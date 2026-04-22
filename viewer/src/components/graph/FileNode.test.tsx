import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import FileNode from "./FileNode";
import { NODE_W } from "@/lib/graph/layout";
import type { FileNode as FileNodeData } from "@/lib/graph/types";

// FileNode renders react-flow <Handle>s, which need a ReactFlowProvider
// ancestor. Wrap every render call with it.
function renderNode(file: FileNodeData, selected = false) {
  return render(
    <ReactFlowProvider>
      <FileNode data={{ file }} selected={selected} />
    </ReactFlowProvider>,
  );
}

function makeFile(overrides: Partial<FileNodeData> = {}): FileNodeData {
  return {
    id: "f1",
    path: "config/a.xml",
    name: "a.xml",
    folder: "config",
    kind: "xml",
    sizeBytes: 10,
    params: [],
    parseError: null,
    isTest: false,
    ...overrides,
  };
}

describe("FileNode", () => {
  it("pins rendered width to NODE_W regardless of content length", () => {
    const longFolder =
      "viewer/public/source/viewer/public/source/viewer/public/source/deeply/nested/path";
    const file = makeFile({
      name: "graph-with-obnoxiously-long-filename.json",
      folder: longFolder,
      path: `${longFolder}/graph-with-obnoxiously-long-filename.json`,
    });
    const { getByTestId } = renderNode(file);
    const el = getByTestId("node-f1") as HTMLElement;

    // Inline style fixes width to NODE_W — the layout contract is that the
    // DOM card never exceeds the dagre-reserved slot.
    expect(el.style.width).toBe(`${NODE_W}px`);
    // min-w-[200px] was the old unbounded version; asserting it's gone
    // catches a regression to the latent-overflow state.
    expect(el.className).not.toMatch(/min-w-\[/);
  });

  it("renders the folder path with a title attribute for hover reveal", () => {
    const longFolder = "a/very/long/folder/path/that/gets/truncated/in/the/ui";
    const file = makeFile({ folder: longFolder });
    const { getByTestId } = renderNode(file);
    const el = getByTestId("node-f1") as HTMLElement;
    // The folder sub-label carries the full path on its title attribute
    // so hover surfaces the truncated text.
    const folderEl = el.querySelector(`[title="${longFolder}"]`);
    expect(folderEl).not.toBeNull();
    expect(folderEl!.className).toMatch(/truncate/);
  });

  it("uses a truncate class on the filename so overflow is clipped", () => {
    const file = makeFile({ name: "short.xml" });
    const { getByTestId } = renderNode(file);
    const el = getByTestId("node-f1") as HTMLElement;
    // The filename element is the first child div with font-mono.
    const nameEl = el.querySelector(".font-mono");
    expect(nameEl).not.toBeNull();
    expect(nameEl!.className).toMatch(/truncate/);
  });

  it("renders a 'gen' badge + data-generated when generated=true (V.9)", () => {
    const file = makeFile({
      generated: true,
      generatedFrom: "scripts/templating_config.yaml",
    });
    const { getByTestId, getByLabelText } = renderNode(file);
    const el = getByTestId("node-f1") as HTMLElement;
    expect(el.getAttribute("data-generated")).toBe("true");
    const badge = getByLabelText("generated from template");
    expect(badge.textContent?.toLowerCase()).toContain("gen");
  });

  it("does NOT render a gen badge when generated=false", () => {
    const file = makeFile({ generated: false });
    const { getByTestId, queryByLabelText } = renderNode(file);
    const el = getByTestId("node-f1") as HTMLElement;
    expect(el.getAttribute("data-generated")).toBeNull();
    expect(queryByLabelText("generated from template")).toBeNull();
  });
});
