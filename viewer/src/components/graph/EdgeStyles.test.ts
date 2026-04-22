import { describe, it, expect } from "vitest";
import { edgeStyleFor } from "./EdgeStyles";

describe("edgeStyleFor", () => {
  it("colors include blue, ref amber, import green (v1 unchanged)", () => {
    expect(edgeStyleFor("include", false).stroke).toBe("#60a5fa");
    expect(edgeStyleFor("ref", false).stroke).toBe("#fbbf24");
    expect(edgeStyleFor("import", false).stroke).toBe("#34d399");
  });

  it("renders xsd as dashed green", () => {
    const s = edgeStyleFor("xsd", false);
    expect(s.stroke).toBe("#4ade80");
    expect(s.strokeDasharray).toBe("6 3");
  });

  it("renders d-aggregate as subtle gray thin", () => {
    const s = edgeStyleFor("d-aggregate", false);
    expect(s.stroke).toBe("#9ca3af");
    expect(s.strokeWidth).toBe(1);
  });

  it("renders logical-id as solid amber", () => {
    const s = edgeStyleFor("logical-id", false);
    expect(s.stroke).toBe("#f59e0b");
    expect(s.strokeDasharray).toBeUndefined();
  });

  it("applies red-dashed error treatment for any unresolved", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      const s = edgeStyleFor(k, true);
      expect(s.stroke).toBe("#ef4444");
      expect(s.strokeDasharray).toBe("4 3");
    }
  });
});
