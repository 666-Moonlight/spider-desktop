import type { ChatMap } from "../src/domain/types"

export const appendMessage = (
  map: ChatMap,
  nodeId: string,
  role: "user" | "assistant",
  content: string,
): ChatMap => {
  const node = map.nodes[nodeId]
  if (node === undefined) return map
  const stamp = Date.now().toString(36)
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [nodeId]: {
        ...node,
        messages: [
          ...node.messages,
          {
            id: `msg_${stamp}_${node.messages.length}`,
            role,
            content,
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  }
}
