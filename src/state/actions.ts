import { type ChatMap, type ChatNode, nowIso, type ToolTraceEntry } from "../domain/types"
import { api } from "./api"
import { runSend, type SendDeps, scheduleSave } from "./flow"

export interface ExtraDeps extends SendDeps {
  readonly getSummarizing: () => boolean
  readonly setSummarizing: (busy: boolean) => void
  readonly setToast: (msg: string | null) => void
  readonly setToolTrace: (trace: readonly ToolTraceEntry[]) => void
  readonly patchNode: (id: string, patch: (node: ChatNode) => ChatNode) => void
}

export const runSummarize = async (deps: ExtraDeps): Promise<void> => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null || deps.getSummarizing()) {
    return
  }
  deps.setSummarizing(true)
  deps.setToast("正在总结…（上游较慢，约 30-90 秒）")
  try {
    const summary = await api.summarize(String(current.id), activeNodeId)
    deps.patchNode(activeNodeId, (n) => ({ ...n, summary, updatedAt: nowIso() }))
    deps.setSummarizing(false)
    deps.setToast(`已生成总结：${summary.slice(0, 40)}`)
  } catch (e) {
    deps.setSummarizing(false)
    deps.setError(e instanceof Error ? e.message : "总结失败")
  }
}

export const runRetry = async (deps: ExtraDeps): Promise<void> => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null || deps.isSending()) return
  const node = current.nodes[activeNodeId]
  if (node === undefined || node.messages.length < 2) return
  const lastUser = [...node.messages].reverse().find((m) => m.role === "user")
  if (lastUser === undefined) return
  const trimmed: ChatMap = {
    ...current,
    nodes: {
      ...current.nodes,
      [activeNodeId]: {
        ...node,
        messages: node.messages.slice(0, Math.max(0, node.messages.length - 2)),
        updatedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  }
  deps.setCurrent(trimmed)
  await runSend(lastUser.content, {
    getCurrent: deps.getCurrent,
    getActiveNodeId: deps.getActiveNodeId,
    isSending: deps.isSending,
    getStreamText: deps.getStreamText,
    setCurrent: deps.setCurrent,
    setSending: deps.setSending,
    setStreamText: deps.setStreamText,
    setError: deps.setError,
    setToolTrace: deps.setToolTrace,
    scheduleSave: (map) => scheduleSave(map, deps.setError),
  })
}

export const runExport = async (
  deps: Pick<ExtraDeps, "getCurrent" | "setToast" | "setError">,
): Promise<void> => {
  const current = deps.getCurrent()
  if (current === null) return
  deps.setToast("正在导出…")
  try {
    const res = await api.exportMap(String(current.id))
    deps.setToast(`已导出 ${res.files.length} 个文件 → ${res.dir}`)
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "导出失败")
  }
}
