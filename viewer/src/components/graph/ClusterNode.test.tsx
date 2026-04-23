/**
 * ClusterNode unit tests (V.3).
 */
import type { ReactElement } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import ClusterNode from "./ClusterNode";
import {
  useHierarchyStore,
  HIERARCHY_STORAGE_KEY,
} from "@/lib/state/hierarchy-store";
import type { ClusterNode as ClusterNodeData } from "@/lib/graph/types";

function mkCluster(kind: "folder" | "d-aggregate"): ClusterNodeData {
  return {
    path: "a/b",
    parent: "a",
    childFiles: ["f1", "f2", "f3"],
    childClusters: [],
    kind,
  };
}

/**
 * ClusterNode renders React Flow `<Handle>` components so cluster-to-cluster
 * edges can dock. `<Handle>` reads from ReactFlowProvider context, so tests
 * must wrap the node accordingly.
 */
const withProvider = (el: ReactElement) => (
  <ReactFlowProvider>{el}</ReactFlowProvider>
);

describe("ClusterNode", () => {
  beforeEach(() => {
    sessionStorage.removeItem(HIERARCHY_STORAGE_KEY);
    useHierarchyStore.setState({ expanded: new Set() });
  });

  it("renders collapsed with path + count badge", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: false,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    expect(screen.getByTestId("cluster-a/b")).toBeInTheDocument();
    // Badge text = childCount
    expect(screen.getByText("3")).toBeInTheDocument();
    // Collapsed has ▸ chevron
    expect(screen.getByText("▸")).toBeInTheDocument();
  });

  it("click toggles expanded state via hierarchyStore", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: false,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    const header = screen.getByRole("button");
    fireEvent.click(header);
    expect(useHierarchyStore.getState().isExpanded("a/b")).toBe(true);
  });

  it("keyboard Enter activates the toggle", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: false,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    const header = screen.getByRole("button");
    fireEvent.keyDown(header, { key: "Enter" });
    expect(useHierarchyStore.getState().isExpanded("a/b")).toBe(true);
  });

  it("d-aggregate variant carries data-cluster-kind attr", () => {
    const data = {
      cluster: mkCluster("d-aggregate"),
      expanded: false,
      childCount: 5,
    };
    render(withProvider(<ClusterNode data={data} />));
    const el = screen.getByTestId("cluster-a/b");
    expect(el.getAttribute("data-cluster-kind")).toBe("d-aggregate");
  });

  it("renders expanded variant with header strip + aria-expanded=true", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: true,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("▾")).toBeInTheDocument();
  });

  // INVARIANT LOCK (image #14 fix, parity with TreeFileNode): cluster cards
  // MUST use an opaque label-bearing surface so cross-ref edges passing
  // behind them cannot bleed through and visually cut across the folder
  // name + child-count badge. The edge SVG layer sits below the React Flow
  // node layer in z-order, but a translucent fill defeats that protection.
  it("collapsed card uses an opaque bg fill (no /alpha suffix)", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: false,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    const el = screen.getByTestId("cluster-a/b");
    expect(el.className).toContain("bg-neutral-900");
    // The opaque variant is `bg-neutral-900` exactly; the previously broken
    // variant was `bg-neutral-900/70`. Reject any /alpha suffix so a future
    // refactor can't silently regress.
    expect(el.className).not.toMatch(/bg-neutral-900\/\d+/);
  });

  it("expanded header uses an opaque bg fill (no /alpha suffix)", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: true,
      childCount: 3,
    };
    render(withProvider(<ClusterNode data={data} />));
    const header = screen.getByRole("button");
    expect(header.className).toContain("bg-neutral-900");
    expect(header.className).not.toMatch(/bg-neutral-900\/\d+/);
  });

  // polish-batch-1 item 1 — collapsed-cluster intra-edge badge.
  describe("intraClusterEdgeCount badge", () => {
    it("renders ↻ N pill when collapsed and count > 0", () => {
      const data = {
        cluster: mkCluster("folder"),
        expanded: false,
        childCount: 3,
        intraClusterEdgeCount: 7,
      };
      render(withProvider(<ClusterNode data={data} />));
      // The pill renders as "↻ 7" (with a space).
      expect(screen.getByText(/↻ 7/)).toBeInTheDocument();
    });

    it("hides the badge when count === 0", () => {
      const data = {
        cluster: mkCluster("folder"),
        expanded: false,
        childCount: 3,
        intraClusterEdgeCount: 0,
      };
      render(withProvider(<ClusterNode data={data} />));
      // No "↻ 0" — must not render at all.
      expect(screen.queryByText(/↻/)).toBeNull();
    });

    it("hides the badge when count is undefined", () => {
      const data = {
        cluster: mkCluster("folder"),
        expanded: false,
        childCount: 3,
        // intraClusterEdgeCount intentionally omitted
      };
      render(withProvider(<ClusterNode data={data} />));
      expect(screen.queryByText(/↻/)).toBeNull();
    });

    it("hides the badge in expanded mode even when count > 0 (intra edges become visible)", () => {
      // The expanded branch shows file children directly; the intra-cluster
      // edges between them render as real edges, so the badge would be
      // misleading. Cluster-mode only, collapsed-only.
      const data = {
        cluster: mkCluster("folder"),
        expanded: true,
        childCount: 3,
        intraClusterEdgeCount: 7,
      };
      render(withProvider(<ClusterNode data={data} />));
      expect(screen.queryByText(/↻/)).toBeNull();
    });
  });
});
