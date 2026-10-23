import { Handle, type Node, type NodeProps, Position } from "@xyflow/react"
import { memo } from "react"
import { type ToolShowNode, toolCallCount } from "../domain/toolNodes"

export interface ToolNodeData {
  readonly [key: string]: unknown
  readonly show: ToolShowNode
}

export type ToolFlowNode = Node<ToolNodeData, "tool">

const ToolNodeCard = memo(function ToolNodeCard({ data }: NodeProps<ToolFlowNode>) {
  const { show } = data
  const calls = toolCallCount(show.entries)
  return (
    <div className="tool-node">
      <Handle type="target" position={Position.Left} id="t-left" />
      <div className="tool-node-head">
        <span className="tool-node-title">工具调用 × {calls}</span>
        <span className="tool-node-meta">{show.entries.length} 条事件</span>
      </div>
      <ol className="trace-list tool-node-list">
        {show.entries.map((t) => (
          <li
            key={`${t.kind}-${t.name}-${t.args ?? ""}-${t.result ?? ""}`}
            className={`trace-item trace-${t.kind}`}
          >
            <span className="trace-name">
              {t.kind === "call" ? "→ " : "← "}
              {t.name}
            </span>
            <pre className="trace-body">
              {t.kind === "call"
                ? t.args === ""
                  ? "{}"
                  : t.args
                : `${t.ok === false ? "✗ " : ""}${t.result ?? ""}`}
            </pre>
          </li>
        ))}
      </ol>
    </div>
  )
})

export const ToolNode = ToolNodeCard as typeof ToolNodeCard
