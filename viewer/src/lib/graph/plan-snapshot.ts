/**
 * Plan snapshot stripper (Phase 1).
 *
 * `stripSnapshot(graph)` returns a NEW `Graph` whose every `FileNode.params`
 * is replaced with `[]`. Everything else is preserved by structural copy:
 *  - top-level: version, root, generatedAt, clusters, edges
 *  - per-file:  id, path, name, folder, kind, sizeBytes, parseError, isTest,
 *               generated, generatedFrom
 *
 * Properties (locked by Vitest):
 *  - Pure: does not mutate input.
 *  - Idempotent: `stripSnapshot(stripSnapshot(g))` deep-equals `stripSnapshot(g)`.
 *
 * Why params? Per locked Q6 (plan §1) — `params` arrays dominate the
 * `xxlarge` 3MB fixture. Stripping them at `createPlan(name, liveGraph)` time
 * keeps each per-plan localStorage write under quota.
 */
import type { Graph } from "./types";

export function stripSnapshot(graph: Graph): Graph {
  return {
    version: graph.version,
    root: graph.root,
    generatedAt: graph.generatedAt,
    files: graph.files.map((f) => ({
      ...f,
      params: [],
    })),
    edges: graph.edges.map((e) => ({ ...e })),
    clusters: graph.clusters ? graph.clusters.map((c) => ({ ...c })) : [],
  };
}
