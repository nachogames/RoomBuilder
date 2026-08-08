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
import { evenlySpacedShelves, isEvenlySpaced } from "../domain/shelves";
import { buildProject } from "../geometry";
import { snapHeight } from "../geometry/stacking";
import { buildCutList } from "../cutlist";
import { buildPocketPlan } from "../pockets/plan";
import { buildBom } from "../bom/aggregate";
import { checkCarcass, worstLevel } from "../domain/checks";
import { checkRunnerSag } from "../domain/sag";
import { Scene } from "../scene/Scene";
import { resolveDrop, resolveShelfDrop } from "../scene/placement";
import { PlanView } from "../scene/PlanView";
import { AssemblyView } from "../scene/AssemblyView";
import { roomInteriorPoint } from "../domain/room";
import { fitRunnerToCarcasses } from "../geometry/group";
import { loadViewState, saveViewState } from "./viewState";
import {
  clear as clearSel,
  deserialize as deserializeSel,
  replace as replaceSel,
  serialize as serializeSel,
  toggle as toggleSel,
  unionIds,
  type SelectionState,
} from "../scene/selection";
import { openCutlistPrintWindow } from "./printWindow";
import {
  CUTLIST_VISUAL_CSS,
  renderBoardMaterial,
  renderDetailTable as renderCutlistDetailTable,
  renderSheetSvg,
  renderSummarySection as renderCutlistSummary,
  sheetHeading,
  sheetSubtitle,
} from "./cutlistVisual";
import { formatLength } from "../domain/measure";
import { ZoomPan } from "./ZoomPan";
import { groupPocketsByPart, type PartPocketGroup } from "../pockets/byPart";
import {
  POCKET_VISUAL_CSS,
  partHeading,
  partSubtitle,
  renderPartSvg,
} from "./pocketVisual";
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
type Tab = "3D" | "Plan" | "Assembly" | "Cut list" | "Pocket plan" | "Materials";

/** Fusion-style visibility eye. Sits inside a tree row; stops propagation so
 *  toggling never changes the selection. */
function EyeButton({
  hidden,
  onToggle,
}: {
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`eye ${hidden ? "off" : ""}`}
      title={hidden ? "Show in Plan & 3D" : "Hide in Plan & 3D"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M2 12c2.6-4.4 6-6.5 10-6.5S19.4 7.6 22 12c-2.6 4.4-6 6.5-10 6.5S4.6 16.4 2 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        {hidden && (
          <line
            x1="4"
            y1="20"
            x2="20"
            y2="4"
            stroke="currentColor"
            strokeWidth="2"
          />
        )}
      </svg>
    </button>
  );
}

/** Browser-tree row: select on click, with an optional visibility eye.
 *  A div (not a button) because the eye is itself a button. */
