import { create } from "zustand"
import {
  createChildNode,
  createConvergentNode,
  createRootNode,
  deleteNode,
} from "../domain/graphOps"
import { visibleNodeIds } from "../domain/graphTraverse"
import type { NodeId } from "../domain/ids"
import { layoutPositions } from "../domain/layout"
import { coneNavigate } from "../domain/nav"
import { type ChatMap, type ChatNode, nowIso, type WritableMap } from "../domain/types"
import { type ExtraDeps, runExport, runRetry, runSummarize } from "./actions"
import { api } from "./api"
import { type AppState, INITIAL_STATE } from "./appState"
import { runSend, scheduleSave } from "./flow"
import {
  importFromImpl,
  type MapListDeps,
  newMapImpl,
  openMapImpl,
  refreshMapsImpl,
  removeMapImpl,
  renameMapImpl,
} from "./maps"
import {
  makeReferenceDeps,
  runAddReference,
  runLoadSimilar,
  runRemoveReference,
} from "./references"

export const useStore = create<AppState>((set, get) => {
  const commit = (next: ChatMap | null, selectId?: string, refuseMsg = "操作被拒绝"): boolean => {
    if (next === null) {
      set({ error: refuseMsg })
      return false
    }
    set(selectId !== undefined ? { current: next, activeNodeId: selectId } : { current: next })
    scheduleSave(next, (msg) => set({ error: msg }))
    return true
  }
  const patchNode = (id: string, patch: (node: ChatNode) => ChatNode): void => {
    const { current } = get()
    if (current === null) return
    const node = current.nodes[id]
    if (node === undefined) return
    commit({
      ...current,
      nodes: { ...current.nodes, [id]: patch(node) },
      updatedAt: nowIso(),
    })
  }
  const mapDeps = (): MapListDeps => ({
    getCurrent: () => get().current,
    setMaps: (maps) => set({ maps }),
    setCurrent: (map, activeNodeId) =>
      set({
        current: map,
        activeNodeId: activeNodeId ?? null,
        streamText: null,
        mergeSourceId: null,
        collapsedIds: [],
      }),
    setError: (error) => set({ error }),
  })

  const extraDeps = (): ExtraDeps => ({
    getCurrent: () => get().current,
    getActiveNodeId: () => get().activeNodeId,
    isSending: () => get().sending,
    getStreamText: () => get().streamText,
    setCurrent: (map) => set({ current: map }),
    setSending: (sending) => set({ sending }),
    setStreamText: (streamText) => set({ streamText }),
    setError: (error) => set({ error }),
    scheduleSave: (map) => scheduleSave(map, (msg) => set({ error: msg })),
    getSummarizing: () => get().summarizing,
    setSummarizing: (summarizing) => set({ summarizing }),
    setToast: (toast) => set({ toast }),
    setToolTrace: (toolTrace) => set({ toolTrace }),
    patchNode,
  })

  return {
    ...INITIAL_STATE,
    refreshMaps: () => refreshMapsImpl(mapDeps()),
    openMap: (id) => openMapImpl(id, mapDeps()),
    newMap: () => newMapImpl(mapDeps()),
    removeMap: (id) => removeMapImpl(id, mapDeps()),
    renameMap: (id, title) => renameMapImpl(id, title, mapDeps()),
    importFrom: (source) => importFromImpl(source, mapDeps()),
    setActive: (id) => set({ activeNodeId: id }),
    createChild(direction, anchorText) {
      const { current, activeNodeId } = get()
      if (current === null || activeNodeId === null) return
      const res = createChildNode(current, {
        parentId: activeNodeId as NodeId,
        direction,
        ...(anchorText !== undefined ? { anchorText } : {}),
      })
      if (res !== null) commit(res.map, res.node.id)
    },
    addRoot() {
      const { current } = get()
      if (current === null) return
      const res = createRootNode(current)
      commit(res.map, res.node.id)
    },
    deleteActive() {
      const { current, activeNodeId } = get()
      if (current === null || activeNodeId === null) return
      const next = deleteNode(current, activeNodeId as NodeId)
      if (next === null) {
        set({ error: "不能删除最后一个根节点" })
        return
      }
      const fallback = next.rootNodeId ?? Object.keys(next.nodes)[0] ?? null
      commit(next, fallback === null ? undefined : fallback, "删除被拒绝")
    },
    beginMerge(id) {
      const { current, mergeSourceId } = get()
      if (current === null) return
      if (mergeSourceId === null || mergeSourceId === id) {
        set({ mergeSourceId: id, error: null })
        return
      }
      const res = createConvergentNode(current, [mergeSourceId as NodeId, id as NodeId])
      if (res !== null) {
        commit(res.map, res.node.id)
        set({ mergeSourceId: null })
      } else {
        set({
          mergeSourceId: null,
          error: "汇聚失败：请选择两个不同节点",
        })
      }
    },
    applyLayout() {
      const { current } = get()
      if (current === null) return
      const positions = layoutPositions(current)
      const nodes: Record<string, ChatNode> = {}
      for (const [id, node] of Object.entries(current.nodes)) {
        const p = positions[id]
        nodes[id] = p === undefined ? node : { ...node, position: p }
      }
      const next: WritableMap = {
        ...current,
        nodes,
        updatedAt: nowIso(),
      }
      commit(next)
    },
    moveNode(id, position) {
      const { current } = get()
      if (current === null) return
      const node = current.nodes[id]
      if (node === undefined) return
      commit({
        ...current,
        nodes: { ...current.nodes, [id]: { ...node, position } },
        updatedAt: nowIso(),
      })
    },
    async send(text) {
      await runSend(text, extraDeps())
    },
    navKey(key) {
      const { current, activeNodeId, collapsedIds } = get()
      if (current === null || activeNodeId === null) return
      const next = coneNavigate(
        current,
        activeNodeId as NodeId,
        key,
        visibleNodeIds(current, new Set(collapsedIds)),
      )
      if (next !== null) set({ activeNodeId: next })
    },
    openSettings() {
      set({ settingsOpen: true })
    },
    closeSettings() {
      set({ settingsOpen: false })
    },
    async saveSettings(next) {
      const saved = await api.saveSettings(next)
      set({ settings: saved, settingsOpen: false, toast: "设置已保存" })
    },
    clearError() {
      set({ error: null })
    },
    setToast(msg) {
      set({ toast: msg })
    },
    toggleCollapse(id) {
      const { collapsedIds } = get()
      set({
        collapsedIds: collapsedIds.includes(id)
          ? collapsedIds.filter((x) => x !== id)
          : [...collapsedIds, id],
      })
    },
    updateNote(id, note) {
      patchNode(id, (n) => ({ ...n, note, updatedAt: nowIso() }))
    },
    appendToNote(id, text) {
      patchNode(id, (n) => ({
        ...n,
        note: n.note !== undefined && n.note !== "" ? `${n.note}\n${text}` : text,
        updatedAt: nowIso(),
      }))
      set({ toast: "已存为随记" })
    },
    async summarizeActive() {
      await runSummarize(extraDeps())
    },
    async retry() {
      await runRetry(extraDeps())
    },
    async exportCurrent() {
      await runExport({
        getCurrent: () => get().current,
        setToast: (toast) => set({ toast }),
        setError: (error) => set({ error }),
      })
    },
    async loadSimilar() {
      await runLoadSimilar(makeReferenceDeps(extraDeps(), get, set))
    },
    closeSimilar() {
      set({ similarOpen: false })
    },
    addReference(candidate) {
      runAddReference(candidate, makeReferenceDeps(extraDeps(), get, set))
    },
    removeReference(nodeId) {
      runRemoveReference(nodeId, makeReferenceDeps(extraDeps(), get, set))
    },
  }
})
