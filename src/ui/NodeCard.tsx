import { Handle, type Node, type NodeProps, Position } from "@xyflow/react"
import { memo } from "react"
import type { Direction } from "../domain/graphOps"
import type { ChatNode } from "../domain/types"

export interface NodeCardData {
  readonly [key: string]: unknown
  readonly node: ChatNode
  readonly isActive: boolean
  readonly onPath: boolean
  readonly mergeSource: boolean
  readonly isCollapsed: boolean
  readonly childCount: number
  readonly onSpawn: (direction: Direction) => void
  readonly onMerge: () => void
  readonly onToggleCollapse: () => void
}

export type SpiderFlowNode = Node<NodeCardData, "spider">

const SpawnButton = ({
  direction,
  onSpawn,
}: {
  direction: Direction
  onSpawn: (d: Direction) => void
}) => (
  <button
    type="button"
    className={`spawn spawn-${direction}`}
    aria-label={`向${direction}新建分支`}
    onClick={(e) => {
      e.stopPropagation()
      onSpawn(direction)
    }}
  >
    +
  </button>
)

export const NodeCard = memo(function NodeCard({ data }: NodeProps<SpiderFlowNode>) {
  const {
    node,
    isActive,
    onPath,
    mergeSource,
    isCollapsed,
    childCount,
    onSpawn,
    onMerge,
    onToggleCollapse,
  } = data
  const preview =
    node.summary ??
    [...node.messages]
      .reverse()
      .find((m) => m.role === "assistant")
      ?.content.replace(/\s+/g, " ")
      .slice(0, 96) ??
    ""
  return (
    <div
      className={
        "node-card" +
        (isActive ? " is-active" : "") +
        (onPath && !isActive ? " is-path" : "") +
        (mergeSource ? " is-merge-source" : "") +
        (node.status === "archived" ? " is-archived" : "")
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id="t-left"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="t-top"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="t-bottom"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="s-left"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="s-top"
        className="anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="s-bottom"
        className="anchor"
        isConnectable={false}
      />
      <div className="node-head">
        {node.status === "understood" && <span className="node-ok">✓</span>}
        {(node.parentIds?.length ?? 0) > 1 && <span className="node-merge-tag">汇</span>}
        {node.note !== undefined && node.note !== "" && (
          <span className="node-note-tag" title="有随记">
            ✎
          </span>
        )}
        <span className="node-title">{node.title}</span>
        {childCount > 0 && (
          <button
            type="button"
            className="node-collapse"
            aria-label={isCollapsed ? "展开子树" : "折叠子树"}
            aria-expanded={!isCollapsed}
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
          >
            {isCollapsed ? `▸${childCount}` : "▾"}
          </button>
        )}
        <button
          type="button"
          className="node-merge-btn"
          aria-label="标记汇聚"
          onClick={(e) => {
            e.stopPropagation()
            onMerge()
          }}
        >
          汇
        </button>
      </div>
      {node.anchorText !== undefined && node.anchorText !== "" && (
        <div className="node-anchor">「{node.anchorText.slice(0, 40)}」</div>
      )}
      {preview !== "" && <div className="node-preview">{preview}</div>}
      <SpawnButton direction="left" onSpawn={onSpawn} />
      <SpawnButton direction="right" onSpawn={onSpawn} />
      <SpawnButton direction="top" onSpawn={onSpawn} />
      <SpawnButton direction="bottom" onSpawn={onSpawn} />
    </div>
  )
})
