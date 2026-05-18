import { createContext, useContext } from "react";
import type { Units } from "../domain/types";
import { formatLength, parseLength } from "../domain/measure";

const UnitsCtx = createContext<Units>("in");

export function UnitsProvider({
  units,
  children,
}: {
  units: Units;
  children: React.ReactNode;
}) {
  return <UnitsCtx.Provider value={units}>{children}</UnitsCtx.Provider>;
}

export function useUnits() {
  const units = useContext(UnitsCtx);
  return {
    units,
    fmt: (v: number) => formatLength(v, units),
    parse: (s: string) => parseLength(s, units),
  };
}
