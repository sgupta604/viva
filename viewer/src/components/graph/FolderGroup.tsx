import { memo } from "react";
import { NodeResizer } from "reactflow";

interface Props {
  data: { label: string };
  selected: boolean;
}

function FolderGroupInner({ data, selected }: Props) {
  return (
    <div
      className={`h-full w-full rounded-lg border border-dashed ${
        selected ? "border-neutral-400" : "border-neutral-700"
      } bg-neutral-900/30`}
      aria-label={`folder ${data.label}`}
    >
      <NodeResizer isVisible={false} />
      <div className="px-2 pt-1 font-mono text-xs text-neutral-400">{data.label}</div>
    </div>
  );
}

export default memo(FolderGroupInner);
