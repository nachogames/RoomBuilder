# RoomBuilder — Design Spec

**Date:** 2026-05-18
**Status:** Awaiting user approval

## Purpose

A browser-based 3D parametric configurator for designing rectilinear shelving
(bookcases, cabinets, spanning runner shelves) that fit a specific room, and
producing shop-ready output: a 3D preview, a cut list, a bill of materials, and
full pocket-hole drilling plans. It is **not** a general CAD tool — it models a
fixed, well-understood vocabulary of woodworking parts so it can automate the
parts SketchUp + OpenCutList cannot (pocket-hole drilling specs) without their
general-CAD friction.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Platform | Pure client-side web app. No backend. Deployable as a static site. |
| Stack | TypeScript, React, Vite, Three.js via react-three-fiber. |
| Persistence | IndexedDB autosave + in-app project list; JSON export/import; File System Access API direct-to-disk save where supported, download fallback elsewhere. |
| Units | Inches, displayed as fractions (e.g. `23 3/4"`). Metric is a later toggle, out of scope now. |
| Material | Both plywood sheet goods (2D nesting) and dimensional lumber (1D board cuts). |
| Pocket holes | Full Kreg drilling spec per joint: which member is drilled, hole count & spacing, jig drill-guide step, collar depth, exact screw length, derived from member thickness. |

## Domain model

All output (parts, joints, cut list, pocket-hole schedule, BOM) is **derived**
from the model and never stored, so it cannot drift out of sync.

- **Project** — units, stock catalog (sheet sizes, board sizes/species), kerf
  width, the room, and a list of furniture instances.
- **Room** — a footprint rectangle (length × width) + a ceiling height. Simple
  on purpose. A furniture item may carry a typed **target opening width**
  (e.g. `20.75"`); the fit check warns if its outside dimension exceeds that
  or the room.
- **Carcass** (shared primitive — bookcases, cabinets, desk cabinets are all
  this): two sides, top, bottom, back panel, optional toe kick, optional face
  frame, and N shelves. Each shelf has a position and an **attachment method**.
- **Runner / span board** — a board (e.g. a 2×12) that spans one or more
  carcasses. Its length is **derived** from the carcasses it spans (auto-follows
  when they move/resize). Has a fastening method and zero or more supports.
  Multiple stacked runners allowed.
- **Support** — corbel, bracket, leg, or cleat placed along a span at a
  position. Drives the sag check.
- **Desk** — a preset assembly: two carcasses + one runner/top. Flagged
  "reference" (models real parts so 3D/footprint are accurate); becoming a
  buildable item later is a flag flip, not a rebuild.
- **Reference box (Phase 3, deferred)** — a plain labeled box (e.g. a tote) for
  fit-checking. Model reserves space for it now; not built initially.

## Joinery — first-class and swappable

Every joint references a **method** from a registry. Methods:
`pocket-screw`, `shelf-pin`, `cleat`, `dado`, `screw-through`, `bracket`.
Switching a joint's method recomputes the cut list, hardware, and pocket-hole
schedule. Each method contributes:

- hardware items to the BOM (screws by length, shelf pins, brackets, etc.);
- geometry hints (e.g. dado removes material; cleat adds a part);
- for `pocket-screw`, a Kreg drilling spec entry.

## Checks

- **Fit check** — furniture outside dimensions vs room and vs typed target
  opening; red warning on overflow.
- **Sag check** — unsupported runner span vs a rule-of-thumb table keyed by
  board species and nominal size; warns and suggests adding a support.

## Modules (isolation boundaries)

1. **domain/** — typed model + invariants. Pure data, no rendering.
2. **geometry/** — model → `Part[]` + `Joint[]`. Pure functions.
3. **joinery/** — method registry: per-method hardware, geometry hints,
   pocket-hole spec. Pure.
4. **cutlist/** — `Part[]` grouped by material → 2D sheet nesting (guillotine)
   for sheet goods + 1D bin-packing for boards, kerf-aware; yields diagrams +
   offcut/yield. Pure.
5. **pockets/** — `Joint[]` (pocket-screw) + member thickness → Kreg schedule.
   Pure.
6. **bom/** — aggregate sheets, boards, hardware → quantities. Pure.
7. **scene/** — `Part[]` → react-three-fiber meshes; room shell; orbit camera.
8. **report/** — printable PDF (3D snapshot + cut diagrams + pocket schedule +
   BOM) and CSV cut list.
9. **persistence/** — IndexedDB store, project list, JSON import/export,
   File System Access API with download fallback.
10. **ui/** — parametric controls panel + viewport + reports.

Modules 1–6 are pure and the bulk of the value; they are unit-tested in
isolation without a browser.

## Testing

- **Vitest** unit tests for `domain`, `geometry`, `joinery`, `cutlist`,
  `pockets`, `bom` — including known-answer fixtures (e.g. a 14"-wide bookcase
  with 3 shelves produces an expected part list, screw count, and Kreg spec).
- TDD for the pure modules: tests before implementation.
- Playwright smoke test (optional, Phase 2): load app, build a bookcase,
  export a cut list.

## Phasing

- **Phase 1 (MVP):** Project + Room shell + a single Carcass (bookcase),
  parametric → 3D + cut list (sheet + board) + pocket-hole spec + BOM +
  PDF/CSV export + persistence. This alone beats the SketchUp workflow for
  your immediate need.
- **Phase 2:** Multiple carcasses; Runner spanning + Supports + sag check;
  full joinery-method swapping; Desk preset; Playwright smoke.
- **Phase 3:** Reference boxes (tote); metric toggle; polish.

## Out of scope

Cloud sync/accounts; general free-form CAD; curved/angled geometry; structural
engineering beyond the rule-of-thumb sag table; CNC export.

## Non-obvious risks

- 2D sheet nesting is the hardest algorithm; a simple guillotine cut packer is
  sufficient at this scale and is what Phase 1 ships.
- Kreg specs vary by jig model; Phase 1 targets the common Kreg 720/520-style
  drill-guide + collar settings and standard coarse/fine screw lengths,
  documented in a single editable table.
