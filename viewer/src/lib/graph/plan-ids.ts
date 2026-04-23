/**
 * Plan-mode ID minters + edge-key helper (Phase 1).
 *
 * Pure functions. No store, no state, no side effects beyond `crypto.randomUUID`.
 *
 * ID format (locked plan §1):
 *  - `plan:node:<uuid-v4>` — synthetic FileNode
 *  - `plan:edge:<uuid-v4>` — synthetic Edge
 *  - `plan:note:<uuid-v4>` — note
 *  - `plan:<uuid-v4>`      — Plan itself
 *
 * Live FileNode ids are 10-hex SHA-1 prefixes (docs/GRAPH-SCHEMA.md), so the
 * `plan:` prefix is collision-free against the live namespace by construction.
 */
import type { EdgeKind } from "./types";

/**
 * jsdom 22+ ships `crypto.randomUUID`. The viewer's vitest runtime uses
 * jsdom 25 (see viewer/package.json devDependencies), so this is safe.
 * Production browsers (Chrome 92+, Safari 15.4+, Firefox 95+) all support it.
 *
 * Fallback exists for ancient runtimes — non-cryptographic but unique-enough
 * for test isolation if a future config disables WebCrypto.
 */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: time + 32 bits of Math.random + an autoincrementing counter to
  // guarantee uniqueness within a single process even if Math.random repeats.
  const rand = Math.random().toString(36).slice(2, 12);
  const time = Date.now().toString(36);
  fallbackCounter += 1;
  return `${time}-${rand}-${fallbackCounter.toString(36)}`;
}
let fallbackCounter = 0;

export function mintPlanNodeId(): string {
  return `plan:node:${uuid()}`;
}

export function mintPlanEdgeId(): string {
  return `plan:edge:${uuid()}`;
}

export function mintPlanNoteId(): string {
  return `plan:note:${uuid()}`;
}

export function mintPlanId(): string {
  return `plan:${uuid()}`;
}

/** Returns true iff `id` is in the `plan:` namespace. */
export function isPlanId(id: string): boolean {
  return id.startsWith("plan:");
}

/**
 * Composite edge identity used for tombstone keys and dedup.
 *
 * Mirrors the existing `(source, kind, target)` sort key — `target` is
 * rendered as the literal string `"null"` when the edge is unresolved so
 * `aaa|include|null` is a valid round-trippable key.
 */
export function edgeKey(
  source: string,
  kind: EdgeKind,
  target: string | null,
): string {
  return `${source}|${kind}|${target ?? "null"}`;
}
