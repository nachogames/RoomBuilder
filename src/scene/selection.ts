/**
 * Multi-selection helpers. We model selection as the pair (primary, extras):
 *   - `primary` is the single item the inspector / gizmo / keyboard nudge bind
 *     to. Same semantics as the pre-existing single selection.
 *   - `extras` are additional items added by Cmd/Ctrl-click. They render with
 *     the same highlight outline and flow into the cutlist alongside primary,
 *     but they aren't the "active" item for editing.
 *
 * The merged set used by consumers that care about "what's highlighted" or
 * "what's in the cutlist" is `unionIds(state)`.
 */
export interface SelectionState {
  primary: string;
  extras: ReadonlySet<string>;
}

export function emptySelection(): SelectionState {
  return { primary: "", extras: new Set() };
}

export function unionIds(s: SelectionState): ReadonlySet<string> {
  if (!s.primary) return s.extras;
  if (s.extras.has(s.primary)) return s.extras;
  const out = new Set(s.extras);
  out.add(s.primary);
  return out;
}

/** Plain click on an item: replace the whole selection with just this id. */
export function replace(id: string): SelectionState {
  return { primary: id, extras: new Set() };
}

/** Plain click on empty space: clear everything. */
export function clear(): SelectionState {
  return emptySelection();
}

/**
 * Cmd/Ctrl-click on an item:
 *   - if it's already in the union, remove it. If we removed the primary,
 *     promote one of the extras to primary (or clear if none left).
 *   - otherwise add it as an extra (keeping current primary).
 *   - special case: clicking the primary on an otherwise-empty selection
 *     clears the selection (matches the macOS "click again to deselect"
 *     intuition).
 */
export function toggle(s: SelectionState, id: string): SelectionState {
  if (!id) return s;
  const isPrimary = s.primary === id;
  const isExtra = s.extras.has(id);
  if (!isPrimary && !isExtra) {
    if (!s.primary) return { primary: id, extras: new Set() };
    const extras = new Set(s.extras);
    extras.add(id);
    return { primary: s.primary, extras };
  }
  if (isExtra) {
    const extras = new Set(s.extras);
    extras.delete(id);
    return { primary: s.primary, extras };
  }
  // removing primary
  const first = s.extras.values().next();
  if (first.done) return emptySelection();
  const extras = new Set(s.extras);
  extras.delete(first.value);
  return { primary: first.value, extras };
}

/**
 * Serialize for viewState. Format: primary id, then a comma + extras (sorted
 * for stable output). A bare id (no commas) is legal and round-trips through
 * the legacy single-string viewState format.
 */
export function serialize(s: SelectionState): string {
  if (!s.primary && s.extras.size === 0) return "";
  const xs = [...s.extras].sort();
  if (!s.primary) return xs.join(",");
  if (xs.length === 0) return s.primary;
  return [s.primary, ...xs].join(",");
}

export function deserialize(raw: string | undefined): SelectionState {
  if (!raw) return emptySelection();
  const parts = raw.split(",").filter(Boolean);
  if (parts.length === 0) return emptySelection();
  const [primary, ...rest] = parts;
  return { primary, extras: new Set(rest) };
}
