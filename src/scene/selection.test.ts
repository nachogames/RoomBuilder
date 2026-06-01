import { describe, expect, it } from "vitest";
import {
  clear,
  deserialize,
  emptySelection,
  replace,
  serialize,
  toggle,
  unionIds,
} from "./selection";

describe("selection", () => {
  it("starts empty", () => {
    const s = emptySelection();
    expect(s.primary).toBe("");
    expect(s.extras.size).toBe(0);
    expect(unionIds(s).size).toBe(0);
  });

  it("replace sets primary, clears extras", () => {
    // build a multi-selection first to verify replace truly clears extras
    toggle(toggle(emptySelection(), "a"), "b");
    const r = replace("c");
    expect(r.primary).toBe("c");
    expect(r.extras.size).toBe(0);
  });

  it("clear wipes everything", () => {
    toggle(replace("a"), "b");
    const c = clear();
    expect(c.primary).toBe("");
    expect(c.extras.size).toBe(0);
  });

  it("toggle on empty adds as primary", () => {
    const s = toggle(emptySelection(), "a");
    expect(s.primary).toBe("a");
    expect(s.extras.size).toBe(0);
  });

  it("toggle adds extra when primary exists", () => {
    const s = toggle(replace("a"), "b");
    expect(s.primary).toBe("a");
    expect([...s.extras]).toEqual(["b"]);
  });

  it("toggle removes existing extra", () => {
    const s = toggle(toggle(replace("a"), "b"), "b");
    expect(s.primary).toBe("a");
    expect(s.extras.size).toBe(0);
  });

  it("toggling primary with no extras clears the selection", () => {
    const s = toggle(replace("a"), "a");
    expect(s.primary).toBe("");
    expect(s.extras.size).toBe(0);
  });

  it("toggling primary with extras promotes an extra", () => {
    const before = toggle(replace("a"), "b");
    const after = toggle(before, "a");
    expect(after.primary).toBe("b");
    expect(after.extras.size).toBe(0);
  });

  it("union includes primary plus extras", () => {
    const s = toggle(toggle(replace("a"), "b"), "c");
    expect([...unionIds(s)].sort()).toEqual(["a", "b", "c"]);
  });

  it("serializes single id as bare string (legacy-compatible)", () => {
    expect(serialize(replace("a"))).toBe("a");
  });

  it("serializes multi as comma list with primary first", () => {
    const s = toggle(toggle(replace("a"), "c"), "b");
    expect(serialize(s)).toBe("a,b,c");
  });

  it("deserializes legacy bare string", () => {
    const s = deserialize("only");
    expect(s.primary).toBe("only");
    expect(s.extras.size).toBe(0);
  });

  it("deserializes empty / undefined to empty", () => {
    expect(deserialize(undefined).primary).toBe("");
    expect(deserialize("").primary).toBe("");
  });

  it("round-trips through serialize/deserialize", () => {
    const original = toggle(toggle(replace("alpha"), "gamma"), "beta");
    const back = deserialize(serialize(original));
    expect(back.primary).toBe(original.primary);
    expect([...back.extras].sort()).toEqual([...original.extras].sort());
  });
});
