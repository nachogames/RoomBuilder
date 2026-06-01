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
  /** When >0, every setProject inside the group coalesces into the same
   *  history entry regardless of timing. Used for explicit interactions like
   *  a gizmo drag where the operation may exceed the time-based coalesce. */
  const groupDepth = useRef(0);
  /** Set when entering a group; first setProject inside MUST create a fresh
   *  history entry (so it can be undone), subsequent ones coalesce in. */
  const groupStarted = useRef(false);

  const setProject = useCallback(
    (u: Updater) => {
      setH((s) => {
        const next =
          typeof u === "function"
            ? (u as (p: Project) => Project)(s.present)
            : u;
        if (next === s.present) return s;
        const now = Date.now();
        let coalesce: boolean;
        if (groupDepth.current > 0) {
          coalesce = groupStarted.current;
          groupStarted.current = true;
        } else {
          coalesce = now - lastTs.current < coalesceMs;
        }
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

  const beginInteraction = useCallback(() => {
    groupDepth.current += 1;
    if (groupDepth.current === 1) groupStarted.current = false;
  }, []);

  const endInteraction = useCallback(() => {
    groupDepth.current = Math.max(0, groupDepth.current - 1);
    if (groupDepth.current === 0) {
      groupStarted.current = false;
      // Reset time-based coalesce so the next edit after an interaction
      // doesn't accidentally merge into it.
      lastTs.current = 0;
    }
  }, []);

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
    beginInteraction,
    endInteraction,
  };
}
