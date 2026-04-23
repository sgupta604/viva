/**
 * Deterministic synthesizer for a ~3000-file graph.json fixture at v2 shape.
 *
 * Called at Playwright globalSetup time (NOT committed as a static file — the
 * file would be ~2 MB of bloat in the repo). The seed is fixed so generation
 * is idempotent across CI and local runs.
 *
 * Shape contract (asserted by `fps-bench.spec.ts` and `large-scale.spec.ts`):
 *   - total files ≈ 3000 (LARGE_FIXTURE.TOP × MID × LEAF plus `.d/` adjustments)
 *   - ~1700 XML (remainder split across yaml/json/ini)
 *   - 2 `.d/` aggregate clusters with 10 children each
 *   - ≥ 5 xsd edges
 *   - ≥ 20 logical-id edges
 *   - ≥ 1 xi:include-like `include` edge per top-level folder (≥ 20)
 *   - clusters[] populated bottom-up
 *
 * The generated file goes to  viewer/e2e/fixtures/large/graph.json  AND is
 * staged into public/ + dist/ by global-setup.ts for a Vite preview serve.
 *
 * OFFLINE: pure stdlib node. No fetch.
 */

import { createHash } from "node:crypto";
import type { Graph } from "@/lib/graph/types";

export const LARGE_FIXTURE = {
  TOP: 20,
  MID: 15,
  LEAF: 10,
  D_AGGREGATE_COUNT: 2,
  D_AGGREGATE_CHILDREN: 10,
} as const;

type FileKind = "xml" | "yaml" | "json" | "ini";
type EdgeKind =
  | "include"
  | "ref"
  | "import"
  | "xsd"
  | "d-aggregate"
  | "logical-id";

interface GenFileNode {
  id: string;
  path: string;
  name: string;
  folder: string;
  kind: FileKind;
  sizeBytes: number;
  params: Array<{
    key: string;
    value: string;
    kind: "scalar" | "list" | "map";
    line: number | null;
  }>;
  parseError: string | null;
  isTest: boolean;
  generated: boolean;
  generatedFrom: string | null;
}
interface GenEdge {
  source: string;
  target: string | null;
  kind: EdgeKind;
  unresolved: string | null;
  attrs?: { order?: number };
}
interface GenCluster {
  path: string;
  parent: string | null;
  childFiles: string[];
  childClusters: string[];
  kind: "folder" | "d-aggregate";
}

export interface LargeGraph {
  version: 2;
  root: string;
  files: GenFileNode[];
  edges: GenEdge[];
  clusters: GenCluster[];
}

function sha1(s: string): string {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 10);
}

