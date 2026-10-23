import type { ChatMessage, ChatNode, ToolTraceEntry } from "./types"

export interface ToolShowNode {
  readonly id: string
  readonly sourceNodeId: string
  readonly messageId: string
  readonly position: { readonly x: number; readonly y: number }
  readonly entries: readonly ToolTraceEntry[]
}

export const TOOL_NODE_ID_PREFIX = "tool:"
export const TOOL_NODE_DX = 300
export const TOOL_NODE_DY = 0

const lastAssistantWithTrace = (node: ChatNode): ChatMessage | null => {
  for (let i = node.messages.length - 1; i >= 0; i -= 1) {
    const m = node.messages[i]
    if (m === undefined) continue
    if (m.role === "assistant" && (m.toolTrace?.length ?? 0) > 0) return m
  }
  return null
}

/** Tool nodes are display-only: never written into ChatMap, so importer round-trips are unaffected. */
export const toolShowNodes = (
  nodes: readonly ChatNode[],
  activeNodeId: string | null,
): readonly ToolShowNode[] => {
  const out: ToolShowNode[] = []
  for (const node of nodes) {
    if (activeNodeId !== null && node.id !== activeNodeId) continue
    const msg = lastAssistantWithTrace(node)
    if (msg === null || msg.toolTrace === undefined) continue
    out.push({
      id: `${TOOL_NODE_ID_PREFIX}${msg.id}`,
      sourceNodeId: node.id,
      messageId: msg.id,
      position: {
        x: node.position.x + TOOL_NODE_DX,
        y: node.position.y + TOOL_NODE_DY,
      },
      entries: msg.toolTrace,
    })
  }
  return out
}

export const toolCallCount = (entries: readonly ToolTraceEntry[]): number =>
  entries.filter((e) => e.kind === "call").length
