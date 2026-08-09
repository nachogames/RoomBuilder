/** Lightweight persistence of UI/view state (which tab, selection, camera) so
 *  a reload drops you back where you were. Kept out of the project file. */
const KEY = "roombuilder.view";

export interface ViewState {
  tab?: string;
  sel?: string;
  /** name of the last-opened saved project, to reload on startup */
  project?: string;
  cam?: { pos: number[]; target: number[] };
  /** ids hidden via the browser-tree eye toggles (shared by Plan and 3D) */
  hidden?: string[];
  /** user-dragged Plan dimension-label offsets, keyed by label id */
  dimOffsets?: Record<string, { x: number; z: number }>;
  /** which Plan dimensions are shown: room walls / furniture items */
  dims?: { walls: boolean; items: boolean };
  /** persisted Measure-tool annotations (pairs of pick targets) */
  measurements?: Array<{ id: string; a: unknown; b: unknown }>;
}

export function loadViewState(): ViewState {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as ViewState;
  } catch {
    return {};
  }
}

export function saveViewState(patch: ViewState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadViewState(), ...patch }));
  } catch {
    /* ignore (private mode / unavailable storage) */
  }
}
