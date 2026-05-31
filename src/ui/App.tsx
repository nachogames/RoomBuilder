import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Carcass,
  Project,
  Runner,
  ShelfAttachment,
  SupportKind,
} from "../domain/types";
import {
  defaultProject,
  defaultBookcase,
  defaultRunner,
  defaultRefBox,
  defaultPerson,
  deskAssembly,
  normalizeProject,
  rectWalls,
  uid,
  RUNNER_PROFILES,
  myRoom,
} from "../domain/defaults";
import { evenlySpacedShelves } from "../domain/shelves";
import { buildProject } from "../geometry";
import { snapHeight } from "../geometry/stacking";
import { buildCutList } from "../cutlist";
import { buildPocketPlan } from "../pockets/plan";
import { buildBom } from "../bom/aggregate";
import { checkCarcass, worstLevel } from "../domain/checks";
import { checkRunnerSag } from "../domain/sag";
import { Scene } from "../scene/Scene";
import { PlanView } from "../scene/PlanView";
import { roomInteriorPoint } from "../domain/room";
import { fitRunnerToCarcasses } from "../geometry/group";
import { loadViewState, saveViewState } from "./viewState";
import { DimField, NumField, SelectField, StepField } from "./fields";
import { UnitsProvider, useUnits } from "./units";
import { useProjectHistory } from "./useProjectHistory";
import { JutTool } from "./JutTool";
import { SnapshotRecorder } from "./SnapshotRecorder";
import { bomCsv, cutListCsv, downloadText, pocketCsv } from "../report/csv";
import {
  exportProjectJson,
  importProjectJson,
  listProjects,
  loadProject,
  saveProject,
  saveProjectToDisk,
} from "../persistence/store";

const SHELF_ATTACH: readonly ShelfAttachment[] = [
  "pocket-screw",
  "shelf-pin",
  "cleat",
  "dado",
];
const CARCASS_JOIN = ["pocket-screw", "dado", "screw-through"] as const;
const RUNNER_FASTEN = ["pocket-screw", "screw-through", "bracket"] as const;
const SUPPORT_KINDS: readonly SupportKind[] = [
  "corbel",
  "bracket",
  "leg",
  "cleat",
];
type Tab = "3D" | "Plan" | "Cut list" | "Pocket plan" | "Materials";

/** Placement controls shared by carcasses, runners (desktops) and totes. */
interface Placeable {
  id: string;
  position: { x: number; z: number };
  rotationDeg: number;
  baseHeight?: number;
}
function PlacementFields({
  obj,
  onPatch,
  onSnap,
}: {
  obj: Placeable;
  onPatch: (patch: Partial<Placeable>) => void;
  onSnap: () => void;
}) {
  return (
    <>
      <StepField
        label="Pos X"
        value={obj.position.x}
        onChange={(v) => onPatch({ position: { ...obj.position, x: v } })}
      />
      <StepField
        label="Pos Y"
        value={obj.baseHeight ?? 0}
        onChange={(v) => onPatch({ baseHeight: v })}
      />
      <StepField
        label="Pos Z"
        value={obj.position.z}
        onChange={(v) => onPatch({ position: { ...obj.position, z: v } })}
      />
      <NumField
        label="Rotation°"
        value={obj.rotationDeg}
        step={15}
        min={-360}
        onChange={(v) => onPatch({ rotationDeg: v })}
      />
      <button
        title="Set Pos Y to the top of whatever this sits over"
        onClick={onSnap}
      >
        Snap to surface below
      </button>
    </>
  );
}

export default function App() {
  const hist = useProjectHistory(defaultProject());
  return (
    <UnitsProvider units={hist.project.units}>
      <Workspace
        project={hist.project}
        setProject={hist.setProject}
        undo={hist.undo}
        redo={hist.redo}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
      />
      <SnapshotRecorder />
    </UnitsProvider>
  );
}

