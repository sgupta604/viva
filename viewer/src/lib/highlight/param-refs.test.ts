import { describe, it, expect } from "vitest";
import { highlightsFor } from "./param-refs";
import type { Graph } from "@/lib/graph/types";

const graph: Graph = {
  version: 1,
  root: "r",
  files: [
    {
      id: "declarer",
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
      id: "user",
      path: "config/ingestion.xml",
      name: "ingestion.xml",
      folder: "config",
      kind: "xml",
      sizeBytes: 0,
      params: [],
      parseError: null,
      isTest: false,
    },
    {
      id: "copycat",
      path: "shared/common.xml",
      name: "common.xml",
      folder: "shared",
      kind: "xml",
      sizeBytes: 0,
      params: [{ key: "radar.threshold_rain", value: "0.0", kind: "scalar", line: 1 }],
      parseError: null,
      isTest: false,
    },
  ],
  edges: [{ source: "user", target: "declarer", kind: "ref", unresolved: null }],
};

describe("highlightsFor", () => {
  it("edge-resolved contains the ref source and target", () => {
    const h = highlightsFor("radar.threshold_rain", graph);
    expect(h.edgeResolved.has("user")).toBe(true);
    expect(h.edgeResolved.has("declarer")).toBe(true);
  });

  it("name-only match is muted, not edge-resolved", () => {
    const h = highlightsFor("radar.threshold_rain", graph);
    expect(h.nameMatch.has("copycat")).toBe(true);
    expect(h.edgeResolved.has("copycat")).toBe(false);
  });
});
