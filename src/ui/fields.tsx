import { useState } from "react";
import { useUnits } from "./units";

/** ↑/↓ step size in inches for dimension inputs. Default ¼", Shift = 1",
 *  Alt = 1/16" (metric: 5 / 25 / 1 mm). */
export function dimStep(
  units: string,
  mods: { shiftKey: boolean; altKey: boolean },
): number {
  const mm = units === "mm";
  if (mods.altKey) return mm ? 1 / 25.4 : 1 / 16;
  if (mods.shiftKey) return mm ? 25 / 25.4 : 1;
  return mm ? 5 / 25.4 : 0.25;
}

export const DIM_HINT =
  'Value ("5 1/8", 5.125) or math ("=96-5.125"). ↑/↓ steps ¼" — Shift: 1", Alt: 1/16"';

export function DimField({
  label,
  value,
  onChange,
  allowZero = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  allowZero?: boolean;
}) {
  const { fmt, parse, units } = useUnits();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? fmt(value).replace(/"$/, "").replace(/ mm$/, "");
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={shown}
        title={DIM_HINT}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
            return;
          }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const dir = e.key === "ArrowUp" ? 1 : -1;
          const cur = draft != null ? parse(draft) ?? value : value;
          const step = dimStep(units, e);
          const floor = allowZero ? 0 : step;
          const next = Math.max(floor, cur + dir * step);
          setDraft(null);
          onChange(next);
        }}
        onBlur={() => {
          if (draft != null) {
            const n = parse(draft);
            if (n != null && (n > 0 || (allowZero && n >= 0))) onChange(n);
            setDraft(null);
          }
        }}
      />
    </label>
  );
}

/** Units-aware numeric field: type=number so ↑/↓ arrows bump by `step`
 *  (in the displayed units). Value is stored internally in inches. */
export function StepField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const { units } = useUnits();
  const mm = units === "mm";
  const shown = mm
    ? Math.round(value * 25.4)
    : Math.round(value * 100) / 100;
  const stp = step ?? (mm ? 5 : 0.25);
  return (
    <label className="field">
      <span>
        {label} <em className="u">{mm ? "mm" : "in"}</em>
      </span>
      <input
        type="number"
        value={shown}
        step={stp}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(mm ? n / 25.4 : n);
        }}
      />
    </label>
  );
}

export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