/** Mulberry32 PRNG — deterministic, byte-stable across runs for a given seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKind(rng: () => number): FileKind {
  // Target mix: ~56% xml, 15% yaml, 15% json, 14% ini
  const r = rng();
  if (r < 0.57) return "xml";
  if (r < 0.72) return "yaml";
  if (r < 0.86) return "json";
  return "ini";
}

export function generateLargeGraph(seed = 1): LargeGraph {
  const rng = mulberry32(seed);
  const { TOP, MID, LEAF, D_AGGREGATE_COUNT, D_AGGREGATE_CHILDREN } =
    LARGE_FIXTURE;

  const files: GenFileNode[] = [];
  const clusters: GenCluster[] = [];
  const edges: GenEdge[] = [];

  for (let t = 0; t < TOP; t += 1) {
    const topName = `top${t.toString().padStart(2, "0")}`;
    const topPath = topName;
    const topChildClusters: string[] = [];
    const topCluster: GenCluster = {
      path: topPath,
      parent: null,
      childFiles: [],
      childClusters: topChildClusters,
      kind: "folder",
    };
    clusters.push(topCluster);

    for (let m = 0; m < MID; m += 1) {
      const midName = `mid${m.toString().padStart(2, "0")}`;
      const isDAggregate = t < D_AGGREGATE_COUNT && m === MID - 1;

      const effectiveMidPath = isDAggregate
        ? `${topPath}/${midName}.d`
        : `${topPath}/${midName}`;
      topChildClusters.push(effectiveMidPath);

      const midChildFiles: string[] = [];
      clusters.push({
        path: effectiveMidPath,
        parent: topPath,
        childFiles: midChildFiles,
        childClusters: [],
        kind: isDAggregate ? "d-aggregate" : "folder",
      });

      const leafCount = isDAggregate ? D_AGGREGATE_CHILDREN : LEAF;
      for (let l = 0; l < leafCount; l += 1) {
        // Force leaf00 + leaf01 in mid00 to xml — needed as anchors for
        // the deterministic xsd / logical-id edge emission below.
        const isAnchor = m === 0 && l <= 1;
        const fileKind: FileKind = isDAggregate || isAnchor
          ? "xml"
          : pickKind(rng);
        const ext = fileKind;
        const base = isDAggregate
          ? `${(l + 1).toString().padStart(2, "0")}-piece${l}`
          : `leaf${l.toString().padStart(2, "0")}`;
        const fileName = `${base}.${ext}`;
        const filePath = `${effectiveMidPath}/${fileName}`;
        const fileId = sha1(filePath);
        midChildFiles.push(fileId);

        files.push({
          id: fileId,
          path: filePath,
          name: fileName,
          folder: effectiveMidPath,
          kind: fileKind,
          sizeBytes: 200 + Math.floor(rng() * 500),
          params: [
            {
              key: `param_${t}_${m}_${l}`,
              value: `v${t}.${m}.${l}`,
              kind: "scalar",
              line: 1,
            },
          ],
          parseError: null,
          isTest: false,
          generated: false,
          generatedFrom: null,
        });
      }

      if (isDAggregate) {
        // Add sibling parent `foo.xml` under the top cluster (contract rule:
        // `.d/` dir paired with sibling file of matching stem).
        const parentName = `${midName}.xml`;
        const parentPath = `${topPath}/${parentName}`;
        const parentId = sha1(parentPath);
        files.push({
          id: parentId,
          path: parentPath,
          name: parentName,
          folder: topPath,
          kind: "xml",
          sizeBytes: 400,
          params: [],
          parseError: null,
          isTest: false,
          generated: false,
          generatedFrom: null,
        });
        topCluster.childFiles.push(parentId);

        // Emit d-aggregate edges to each child with attrs.order
        midChildFiles.forEach((childId, idx) => {
          edges.push({
            source: parentId,
            target: childId,
            kind: "d-aggregate",
            unresolved: null,
            attrs: { order: idx + 1 },
          });
        });
      }
    }
  }

  // Guarantee ≥ 1 include edge per top cluster
  for (let t = 0; t < TOP; t += 1) {
    const topName = `top${t.toString().padStart(2, "0")}`;
    const topFiles = files.filter(
      (f) => f.folder.startsWith(`${topName}/`) && !f.folder.endsWith(".d"),
    );
    if (topFiles.length >= 2) {
      edges.push({
        source: topFiles[0].id,
        target: topFiles[1].id,
        kind: "include",
        unresolved: null,
      });
    }
  }

  // XSD edges (≥5 required; emit 8 for margin)
  for (let t = 0; t < 8; t += 1) {
    const topName = `top${t.toString().padStart(2, "0")}`;
    const mid00Files = files.filter(
      (f) => f.folder === `${topName}/mid00` && f.kind === "xml",
    );
    if (mid00Files.length >= 2) {
      edges.push({
        source: mid00Files[0].id,
        target: mid00Files[1].id,
        kind: "xsd",
        unresolved: null,
      });
    }
  }

  // Logical-id edges (≥20; emit 30 for margin). Cross-top deterministic links.
  for (let t = 0; t < 30; t += 1) {
    const aName = `top${(t % TOP).toString().padStart(2, "0")}`;
    const bName = `top${((t + 1) % TOP).toString().padStart(2, "0")}`;
    const src = files.find((f) => f.path === `${aName}/mid00/leaf00.xml`);
    const tgt = files.find((f) => f.path === `${bName}/mid00/leaf01.xml`);
    if (src && tgt) {
      edges.push({
        source: src.id,
        target: tgt.id,
        kind: "logical-id",
        unresolved: null,
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  clusters.sort((a, b) => a.path.localeCompare(b.path));
  edges.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return (a.target ?? "").localeCompare(b.target ?? "");
  });

  return {
    version: 2,
    root: "synthetic-large",
    files,
    edges,
    clusters,
  };
}

/** Type shim — the generator emits an in-spec v2 Graph. */
export function generateLargeGraphAsGraph(seed = 1): Graph {
  return generateLargeGraph(seed) as unknown as Graph;
}