function Workspace({
  project,
  setProject,
  undo,
  redo,
  canUndo,
  canRedo,
}: {
  project: Project;
  setProject: (u: Project | ((p: Project) => Project)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const { fmt } = useUnits();
  const view0 = useMemo(() => loadViewState(), []);
  const [sel, setSel] = useState<string>(view0.sel ?? "room");
  const setSelId = setSel; // tree selection drives the inspector
  const [collapse, setCollapse] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>((view0.tab as Tab) ?? "3D");
  const [showDims, setShowDims] = useState(true);
  const [dollhouse, setDollhouse] = useState(true);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = project.carcasses.find((c) => c.id === sel);
  // Runner inspector shows only when the runner itself is selected. When a
  // support is selected (sel = `sup:rid:sid`) we render the dedicated support
  // inspector instead, the same way other items get their own inspector.
  const selRunner = project.runners.find((r) => r.id === sel) ?? null;
  const selSupport = (() => {
    if (!sel.startsWith("sup:")) return null;
    const [, rid, sid] = sel.split(":");
    const runner = project.runners.find((x) => x.id === rid);
    if (!runner) return null;
    const support = runner.supports.find((x) => x.id === sid);
    if (!support) return null;
    return { runner, support };
  })();
  const selTote = project.refBoxes.find((b) => b.id === sel) ?? null;
  const selPerson = project.people.find((p) => p.id === sel) ?? null;
  const toggle = (k: string) =>
    setCollapse((c) => ({ ...c, [k]: !c[k] }));

  const derived = useMemo(() => {
    const g = buildProject(project);
    const cutList = buildCutList(g.parts, project.catalog);
    const pocketPlan = buildPocketPlan(g.joints, g.parts, project.catalog);
    const bom = buildBom(g.joints, cutList, pocketPlan);
    return { ...g, cutList, pocketPlan, bom };
  }, [project]);

  const checks = useMemo(() => {
    const cc = project.carcasses.flatMap((c) => checkCarcass(c, project));
    const rc = project.runners.map((r) =>
      checkRunnerSag(r, project.carcasses, project.catalog),
    );
    return [...cc, ...rc];
  }, [project]);

  useEffect(() => {
    const t = setTimeout(() => {
      saveProject(project)
        .then(() => listProjects())
        .then(setSavedNames)
        .catch(() => {});
      saveViewState({ project: project.name });
    }, 800);
    return () => clearTimeout(t);
  }, [project]);

  useEffect(() => {
    listProjects().then(setSavedNames).catch(() => {});
    // restore the last-opened project on startup
    const last = view0.project;
    if (last) {
      loadProject(last)
        .then((p) => {
          if (p) {
            const np = normalizeProject(p);
            setProject(np);
            if (!view0.sel) setSelId(np.carcasses[0]?.id ?? "");
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveViewState({ tab, sel });
  }, [tab, sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function patchSelected(patch: Partial<Carcass>) {
    if (!selected) return;
    setProject((p) => ({
      ...p,
      carcasses: p.carcasses.map((c) =>
        c.id === selected.id ? { ...c, ...patch } : c,
      ),
    }));
  }

  function patchRunner(id: string, patch: Partial<Runner>) {
    setProject((p) => ({
      ...p,
      runners: p.runners.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function setShelfCount(n: number) {
    if (!selected) return;
    const attach = selected.shelves[0]?.attachment ?? "pocket-screw";
    patchSelected({
      shelves: evenlySpacedShelves(
        selected,
        project.catalog,
        n,
        attach,
      ),
    });
  }

  function reflowShelves(patch: Partial<Carcass>) {
    // re-even shelves whenever a dimension that affects spacing changes
    if (!selected) return;
    const next = { ...selected, ...patch };
    const attach = selected.shelves[0]?.attachment ?? "pocket-screw";
    patchSelected({
      ...patch,
      shelves: evenlySpacedShelves(
        next,
        project.catalog,
        selected.shelves.length,
        attach,
      ),
    });
  }

  function addBookcase() {
    const c = {
      ...defaultBookcase(),
      id: uid("carcass"),
      position: roomInteriorPoint(project.room.walls),
    };
    setProject((p) => ({ ...p, carcasses: [...p.carcasses, c] }));
    setSelId(c.id);
  }

  function addRunner() {
    if (project.carcasses.length === 0) return;
    const base = defaultRunner(project.carcasses.map((c) => c.id));
    const r = { ...base, ...fitRunnerToCarcasses(base, project) };
    setProject((p) => ({ ...p, runners: [...p.runners, r] }));
    setSelId(r.id);
  }

  function addDesk() {
    const { carcasses, runner } = deskAssembly();
    const at = roomInteriorPoint(project.room.walls);
    const cs = carcasses.map((c) => ({
      ...c,
      position: { x: c.position.x + at.x, z: c.position.z + at.z },
    }));
    const rn = {
      ...runner,
      position: { x: runner.position.x + at.x, z: runner.position.z + at.z },
    };
    setProject((p) => ({
      ...p,
      carcasses: [...p.carcasses, ...cs],
      runners: [...p.runners, rn],
    }));
  }

  function addTote() {
    const b = { ...defaultRefBox(), position: roomInteriorPoint(project.room.walls) };
    setProject((p) => ({ ...p, refBoxes: [...p.refBoxes, b] }));
    setSelId(b.id);
  }

  function addPerson() {
    const pn = { ...defaultPerson(), position: roomInteriorPoint(project.room.walls) };
    setProject((p) => ({ ...p, people: [...p.people, pn] }));
    setSelId(pn.id);
  }

  const overall = worstLevel(checks);

  return (
    <div className="app">
      <header>
        <strong>RoomBuilder</strong>
        <input
          className="proj-name"
          value={project.name}
          onChange={(e) =>
            setProject((p) => ({ ...p, name: e.target.value }))
          }
        />
        <button
          onClick={() =>
            setProject((p) => ({
              ...p,
              units: p.units === "in" ? "mm" : "in",
            }))
          }
          title="Toggle units"
        >
          {project.units === "in" ? 'inches' : 'mm'}
        </button>
        <button onClick={undo} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>
        <div className="spacer" />
        <button
          onClick={() =>
            saveProjectToDisk(project).then((m) => setStatus(`Saved to ${m}`))
          }
        >
          Save to disk
        </button>
        <button onClick={() => exportProjectJson(project)}>Export JSON</button>
        <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        <button
          title="Load the saved room preset (replaces the current project)"
          onClick={() => {
            const p = normalizeProject(myRoom());
            setProject(p);
            setSelId(p.runners[0]?.id ?? "");
            setStatus("Loaded My Room");
          }}
        >
          My Room
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const p = await importProjectJson(f);
              setProject(p);
              setSelId(p.carcasses[0]?.id ?? "");
              setStatus("Imported");
            } catch (err) {
              setStatus(`Import failed: ${(err as Error).message}`);
            }
          }}
        />
        <select
          value={savedNames.includes(project.name) ? project.name : ""}
          onChange={(e) => {
            if (e.target.value)
              loadProject(e.target.value).then((p) => {
                if (p) {
                  setProject(normalizeProject(p));
                  setSelId(p.carcasses[0]?.id ?? "");
                  saveViewState({ project: e.target.value });
                }
              });
          }}
        >
          <option value="">Open saved…</option>
          {savedNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </header>

      <div className="body">
        <aside className="panel">
          <div className="browser">
            <button
              className={`tree-row ${sel === "room" ? "on" : ""}`}
              onClick={() => setSel("room")}
            >
              ▸ Room
            </button>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("cases")}>
                  {collapse.cases ? "▸" : "▾"} Bookcases (
                  {project.carcasses.length})
                </button>
                <span>
                  <button onClick={addBookcase}>+ Case</button>{" "}
                  <button onClick={addDesk}>+ Desk</button>
                </span>
              </div>
              {!collapse.cases &&
                project.carcasses.map((c) => (
                  <button
                    key={c.id}
                    className={`tree-row ${sel === c.id ? "on" : ""}`}
                    onClick={() => setSel(c.id)}
                  >
                    ▫ {c.label}
                  </button>
                ))}
            </div>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("runners")}>
                  {collapse.runners ? "▸" : "▾"} Runners (
                  {project.runners.length})
                </button>
                <button onClick={addRunner}>+ Runner</button>
              </div>
              {!collapse.runners &&
                project.runners.map((r) => (
                  <div key={r.id}>
                    <button
                      className={`tree-row ${sel === r.id ? "on" : ""}`}
                      onClick={() => setSel(r.id)}
                    >
                      ▭ {r.label}
                    </button>
                    {r.supports.map((s, i) => (
                      <button
                        key={s.id}
                        className={`tree-row sub ${
                          sel === `sup:${r.id}:${s.id}` ? "on" : ""
                        }`}
                        onClick={() => setSel(`sup:${r.id}:${s.id}`)}
                      >
                        └ {s.kind} #{i + 1}
                      </button>
                    ))}
                  </div>
                ))}
            </div>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("totes")}>
                  {collapse.totes ? "▸" : "▾"} Totes (
                  {project.refBoxes.length})
                </button>
                <button onClick={addTote}>+ Tote</button>
              </div>
              {!collapse.totes &&
                project.refBoxes.map((b) => (
                  <button
                    key={b.id}
                    className={`tree-row ${sel === b.id ? "on" : ""}`}
                    onClick={() => setSel(b.id)}
                  >
                    ▢ {b.label}
                  </button>
                ))}
            </div>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("people")}>
                  {collapse.people ? "▸" : "▾"} People (
                  {project.people.length})
                </button>
                <button onClick={addPerson}>+ Person</button>
              </div>
              {!collapse.people &&
                project.people.map((pn) => (
                  <button
                    key={pn.id}
                    className={`tree-row ${sel === pn.id ? "on" : ""}`}
                    onClick={() => setSel(pn.id)}
                  >
                    ☻ {pn.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="inspector">
          {sel === "room" && (
          <>
          <div className="row">
            <h3>Room</h3>
          </div>
          <DimField
            label="Length"
            value={project.room.length}
            onChange={(v) =>
              setProject((p) => ({ ...p, room: { ...p.room, length: v } }))
            }
          />
          <DimField
            label="Width"
            value={project.room.width}
            onChange={(v) =>
              setProject((p) => ({ ...p, room: { ...p.room, width: v } }))
            }
          />
          <DimField
            label="Ceiling"
            value={project.room.ceilingHeight}
            onChange={(v) =>
              setProject((p) => ({
                ...p,
                room: { ...p.room, ceilingHeight: v },
              }))
            }
          />
          <DimField
            label="Wall thick"
            value={project.room.wallThickness}
            onChange={(v) =>
              setProject((p) => ({
                ...p,
                room: { ...p.room, wallThickness: v },
              }))
            }
          />
          <label className="field">
            <span>Baseboard</span>
            <input
              type="checkbox"
              checked={!!project.room.baseboard}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  room: {
                    ...p.room,
                    baseboard: e.target.checked
                      ? { height: 3.5, thickness: 0.5 }
                      : null,
                  },
                }))
              }
            />
          </label>
          {project.room.baseboard && (
            <>
              <DimField
                label="Base height"
                value={project.room.baseboard.height}
                onChange={(v) =>
                  setProject((p) => ({
                    ...p,
                    room: {
                      ...p.room,
                      baseboard: { ...p.room.baseboard!, height: v },
                    },
                  }))
                }
              />
              <DimField
                label="Base thick"
                value={project.room.baseboard.thickness}
                onChange={(v) =>
                  setProject((p) => ({
                    ...p,
                    room: {
                      ...p.room,
                      baseboard: { ...p.room.baseboard!, thickness: v },
                    },
                  }))
                }
              />
            </>
          )}

          <button
            onClick={() =>
              setProject((p) => ({
                ...p,
                room: {
                  ...p.room,
                  walls: rectWalls(p.room.length, p.room.width),
                },
              }))
            }
            title="Reset walls to a rectangle of Length x Width"
          >
            Reset walls to box
          </button>
          <p className="label" style={{ marginTop: 6 }}>
            Shape the room in the <b>Plan</b> tab: drag a wall to pull it
            in/out, click a wall to drop a breakpoint, double-click a corner
            to remove it. Cmd/Ctrl+Z to undo.
          </p>
          <JutTool
            walls={project.room.walls}
            onApply={(walls) =>
              setProject((p) => ({ ...p, room: { ...p.room, walls } }))
            }
          />
          </>
          )}

          {selected && (
            <>
              <h3>{selected.label}</h3>
              <input
                className="proj-name"
                style={{ width: "100%", marginTop: 6 }}
                value={selected.label}
                onChange={(e) => patchSelected({ label: e.target.value })}
              />
              <DimField
                label="Width"
                value={selected.width}
                onChange={(v) => patchSelected({ width: v })}
              />
              <DimField
                label="Height"
                value={selected.height}
                onChange={(v) => reflowShelves({ height: v })}
              />
              <DimField
                label="Depth"
                value={selected.depth}
                onChange={(v) => patchSelected({ depth: v })}
              />
              <DimField
                label="Toe kick"
                value={selected.toeKickHeight}
                allowZero
                onChange={(v) => reflowShelves({ toeKickHeight: v })}
              />
              <PlacementFields
                obj={selected}
                onPatch={patchSelected}
                onSnap={() =>
                  setProject((p) => ({
                    ...p,
                    carcasses: p.carcasses.map((c) =>
                      c.id === selected.id
                        ? { ...c, baseHeight: snapHeight(c, p) }
                        : c,
                    ),
                  }))
                }
              />
              <DimField
                label="Target opening"
                value={selected.targetOpeningWidth ?? 0}
                allowZero
                onChange={(v) =>
                  patchSelected({
                    targetOpeningWidth: v > 0 ? v : undefined,
                  })
                }
              />
              <NumField
                label="Shelves"
                value={selected.shelves.length}
                onChange={setShelfCount}
                min={0}
              />
              <SelectField
                label="Shelf joinery"
                value={selected.shelves[0]?.attachment ?? "pocket-screw"}
                options={SHELF_ATTACH}
                onChange={(a) =>
                  patchSelected({
                    shelves: selected.shelves.map((s) => ({
                      ...s,
                      attachment: a,
                    })),
                  })
                }
              />
              <SelectField
                label="Carcass joinery"
                value={selected.carcassJoinery}
                options={CARCASS_JOIN}
                onChange={(v) => patchSelected({ carcassJoinery: v })}
              />
              <label className="field">
                <span>Has back</span>
                <input
                  type="checkbox"
                  checked={selected.hasBack}
                  onChange={(e) =>
                    patchSelected({ hasBack: e.target.checked })
                  }
                />
              </label>
              <button
                onClick={() => {
                  setProject((p) => ({
                    ...p,
                    carcasses: p.carcasses.filter(
                      (c) => c.id !== selected.id,
                    ),
                    runners: p.runners.map((r) => ({
                      ...r,
                      spannedCarcassIds: r.spannedCarcassIds.filter(
                        (id) => id !== selected.id,
                      ),
                    })),
                  }));
                }}
              >
                Delete carcass
              </button>
            </>
          )}

          {(selRunner ? [selRunner] : []).map((r) => (
            <div key={r.id} className="sub">
              <h3>{r.label}</h3>
              <input
                className="proj-name"
                style={{ width: "100%" }}
                value={r.label}
                onChange={(e) =>
                  patchRunner(r.id, { label: e.target.value })
                }
              />
              <label className="field">
                <span>Profile</span>
                <select
                  value=""
                  onChange={(e) => {
                    const p = RUNNER_PROFILES.find(
                      (x) => x.id === e.target.value,
                    );
                    if (!p) return;
                    patchRunner(r.id, {
                      boardMaterialId: p.materialId,
                      ...(p.depth !== undefined ? { depth: p.depth } : {}),
                    });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Pick a profile…</option>
                  {RUNNER_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <SelectField
                label="Board"
                value={r.boardMaterialId}
                options={project.catalog.materials.map((m) => m.id)}
                onChange={(v) => patchRunner(r.id, { boardMaterialId: v })}
              />
              <DimField
                label="Length"
                value={r.length}
                onChange={(v) => patchRunner(r.id, { length: v })}
              />
              <DimField
                label="Depth"
                value={r.depth}
                onChange={(v) => patchRunner(r.id, { depth: v })}
              />
              <SelectField
                label="Fastening"
                value={r.fastening}
                options={RUNNER_FASTEN}
                onChange={(v) => patchRunner(r.id, { fastening: v })}
              />
              <PlacementFields
                obj={r}
                onPatch={(patch) => patchRunner(r.id, patch)}
                onSnap={() =>
                  setProject((p) => ({
                    ...p,
                    runners: p.runners.map((x) =>
                      x.id === r.id
                        ? { ...x, baseHeight: snapHeight(x, p) }
                        : x,
                    ),
                  }))
                }
              />
              <label
                className="field"
                title="On (desk top): dragging this also moves its cabinets. Off (shelf): it moves on its own."
              >
                <span>Drag moves cabinets</span>
                <input
                  type="checkbox"
                  checked={r.groupDrag ?? false}
                  onChange={(e) =>
                    patchRunner(r.id, { groupDrag: e.target.checked })
                  }
                />
              </label>
              <div className="label" style={{ margin: "6px 0 2px" }}>
                Sits on:
              </div>
              {project.carcasses.map((c) => (
                <label key={c.id} className="field">
                  <span>{c.label}</span>
                  <input
                    type="checkbox"
                    checked={r.spannedCarcassIds.includes(c.id)}
                    onChange={(e) =>
                      patchRunner(r.id, {
                        spannedCarcassIds: e.target.checked
                          ? [...r.spannedCarcassIds, c.id]
                          : r.spannedCarcassIds.filter(
                              (id) => id !== c.id,
                            ),
                      })
                    }
                  />
                </label>
              ))}
              <div className="row">
                <span className="label">
                  Spans {r.spannedCarcassIds.length} / supports{" "}
                  {r.supports.length}
                </span>
                <button
                  title="Add a support and open its inspector"
                  onClick={() => {
                    const sup = {
                      id: uid("sup"),
                      kind: "leg" as SupportKind,
                      offsetFromLeft: 24,
                    };
                    patchRunner(r.id, { supports: [...r.supports, sup] });
                    setSelId(`sup:${r.id}:${sup.id}`);
                  }}
                >
                  + Support
                </button>
              </div>
              {r.supports.length > 0 && (
                <p className="label" style={{ marginTop: 2 }}>
                  Click a support in the tree to edit it.
                </p>
              )}
              <button
                title="Size & centre this runner to span across its cabinets, resting on top"
                onClick={() =>
                  setProject((p) => ({
                    ...p,
                    runners: p.runners.map((x) =>
                      x.id === r.id
                        ? { ...x, ...fitRunnerToCarcasses(x, p) }
                        : x,
                    ),
                  }))
                }
              >
                Span cabinets
              </button>
              <button
                onClick={() =>
                  setProject((p) => ({
                    ...p,
                    runners: p.runners.filter((x) => x.id !== r.id),
                  }))
                }
              >
                Delete runner
              </button>
            </div>
          ))}

          {(selTote ? [selTote] : []).map((b) => (
            <div key={b.id} className="sub">
              <input
                className="proj-name"
                style={{ width: "100%" }}
                value={b.label}
                onChange={(e) =>
                  setProject((p) => ({
                    ...p,
                    refBoxes: p.refBoxes.map((x) =>
                      x.id === b.id ? { ...x, label: e.target.value } : x,
                    ),
                  }))
                }
              />
              {(["width", "height", "depth"] as const).map((k) => (
                <DimField
                  key={k}
                  label={k}
                  value={b[k]}
                  onChange={(v) =>
                    setProject((p) => ({
                      ...p,
                      refBoxes: p.refBoxes.map((x) =>
                        x.id === b.id ? { ...x, [k]: v } : x,
                      ),
                    }))
                  }
                />
              ))}
              <PlacementFields
                obj={b}
                onPatch={(patch) =>
                  setProject((p) => ({
                    ...p,
                    refBoxes: p.refBoxes.map((x) =>
                      x.id === b.id ? { ...x, ...patch } : x,
                    ),
                  }))
                }
                onSnap={() =>
                  setProject((p) => ({
                    ...p,
                    refBoxes: p.refBoxes.map((x) =>
                      x.id === b.id
                        ? { ...x, baseHeight: snapHeight(x, p) }
                        : x,
                    ),
                  }))
                }
              />
              <button
                onClick={() =>
                  setProject((p) => ({
                    ...p,
                    refBoxes: p.refBoxes.filter((x) => x.id !== b.id),
                  }))
                }
              >
                Delete tote
              </button>
            </div>
          ))}

          {(selPerson ? [selPerson] : []).map((pn) => (
            <div key={pn.id} className="sub">
              <h3>{pn.label}</h3>
              <input
                className="proj-name"
                style={{ width: "100%" }}
                value={pn.label}
                onChange={(e) =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.map((x) =>
                      x.id === pn.id ? { ...x, label: e.target.value } : x,
                    ),
                  }))
                }
              />
              <SelectField
                label="Pose"
                value={pn.pose}
                options={["standing", "sitting"] as const}
                onChange={(v) =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.map((x) =>
                      x.id === pn.id ? { ...x, pose: v } : x,
                    ),
                  }))
                }
              />
              <DimField
                label="Height"
                value={pn.height}
                onChange={(v) =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.map((x) =>
                      x.id === pn.id ? { ...x, height: v } : x,
                    ),
                  }))
                }
              />
              <PlacementFields
                obj={pn}
                onPatch={(patch) =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.map((x) =>
                      x.id === pn.id ? { ...x, ...patch } : x,
                    ),
                  }))
                }
                onSnap={() =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.map((x) =>
                      x.id === pn.id
                        ? { ...x, baseHeight: snapHeight(x, p) }
                        : x,
                    ),
                  }))
                }
              />
              <button
                onClick={() =>
                  setProject((p) => ({
                    ...p,
                    people: p.people.filter((x) => x.id !== pn.id),
                  }))
                }
              >
                Delete person
              </button>
            </div>
          ))}

          {selSupport && (() => {
            const { runner: rr, support: ss } = selSupport;
            const i = rr.supports.findIndex((x) => x.id === ss.id);
            const patchSupport = (patch: Partial<typeof ss>) =>
              patchRunner(rr.id, {
                supports: rr.supports.map((x) =>
                  x.id === ss.id ? { ...x, ...patch } : x,
                ),
              });
            return (
              <div className="sub">
                <h3>
                  {ss.kind} #{i + 1}
                </h3>
                <p className="label" style={{ marginTop: 0 }}>
                  on{" "}
                  <button
                    className="link"
                    onClick={() => setSelId(rr.id)}
                    title="Open the parent runner"
                  >
                    {rr.label}
                  </button>
                </p>
                <SelectField
                  label="Kind"
                  value={ss.kind}
                  options={SUPPORT_KINDS}
                  onChange={(v) => patchSupport({ kind: v })}
                />
                <StepField
                  label="X (from left)"
                  value={ss.offsetFromLeft}
                  onChange={(v) => patchSupport({ offsetFromLeft: v })}
                />
                <StepField
                  label="Z (from centre)"
                  value={ss.offsetFromCenterZ ?? 0}
                  onChange={(v) => patchSupport({ offsetFromCenterZ: v })}
                />
                <button
                  onClick={() => {
                    patchRunner(rr.id, {
                      supports: rr.supports.filter((x) => x.id !== ss.id),
                    });
                    setSelId(rr.id);
                  }}
                >
                  Delete support
                </button>
              </div>
            );
          })()}

          {sel !== "room" && !selected && !selRunner && !selTote && !selPerson && !selSupport && (
            <p className="label">Select an item above to edit it.</p>
          )}
          </div>
        </aside>

        <main className="view">
          <nav className="tabs">
            {(
              ["3D", "Plan", "Cut list", "Pocket plan", "Materials"] as Tab[]
            ).map(
              (t) => (
                <button
                  key={t}
                  className={t === tab ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ),
            )}
            <div className="spacer" />
            {tab === "Plan" && (
              <button
                className={showDims ? "active" : ""}
                onClick={() => setShowDims((s) => !s)}
                title="Show or hide all dimensions"
              >
                Dimensions: {showDims ? "on" : "off"}
              </button>
            )}
            {tab === "Cut list" && (
              <button
                onClick={() =>
                  downloadText("cutlist.csv", cutListCsv(derived.cutList))
                }
              >
                Export CSV
              </button>
            )}
            {tab === "Pocket plan" && (
              <button
                onClick={() =>
                  downloadText(
                    "pocket-plan.csv",
                    pocketCsv(derived.pocketPlan),
                  )
                }
              >
                Export CSV
              </button>
            )}
            {tab === "Materials" && (
              <button
                onClick={() =>
                  downloadText("materials.csv", bomCsv(derived.bom))
                }
              >
                Export CSV
              </button>
            )}
          </nav>

          {checks.length > 0 && (
            <div className={`checks ${overall}`}>
              {checks.map((c, i) => (
                <div key={i} className={c.level}>
                  {c.level === "error"
                    ? "⛔"
                    : c.level === "warn"
                      ? "⚠️"
                      : "✅"}{" "}
                  {c.message}
                </div>
              ))}
            </div>
          )}

          <section className="content">
            {tab === "3D" && (
              <div className="canvas-wrap" style={{ position: "relative" }}>
                <label
                  className="field"
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    zIndex: 1,
                    background: "#0008",
                    padding: "4px 8px",
                    borderRadius: 4,
                  }}
                  title="Hide whichever walls sit between you and the room"
                >
                  <span>Dollhouse</span>
                  <input
                    type="checkbox"
                    checked={dollhouse}
                    onChange={(e) => setDollhouse(e.target.checked)}
                  />
                </label>
                <Scene project={project} dollhouse={dollhouse} />
              </div>
            )}

            {tab === "Plan" && (
              <PlanView
                project={project}
                setProject={setProject}
                showDims={showDims}
                onSelect={setSel}
              />
            )}

            {tab === "Cut list" && (
              <div className="report">
                {derived.cutList.byMaterial.map((m) => (
                  <div key={m.materialId}>
                    <h4>
                      {m.materialName} — {m.stockCount}{" "}
                      {m.kind === "sheet" ? "sheet(s)" : "board(s)"}
                    </h4>
                    {m.kind === "sheet"
                      ? m.sheetBins.map((b, i) => (
                          <table key={i}>
                            <thead>
                              <tr>
                                <th>Sheet {i + 1}</th>
                                <th>Length</th>
                                <th>Width</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.placements.map((pl, k) => (
                                <tr key={k}>
                                  <td>{pl.label}</td>
                                  <td>{fmt(pl.w)}</td>
                                  <td>{fmt(pl.h)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ))
                      : m.boardBins.map((b, i) => (
                          <table key={i}>
                            <thead>
                              <tr>
                                <th>
                                  {b.nominal} #{i + 1} (leftover{" "}
                                  {fmt(b.leftover)})
                                </th>
                                <th>Length</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.cuts.map((c, k) => (
                                <tr key={k}>
                                  <td>{c.label}</td>
                                  <td>{fmt(c.length)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ))}
                  </div>
                ))}
              </div>
            )}

            {tab === "Pocket plan" && (
              <div className="report">
                <table>
                  <thead>
                    <tr>
                      <th>Joint</th>
                      <th>Drill into</th>
                      <th>Holes</th>
                      <th>Jig</th>
                      <th>Collar</th>
                      <th>Screw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.pocketPlan.map((e) => (
                      <tr key={e.jointId}>
                        <td>{e.label}</td>
                        <td>{e.drilledPartLabel}</td>
                        <td>{e.holes}</td>
                        <td>{e.setting.guideSetting}</td>
                        <td>{fmt(e.setting.collarDepth)}</td>
                        <td>
                          {fmt(e.setting.screwLength)} {e.setting.screwType}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "Materials" && (
              <div className="report">
                <h3>Stock (edit width & length to match what you have)</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Item</th>
                      <th>Width (in)</th>
                      <th>Length (in)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.catalog.boards.map((b, i) => (
                      <tr key={`board-${b.materialId}-${i}`}>
                        <td>Board</td>
                        <td>{b.nominal}</td>
                        <td>
                          <input
                            type="number"
                            step={0.0625}
                            value={b.width}
                            onChange={(e) =>
                              setProject((p) => ({
                                ...p,
                                catalog: {
                                  ...p.catalog,
                                  boards: p.catalog.boards.map((x, k) =>
                                    k === i
                                      ? { ...x, width: Number(e.target.value) }
                                      : x,
                                  ),
                                },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.25}
                            value={b.length}
                            onChange={(e) =>
                              setProject((p) => ({
                                ...p,
                                catalog: {
                                  ...p.catalog,
                                  boards: p.catalog.boards.map((x, k) =>
                                    k === i
                                      ? { ...x, length: Number(e.target.value) }
                                      : x,
                                  ),
                                },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {project.catalog.sheets.map((s, i) => {
                      const mat = project.catalog.materials.find(
                        (m) => m.id === s.materialId,
                      );
                      return (
                        <tr key={`sheet-${s.materialId}-${i}`}>
                          <td>Sheet</td>
                          <td>{mat?.name ?? s.materialId}</td>
                          <td>
                            <input
                              type="number"
                              step={0.25}
                              value={s.width}
                              onChange={(e) =>
                                setProject((p) => ({
                                  ...p,
                                  catalog: {
                                    ...p.catalog,
                                    sheets: p.catalog.sheets.map((x, k) =>
                                      k === i
                                        ? { ...x, width: Number(e.target.value) }
                                        : x,
                                    ),
                                  },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step={0.25}
                              value={s.length}
                              onChange={(e) =>
                                setProject((p) => ({
                                  ...p,
                                  catalog: {
                                    ...p.catalog,
                                    sheets: p.catalog.sheets.map((x, k) =>
                                      k === i
                                        ? { ...x, length: Number(e.target.value) }
                                        : x,
                                    ),
                                  },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <h3 style={{ marginTop: 16 }}>Bill of materials</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.bom.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.category}</td>
                        <td>{l.item}</td>
                        <td>{l.qty}</td>
                        <td>{l.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <footer>{status}</footer>
        </main>
      </div>
    </div>
  );
}
