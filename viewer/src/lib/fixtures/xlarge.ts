/**
 * Parametric synthesizer for very-large graph.json fixtures (5k / 10k).
 *
 * Built on the same shape contract as `large.ts` (the 3k FPS-bench fixture)
 * but with tunable TOP × MID × LEAF and a slightly more realistic edge
 * topology for scale-testing the dendrogram view at thousands of files:
 *
 *   - **More cross-references.** ~15-20% of files have at least one outgoing
 *     reference, average ~2-3 refs per referencing file (matches what a real
 *     config codebase looks like — most files are leaves, a minority chain
 *     into others).
 *   - **Hub files.** A handful of "central config" files get 10+ outgoing
 *     refs each (think: a base.xml or env.json that everyone includes).
 *   - **Cross-folder references.** Refs deliberately span top-level folders
 *     so the dendrogram has visible cross-tree edges to render under load.
 *   - **File-type mix tuned closer to real-world.** ~60% XML / 20% JSON /
 *     10% YAML / 10% INI (vs. large.ts's 57/15/15/14 split).
 *
 * NOT committed as a static file — fixtures are generated at Playwright
 * globalSetup time (or via the standalone `scripts/generate-xlarge-fixture.mjs`
 * for ad-hoc browser scale-testing). The seed is fixed so generation is
 * idempotent across runs.
 *
 * The two production presets are:
 *   - XLARGE  (~5,000 files) — first scale gate.
 *   - XXLARGE (~10,000 files) — stress gate. If dendrogram holds here we're
 *     comfortable for the user's ~2,250-file Coder codebase with margin.
 *
 * OFFLINE: pure stdlib node. No fetch. No external deps.
 */

import { createHash } from "node:crypto";
import type { Graph } from "@/lib/graph/types";

export interface FixtureSpec {
  TOP: number;
  MID: number;
  LEAF: number;
  D_AGGREGATE_COUNT: number;
  D_AGGREGATE_CHILDREN: number;
  /** ~fraction of files that have outgoing cross-references. */
  REF_DENSITY: number;
  /** Average refs per referencing file. */
  REFS_PER_FILE: number;
  /** Number of "hub" files with 10+ outgoing refs. */
  HUB_COUNT: number;
  /** Outgoing refs per hub. */
  REFS_PER_HUB: number;
}

// ~5,000 files: 25 top × 12 mid × 16 leaf = 4,800 + 2 d-aggregate parents.
export const XLARGE_FIXTURE: FixtureSpec = {
  TOP: 25,
  MID: 12,
  LEAF: 16,
  D_AGGREGATE_COUNT: 2,
  D_AGGREGATE_CHILDREN: 12,
  REF_DENSITY: 0.18,
  REFS_PER_FILE: 2.5,
  HUB_COUNT: 4,
  REFS_PER_HUB: 12,
};

// ~10,000 files: 40 top × 15 mid × 16 leaf = 9,600 + d-aggregate parents.
export const XXLARGE_FIXTURE: FixtureSpec = {
  TOP: 40,
  MID: 15,
  LEAF: 16,
  D_AGGREGATE_COUNT: 4,
  D_AGGREGATE_CHILDREN: 12,
  REF_DENSITY: 0.18,
  REFS_PER_FILE: 2.5,
  HUB_COUNT: 6,
  REFS_PER_HUB: 14,
};

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

export interface SynthGraph {
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
  // Target mix: ~60% xml, 10% yaml, 20% json, 10% ini (real-world skew).
  const r = rng();
  if (r < 0.6) return "xml";
  if (r < 0.7) return "yaml";
  if (r < 0.9) return "json";
  return "ini";
}

function pickRefKind(rng: () => number): EdgeKind {
  // Distribution biased toward `include` and `ref`, with occasional `import`
  // and `logical-id`. xsd kept rare. Same kinds the renderer already styles.
  const r = rng();
  if (r < 0.45) return "include";
  if (r < 0.75) return "ref";
  if (r < 0.9) return "import";
  if (r < 0.97) return "logical-id";
  return "xsd";
}

