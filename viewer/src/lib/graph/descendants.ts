/**
 * descendants.ts — pure helpers for computing the subtree of a folder cluster.
 *
 * Powers the "hover folder, light up its subtree" affordance in dendrogram +
 * tree modes (user feedback 2026-04-22). When sibling folders are expanded
 * side-by-side the children stack vertically with no visual binding back to
 * their parent — hovering a folder needs to be able to call out "all of
 * THESE descendants belong to me" without changing layout.
 *
 * Cluster mode does NOT consume these helpers — its containment boxes
 * already make subtree membership visually obvious.
 *
 * Why a separate module instead of extending hierarchy-store:
 *   - hierarchy-store deliberately avoids importing graph types (Decisions
 *     2026-04-20: stores stay flat and graph-agnostic so tests can stub
 *     them without dragging the schema in). Subtree walks need access to
 *     `clusters[].childClusters` + `childFiles` so they live next to the
 *     other graph-shape helpers.
 *   - Pure functions over `Graph` make these trivially memoizable from any
 *     React component or selector.
 */
import type { ClusterNode, Graph } from "./types";

/**
 * Return every descendant id (cluster paths AND file ids) under `folderId`,
 * INCLUSIVE of the folder itself. The inclusive form matches how callers use
 * the result: a "is this node in the focused subtree?" check should be true
 * for the root folder too (it stays lit when YOU hover IT).
 *
 * Returns an empty Set when:
 *   - `folderId` is null or empty
 *   - `folderId` does not match any cluster path (e.g. the focused node is
 *     a file id — files have no descendants, so the caller naturally falls
 *     back to the existing single-node focus path)
 *
 * Cycle-safe via a visiting guard, mirroring buildDescendantFileCounts in
 * cluster-layout.ts. The crawler emits a strict tree so this is defensive
 * only, but a corrupted / hand-edited graph.json shouldn't crash the UI.
 */
export function getDescendantIds(
  folderId: string | null,
  graph: Graph | null,
): Set<string> {
  const out = new Set<string>();
  if (!folderId || !graph) return out;
  const clusters = graph.clusters ?? [];
  if (clusters.length === 0) return out;

  const byPath = new Map<string, ClusterNode>();
  for (const c of clusters) byPath.set(c.path, c);

  const root = byPath.get(folderId);
  if (!root) return out; // not a cluster — no descendants to compute

  const visiting = new Set<string>();
  const walk = (path: string): void => {
    if (visiting.has(path)) return; // cycle guard — defensive only
    visiting.add(path);
    const c = byPath.get(path);
    if (!c) return;
    out.add(path);
    for (const fid of c.childFiles ?? []) out.add(fid);
    for (const child of c.childClusters ?? []) walk(child);
  };
  walk(folderId);
  return out;
}

/**
 * Whether the focused node is a folder cluster (vs. a file). Driven off the
 * graph because the "id" namespace overlaps — a cluster path is also a
 * legal-looking string, but only ones that exist in `graph.clusters` count.
 *
 * Used by GraphCanvas to decide whether to compute a descendant set at all
 * (files have no descendants → cheap early-out).
 */
export function isFolderId(
  id: string | null,
  graph: Graph | null,
): boolean {
  if (!id || !graph) return false;
  const clusters = graph.clusters ?? [];
  for (const c of clusters) {
    if (c.path === id) return true;
  }
  return false;
}
