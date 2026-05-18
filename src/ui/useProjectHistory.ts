import { useCallback, useRef, useState } from "react";
import type { Project } from "../domain/types";

type Updater = Project | ((p: Project) => Project);

interface Hist {
  past: Project[];
  present: Project;
  future: Project[];
}

/**
 * Project state with undo/redo. Rapid edits within `coalesceMs` (e.g. a drag
 * burst) collapse into a single undo step; the pre-burst state is preserved.
 */
export function useProjectHistory(initial: Project, coalesceMs = 600) {
  const [h, setH] = useState<Hist>({
    past: [],
    present: initial,
    future: [],
  });
  const lastTs = useRef(0);

  const setProject = useCallback(
    (u: Updater) => {
      setH((s) => {
        const next =
          typeof u === "function"
            ? (u as (p: Project) => Project)(s.present)
            : u;
        if (next === s.present) return s;
        const now = Date.now();
        const coalesce = now - lastTs.current < coalesceMs;
        lastTs.current = now;
        return {
          past: coalesce ? s.past : [...s.past, s.present].slice(-100),
          present: next,
          future: [],
        };
      });
    },
    [coalesceMs],
  );

  const undo = useCallback(() => {
    lastTs.current = 0;
    setH((s) =>
      s.past.length === 0
        ? s
        : {
            past: s.past.slice(0, -1),
            present: s.past[s.past.length - 1],
            future: [s.present, ...s.future],
          },
    );
  }, []);

  const redo = useCallback(() => {
    lastTs.current = 0;
    setH((s) =>
      s.future.length === 0
        ? s
        : {
            past: [...s.past, s.present],
            present: s.future[0],
            future: s.future.slice(1),
          },
    );
  }, []);

  return {
    project: h.present,
    setProject,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