export function generateSynthGraph(spec: FixtureSpec, seed = 1): SynthGraph {
  const rng = mulberry32(seed);
  const { TOP, MID, LEAF, D_AGGREGATE_COUNT, D_AGGREGATE_CHILDREN } = spec;

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
        const fileKind: FileKind =
          isDAggregate || isAnchor ? "xml" : pickKind(rng);
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

  // Cross-reference edges — proportional to file count for realistic density.
  // Skip the d-aggregate-parent files (they already have outgoing edges) and
  // restrict to leaf files to avoid double-edging the parents.
  const refCandidates = files.filter((f) => f.folder !== f.path.split("/")[0]);
  const referencingCount = Math.floor(refCandidates.length * spec.REF_DENSITY);
  for (let i = 0; i < referencingCount; i += 1) {
    const sourceIdx = Math.floor(rng() * refCandidates.length);
    const source = refCandidates[sourceIdx];
    const sourceTop = source.folder.split("/")[0];

    const refsForThisFile = Math.max(
      1,
      Math.round(spec.REFS_PER_FILE + (rng() - 0.5) * 2),
    );
    for (let r = 0; r < refsForThisFile; r += 1) {
      // Bias ~30% same-top-folder, ~70% cross-top-folder for realistic spread.
      const sameTop = rng() < 0.3;
      let target: GenFileNode | undefined;
      let attempts = 0;
      while (!target && attempts < 8) {
        const candIdx = Math.floor(rng() * refCandidates.length);
        const cand = refCandidates[candIdx];
        const candTop = cand.folder.split("/")[0];
        const matchesTopRule = sameTop ? candTop === sourceTop : candTop !== sourceTop;
        if (cand.id !== source.id && matchesTopRule) target = cand;
        attempts += 1;
      }
      if (!target) continue;
      edges.push({
        source: source.id,
        target: target.id,
        kind: pickRefKind(rng),
        unresolved: null,
      });
    }
  }

  // Hub files — pick HUB_COUNT files in mid00 and give each REFS_PER_HUB
  // outgoing refs spread across other top folders (the "central config that
  // everyone includes" pattern). Reverse the sense vs. above (everyone refs
  // INTO the hub) so the hub appears as a high-in-degree node — this is what
  // strains the renderer at scale.
  for (let h = 0; h < spec.HUB_COUNT; h += 1) {
    const hubTopIdx = Math.floor((TOP / spec.HUB_COUNT) * h);
    const hubTopName = `top${hubTopIdx.toString().padStart(2, "0")}`;
    const hub = files.find(
      (f) => f.path === `${hubTopName}/mid00/leaf00.xml`,
    );
    if (!hub) continue;
    for (let r = 0; r < spec.REFS_PER_HUB; r += 1) {
      const targetTopIdx = (hubTopIdx + 1 + r) % TOP;
      const targetTopName = `top${targetTopIdx.toString().padStart(2, "0")}`;
      const candidates = files.filter(
        (f) => f.folder.startsWith(`${targetTopName}/`) && f.id !== hub.id,
      );
      if (candidates.length === 0) continue;
      const target = candidates[Math.floor(rng() * candidates.length)];
      edges.push({
        source: hub.id,
        target: target.id,
        kind: "include",
        unresolved: null,
      });
    }
  }

  // Anchor edges (parity with large.ts contracts so the same renderers light up).
  // XSD edges (≥5).
  for (let t = 0; t < Math.min(8, TOP); t += 1) {
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

  // Logical-id edges (≥20).
  for (let t = 0; t < Math.min(30, TOP); t += 1) {
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
    root: `synthetic-${spec.TOP}x${spec.MID}x${spec.LEAF}`,
    files,
    edges,
    clusters,
  };
}

export function generateXLargeGraph(seed = 1): SynthGraph {
  return generateSynthGraph(XLARGE_FIXTURE, seed);
}

export function generateXXLargeGraph(seed = 1): SynthGraph {
  return generateSynthGraph(XXLARGE_FIXTURE, seed);
}

/** Type shim — the generator emits an in-spec v2 Graph. */
export function generateXLargeGraphAsGraph(seed = 1): Graph {
  return generateXLargeGraph(seed) as unknown as Graph;
}

export function generateXXLargeGraphAsGraph(seed = 1): Graph {
  return generateXXLargeGraph(seed) as unknown as Graph;
}
