import { describe, it, expect } from "vitest";
import { groupByFolder } from "./group";
import type { FileNode } from "@/lib/graph/types";
import { sortFiles } from "./sort";

function mkFile(path: string, folder = ""): FileNode {
  return {
    id: path,
    path,
    name: path.split("/").pop()!,
    folder,
    kind: "xml",
    sizeBytes: 1,
    params: [],
    parseError: null,
    isTest: false,
  };
}

describe("groupByFolder", () => {
  it("buckets files by folder", () => {
    const files = [
      mkFile("config/a.xml", "config"),
      mkFile("config/b.xml", "config"),
      mkFile("shared/c.xml", "shared"),
    ];
    const r = groupByFolder(files);
    expect(r).toHaveLength(2);
    expect(r[0].folder).toBe("config");
    expect(r[0].files.map((f) => f.name)).toEqual(["a.xml", "b.xml"]);
    expect(r[1].folder).toBe("shared");
    expect(r[1].files.map((f) => f.name)).toEqual(["c.xml"]);
  });

  it("puts root (empty folder) files first", () => {
    const files = [
      mkFile("config/a.xml", "config"),
      mkFile("root.xml", ""),
    ];
    const r = groupByFolder(files);
    expect(r[0].folder).toBe("");
    expect(r[0].files[0].name).toBe("root.xml");
    expect(r[1].folder).toBe("config");
  });

  it("handles empty input", () => {
    expect(groupByFolder([])).toEqual([]);
  });

  it("preserves within-folder order from input", () => {
    const files = [
      mkFile("config/z.xml", "config"),
      mkFile("config/a.xml", "config"),
    ];
    const r = groupByFolder(files);
    expect(r[0].files.map((f) => f.name)).toEqual(["z.xml", "a.xml"]);
  });

  it("composes with sortFiles", () => {
    const files = [
      mkFile("config/z.xml", "config"),
      mkFile("config/a.xml", "config"),
      mkFile("shared/m.xml", "shared"),
    ];
    const sorted = sortFiles(files, [], "name", "asc");
    const r = groupByFolder(sorted);
    expect(r[0].folder).toBe("config");
    expect(r[0].files.map((f) => f.name)).toEqual(["a.xml", "z.xml"]);
    expect(r[1].folder).toBe("shared");
  });

  it("bucket keys sort ascending lexicographically (nested before sibling)", () => {
    const files = [
      mkFile("zeta/a.xml", "zeta"),
      mkFile("alpha/a.xml", "alpha"),
      mkFile("alpha/nested/a.xml", "alpha/nested"),
    ];
    const r = groupByFolder(files);
    expect(r.map((b) => b.folder)).toEqual(["alpha", "alpha/nested", "zeta"]);
  });
});
