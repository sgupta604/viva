/**
 * Plan Mode store (Phase 1) — adds a SIXTH Zustand slice alongside the
 * existing graph/view/filter/selection/hierarchy stores. Per
 * `.claude/docs/DECISIONS.md` (2026-04-20) and the user's MEMORY entry
 * `architecture_state_zustand.md`, Plan Mode is additive — no refactor of
 * the existing stores.
 *
 * **Phase 1 contract:** the headless toggle changes nothing visible. There is
 * NO UI surface that calls these actions; only test code does. Phase 2 will
 * wire `PlanModeToggle.tsx` to `togglePlanMode()`.
 *
 * **Cross-store boundary:** this module does NOT import from any other
 * store. Composition happens at the component level. A Vitest case in
 * plan-mode-store.test.ts asserts the static import edges remain clean.
 *
 * **Persistence:** custom per-key writer (NOT zustand `persist` middleware
 * blob — see locked plan §1.6). Reasoning: the middleware writes one big
 * blob; quota errors on one big plan corrupt the entire store. Per-key
 * isolation contains the blast radius. Each plan is one localStorage entry;
 * a too-big plan can't take the others down with it.
 *
 * **Schema versioning:** all keys carry the `v1` infix. Future v2 bumps
 * the prefix and IGNORES v1 entries — no migration shim per locked plan §9.
 *
 * **Quota handling:** every `setItem` is wrapped in try/catch. On
 * `QuotaExceededError` the in-memory state for the failed write is rolled
 * back, a single `console.warn` is emitted per session, and the store does
 * NOT crash.
 */
import { create } from "zustand";
import { stripSnapshot } from "@/lib/graph/plan-snapshot";
import {
  mintPlanEdgeId,
  mintPlanId,
  mintPlanNodeId,
  mintPlanNoteId,
} from "@/lib/graph/plan-ids";
import type { Graph, EdgeKind, FileKind } from "@/lib/graph/types";
import type {
  Plan,
  PlanNote,
  PlannedEdge,
  PlannedNode,
} from "./plan-mode-types";

/** Storage key prefix; bumping `v1` -> `v2` would intentionally orphan v1 entries. */
export const PLAN_MODE_STORAGE_PREFIX = "viva:plans:v1";
const KEY_LIST = `${PLAN_MODE_STORAGE_PREFIX}:list`;
const KEY_ACTIVE = `${PLAN_MODE_STORAGE_PREFIX}:active`;
const KEY_ENABLED = `${PLAN_MODE_STORAGE_PREFIX}:enabled`;
const KEY_PLAN_PREFIX = `${PLAN_MODE_STORAGE_PREFIX}:plan:`;

// ---------------------------------------------------------------------------
// SSR-safe localStorage helpers + once-per-session quota warning.
// Mirrors the hierarchy-store SSR shim pattern.
// ---------------------------------------------------------------------------

let quotaWarned = false;

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Returns `true` on successful write, `false` on quota / unavailable storage.
 * The boolean lets the caller roll back in-memory state when persistence fails.
 */
function safeSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err.code === 22)
    ) {
      if (!quotaWarned) {
        // eslint-disable-next-line no-console
        console.warn(
          "[plan-mode-store] localStorage quota exceeded. Recent plan write was rolled back. Consider deleting old plans.",
        );
        quotaWarned = true;
      }
      return false;
    }
    // Unknown storage error — treat as failure but don't blow up the app.
    // eslint-disable-next-line no-console
    console.warn("[plan-mode-store] localStorage write failed:", err);
    return false;
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Store shape + actions.
// ---------------------------------------------------------------------------

interface PlanModeState {
  /** Phase 1: no UI; toggle is invisible. Phase 2 will wire PlanModeToggle.tsx. */
  planModeEnabled: boolean;
  activePlanId: string | null;
  plansById: Record<string, Plan>;
  /** Display order. Independent of plansById insertion semantics. */
  planOrder: string[];

  // ---- toggle (Stream F) ----
  togglePlanMode: () => void;
  setPlanModeEnabled: (value: boolean) => void;

  // ---- plan lifecycle ----
  createPlan: (name: string, liveGraph: Graph) => string;
  setActivePlan: (id: string | null) => void;
  deletePlan: (id: string) => void;

