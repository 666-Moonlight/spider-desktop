import { useStore } from "../state/store"

export const SimilarPanel = () => {
  const open = useStore((s) => s.similarOpen)
  const similar = useStore((s) => s.similar)
  const close = useStore((s) => s.closeSimilar)
  const openMap = useStore((s) => s.openMap)
  const setActive = useStore((s) => s.setActive)
  const current = useStore((s) => s.current)

  if (!open) return null
  return (
    <div className="similar-panel" role="dialog" aria-label="相似节点">
      <div className="similar-head">
        <span>相似节点（本地词法相似度）</span>
        <button type="button" className="btn tool" onClick={close}>
          关闭
        </button>
      </div>
      {similar.length === 0 ? (
        <p className="similar-empty">没有找到相似节点。</p>
      ) : (
        <ul className="similar-list">
          {similar.map((n) => (
            <li key={`${n.mapId}-${n.nodeId}`}>
              <button
                type="button"
                className="similar-hit"
                onClick={() => {
                  if (String(current?.id) !== n.mapId) {
                    void openMap(n.mapId).then(() => setActive(n.nodeId))
                  } else {
                    setActive(n.nodeId)
                  }
                  close()
                }}
              >
                <span className="similar-title">{n.title}</span>
                <span className="similar-meta">
                  {n.mapTitle} · {n.score.toFixed(2)}
                </span>
                <span className="similar-excerpt">{n.excerpt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
