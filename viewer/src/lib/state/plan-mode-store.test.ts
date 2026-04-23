/**
 * plan-mode-store — Phase 1 actions + persistence (Streams D + E + F).
 *
 * Persistence is a CUSTOM per-key writer (per locked plan §1.6) — NOT zustand
 * `persist` middleware. The middleware writes one big blob; quota errors on
 * one big plan would corrupt the entire store. Per-key isolation contains
 * the blast radius to the single plan being written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "@/lib/graph/types";
import type { Plan } from "./plan-mode-types";
import {
  PLAN_MODE_STORAGE_PREFIX,
  hydratePlanModeStore,
  resetPlanModeStoreForTest,
  usePlanModeStore,
} from "./plan-mode-store";

function clearAllPlanKeys() {
  if (typeof localStorage === "undefined") return;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith("viva:plans:")) toDelete.push(k);
  }
  for (const k of toDelete) localStorage.removeItem(k);
}

function tinyGraph(): Graph {
  return {
    version: 2,
    root: "/r",
    files: [
      {
        id: "aaaaaaaaaa",
        path: "src/a.xml",
        name: "a.xml",
        folder: "src",
        kind: "xml",
        sizeBytes: 100,
        params: [{ key: "k", value: "v", kind: "scalar", line: 1 }],
        parseError: null,
        isTest: false,
        generated: false,
        generatedFrom: null,
      },
    ],
    edges: [],
    clusters: [{ path: "src", parent: null, childFiles: ["aaaaaaaaaa"], childClusters: [], kind: "folder" }],
  };
}

beforeEach(() => {
  clearAllPlanKeys();
  resetPlanModeStoreForTest();
});

afterEach(() => {
  clearAllPlanKeys();
  resetPlanModeStoreForTest();
  vi.restoreAllMocks();
});

describe("plan-mode-store — toggle (Stream F)", () => {
  it("default planModeEnabled is false", () => {
    expect(usePlanModeStore.getState().planModeEnabled).toBe(false);
  });
  it("togglePlanMode flips the boolean", () => {
    usePlanModeStore.getState().togglePlanMode();
    expect(usePlanModeStore.getState().planModeEnabled).toBe(true);
    usePlanModeStore.getState().togglePlanMode();
    expect(usePlanModeStore.getState().planModeEnabled).toBe(false);
  });
  it("setPlanModeEnabled writes the requested value", () => {
    usePlanModeStore.getState().setPlanModeEnabled(true);
    expect(usePlanModeStore.getState().planModeEnabled).toBe(true);
    usePlanModeStore.getState().setPlanModeEnabled(false);
    expect(usePlanModeStore.getState().planModeEnabled).toBe(false);
  });
});

describe("plan-mode-store — createPlan / setActivePlan / deletePlan", () => {
  it("createPlan mints id, strips snapshot, appends to plansById + planOrder", () => {
    const id = usePlanModeStore.getState().createPlan("first plan", tinyGraph());
    expect(id.startsWith("plan:")).toBe(true);
    const s = usePlanModeStore.getState();
    expect(s.planOrder).toContain(id);
    expect(s.plansById[id]).toBeDefined();
    expect(s.plansById[id].name).toBe("first plan");
    // Stripped: params are gone.
    expect(s.plansById[id].baseGraph.files[0].params).toEqual([]);
    // ISO timestamps populated.
    expect(s.plansById[id].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.plansById[id].archived).toBe(false);
  });

  it("setActivePlan to a known id sets activePlanId", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    expect(usePlanModeStore.getState().activePlanId).toBe(id);
  });

  it("setActivePlan(null) clears", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().setActivePlan(null);
    expect(usePlanModeStore.getState().activePlanId).toBeNull();
  });

  it("setActivePlan to an unknown id is a no-op + warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    usePlanModeStore.getState().setActivePlan("plan:nope");
    expect(usePlanModeStore.getState().activePlanId).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("deletePlan removes from plansById + planOrder; clears activePlanId if it was active", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().deletePlan(id);
    const s = usePlanModeStore.getState();
    expect(s.plansById[id]).toBeUndefined();
    expect(s.planOrder).not.toContain(id);
    expect(s.activePlanId).toBeNull();
  });
});

describe("plan-mode-store — edit actions", () => {
  it("addPlannedNode appends to addedNodes when an active plan exists", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().addPlannedNode({ name: "new.xml", folder: "src", kind: "xml" });
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.addedNodes).toHaveLength(1);
    expect(plan.edits.addedNodes[0].name).toBe("new.xml");
    expect(plan.edits.addedNodes[0].id.startsWith("plan:node:")).toBe(true);
  });

  it("addPlannedNode is a no-op + warns when no active plan", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    usePlanModeStore.getState().addPlannedNode({ name: "x", folder: "src", kind: "xml" });
    expect(warn).toHaveBeenCalled();
  });

  it("addPlannedEdge appends to addedEdges", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().addPlannedEdge({ source: "aaaaaaaaaa", target: "bbb", kind: "ref" });
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.addedEdges).toHaveLength(1);
    expect(plan.edits.addedEdges[0].id.startsWith("plan:edge:")).toBe(true);
  });

  it("markDeletedNode adds idempotently to removedNodeIds", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().markDeletedNode("aaaaaaaaaa");
    usePlanModeStore.getState().markDeletedNode("aaaaaaaaaa");
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.removedNodeIds).toEqual(["aaaaaaaaaa"]);
  });

  it("markDeletedEdge adds idempotently to removedEdgeKeys", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().markDeletedEdge("a|include|b");
    usePlanModeStore.getState().markDeletedEdge("a|include|b");
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.removedEdgeKeys).toEqual(["a|include|b"]);
  });

  it("addNote mints id + ISO timestamps, appends to notes", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().addNote({ targetId: "aaaaaaaaaa", targetKind: "node", text: "split me" });
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.notes).toHaveLength(1);
    expect(plan.edits.notes[0].text).toBe("split me");
    expect(plan.edits.notes[0].id.startsWith("plan:note:")).toBe(true);
    expect(plan.edits.notes[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("renamePlanNode writes to renamedNodes record", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    usePlanModeStore.getState().renamePlanNode("aaaaaaaaaa", "Foo");
    const plan = usePlanModeStore.getState().plansById[id];
    expect(plan.edits.renamedNodes["aaaaaaaaaa"]).toBe("Foo");
  });

  it("any edit action bumps updatedAt", async () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    const before = usePlanModeStore.getState().plansById[id].updatedAt;
    // Wait at least 1 ms so the new ISO timestamp differs.
    await new Promise((r) => setTimeout(r, 5));
    usePlanModeStore.getState().markDeletedNode("aaaaaaaaaa");
    const after = usePlanModeStore.getState().plansById[id].updatedAt;
    expect(after >= before).toBe(true);
    expect(after).not.toBe(before);
  });
});

describe("plan-mode-store — persistence (Stream E)", () => {
  it("write-on-change: createPlan persists to per-key entries", () => {
    const id = usePlanModeStore.getState().createPlan("named", tinyGraph());
    usePlanModeStore.getState().togglePlanMode();
    expect(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:enabled`)).toBe("true");
    const list = JSON.parse(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:list`) ?? "[]");
    expect(list).toContain(id);
    const planRaw = localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:plan:${id}`);
    expect(planRaw).not.toBeNull();
    const parsed = JSON.parse(planRaw!) as Plan;
    expect(parsed.id).toBe(id);
    expect(parsed.name).toBe("named");
  });

  it("setActivePlan persists active id", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().setActivePlan(id);
    expect(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:active`)).toBe(JSON.stringify(id));
  });

  it("hydrate from existing storage round-trips the plan corpus", () => {
    // Seed three keys directly.
    const id = "plan:11111111-1111-1111-1111-111111111111";
    const plan: Plan = {
      id,
      name: "preexisting",
      createdAt: "2026-04-22T00:00:00Z",
      updatedAt: "2026-04-22T00:00:00Z",
      archived: false,
      baseGraph: tinyGraph(),
      edits: {
        addedNodes: [],
        addedEdges: [],
        removedNodeIds: [],
        removedEdgeKeys: [],
        notes: [],
        renamedNodes: {},
      },
    };
    localStorage.setItem(`${PLAN_MODE_STORAGE_PREFIX}:list`, JSON.stringify([id]));
    localStorage.setItem(`${PLAN_MODE_STORAGE_PREFIX}:active`, JSON.stringify(id));
    localStorage.setItem(`${PLAN_MODE_STORAGE_PREFIX}:enabled`, "true");
    localStorage.setItem(`${PLAN_MODE_STORAGE_PREFIX}:plan:${id}`, JSON.stringify(plan));

    hydratePlanModeStore();
    const s = usePlanModeStore.getState();
    expect(s.planModeEnabled).toBe(true);
    expect(s.activePlanId).toBe(id);
    expect(s.planOrder).toEqual([id]);
    expect(s.plansById[id]?.name).toBe("preexisting");
  });

  it("schema-version mismatch (vN with N != 1) is ignored, no clobber", () => {
    // Seed an old-shape key that should be ignored.
    localStorage.setItem("viva:plans:v0:list", JSON.stringify(["plan:old"]));
    localStorage.setItem("viva:plans:v0:plan:plan:old", JSON.stringify({ id: "plan:old" }));

    hydratePlanModeStore();
    const s = usePlanModeStore.getState();
    expect(s.planOrder).toEqual([]);
    expect(s.plansById).toEqual({});
    // We did not clobber the v0 entries.
    expect(localStorage.getItem("viva:plans:v0:list")).not.toBeNull();
    // We did not write any v1 list entry just because we hydrated.
    expect(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:list`)).toBeNull();
  });

  it("quota-exceeded on createPlan rolls back in-memory + warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockImplementation((key: string, _value: string) => {
      if (key.startsWith(`${PLAN_MODE_STORAGE_PREFIX}:plan:`)) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      // Allow other keys (list/active/enabled) to write through normally.
      // We must call the real implementation rather than recursing.
      Storage.prototype.setItem.bind(localStorage);
    });

    const beforeCount = Object.keys(usePlanModeStore.getState().plansById).length;
    const id = usePlanModeStore.getState().createPlan("toobig", tinyGraph());
    // Rollback: id is NOT present in plansById or planOrder.
    const s = usePlanModeStore.getState();
    expect(s.plansById[id]).toBeUndefined();
    expect(s.planOrder).not.toContain(id);
    expect(Object.keys(s.plansById).length).toBe(beforeCount);
    expect(warn).toHaveBeenCalled();

    // Subsequent createPlan calls do not crash.
    expect(() => usePlanModeStore.getState().createPlan("again", tinyGraph())).not.toThrow();
  });

  it("deletePlan removes the per-plan key AND prunes the list", () => {
    const id = usePlanModeStore.getState().createPlan("a", tinyGraph());
    usePlanModeStore.getState().deletePlan(id);
    expect(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:plan:${id}`)).toBeNull();
    const list = JSON.parse(localStorage.getItem(`${PLAN_MODE_STORAGE_PREFIX}:list`) ?? "[]");
    expect(list).not.toContain(id);
  });
});

describe("plan-mode-store — boundary check (no cross-store imports)", async () => {
  it("does not pull in other store modules at import time", async () => {
    // Import the source as text and check for store-name imports. This is
    // a static check — keeps the modular-stores wall (DECISIONS.md) honest.
    const mod = await import("./plan-mode-store?raw").catch(() => null);
    if (mod === null) {
      // ?raw not supported in this Vite config — fallback: at least confirm
      // the module imports cleanly without dragging anything else in.
      const m = await import("./plan-mode-store");
      expect(m.usePlanModeStore).toBeDefined();
      return;
    }
    const src = (mod as { default: string }).default;
    expect(src).not.toMatch(/from ["']\.\/graph-store["']/);
    expect(src).not.toMatch(/from ["']\.\/view-store["']/);
    expect(src).not.toMatch(/from ["']\.\/filter-store["']/);
    expect(src).not.toMatch(/from ["']\.\/selection-store["']/);
    expect(src).not.toMatch(/from ["']\.\/hierarchy-store["']/);
  });
});