  // ---- edits (no-op + warn when no active plan) ----
  addPlannedNode: (input: { name: string; folder: string; kind: FileKind }) => void;
  addPlannedEdge: (input: { source: string; target: string; kind: EdgeKind }) => void;
  markDeletedNode: (liveId: string) => void;
  markDeletedEdge: (edgeKey: string) => void;
  addNote: (input: { targetId: string; targetKind: "node" | "edge"; text: string }) => void;
  renamePlanNode: (id: string, newName: string) => void;
}

function nowISO(): string {
  return new Date().toISOString();
}

function emptyEdits() {
  return {
    addedNodes: [],
    addedEdges: [],
    removedNodeIds: [],
    removedEdgeKeys: [],
    notes: [],
    renamedNodes: {},
  } satisfies Plan["edits"];
}

let noActivePlanWarned = false;
function warnNoActivePlan(action: string): void {
  if (noActivePlanWarned) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[plan-mode-store] ${action} ignored — no active plan. Call createPlan + setActivePlan first.`,
  );
  noActivePlanWarned = true;
}

export const usePlanModeStore = create<PlanModeState>((set, get) => ({
  planModeEnabled: false,
  activePlanId: null,
  plansById: {},
  planOrder: [],

  togglePlanMode: () => {
    const next = !get().planModeEnabled;
    set({ planModeEnabled: next });
    safeSet(KEY_ENABLED, next ? "true" : "false");
  },

  setPlanModeEnabled: (value) => {
    set({ planModeEnabled: value });
    safeSet(KEY_ENABLED, value ? "true" : "false");
  },

  createPlan: (name, liveGraph) => {
    const id = mintPlanId();
    const t = nowISO();
    const plan: Plan = {
      id,
      name,
      createdAt: t,
      updatedAt: t,
      archived: false,
      baseGraph: stripSnapshot(liveGraph),
      edits: emptyEdits(),
    };
    // Persist FIRST so a quota failure rolls back cleanly.
    const planOk = safeSet(`${KEY_PLAN_PREFIX}${id}`, JSON.stringify(plan));
    if (!planOk) {
      // Quota / storage failure — do NOT mutate in-memory state.
      return id;
    }
    const nextOrder = [...get().planOrder, id];
    const listOk = safeSet(KEY_LIST, JSON.stringify(nextOrder));
    if (!listOk) {
      // Roll back the per-plan write to avoid an orphan key on disk.
      safeRemove(`${KEY_PLAN_PREFIX}${id}`);
      return id;
    }
    set({
      plansById: { ...get().plansById, [id]: plan },
      planOrder: nextOrder,
    });
    return id;
  },

  setActivePlan: (id) => {
    if (id !== null && !get().plansById[id]) {
      // eslint-disable-next-line no-console
      console.warn(`[plan-mode-store] setActivePlan(${id}) ignored — unknown plan id.`);
      return;
    }
    set({ activePlanId: id });
    safeSet(KEY_ACTIVE, JSON.stringify(id));
  },

  deletePlan: (id) => {
    const s = get();
    if (!s.plansById[id]) return;
    const { [id]: _drop, ...rest } = s.plansById;
    void _drop;
    const nextOrder = s.planOrder.filter((p) => p !== id);
    set({
      plansById: rest,
      planOrder: nextOrder,
      activePlanId: s.activePlanId === id ? null : s.activePlanId,
    });
    safeRemove(`${KEY_PLAN_PREFIX}${id}`);
    safeSet(KEY_LIST, JSON.stringify(nextOrder));
    if (s.activePlanId === id) safeSet(KEY_ACTIVE, JSON.stringify(null));
  },

  addPlannedNode: (input) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("addPlannedNode");
      return;
    }
    const plan = s.plansById[id];
    const node: PlannedNode = {
      id: mintPlanNodeId(),
      name: input.name,
      folder: input.folder,
      kind: input.kind,
    };
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: nowISO(),
      edits: { ...plan.edits, addedNodes: [...plan.edits.addedNodes, node] },
    });
  },

  addPlannedEdge: (input) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("addPlannedEdge");
      return;
    }
    const plan = s.plansById[id];
    const edge: PlannedEdge = {
      id: mintPlanEdgeId(),
      source: input.source,
      target: input.target,
      kind: input.kind,
    };
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: nowISO(),
      edits: { ...plan.edits, addedEdges: [...plan.edits.addedEdges, edge] },
    });
  },

  markDeletedNode: (liveId) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("markDeletedNode");
      return;
    }
    const plan = s.plansById[id];
    if (plan.edits.removedNodeIds.includes(liveId)) return;
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: nowISO(),
      edits: { ...plan.edits, removedNodeIds: [...plan.edits.removedNodeIds, liveId] },
    });
  },

  markDeletedEdge: (edgeKey) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("markDeletedEdge");
      return;
    }
    const plan = s.plansById[id];
    if (plan.edits.removedEdgeKeys.includes(edgeKey)) return;
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: nowISO(),
      edits: { ...plan.edits, removedEdgeKeys: [...plan.edits.removedEdgeKeys, edgeKey] },
    });
  },

  addNote: (input) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("addNote");
      return;
    }
    const plan = s.plansById[id];
    const t = nowISO();
    const note: PlanNote = {
      id: mintPlanNoteId(),
      targetId: input.targetId,
      targetKind: input.targetKind,
      text: input.text,
      createdAt: t,
      updatedAt: t,
    };
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: t,
      edits: { ...plan.edits, notes: [...plan.edits.notes, note] },
    });
  },

  renamePlanNode: (nodeId, newName) => {
    const s = get();
    const id = s.activePlanId;
    if (!id) {
      warnNoActivePlan("renamePlanNode");
      return;
    }
    const plan = s.plansById[id];
    updatePlan(set, get, id, {
      ...plan,
      updatedAt: nowISO(),
      edits: {
        ...plan.edits,
        renamedNodes: { ...plan.edits.renamedNodes, [nodeId]: newName },
      },
    });
  },
}));

// ---------------------------------------------------------------------------
// Internal helper — apply a plan update + persist with rollback on quota fail.
// ---------------------------------------------------------------------------

function updatePlan(
  set: (partial: Partial<PlanModeState>) => void,
  get: () => PlanModeState,
  id: string,
  next: Plan,
): void {
  const prev = get().plansById[id];
  // Optimistic in-memory write so the UI sees the change immediately.
  set({ plansById: { ...get().plansById, [id]: next } });
  const ok = safeSet(`${KEY_PLAN_PREFIX}${id}`, JSON.stringify(next));
  if (!ok) {
    // Roll back to the previous plan snapshot.
    set({ plansById: { ...get().plansById, [id]: prev } });
  }
}

// ---------------------------------------------------------------------------
// Hydration — synchronous reads at module top level (mirrors view-store).
// Exported for tests + future "rehydrate after import" callsites.
// ---------------------------------------------------------------------------

export function hydratePlanModeStore(): void {
  if (typeof window === "undefined") return;

  const enabledRaw = safeGet(KEY_ENABLED);
  const planModeEnabled = enabledRaw === "true";

  let planOrder: string[] = [];
  const listRaw = safeGet(KEY_LIST);
  if (listRaw) {
    try {
      const parsed = JSON.parse(listRaw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        planOrder = parsed;
      }
    } catch {
      // ignore — corrupt list, treat as empty
    }
  }

  const plansById: Record<string, Plan> = {};
  for (const id of planOrder) {
    const raw = safeGet(`${KEY_PLAN_PREFIX}${id}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Plan;
      // Minimal shape sanity. We trust schema-prefix versioning to catch
      // hard breakages; if a Plan-shaped object lacks `id` we drop it.
      if (parsed && typeof parsed.id === "string" && parsed.id === id) {
        plansById[id] = parsed;
      }
    } catch {
      // ignore — corrupt entry, drop silently
    }
  }
  // Filter the order to the plans we actually rehydrated.
  const cleanOrder = planOrder.filter((id) => plansById[id]);

  let activePlanId: string | null = null;
  const activeRaw = safeGet(KEY_ACTIVE);
  if (activeRaw) {
    try {
      const parsed = JSON.parse(activeRaw);
      if (typeof parsed === "string" && plansById[parsed]) activePlanId = parsed;
    } catch {
      // ignore
    }
  }

  usePlanModeStore.setState({
    planModeEnabled,
    plansById,
    planOrder: cleanOrder,
    activePlanId,
  });
}

// Eagerly hydrate on module load (matches view-store top-level reads).
hydratePlanModeStore();

// ---------------------------------------------------------------------------
// Test-only reset helper (NOT for production callers).
// ---------------------------------------------------------------------------

export function resetPlanModeStoreForTest(): void {
  noActivePlanWarned = false;
  quotaWarned = false;
  usePlanModeStore.setState({
    planModeEnabled: false,
    activePlanId: null,
    plansById: {},
    planOrder: [],
  });
}
