import { useEffect, useState } from "react"
import { api, type SettingsDto } from "../state/api"
import { useStore } from "../state/store"

const STYLE_OPTIONS: ReadonlyArray<{
  readonly value: SettingsDto["teachingStyle"]
  readonly label: string
}> = [
  { value: "default", label: "默认（不注入教学风格）" },
  { value: "teacher", label: "循序渐进（系统讲解）" },
  { value: "socratic", label: "启发提问（苏格拉底）" },
  { value: "concise", label: "简明要点" },
  { value: "custom", label: "自定义系统提示词" },
]

export const SettingsModal = () => {
  const open = useStore((s) => s.settingsOpen)
  const close = useStore((s) => s.closeSettings)
  const save = useStore((s) => s.saveSettings)
  const [form, setForm] = useState<SettingsDto | null>(null)
  const [testMsg, setTestMsg] = useState("")

  useEffect(() => {
    if (open) {
      setTestMsg("")
      void api
        .settings()
        .then(setForm)
        .catch(() => setForm(null))
    }
  }, [open])

  if (!open) return null
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="设置">
      <div className="card modal">
        <h2 className="modal-title">设置</h2>
        {form === null ? (
          <p className="modal-loading">载入中…</p>
        ) : (
          <>
            <label className="field">
              <span>API Base URL</span>
              <input
                className="input"
                value={form.apiBaseUrl}
                spellCheck={false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    apiBaseUrl: e.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              <span>API Key</span>
              <input
                className="input"
                type="password"
                value={form.apiKey}
                spellCheck={false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    apiKey: e.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              <span>模型</span>
              <input
                className="input"
                value={form.model}
                spellCheck={false}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </label>
            <label className="field">
              <span>向量嵌入模型（可选，留空使用词法相似度）</span>
              <input
                className="input"
                value={form.embeddingsModel ?? ""}
                placeholder="例如 text-embedding-3-small 或 nomic-embed-text"
                spellCheck={false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    embeddingsModel: e.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              <span>学习方式（教学风格系统提示词）</span>
              <select
                className="input"
                value={form.teachingStyle}
                onChange={(e) =>
                  setForm({
                    ...form,
                    teachingStyle: e.target.value as SettingsDto["teachingStyle"],
                  })
                }
              >
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {form.teachingStyle === "custom" && (
              <label className="field">
                <span>自定义系统提示词</span>
                <textarea
                  className="input"
                  rows={3}
                  value={form.customSystemPrompt}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customSystemPrompt: e.target.value,
                    })
                  }
                />
              </label>
            )}
            <label className="field field-row">
              <input
                type="checkbox"
                checked={form.includeParentContext}
                onChange={(e) =>
                  setForm({
                    ...form,
                    includeParentContext: e.target.checked,
                  })
                }
              />
              <span>子节点携带上级链对话上下文（M2 引擎：近层全文 + 深层摘要）</span>
            </label>
            <label className="field field-row">
              <input
                type="checkbox"
                checked={form.toolsEnabled}
                onChange={(e) =>
                  setForm({
                    ...form,
                    toolsEnabled: e.target.checked,
                  })
                }
              />
              <span>启用工具调用（内置笔记检索/节点读取 + MCP 工具）</span>
            </label>
            <label className="field">
              <span>MCP 服务器（每行一个：名称|命令|参数，用空格分隔参数）</span>
              <textarea
                className="input"
                rows={3}
                value={form.mcpServers
                  .map((s) => `${s.name}|${s.command}|${s.args.join(" ")}`)
                  .join("\n")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mcpServers: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter((line) => line !== "")
                      .map((line) => {
                        const [name = "", command = "", ...args] = line.split("|")
                        const argText = args.join("|").trim()
                        return {
                          name: name.trim(),
                          command: command.trim(),
                          args: argText === "" ? [] : argText.split(/\s+/),
                          env: {},
                        }
                      })
                      .filter((s) => s.name !== "" && s.command !== ""),
                  })
                }
                placeholder="mock|node|C:/path/to/mock-mcp-server.mjs"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTestMsg("测试中…")
                  void api
                    .testConnection()
                    .then((r) => setTestMsg(r.ok ? `连通正常：${r.message}` : `失败：${r.message}`))
                    .catch((e: unknown) => setTestMsg(e instanceof Error ? e.message : "测试失败"))
                }}
              >
                测试连通
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => void save(form).then(close)}
              >
                保存
              </button>
              <button type="button" className="btn" onClick={close}>
                取消
              </button>
            </div>
            {testMsg !== "" && <p className="modal-test">{testMsg}</p>}
            <p className="modal-hint">
              默认指向本机 agy 桥（127.0.0.1:8000）；也可填任意 OpenAI 兼容端点或 Ollama。
            </p>
          </>
        )}
      </div>
    </div>
  )
}
