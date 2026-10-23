import { useState } from "react"
import { api, type ContextDto } from "../state/api"
import { activeNodeOf, breadcrumbOf } from "../state/flow"
import { useStore } from "../state/store"
import { Markdown } from "./Markdown"
import { ReferencePicker } from "./ReferencePicker"
import { SimilarPanel } from "./SimilarPanel"
import { ToolTrace } from "./ToolTrace"

const SOURCE_NAMES: Record<ContextDto["parts"][number]["source"], string> = {
  language: "语言",
  teaching: "教学",
  ancestor: "上级",
  convergent: "汇聚",
  current: "当前",
}

export const ChatPanel = () => {
  const current = useStore((s) => s.current)
  const activeNodeId = useStore((s) => s.activeNodeId)
  const streamText = useStore((s) => s.streamText)
  const sending = useStore((s) => s.sending)
  const summarizing = useStore((s) => s.summarizing)
  const error = useStore((s) => s.error)
  const send = useStore((s) => s.send)
  const retry = useStore((s) => s.retry)
  const summarizeActive = useStore((s) => s.summarizeActive)
  const createChild = useStore((s) => s.createChild)
  const appendToNote = useStore((s) => s.appendToNote)
  const updateNote = useStore((s) => s.updateNote)
  const loadSimilar = useStore((s) => s.loadSimilar)
  const clearError = useStore((s) => s.clearError)
  const [input, setInput] = useState("")
  const [selection, setSelection] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [context, setContext] = useState<ContextDto | null>(null)
  const [showNote, setShowNote] = useState(false)

  const node = activeNodeOf(current, activeNodeId)

  const submit = (): void => {
    const text = input.trim()
    if (text === "" || sending) return
    setInput("")
    void send(text)
  }

  const openContext = (): void => {
    if (current === null || node === null) return
    setShowContext(true)
    setContext(null)
    void api
      .contextOf(String(current.id), node.id)
      .then(setContext)
      .catch((e: unknown) =>
        useStore.setState({ error: e instanceof Error ? e.message : "上下文加载失败" }),
      )
  }

  if (current === null || node === null) {
    return (
      <aside className="chat">
        <div className="chat-empty">选择或创建一个图谱后，点击节点开始对话。</div>
      </aside>
    )
  }

  const lastIsAssistant = node.messages.at(-1)?.role === "assistant"

  return (
    <aside className="chat">
      <div className="chat-head">
        <div className="chat-path">{breadcrumbOf(current, node.id).join(" › ")}</div>
        <div className="chat-tools">
          <button type="button" className="btn tool" onClick={openContext}>
            上下文
          </button>
          <button
            type="button"
            className="btn tool"
            disabled={summarizing || node.messages.length === 0}
            onClick={() => void summarizeActive()}
          >
            {summarizing ? "总结中…" : "总结"}
          </button>
          <button type="button" className="btn tool" onClick={() => setShowNote(!showNote)}>
            随记{node.note !== undefined && node.note !== "" ? "✎" : ""}
          </button>
          <button type="button" className="btn tool" onClick={() => void loadSimilar()}>
            相似
          </button>
        </div>
      </div>
      <ReferencePicker />
      {showContext && (
        <div className="ctx-modal" role="dialog" aria-label="上下文预览">
          <div className="ctx-head">
            <span>
              模型将看到的内容（
              {context === null ? "载入中…" : `${context.chars} 字符 · ${context.parts.length} 段`}
              ）
            </span>
            <button type="button" className="btn" onClick={() => setShowContext(false)}>
              关闭
            </button>
          </div>
          <div className="ctx-list">
            {(context?.parts ?? []).map((p) => (
              <div key={`${p.source}-${p.label}`} className={`ctx-part ctx-${p.source}`}>
                <div className="ctx-label">
                  <span className="ctx-src">{SOURCE_NAMES[p.source]}</span> {p.label}
                </div>
                <pre>{p.content.slice(0, 1200)}</pre>
              </div>
            ))}
            {context !== null && context.clipped.length > 0 && (
              <div className="ctx-clipped">
                更深层节点已压缩为摘要：{context.clipped.join("、")}
              </div>
            )}
          </div>
        </div>
      )}
      {showNote && (
        <div className="note-area">
          <textarea
            value={node.note ?? ""}
            onChange={(e) => updateNote(node.id, e.target.value)}
            placeholder="这个节点的个人随记…（自动保存）"
            rows={4}
            aria-label="节点随记"
          />
        </div>
      )}
      <div
        className="chat-list"
        role="log"
        aria-label="节点对话记录"
        onMouseUp={() => {
          const text = window.getSelection()?.toString().trim() ?? ""
          setSelection(text !== "" && text.length <= 200 ? text : null)
        }}
      >
        {selection !== null && (
          <div className="chat-selection">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => {
                createChild("right", selection)
                setSelection(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              拉分支
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                appendToNote(node.id, `「${selection}」`)
                setSelection(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              存为随记
            </button>
          </div>
        )}
        {node.messages.map((m, i) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role === "assistant" ? (
              <Markdown text={m.content} />
            ) : (
              <p className="md-p">{m.content}</p>
            )}
            {m.role === "assistant" && m.toolTrace !== undefined && <ToolTrace message={m} />}
            {m.role === "assistant" && i === node.messages.length - 1 && !sending && (
              <button
                type="button"
                className="btn msg-retry"
                onClick={() => void retry()}
                aria-label="重新生成最后回复"
              >
                ↻ 重试
              </button>
            )}
          </div>
        ))}
        {streamText !== null && streamText === "" && (
          <div className="msg msg-assistant chat-waiting">
            正在生成…
            <span className="stream-cursor" aria-hidden="true" />
          </div>
        )}
        {streamText !== null && streamText !== "" && (
          <div className="msg msg-assistant is-streaming">
            <Markdown text={streamText} />
            <span className="stream-cursor" aria-hidden="true" />
          </div>
        )}
        {lastIsAssistant === false && streamText === null && node.messages.length > 0 && (
          <div className="chat-hint">上一条未获回复，可点「重试」或直接重发。</div>
        )}
      </div>
      {error !== null && (
        <div className="chat-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={clearError}>
            知道了
          </button>
        </div>
      )}
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            sending ? "回复生成中…" : "输入问题，Enter 发送；选中上方回答文字可拉分支或存随记"
          }
          rows={3}
          disabled={sending}
          aria-label="对话输入框"
        />
        <button
          type="button"
          className="btn btn-accent"
          onClick={submit}
          disabled={sending || input.trim() === ""}
        >
          发送
        </button>
      </div>
      <SimilarPanel />
    </aside>
  )
}
