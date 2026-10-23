import { useState } from "react"
import { useStore } from "../state/store"

// 留空时由用户自己填；默认值只做示例，避免把某台机器的路径写死进开源仓库。
const DEFAULT_SOURCE = ""

export const Sidebar = () => {
  const maps = useStore((s) => s.maps)
  const current = useStore((s) => s.current)
  const openMap = useStore((s) => s.openMap)
  const newMap = useStore((s) => s.newMap)
  const renameMap = useStore((s) => s.renameMap)
  const removeMap = useStore((s) => s.removeMap)
  const importFrom = useStore((s) => s.importFrom)
  const refreshMaps = useStore((s) => s.refreshMaps)
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [importMsg, setImportMsg] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button type="button" className="btn btn-accent" onClick={() => void newMap()}>
          新建
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (source.trim() === "") {
              setImportMsg("请先填写 .spider/maps 目录路径")
              return
            }
            setImportMsg("导入中…")
            void importFrom(source.trim())
              .then((r) => {
                setImportMsg(`导入 ${r.imported.length} 张，失败 ${r.failed.length} 张`)
                void refreshMaps()
              })
              .catch((e: unknown) => setImportMsg(e instanceof Error ? e.message : "导入失败"))
          }}
        >
          导入
        </button>
      </div>
      <input
        className="input sidebar-source"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        aria-label=".spider maps 目录路径"
      />
      {importMsg !== "" && <p className="sidebar-msg">{importMsg}</p>}
      <div className="sidebar-list">
        {maps.length === 0 ? (
          <p className="sidebar-empty">还没有图谱。点「导入」读入 .spider/maps，或「新建」开始。</p>
        ) : (
          maps.map((m) => (
            <div key={m.id} className={`map-item${current?.id === m.id ? " is-active" : ""}`}>
              {editingId === m.id ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: user explicitly initiated inline rename via double click
                  autoFocus
                  className="input map-item-rename"
                  value={editingTitle}
                  aria-label="图谱名称"
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = editingTitle.trim()
                      if (trimmed !== "" && trimmed !== m.title) {
                        void renameMap(m.id, trimmed)
                      }
                      setEditingId(null)
                    } else if (e.key === "Escape") {
                      setEditingId(null)
                    }
                  }}
                  onBlur={() => {
                    const trimmed = editingTitle.trim()
                    if (trimmed !== "" && trimmed !== m.title) {
                      void renameMap(m.id, trimmed)
                    }
                    setEditingId(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="map-item-main"
                  onClick={() => void openMap(m.id)}
                  onDoubleClick={() => {
                    setEditingId(m.id)
                    setEditingTitle(m.title)
                  }}
                  title="双击重命名"
                >
                  <span className="map-item-title">{m.title}</span>
                  <span className="map-item-meta">
                    {m.nodeCount} 节点 · {m.updatedAt.slice(0, 10)}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="map-item-del"
                aria-label={`删除 ${m.title}`}
                onClick={() => {
                  if (window.confirm(`删除图谱「${m.title}」？`)) void removeMap(m.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
