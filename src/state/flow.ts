import { ancestorIds } from "../domain/graphTraverse"
import type { NodeId } from "../domain/ids"
import {
  type ChatMap,
  type ChatNode,
  nowIso,
  type ToolTraceEntry,
  type WritableNode,
} from "../domain/types"
import { api } from "./api"

const UNTITLED = new Set(["新分支", "根问题", "独立根问题", "汇聚节点", ""])

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const scheduleSave = (map: ChatMap, onError: (msg: string) => void): void => {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    api.saveMap(map).catch((e: unknown) => onError(e instanceof Error ? e.message : "保存失败"))
  }, 400)
}

export const appendMessage = (
  map: ChatMap,
  nodeId: string,
  role: "user" | "assistant",
  content: string,
  toolTrace?: readonly ToolTraceEntry[],
): ChatMap => {
  const node = map.nodes[nodeId]
  if (node === undefined) return map
  const next: WritableNode = {
    ...node,
    messages: [
      ...node.messages,
      {
        id: `msg_${Date.now().toString(36)}`,
        role,
        content,
        createdAt: nowIso(),
        ...(toolTrace !== undefined && toolTrace.length > 0 ? { toolTrace } : {}),
      },
    ],
    updatedAt: nowIso(),
  }
  return {
    ...map,
    nodes: { ...map.nodes, [nodeId]: next },
    updatedAt: nowIso(),
  }
}

export interface SendDeps {
  readonly getCurrent: () => ChatMap | null
  readonly getActiveNodeId: () => string | null
  readonly isSending: () => boolean
  readonly getStreamText: () => string | null
  readonly setCurrent: (map: ChatMap) => void
  readonly setSending: (sending: boolean) => void
  readonly setStreamText: (text: string | null) => void
  readonly setError: (msg: string | null) => void
  readonly setToolTrace: (trace: readonly ToolTraceEntry[]) => void
  readonly scheduleSave: (map: ChatMap) => void
}

export const runSend = async (text: string, deps: SendDeps): Promise<void> => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null || deps.isSending()) return
  const mapId = String(current.id)
  const nodeId = activeNodeId
  const withUser = appendMessage(current, nodeId, "user", text)
  deps.setCurrent(withUser)
  deps.setSending(true)
  deps.setStreamText("")
  deps.setError(null)
  deps.scheduleSave(withUser)
  try {
    const trace: ToolTraceEntry[] = []
    let finalText = ""
    await api.chat(
      mapId,
      nodeId,
      text,
      (e) => {
        if (e.type === "delta" && e.text !== undefined) {
          const prev = deps.getStreamText() ?? ""
          deps.setStreamText(prev + e.text)
        } else if (e.type === "tool_call" && e.name !== undefined) {
          trace.push({ kind: "call", name: e.name, args: e.args ?? "" })
          deps.setToolTrace([...trace])
        } else if (e.type === "tool_result" && e.name !== undefined) {
          trace.push({
            kind: "result",
            name: e.name,
            result: (e.content ?? "").slice(0, 800),
            ok: e.ok ?? true,
          })
          deps.setToolTrace([...trace])
        } else if (e.type === "final" && e.text !== undefined) {
          finalText = e.text
        } else if (e.type === "error" && e.message !== undefined) {
          deps.setError(e.message)
        }
      },
      new AbortController().signal,
    )
    if (finalText !== "") deps.setStreamText(finalText)
    const reply = (deps.getStreamText() ?? "").trim()
    if (reply === "") {
      deps.setSending(false)
      deps.setStreamText(null)
      deps.setError("未收到任何回复内容：模型首字返回较慢或上游返回了空响应，请稍后重试。")
      deps.scheduleSave(deps.getCurrent() ?? withUser)
      return
    }
    const withReply = appendMessage(
      deps.getCurrent() ?? withUser,
      nodeId,
      "assistant",
      reply,
      trace.length > 0 ? trace : undefined,
    )
    deps.setCurrent(withReply)
    deps.setStreamText(null)
    deps.setSending(false)
    deps.scheduleSave(withReply)
    const node = withReply.nodes[nodeId]
    if (node !== undefined && UNTITLED.has(node.title.trim()) && node.messages.length >= 2) {
      try {
        const title = await api.title(mapId, nodeId)
        if (title !== "") {
          const titled: ChatMap = {
            ...withReply,
            nodes: {
              ...withReply.nodes,
              [nodeId]: { ...node, title },
            },
            updatedAt: nowIso(),
          }
          deps.setCurrent(titled)
          deps.scheduleSave(titled)
        }
      } catch {
        // auto-title is cosmetic; a failing title must never break the chat flow
      }
    }
  } catch (e) {
    deps.setSending(false)
    deps.setStreamText(null)
    deps.setError(e instanceof Error ? e.message : "对话失败")
  }
}

export const activeNodeOf = (map: ChatMap | null, activeNodeId: string | null): ChatNode | null => {
  if (map === null || activeNodeId === null) return null
  return map.nodes[activeNodeId] ?? null
}

export const breadcrumbOf = (map: ChatMap, nodeId: string): readonly string[] => {
  const chain = ancestorIds(map, nodeId as NodeId)
  const titles = chain.map((id) => map.nodes[id]?.title ?? "?")
  const self = map.nodes[nodeId]?.title ?? ""
  return [...titles, self]
}
