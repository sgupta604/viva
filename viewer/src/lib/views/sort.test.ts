import { describe, it, expect } from "vitest";
import { sortFiles } from "./sort";
import type { Edge, FileNode } from "@/lib/graph/types";

function mkFile(overrides: Partial<FileNode>): FileNode {
  return {
    id: overrides.id ?? "x",
    path: overrides.path ?? "x.xml",
    name: overrides.name ?? "x.xml",
    folder: overrides.folder ?? "",
    kind: overrides.kind ?? "xml",
    sizeBytes: overrides.sizeBytes ?? 0,
    params: overrides.params ?? [],
    parseError: overrides.parseError ?? null,
    isTest: overrides.isTest ?? false,
  };
}

const files: FileNode[] = [
  mkFile({ id: "a", name: "banana.xml", path: "config/banana.xml", sizeBytes: 200 }),
  mkFile({ id: "b", name: "apple.xml", path: "config/apple.xml", sizeBytes: 100, parseError: "boom" }),
  mkFile({ id: "c", name: "cherry.xml", path: "shared/cherry.xml", sizeBytes: 300 }),
];

const edges: Edge[] = [
  { source: "a", target: "c", kind: "include", unresolved: null },
  { source: "a", target: null, kind: "ref", unresolved: "unknown" },
  { source: "c", target: "b", kind: "include", unresolved: null },
];

describe("sortFiles", () => {
  it("sorts by name asc", () => {
    const r = sortFiles(files, edges, "name", "asc");
    expect(r.map((f) => f.name)).toEqual(["apple.xml", "banana.xml", "cherry.xml"]);
  });
  it("sorts by name desc", () => {
    const r = sortFiles(files, edges, "name", "desc");
    expect(r.map((f) => f.name)).toEqual(["cherry.xml", "banana.xml", "apple.xml"]);
  });
  it("sorts by path asc", () => {
    const r = sortFiles(files, edges, "path", "asc");
    expect(r.map((f) => f.path)).toEqual([
      "config/apple.xml",
      "config/banana.xml",
      "shared/cherry.xml",
    ]);
  });
  it("sorts by path desc", () => {
    const r = sortFiles(files, edges, "path", "desc");
    expect(r.map((f) => f.path)).toEqual([
      "shared/cherry.xml",
      "config/banana.xml",
      "config/apple.xml",
    ]);
  });
  it("sorts by size asc (numeric, not lexicographic)", () => {
    const r = sortFiles(files, edges, "size", "asc");
    expect(r.map((f) => f.sizeBytes)).toEqual([100, 200, 300]);
  });
  it("sorts by size desc", () => {
    const r = sortFiles(files, edges, "size", "desc");
    expect(r.map((f) => f.sizeBytes)).toEqual([300, 200, 100]);
  });
  it("sorts by refCount asc (a=2 outgoing, c=1, b=0)", () => {
    const r = sortFiles(files, edges, "refCount", "asc");
    expect(r.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });
  it("sorts by refCount desc", () => {
    const r = sortFiles(files, edges, "refCount", "desc");
    expect(r.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts by parseStatus asc (clean first, errors last)", () => {
    const r = sortFiles(files, edges, "parseStatus", "asc");
    // b has the parseError; it must sort last. Stable: a before c among clean.
    expect(r.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts by parseStatus desc (errors first)", () => {
    const r = sortFiles(files, edges, "parseStatus", "desc");
    expect(r[0].id).toBe("b");
  });
  it("does not mutate the input array", () => {
    const snapshot = files.map((f) => f.id);
    sortFiles(files, edges, "name", "desc");
    expect(files.map((f) => f.id)).toEqual(snapshot);
  });
  it("is stable within equal keys", () => {
    const equals = [
      mkFile({ id: "1", name: "same.xml", sizeBytes: 100 }),
      mkFile({ id: "2", name: "same.xml", sizeBytes: 100 }),
      mkFile({ id: "3", name: "same.xml", sizeBytes: 100 }),
    ];
    const r = sortFiles(equals, [], "name", "asc");
    expect(r.map((f) => f.id)).toEqual(["1", "2", "3"]);
  });
});
