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
  deskAssembly,
  normalizeProject,
  uid,
} from "../domain/defaults";
import { buildProject } from "../geometry";
import { buildCutList } from "../cutlist";
import { buildPocketPlan } from "../pockets/plan";
import { buildBom } from "../bom/aggregate";
import { checkCarcass, worstLevel } from "../domain/checks";
import { checkRunnerSag } from "../domain/sag";
import { Scene } from "../scene/Scene";
import { DimField, NumField, SelectField } from "./fields";
import { UnitsProvider, useUnits } from "./units";
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
type Tab = "3D" | "Cut list" | "Pocket plan" | "Materials";

export default function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  return (
    <UnitsProvider units={project.units}>
      <Workspace project={project} setProject={setProject} />
    </UnitsProvider>
  );
}

function Workspace({
  project,
  setProject,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
}) {
  const { fmt } = useUnits();
  const [selId, setSelId] = useState<string>(
    project.carcasses[0]?.id ?? "",
  );
  const [tab, setTab] = useState<Tab>("3D");
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected =
    project.carcasses.find((c) => c.id === selId) ?? project.carcasses[0];

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
    }, 800);
    return () => clearTimeout(t);
  }, [project]);

  useEffect(() => {
    listProjects().then(setSavedNames).catch(() => {});
  }, []);

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
    const count = Math.max(0, Math.min(20, Math.round(n)));
    const t = project.catalog.materials.find(
      (m) => m.id === selected.carcassMaterialId,
    )!.thickness;
    const interiorH = selected.height - selected.toeKickHeight - 2 * t;
    const attach = selected.shelves[0]?.attachment ?? "pocket-screw";
    const shelves = Array.from({ length: count }, (_, i) => ({
      offsetFromBottom:
        Math.round(((interiorH * (i + 1)) / (count + 1)) * 16) / 16,
      attachment: attach,
    }));
    patchSelected({ shelves });
  }

  function addBookcase() {
    const c = {
      ...defaultBookcase(),
      id: uid("carcass"),
      position: { x: 0, z: 0 },
    };
    setProject((p) => ({ ...p, carcasses: [...p.carcasses, c] }));
    setSelId(c.id);
  }

  function addRunner() {
    if (project.carcasses.length === 0) return;
    const r = defaultRunner(project.carcasses.map((c) => c.id));
    setProject((p) => ({ ...p, runners: [...p.runners, r] }));
  }

  function addDesk() {
    const { carcasses, runner } = deskAssembly();
    setProject((p) => ({
      ...p,
      carcasses: [...p.carcasses, ...carcasses],
      runners: [...p.runners, runner],
    }));
  }

  function addTote() {
    setProject((p) => ({ ...p, refBoxes: [...p.refBoxes, defaultRefBox()] }));
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
          value=""
          onChange={(e) => {
            if (e.target.value)
              loadProject(e.target.value).then((p) => {
                if (p) {
                  setProject(normalizeProject(p));
                  setSelId(p.carcasses[0]?.id ?? "");
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

          <div className="row">
            <h3>Carcasses</h3>
            <span>
              <button onClick={addBookcase}>+ Case</button>{" "}
              <button onClick={addDesk}>+ Desk</button>
            </span>
          </div>
          {selected && (
            <>
              <select
                value={selected.id}
                onChange={(e) => setSelId(e.target.value)}
              >
                {project.carcasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
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
                onChange={(v) => patchSelected({ height: v })}
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
                onChange={(v) => patchSelected({ toeKickHeight: v })}
              />
              <DimField
                label="Pos X"
                value={selected.position.x}
                allowZero
                onChange={(v) =>
                  patchSelected({
                    position: { ...selected.position, x: v },
                  })
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

          <div className="row">
            <h3>Runners</h3>
            <button onClick={addRunner}>+ Runner</button>
          </div>
          {project.runners.map((r) => (
            <div key={r.id} className="sub">
              <input
                className="proj-name"
                style={{ width: "100%" }}
                value={r.label}
                onChange={(e) =>
                  patchRunner(r.id, { label: e.target.value })
                }
              />
              <SelectField
                label="Board"
                value={r.boardMaterialId}
                options={project.catalog.materials.map((m) => m.id)}
                onChange={(v) => patchRunner(r.id, { boardMaterialId: v })}
              />
              <DimField
                label="Top height"
                value={r.bottomHeight}
                onChange={(v) => patchRunner(r.id, { bottomHeight: v })}
              />
              <DimField
                label="Depth"
                value={r.depth}
                onChange={(v) => patchRunner(r.id, { depth: v })}
              />
              <DimField
                label="Overhang"
                value={r.overhangEachEnd}
                allowZero
                onChange={(v) =>
                  patchRunner(r.id, { overhangEachEnd: v })
                }
              />
              <SelectField
                label="Fastening"
                value={r.fastening}
                options={RUNNER_FASTEN}
                onChange={(v) => patchRunner(r.id, { fastening: v })}
              />
              <div className="row">
                <span className="label">
                  Spans {r.spannedCarcassIds.length} / supports{" "}
                  {r.supports.length}
                </span>
                <button
                  onClick={() =>
                    patchRunner(r.id, {
                      supports: [
                        ...r.supports,
                        {
                          id: uid("sup"),
                          kind: "leg",
                          offsetFromLeft: 24,
                        },
                      ],
                    })
                  }
                >
                  + Support
                </button>
              </div>
              {r.supports.map((s, i) => (
                <div key={s.id} className="row">
                  <select
                    value={s.kind}
                    onChange={(e) =>
                      patchRunner(r.id, {
                        supports: r.supports.map((x) =>
                          x.id === s.id
                            ? {
                                ...x,
                                kind: e.target.value as SupportKind,
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    {SUPPORT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <DimField
                    label={`#${i + 1} @`}
                    value={s.offsetFromLeft}
                    allowZero
                    onChange={(v) =>
                      patchRunner(r.id, {
                        supports: r.supports.map((x) =>
                          x.id === s.id
                            ? { ...x, offsetFromLeft: v }
                            : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
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

          <div className="row">
            <h3>Reference</h3>
            <button onClick={addTote}>+ Tote</button>
          </div>
          {project.refBoxes.map((b) => (
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
        </aside>

        <main className="view">
          <nav className="tabs">
            {(["3D", "Cut list", "Pocket plan", "Materials"] as Tab[]).map(
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
              <div className="canvas-wrap">
                <Scene project={project} />
              </div>
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
