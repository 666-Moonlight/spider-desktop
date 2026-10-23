import { useEffect } from "react"
import { useStore } from "../state/store"
import { ChatPanel } from "./ChatPanel"
import { ErrorBoundary } from "./ErrorBoundary"
import { GraphCanvas } from "./GraphCanvas"
import { SettingsModal } from "./SettingsModal"
import { Sidebar } from "./Sidebar"

export const App = () => {
  const refreshMaps = useStore((s) => s.refreshMaps)
  const current = useStore((s) => s.current)
  const addRoot = useStore((s) => s.addRoot)
  const applyLayout = useStore((s) => s.applyLayout)
  const openSettings = useStore((s) => s.openSettings)
  const exportCurrent = useStore((s) => s.exportCurrent)
  const mergeSourceId = useStore((s) => s.mergeSourceId)
  const toast = useStore((s) => s.toast)
  const setToast = useStore((s) => s.setToast)

  useEffect(() => {
    void refreshMaps()
  }, [refreshMaps])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast, setToast])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✳</span>
          <span className="brand-name">Spider</span>
          <span className="brand-sub">独立版</span>
        </div>
        <div className="topbar-title">{current?.title ?? ""}</div>
        <div className="topbar-actions">
          <span className="toast" role="status">
            {toast ?? ""}
          </span>
          <span className="merge-hint">
            {mergeSourceId !== null ? "汇聚模式：再点一个节点完成汇合" : ""}
          </span>
          <button type="button" className="btn" onClick={applyLayout} disabled={current === null}>
            自动布局
          </button>
          <button type="button" className="btn" onClick={addRoot} disabled={current === null}>
            + 根节点
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void exportCurrent()}
            disabled={current === null}
          >
            导出
          </button>
          <button type="button" className="btn" onClick={openSettings}>
            设置
          </button>
        </div>
      </header>
      <div className="body">
        <ErrorBoundary>
          <Sidebar />
          {current === null ? <Welcome /> : <GraphCanvas />}
          <ChatPanel />
        </ErrorBoundary>
      </div>
      <SettingsModal />
    </div>
  )
}

const Welcome = () => {
  const newMap = useStore((s) => s.newMap)
  const importFrom = useStore((s) => s.importFrom)
  return (
    <main className="welcome">
      <div className="card welcome-card">
        <h1 className="welcome-title">从一张图谱开始</h1>
        <p className="welcome-text">
          新建图谱，或导入 Obsidian 插件已有的 .spider/maps
          图谱（多根、四向分支、汇聚节点全部保留）。
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn btn-accent" onClick={() => void newMap()}>
            新建图谱
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const source = window.prompt(
                "输入 .spider/maps 目录路径（Obsidian 仓库下的 .spider/maps）",
                "",
              )
              if (source === null || source.trim() === "") return
              void importFrom(source.trim()).then(() => useStore.getState().refreshMaps())
            }}
          >
            导入 .spider 图谱
          </button>
        </div>
      </div>
    </main>
  )
}
