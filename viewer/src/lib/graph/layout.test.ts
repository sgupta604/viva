import { describe, it, expect } from "vitest";
import { computeLayout } from "./layout";
import type { Graph } from "./types";

const tinyGraph: Graph = {
  version: 1,
  root: "test",
  files: [
    {
      id: "a",
      path: "config/a.xml",
      name: "a.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 10,
      params: [],
      parseError: null,
      isTest: false,
    },
    {
      id: "b",
      path: "config/b.xml",
      name: "b.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 10,
      params: [],
      parseError: null,
      isTest: false,
    },
  ],
  edges: [{ source: "a", target: "b", kind: "include", unresolved: null }],
};

describe("computeLayout", () => {
  it("returns one position per file", () => {
    const out = computeLayout(tinyGraph);
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
    expect(out.folders).toContain("config");
  });

  it("is deterministic for identical input", () => {
    const a = computeLayout(tinyGraph);
    const b = computeLayout(tinyGraph);
    expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
      b.nodes.map((n) => [n.id, n.x, n.y]),
    );
  });
});
