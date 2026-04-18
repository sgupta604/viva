import { describe, it, expect } from "vitest";
import { parseGraph, graphSchema } from "./schema";
import fixture from "../../../e2e/fixtures/graph.json";

describe("graph schema", () => {
  it("parses the committed fixture", () => {
    const g = parseGraph(fixture);
    expect(g.version).toBe(1);
    expect(Array.isArray(g.files)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });

  it("rejects a missing files field", () => {
    const bad = { ...(fixture as object), files: undefined };
    const result = graphSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown file kind", () => {
    const mutated = JSON.parse(JSON.stringify(fixture));
    if (mutated.files.length > 0) mutated.files[0].kind = "toml";
    const result = graphSchema.safeParse(mutated);
    expect(result.success).toBe(false);
  });
});
