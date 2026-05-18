import { useEffect, useMemo, useRef, useState } from "react";
import type { Carcass, Project, ShelfAttachment } from "../domain/types";
import { defaultProject, defaultBookcase, uid } from "../domain/defaults";
import { buildAll } from "../geometry/carcass";
import { buildCutList } from "../cutlist";
import { buildPocketPlan } from "../pockets/plan";
import { buildBom } from "../bom/aggregate";
import { checkCarcass, worstLevel } from "../domain/checks";
import { formatInches } from "../domain/units";
import { Scene } from "../scene/Scene";
import { DimField, NumField, SelectField } from "./fields";
import {
  bomCsv,
  cutListCsv,
  downloadText,
  pocketCsv,
} from "../report/csv";
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
type Tab = "3D" | "Cut list" | "Pocket plan" | "Materials";

export default function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [selId, setSelId] = useState<string>(project.carcasses[0].id);
  const [tab, setTab] = useState<Tab>("3D");
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected =
    project.carcasses.find((c) => c.id === selId) ?? project.carcasses[0];

  const derived = useMemo(() => {
    const g = buildAll(project.carcasses, project.catalog);
    const cutList = buildCutList(g.parts, project.catalog);
    const pocketPlan = buildPocketPlan(g.joints, g.parts, project.catalog);
    const bom = buildBom(g.joints, cutList, pocketPlan);
    return { ...g, cutList, pocketPlan, bom };
  }, [project]);

  const checks = useMemo(
    () => project.carcasses.flatMap((c) => checkCarcass(c, project)),
    [project],
  );

  // autosave (debounced) to IndexedDB
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
    setProject((p) => ({
      ...p,
      carcasses: p.carcasses.map((c) =>
        c.id === selected.id ? { ...c, ...patch } : c,
      ),
    }));
  }

  function setShelfCount(n: number) {
    const count = Math.max(0, Math.min(20, Math.round(n)));
    const interiorH =
      selected.height -
      selected.toeKickHeight -
      2 * project.catalog.materials.find((m) => m.id === selected.carcassMaterialId)!
        .thickness;
    const attach = selected.shelves[0]?.attachment ?? "pocket-screw";
    const shelves = Array.from({ length: count }, (_, i) => ({
      offsetFromBottom: Math.round(((interiorH * (i + 1)) / (count + 1)) * 16) / 16,
      attachment: attach,
    }));
    patchSelected({ shelves });
  }

  function setShelfAttachment(a: ShelfAttachment) {
    patchSelected({
      shelves: selected.shelves.map((s) => ({ ...s, attachment: a })),
    });
  }

  function addBookcase() {
    const c = { ...defaultBookcase(), id: uid("carcass"), position: { x: 0, z: 0 } };
    setProject((p) => ({ ...p, carcasses: [...p.carcasses, c] }));
    setSelId(c.id);
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
        <div className="spacer" />
        <button onClick={() => saveProjectToDisk(project).then((m) => setStatus(`Saved to ${m}`))}>
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
                  setProject(p);
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
            <button onClick={addBookcase}>+ Add</button>
          </div>
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
            onChange={(v) => patchSelected({ toeKickHeight: v })}
          />
          <DimField
            label="Target opening"
            value={selected.targetOpeningWidth ?? 0}
            onChange={(v) =>
              patchSelected({ targetOpeningWidth: v > 0 ? v : undefined })
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
            onChange={setShelfAttachment}
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
              onChange={(e) => patchSelected({ hasBack: e.target.checked })}
            />
          </label>
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
                  downloadText("pocket-plan.csv", pocketCsv(derived.pocketPlan))
                }
              >
                Export CSV
              </button>
            )}
            {tab === "Materials" && (
              <button
                onClick={() => downloadText("materials.csv", bomCsv(derived.bom))}
              >
                Export CSV
              </button>
            )}
          </nav>

          {checks.length > 0 && (
            <div className={`checks ${overall}`}>
              {checks.map((c, i) => (
                <div key={i} className={c.level}>
                  {c.level === "error" ? "⛔" : c.level === "warn" ? "⚠️" : "✅"}{" "}
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
                                  <td>{formatInches(pl.w)}</td>
                                  <td>{formatInches(pl.h)}</td>
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
                                  {formatInches(b.leftover)})
                                </th>
                                <th>Length</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.cuts.map((c, k) => (
                                <tr key={k}>
                                  <td>{c.label}</td>
                                  <td>{formatInches(c.length)}</td>
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
                        <td>{formatInches(e.setting.collarDepth)}</td>
                        <td>
                          {formatInches(e.setting.screwLength)}{" "}
                          {e.setting.screwType}
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
