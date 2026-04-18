import { useMemo } from "react";
import type { ParamNode } from "@/lib/graph/types";
import { useSelectionStore } from "@/lib/state/selection-store";

interface Props {
  params: ParamNode[];
}

interface GroupNode {
  prefix: string;
  children: Map<string, GroupNode>;
  leaves: ParamNode[];
}

function group(params: ParamNode[]): GroupNode {
  const root: GroupNode = { prefix: "", children: new Map(), leaves: [] };
  for (const p of params) {
    const segs = p.key.split(".");
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      let child = cur.children.get(seg);
      if (!child) {
        child = { prefix: seg, children: new Map(), leaves: [] };
        cur.children.set(seg, child);
      }
      cur = child;
    }
    cur.leaves.push(p);
  }
  return root;
}

function renderGroup(
  node: GroupNode,
  depth: number,
  onPick: (key: string) => void,
  selected: string | null,
): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (const p of node.leaves.slice().sort((a, b) => a.key.localeCompare(b.key))) {
    const isSel = p.key === selected;
    out.push(
      <button
        type="button"
        key={p.key}
        onClick={() => onPick(p.key)}
        className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs hover:bg-neutral-800 ${
          isSel ? "bg-neutral-800 ring-1 ring-amber-400" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-testid={`param-${p.key}`}
      >
        <span className="font-mono text-neutral-200">{p.key}</span>
        <span className="rounded bg-neutral-800 px-1 text-[9px] uppercase text-neutral-400">
          {p.kind}
        </span>
        {p.line !== null && <span className="text-[10px] text-neutral-500">L{p.line}</span>}
        <span className="ml-auto max-w-[12rem] truncate font-mono text-neutral-400">
          {p.value}
        </span>
      </button>,
    );
  }
  for (const [name, child] of Array.from(node.children.entries()).sort()) {
    out.push(
      <div key={`grp-${name}-${depth}`} className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500" style={{ paddingLeft: 8 + depth * 12 }}>
        {name}
      </div>,
    );
    out.push(...renderGroup(child, depth + 1, onPick, selected));
  }
  return out;
}

export function ParamTree({ params }: Props) {
  const selectParam = useSelectionStore((s) => s.selectParam);
  const selectedParamKey = useSelectionStore((s) => s.selectedParamKey);
  const root = useMemo(() => group(params), [params]);

  if (params.length === 0) {
    return <div className="px-2 py-4 text-xs text-neutral-500">no params</div>;
  }
  return (
    <div className="flex flex-col gap-0.5 py-2" role="tree">
      {renderGroup(root, 0, selectParam, selectedParamKey)}
    </div>
  );
}
