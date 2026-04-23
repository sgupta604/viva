/**
 * Plan-ID minter + edge-key invariants.
 *
 * Locked decisions (plan §1):
 *  - All synthetic ids carry the `plan:` namespace prefix to remain
 *    collision-free against live 10-hex SHA-1 ids.
 *  - `edgeKey` matches the existing `(source, kind, target)` sort key so
 *    tombstone keys round-trip with crawler-emitted edges.
 */
import { describe, expect, it } from "vitest";
import {
  edgeKey,
  isPlanId,
  mintPlanEdgeId,
  mintPlanId,
  mintPlanNodeId,
  mintPlanNoteId,
} from "./plan-ids";

describe("plan-ids — format invariant", () => {
  it("mintPlanNodeId starts with 'plan:node:'", () => {
    expect(mintPlanNodeId().startsWith("plan:node:")).toBe(true);
  });
  it("mintPlanEdgeId starts with 'plan:edge:'", () => {
    expect(mintPlanEdgeId().startsWith("plan:edge:")).toBe(true);
  });
  it("mintPlanNoteId starts with 'plan:note:'", () => {
    expect(mintPlanNoteId().startsWith("plan:note:")).toBe(true);
  });
  it("mintPlanId starts with 'plan:' (and is not one of the kinded variants)", () => {
    const id = mintPlanId();
    expect(id.startsWith("plan:")).toBe(true);
    expect(id.startsWith("plan:node:")).toBe(false);
    expect(id.startsWith("plan:edge:")).toBe(false);
    expect(id.startsWith("plan:note:")).toBe(false);
  });
});

describe("plan-ids — isPlanId", () => {
  it("returns true for plan-namespaced ids", () => {
    expect(isPlanId(mintPlanNodeId())).toBe(true);
    expect(isPlanId(mintPlanEdgeId())).toBe(true);
    expect(isPlanId(mintPlanNoteId())).toBe(true);
    expect(isPlanId(mintPlanId())).toBe(true);
  });
  it("returns false for live 10-hex SHA-1 ids", () => {
    expect(isPlanId("a1b2c3d4e5")).toBe(false);
    // Sample ids drawn from typical crawler output.
    expect(isPlanId("0123456789")).toBe(false);
    expect(isPlanId("deadbeef00")).toBe(false);
  });
  it("returns false for empty / unrelated strings", () => {
    expect(isPlanId("")).toBe(false);
    expect(isPlanId("planA")).toBe(false); // doesn't have the colon
    expect(isPlanId("notplan:node:foo")).toBe(false);
  });
});

describe("plan-ids — collision uniqueness", () => {
  it("1000 mintPlanNodeId calls produce 1000 unique ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(mintPlanNodeId());
    expect(seen.size).toBe(1000);
  });
  it("1000 mintPlanEdgeId calls produce 1000 unique ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(mintPlanEdgeId());
    expect(seen.size).toBe(1000);
  });
  it("ids minted across types do not collide", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 250; i += 1) {
      seen.add(mintPlanNodeId());
      seen.add(mintPlanEdgeId());
      seen.add(mintPlanNoteId());
      seen.add(mintPlanId());
    }
    expect(seen.size).toBe(1000);
  });
});

describe("plan-ids — edgeKey", () => {
  it("matches the documented composite shape `source|kind|target`", () => {
    expect(edgeKey("aaa", "include", "bbb")).toBe("aaa|include|bbb");
  });
  it("renders null target as the literal 'null'", () => {
    expect(edgeKey("aaa", "ref", null)).toBe("aaa|ref|null");
  });
  it("is deterministic — same args always produce same key", () => {
    const k1 = edgeKey("aa", "import", "bb");
    const k2 = edgeKey("aa", "import", "bb");
    expect(k1).toBe(k2);
  });
});