function TreeRow({
  icon,
  label,
  on,
  hidden,
  sub,
  onClick,
  onToggleHidden,
}: {
  icon: string;
  label: string;
  on: boolean;
  hidden?: boolean;
  sub?: boolean;
  onClick: () => void;
  onToggleHidden?: () => void;
}) {
  return (
    <div
      className={`tree-row ${on ? "on" : ""} ${hidden ? "dim" : ""} ${sub ? "sub" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="tree-label">
        {icon} {label}
      </span>
      {onToggleHidden && (
        <EyeButton hidden={!!hidden} onToggle={onToggleHidden} />
      )}
    </div>
  );
}

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
        beginInteraction={hist.beginInteraction}
        endInteraction={hist.endInteraction}
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
  beginInteraction,
  endInteraction,
}: {
  project: Project;
  setProject: (u: Project | ((p: Project) => Project)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  beginInteraction: () => void;
  endInteraction: () => void;
}) {
  const { fmt } = useUnits();
  const view0 = useMemo(() => loadViewState(), []);
  const [selection, setSelection] = useState<SelectionState>(() => {
    const restored = deserializeSel(view0.sel);
    return restored.primary || restored.extras.size > 0
      ? restored
      : { primary: "room", extras: new Set() };
  });
  const sel = selection.primary;
  const setSel = (id: string) => setSelection(replaceSel(id));
  const [subSel, setSubSel] = useState<{ kind: "shelf"; carcassId: string; idx: number } | null>(null);
  // Selecting via tree/inspector clears subSel so the inspector view doesn't
  // contradict a stale shelf focus.
  const setSelId = (id: string) => {
    setSubSel(null);
    setSel(id);
  };
  const onSelectShelf = (carcassId: string, idx: number) => {
    setSel(carcassId);
    setSubSel({ kind: "shelf", carcassId, idx });
  };
  // Handler passed to Scene: plain click replaces, Cmd/Ctrl-click toggles.
  // Empty id (from the deselect plane / Escape) clears everything.
  const onSceneSelect = (id: string, opts?: { toggle?: boolean }) => {
    setSubSel(null);
    if (!id) {
      setSelection(clearSel());
      return;
    }
    if (opts?.toggle) {
      setSelection((s) => toggleSel(s, id));
      return;
    }
    setSelection(replaceSel(id));
  };
  const selectionIds = useMemo(() => unionIds(selection), [selection]);
  // Visibility eyes: hidden ids apply to BOTH Plan and 3D (one shared set,
  // persisted in view state so it survives reload). Hidden ≠ deleted — cut
  // list, BOM and collision still see the item.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(view0.hidden ?? []),
  );
  const toggleHidden = (id: string) =>
    setHiddenIds((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Group eye: hide all, unless everything is already hidden — then show all.
  const toggleHiddenGroup = (ids: string[]) =>
    setHiddenIds((h) => {
      const n = new Set(h);
      const allHidden = ids.length > 0 && ids.every((id) => n.has(id));
      for (const id of ids) {
        if (allHidden) n.delete(id);
        else n.add(id);
      }
      return n;
    });
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

  // Cutlist scoped to whatever the user has selected. Empty selection => empty
  // cutlist (the tab renders an "select items in the scene" empty state).
  const selectedCutList = useMemo(() => {
    if (selectionIds.size === 0) return null;
    const g = derived;
    const selectedParts = g.parts.filter((p) => selectionIds.has(p.carcassId));
    if (selectedParts.length === 0) return null;
    return buildCutList(selectedParts, project.catalog);
  }, [derived, project.catalog, selectionIds]);

  const selectedPocketGroups = useMemo<PartPocketGroup[]>(() => {
    if (selectionIds.size === 0) return [];
    const all = groupPocketsByPart(derived.pocketPlan, derived.joints, derived.parts);
    return all.filter((g) => selectionIds.has(g.carcassId));
  }, [derived.pocketPlan, derived.joints, derived.parts, selectionIds]);

  const selectedItemLabels = useMemo(() => {
    const labels: string[] = [];
    for (const id of selectionIds) {
      const c = project.carcasses.find((x) => x.id === id);
      if (c) { labels.push(c.label); continue; }
      const r = project.runners.find((x) => x.id === id);
      if (r) { labels.push(r.label); continue; }
    }
    return labels;
  }, [project.carcasses, project.runners, selectionIds]);

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
    saveViewState({
      tab,
      sel: serializeSel(selection),
      hidden: [...hiddenIds],
    });
  }, [tab, selection, hiddenIds]);

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
        <aside className="panel side-left">
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
                <span className="tree-head-actions">
                  {project.carcasses.length > 0 && (
                    <EyeButton
                      hidden={project.carcasses.every((c) =>
                        hiddenIds.has(c.id),
                      )}
                      onToggle={() =>
                        toggleHiddenGroup(project.carcasses.map((c) => c.id))
                      }
                    />
                  )}
                  <button onClick={addBookcase}>+ Case</button>{" "}
                  <button onClick={addDesk}>+ Desk</button>
                </span>
              </div>
              {!collapse.cases &&
                project.carcasses.map((c) => (
                  <TreeRow
                    key={c.id}
                    icon="▫"
                    label={c.label}
                    on={sel === c.id}
                    hidden={hiddenIds.has(c.id)}
                    onClick={() => setSel(c.id)}
                    onToggleHidden={() => toggleHidden(c.id)}
                  />
                ))}
            </div>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("runners")}>
                  {collapse.runners ? "▸" : "▾"} Runners (
                  {project.runners.length})
                </button>
                <span className="tree-head-actions">
                  {project.runners.length > 0 && (
                    <EyeButton
                      hidden={project.runners.every((r) =>
                        hiddenIds.has(r.id),
                      )}
                      onToggle={() =>
                        toggleHiddenGroup(project.runners.map((r) => r.id))
                      }
                    />
                  )}
                  <button onClick={addRunner}>+ Runner</button>
                </span>
              </div>
              {!collapse.runners &&
                project.runners.map((r) => (
                  <div key={r.id}>
                    <TreeRow
                      icon="▭"
                      label={r.label}
                      on={sel === r.id}
                      hidden={hiddenIds.has(r.id)}
                      onClick={() => setSel(r.id)}
                      onToggleHidden={() => toggleHidden(r.id)}
                    />
                    {r.supports.map((s, i) => (
                      <TreeRow
                        key={s.id}
                        icon="└"
                        label={`${s.kind} #${i + 1}`}
                        sub
                        on={sel === `sup:${r.id}:${s.id}`}
                        hidden={hiddenIds.has(r.id)}
                        onClick={() => setSel(`sup:${r.id}:${s.id}`)}
                      />
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
                <span className="tree-head-actions">
                  {project.refBoxes.length > 0 && (
                    <EyeButton
                      hidden={project.refBoxes.every((b) =>
                        hiddenIds.has(b.id),
                      )}
                      onToggle={() =>
                        toggleHiddenGroup(project.refBoxes.map((b) => b.id))
                      }
                    />
                  )}
                  <button onClick={addTote}>+ Tote</button>
                </span>
              </div>
              {!collapse.totes &&
                project.refBoxes.map((b) => (
                  <TreeRow
                    key={b.id}
                    icon="▢"
                    label={b.label}
                    on={sel === b.id}
                    hidden={hiddenIds.has(b.id)}
                    onClick={() => setSel(b.id)}
                    onToggleHidden={() => toggleHidden(b.id)}
                  />
                ))}
            </div>

            <div className="tree-group">
              <div className="tree-head">
                <button onClick={() => toggle("people")}>
                  {collapse.people ? "▸" : "▾"} People (
                  {project.people.length})
                </button>
                <span className="tree-head-actions">
                  {project.people.length > 0 && (
                    <EyeButton
                      hidden={project.people.every((p) =>
                        hiddenIds.has(p.id),
                      )}
                      onToggle={() =>
                        toggleHiddenGroup(project.people.map((p) => p.id))
                      }
                    />
                  )}
                  <button onClick={addPerson}>+ Person</button>
                </span>
              </div>
              {!collapse.people &&
                project.people.map((pn) => (
                  <TreeRow
                    key={pn.id}
                    icon="☻"
                    label={pn.label}
                    on={sel === pn.id}
                    hidden={hiddenIds.has(pn.id)}
                    onClick={() => setSel(pn.id)}
                    onToggleHidden={() => toggleHidden(pn.id)}
                  />
                ))}
            </div>
          </div>
        </aside>

        <aside className="panel side-right">
          <div className="inspector">
          {selection.extras.size > 0 && (
            <p className="label" style={{ opacity: 0.8 }}>
              {selection.extras.size + 1} items selected — editing primary.
              Switch to the <b>Cut list</b> tab to see the combined cutlist.
            </p>
          )}
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
                      ? { height: 5.125, thickness: 0.5 }
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
              <label
                className="field"
                title="Off: the case sits flat on the floor (no kick rail in the cut list)"
              >
                <span>Toe kick</span>
                <input
                  type="checkbox"
                  checked={selected.toeKickHeight > 0}
                  onChange={(e) =>
                    reflowShelves({ toeKickHeight: e.target.checked ? 3 : 0 })
                  }
                />
              </label>
              {selected.toeKickHeight > 0 && (
                <DimField
                  label="Kick height"
                  value={selected.toeKickHeight}
                  onChange={(v) => reflowShelves({ toeKickHeight: v })}
                />
              )}
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
              {selected.shelves.length > 0 &&
                !isEvenlySpaced(selected, project.catalog) && (
                  <div className="field" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>Custom spacing</span>
                    {selected.shelves.map((s, i) => (
                      <DimField
                        key={i}
                        label={`Shelf ${i + 1}`}
                        value={s.offsetFromBottom}
                        onChange={(v) =>
                          setProject((pr) =>
                            resolveShelfDrop(pr, selected.id, i, v).project,
                          )
                        }
                      />
                    ))}
                    <button
                      onClick={() => {
                        const attach = selected.shelves[0]?.attachment ?? "pocket-screw";
                        patchSelected({
                          shelves: evenlySpacedShelves(
                            selected,
                            project.catalog,
                            selected.shelves.length,
                            attach,
                          ),
                        });
                      }}
                    >
                      Re-space evenly
                    </button>
                  </div>
                )}
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
              ["3D", "Plan", "Assembly", "Cut list", "Pocket plan", "Materials"] as Tab[]
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
            {tab === "Cut list" && selectedCutList && (
              <button
                onClick={() =>
                  downloadText("cutlist.csv", cutListCsv(selectedCutList))
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
                  className="field viewport-chip"
                  title="Hide whichever walls sit between you and the room"
                >
                  <span>Dollhouse</span>
                  <input
                    type="checkbox"
                    checked={dollhouse}
                    onChange={(e) => setDollhouse(e.target.checked)}
                  />
                </label>
                <Scene
                  project={project}
                  dollhouse={dollhouse}
                  hidden={hiddenIds}
                  sel={sel}
                  extras={selection.extras}
                  subSel={subSel}
                  onSelect={onSceneSelect}
                  onSelectShelf={onSelectShelf}
                  onPatchEntity={(id, kind, patch) =>
                    setProject((pr) =>
                      resolveDrop(pr, kind, id, {
                        x: patch.x,
                        z: patch.z,
                        y: patch.y,
                        rotationDeg: patch.rotationDeg,
                      }).project,
                    )
                  }
                  onPatchShelf={(carcassId, idx, newOffset) =>
                    setProject((pr) =>
                      resolveShelfDrop(pr, carcassId, idx, newOffset).project,
                    )
                  }
                  onCommitHistory={beginInteraction}
                  onEndInteraction={endInteraction}
                />
              </div>
            )}

            {tab === "Plan" && (
              <PlanView
                project={project}
                setProject={setProject}
                showDims={showDims}
                hidden={hiddenIds}
                onSelect={setSel}
              />
            )}

            {tab === "Assembly" && (
              <div className="canvas-wrap" style={{ position: "relative", width: "100%", height: "100%" }}>
                <AssemblyView project={project} carcassId={sel} />
              </div>
            )}

            {tab === "Cut list" && (
              <div className="report">
                {!selectedCutList && (
                  <p className="label">
                    Select items in the 3D scene to build a cutlist.
                    Cmd/Ctrl-click in the 3D view to pick multiple items.
                  </p>
                )}
                {selectedCutList && (
                  <>
                    <style>{CUTLIST_VISUAL_CSS}</style>
                    <div className="row" style={{ alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div>
                        <strong>{selectedItemLabels.length} item{selectedItemLabels.length === 1 ? "" : "s"}:</strong>{" "}
                        {selectedItemLabels.join(", ") || "(no buildable parts in selection)"}
                      </div>
                      <button
                        onClick={() =>
                          openCutlistPrintWindow({
                            projectName: project.name,
                            cutList: selectedCutList,
                            itemLabels: selectedItemLabels,
                            unitsLabel: project.units,
                            pocketGroups: selectedPocketGroups,
                          })
                        }
                      >
                        Open printable view
                      </button>
                    </div>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderCutlistSummary(
                          [],
                          selectedCutList,
                          (n) => formatLength(n, project.units),
                        ),
                      }}
                    />
                    {selectedCutList.byMaterial.map((m) => {
                      const f = (n: number) => formatLength(n, project.units);
                      if (m.kind === "sheet") {
                        return m.sheetBins.map((b, i) => (
                          <div key={`${m.materialId}-${i}`} className="cv-sheet-block">
                            <h3 className="cv-h3">
                              {sheetHeading(m.materialName, i + 1, m.sheetBins.length)}
                            </h3>
                            <div className="cv-sub">{sheetSubtitle(b, f)}</div>
                            <ZoomPan html={renderSheetSvg(b, f, "screen")} />
                          </div>
                        ));
                      }
                      const html = renderBoardMaterial(m, f, "screen");
                      if (!html) return null;
                      return <ZoomPan key={m.materialId} html={html} />;
                    })}
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderCutlistDetailTable(
                          selectedCutList,
                          (n) => formatLength(n, project.units),
                        ),
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {tab === "Pocket plan" && (
              <div className="report">
                <style>{POCKET_VISUAL_CSS}</style>
                {selectedPocketGroups.length === 0 ? (
                  <p className="label">
                    Select items in the 3D scene (Cmd/Ctrl-click for multiple)
                    to see per-part drilling cards.
                  </p>
                ) : (
                  <>
                    <h3>Drilling guide</h3>
                    {selectedPocketGroups.map((g) => {
                      const f = (n: number) => formatLength(n, project.units);
                      return (
                        <div key={g.partId} className="pv-block">
                          <h4 className="pv-h3">{partHeading(g)}</h4>
                          <div className="pv-sub">{partSubtitle(g, f)}</div>
                          <ZoomPan html={renderPartSvg(g, f, "screen")} />
                        </div>
                      );
                    })}
                  </>
                )}
                <h3>Per-joint table</h3>
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
                <h3>Cutting settings</h3>
                <div className="stock-settings">
                  <label>
                    Saw kerf (in)
                    <input
                      type="number"
                      step={0.0078125}
                      min={0}
                      value={project.catalog.kerf}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          catalog: { ...p.catalog, kerf: Number(e.target.value) },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Trim allowance (in)
                    <input
                      type="number"
                      step={0.0625}
                      min={0}
                      value={project.catalog.trimAllowance ?? 0}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          catalog: {
                            ...p.catalog,
                            trimAllowance: Math.max(0, Number(e.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="stock-check">
                    <input
                      type="checkbox"
                      checked={project.catalog.grainMatters !== false}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          catalog: { ...p.catalog, grainMatters: e.target.checked },
                        }))
                      }
                    />
                    Grain direction matters
                  </label>
                </div>
                <p className="stock-hint">
                  {project.catalog.grainMatters !== false
                    ? "Parts keep their grain orientation. Uncheck for paint-grade work — letting parts rotate 90° often saves a whole sheet."
                    : "Parts may rotate 90° on the sheet. Face grain will run across some parts."}
                  {" "}
                  {(project.catalog.trimAllowance ?? 0) > 0
                    ? `Every part is nested ${fmt(project.catalog.trimAllowance ?? 0)} oversize on both axes so you can trim to final size.`
                    : "Trim allowance 0: parts are nested at final size, so a full-length part relies on the factory edge."}
                </p>

                <h3 style={{ marginTop: 16 }}>
                  Stock (sizes and how many you have)
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Item</th>
                      <th>Width (in)</th>
                      <th>Length (in)</th>
                      <th>Qty</th>
                      <th></th>
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
                        <td className="stock-dim">—</td>
                        <td />
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
                          <td>
                            <input
                              type="number"
                              step={1}
                              min={0}
                              placeholder="any"
                              title="Blank = buy as many as needed"
                              value={s.qty ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setProject((p) => ({
                                  ...p,
                                  catalog: {
                                    ...p.catalog,
                                    sheets: p.catalog.sheets.map((x, k) => {
                                      if (k !== i) return x;
                                      if (raw === "") {
                                        const { qty: _drop, ...rest } = x;
                                        return rest;
                                      }
                                      return {
                                        ...x,
                                        qty: Math.max(0, Math.floor(Number(raw))),
                                      };
                                    }),
                                  },
                                }));
                              }}
                            />
                          </td>
                          <td>
                            <button
                              className="stock-remove"
                              title="Remove this stock size"
                              onClick={() =>
                                setProject((p) => ({
                                  ...p,
                                  catalog: {
                                    ...p.catalog,
                                    sheets: p.catalog.sheets.filter((_, k) => k !== i),
                                  },
                                }))
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="stock-add">
                  <button
                    onClick={() => {
                      const sheetMats = project.catalog.materials.filter(
                        (m) => m.kind === "sheet",
                      );
                      const first = sheetMats[0];
                      if (!first) return;
                      setProject((p) => ({
                        ...p,
                        catalog: {
                          ...p.catalog,
                          sheets: [
                            ...p.catalog.sheets,
                            {
                              materialId: first.id,
                              width: 48,
                              length: 96,
                              qty: 1,
                              label: "offcut",
                            },
                          ],
                        },
                      }));
                    }}
                  >
                    + Add sheet size
                  </button>
                  <span className="stock-hint">
                    Add the offcuts you already own. Leave Qty blank for a size
                    you can buy freely; the plan spends what you have first.
                  </span>
                </div>
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
