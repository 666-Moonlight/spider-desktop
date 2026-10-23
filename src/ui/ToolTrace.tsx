import { useState } from "react"
import type { ChatMessage } from "../domain/types"

export const ToolTrace = ({ message }: { message: ChatMessage }) => {
  const [open, setOpen] = useState(false)
  const trace = message.toolTrace ?? []
  if (trace.length === 0) return null
  const calls = trace.filter((t) => t.kind === "call").length
  return (
    <div className="tool-trace">
      <button
        type="button"
        className="btn tool trace-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} 工具调用 {calls} 次 · {trace.length} 条事件
      </button>
      {open && (
        <ol className="trace-list">
          {trace.map((t) => (
            <li
              key={`${t.kind}-${t.name}-${trace.indexOf(t)}`}
              className={`trace-item trace-${t.kind}`}
            >
              <span className="trace-name">
                {t.kind === "call" ? "→ " : "← "}
                {t.name}
              </span>
              {t.kind === "call" ? (
                <pre className="trace-body">{t.args === "" ? "{}" : t.args}</pre>
              ) : (
                <pre className="trace-body">
                  {t.ok === false ? "✗ " : ""}
                  {t.result ?? ""}
                </pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
