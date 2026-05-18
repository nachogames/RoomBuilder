import { useState } from "react";
import { useUnits } from "./units";

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
  const { fmt, parse } = useUnits();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? fmt(value).replace(/"$/, "").replace(/ mm$/, "");
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
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
