/**
 * TreeFolderNode unit tests — focused on the `↻ N` intra-edge badge added
 * in the visual-review 2026-04-23 follow-up to polish-batch-1 item 1.
 *
 * The same badge logic lives on ClusterNode (cluster + tree modes); these
 * tests cover the dendrogram-mode branch (TreeFolderNode) so we don't
 * silently regress one renderer when fixing the other.
 */
import type { ReactElement } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import TreeFolderNode from "./TreeFolderNode";
import {
  useHierarchyStore,
  HIERARCHY_STORAGE_KEY,
} from "@/lib/state/hierarchy-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import type { ClusterNode as ClusterNodeData } from "@/lib/graph/types";

function mkCluster(): ClusterNodeData {
  return {
    path: "src/config",
    parent: "src",
    childFiles: ["f1", "f2", "f3"],
    childClusters: [],
    kind: "folder",
  };
}

const withProvider = (el: ReactElement) => (
  <ReactFlowProvider>{el}</ReactFlowProvider>
);

describe("TreeFolderNode — intraClusterEdgeCount badge", () => {
  beforeEach(() => {
    sessionStorage.removeItem(HIERARCHY_STORAGE_KEY);
    useHierarchyStore.setState({ expanded: new Set() });
    useSelectionStore.setState({
      selectedFileId: null,
      selectedParamKey: null,
      hoveredNodeId: null,
      detailPanelOpen: false,
    });
  });

  it("renders ↻ N pill when count > 0", () => {
    const data = {
      cluster: mkCluster(),
      expanded: false,
      childCount: 3,
      intraClusterEdgeCount: 5,
    };
    render(withProvider(<TreeFolderNode data={data} />));
    // Use the data-testid the helper text suggests so future grep is easy.
    expect(
      screen.getByTestId("cluster-intra-badge-src/config"),
    ).toBeInTheDocument();
    // Pill text uses the ↻ glyph + the count.
    expect(screen.getByText(/↻ 5/)).toBeInTheDocument();
  });

  it("hides the badge when count is 0 (no ↻ 0 noise)", () => {
    const data = {
      cluster: mkCluster(),
      expanded: false,
      childCount: 3,
      intraClusterEdgeCount: 0,
    };
    render(withProvider(<TreeFolderNode data={data} />));
    expect(screen.queryByText(/↻/)).toBeNull();
    expect(
      screen.queryByTestId("cluster-intra-badge-src/config"),
    ).toBeNull();
  });

  it("hides the badge when count is undefined", () => {
    const data = {
      cluster: mkCluster(),
      expanded: false,
      childCount: 3,
      // intraClusterEdgeCount intentionally omitted
    };
    render(withProvider(<TreeFolderNode data={data} />));
    expect(screen.queryByText(/↻/)).toBeNull();
    expect(
      screen.queryByTestId("cluster-intra-badge-src/config"),
    ).toBeNull();
  });

  it("renders the pill BEFORE the descendant-count pill (visual ordering)", () => {
    // Both pills share the `cluster-intra-badge-` and the descendant-count
    // span; the user's mental model puts the hidden-edge marker
    // immediately to the LEFT of the file count, matching ClusterNode.
    const data = {
      cluster: mkCluster(),
      expanded: false,
      childCount: 9,
      intraClusterEdgeCount: 4,
    };
    const { container } = render(withProvider(<TreeFolderNode data={data} />));
    const card = container.querySelector(
      '[data-testid="cluster-src/config"]',
    )!;
    const text = card.textContent ?? "";
    // The intra-badge text appears before the count text in DOM order.
    expect(text.indexOf("↻ 4")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("9")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("↻ 4")).toBeLessThan(text.indexOf("9"));
  });
});
