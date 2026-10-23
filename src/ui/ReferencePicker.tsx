import { useState } from "react"
import { api, type ReferenceCandidateDto } from "../state/api"
import { useStore } from "../state/store"

export const ReferencePicker = () => {
  const current = useStore((s) => s.current)
  const activeNodeId = useStore((s) => s.activeNodeId)
  const addReference = useStore((s) => s.addReference)
  const removeReference = useStore((s) => s.removeReference)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<readonly ReferenceCandidateDto[]>([])
  const [busy, setBusy] = useState(false)

  const node = current !== null && activeNodeId !== null ? current.nodes[activeNodeId] : undefined
  const refs = node?.references ?? []

  const search = (): void => {
    if (current === null || activeNodeId === null || query.trim() === "") {
      return
    }
    setBusy(true)
    void api
      .searchReferences(query, String(current.id), activeNodeId)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setBusy(false))
  }

  return (
    <div className="refs">
      <div className="refs-row">
        {refs.map((r) => (
          <span key={`${r.mapId}-${r.nodeId}`} className="ref-chip" title={r.excerpt}>
            <span className="ref-chip-title">＠{r.title}</span>
            <button
              type="button"
              className="ref-chip-x"
              aria-label={`移除引用 ${r.title}`}
              onClick={() => removeReference(r.nodeId)}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="btn tool"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          ＠ 引用
        </button>
      </div>
      {open && (
        <div className="refs-panel">
          <div className="refs-search">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  search()
                }
              }}
              placeholder="搜索全库节点标题/内容，Enter 检索"
              aria-label="检索可引用节点"
            />
            <button type="button" className="btn" onClick={search} disabled={busy}>
              {busy ? "检索中…" : "检索"}
            </button>
          </div>
          {results.length === 0 ? (
            <p className="refs-empty">{busy ? "" : "输入关键词检索其他图谱节点作为参考资料。"}</p>
          ) : (
            <ul className="refs-results">
              {results.map((c) => (
                <li key={`${c.mapId}-${c.nodeId}`}>
                  <button
                    type="button"
                    className="refs-hit"
                    onClick={() => {
                      addReference({
                        mapId: c.mapId,
                        nodeId: c.nodeId,
                        title: c.title,
                        excerpt: c.excerpt,
                      })
                      setResults([])
                      setQuery("")
                      setOpen(false)
                    }}
                  >
                    <span className="refs-hit-title">{c.title}</span>
                    <span className="refs-hit-meta">
                      {c.mapTitle} · 相似度 {c.score.toFixed(2)}
                    </span>
                    <span className="refs-hit-excerpt">{c.excerpt}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
