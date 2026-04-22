/**
 * ClusterNode unit tests (V.3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    render(<ClusterNode data={data} />);
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
    render(<ClusterNode data={data} />);
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
    render(<ClusterNode data={data} />);
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
    render(<ClusterNode data={data} />);
    const el = screen.getByTestId("cluster-a/b");
    expect(el.getAttribute("data-cluster-kind")).toBe("d-aggregate");
  });

  it("renders expanded variant with header strip + aria-expanded=true", () => {
    const data = {
      cluster: mkCluster("folder"),
      expanded: true,
      childCount: 3,
    };
    render(<ClusterNode data={data} />);
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("▾")).toBeInTheDocument();
  });
});
