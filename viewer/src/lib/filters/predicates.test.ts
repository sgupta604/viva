import { describe, it, expect } from "vitest";
import { applyFilters } from "./predicates";
import type { Graph } from "@/lib/graph/types";

const g: Graph = {
  version: 1,
  root: "r",
  files: [
    {
      id: "a",
      path: "config/a.xml",
      name: "a.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 0,
      params: [{ key: "foo.bar", value: "1", kind: "scalar", line: 1 }],
      parseError: null,
      isTest: false,
    },
    {
      id: "t",
      path: "tests/t.xml",
      name: "t.xml",
      folder: "tests",
      kind: "xml",
      sizeBytes: 0,
      params: [],
      parseError: null,
      isTest: true,
    },
    {
      id: "y",
      path: "pipelines/p.yaml",
      name: "p.yaml",
      folder: "pipelines",
      kind: "yaml",
      sizeBytes: 0,
      params: [],
      parseError: null,
      isTest: false,
    },
  ],
  edges: [
    { source: "a", target: "y", kind: "include", unresolved: null },
    { source: "a", target: null, kind: "ref", unresolved: "ghost" },
  ],
};

describe("applyFilters", () => {
  it("hides tests by default", () => {
    const out = applyFilters(g, {
      kinds: new Set(["xml", "yaml", "json", "ini"]),
      hideTests: true,
      folder: null,
      searchQuery: "",
    });
    expect(out.files.map((f) => f.id)).not.toContain("t");
  });

  it("kind filter removes yaml", () => {
    const out = applyFilters(g, {
      kinds: new Set(["xml"]),
      hideTests: true,
      folder: null,
      searchQuery: "",
    });
    expect(out.files.map((f) => f.id)).toEqual(["a"]);
    expect(out.edges).toHaveLength(1); // the unresolved one survives
  });

  it("search matches on param keys", () => {
    const out = applyFilters(g, {
      kinds: new Set(["xml", "yaml", "json", "ini"]),
      hideTests: true,
      folder: null,
      searchQuery: "foo.bar",
    });
    expect(out.files.map((f) => f.id)).toEqual(["a"]);
  });

  it("keeps unresolved edges when source is visible", () => {
    const out = applyFilters(g, {
      kinds: new Set(["xml", "yaml", "json", "ini"]),
      hideTests: true,
      folder: null,
      searchQuery: "",
    });
    expect(out.edges.some((e) => e.target === null)).toBe(true);
  });
});
