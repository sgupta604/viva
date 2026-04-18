import { describe, it, expect } from "vitest";
import { buildIndex } from "./index";
import type { Graph } from "@/lib/graph/types";

const graph: Graph = {
  version: 1,
  root: "r",
  files: [
    {
      id: "1",
      path: "config/radar.xml",
      name: "radar.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 0,
      params: [{ key: "radar.threshold_rain", value: "0.25", kind: "scalar", line: 1 }],
      parseError: null,
      isTest: false,
    },
    {
      id: "2",
      path: "config/ingestion.xml",
      name: "ingestion.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 0,
      params: [{ key: "ingestion.batch_size", value: "128", kind: "scalar", line: 1 }],
      parseError: null,
      isTest: false,
    },
  ],
  edges: [],
};

describe("search index", () => {
  it("matches on param keys (threshold)", () => {
    const fuse = buildIndex(graph);
    const hits = fuse.search("threshold");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.id).toBe("1");
  });
  it("matches on file name", () => {
    const fuse = buildIndex(graph);
    const hits = fuse.search("ingestion");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.id).toBe("2");
  });
});
