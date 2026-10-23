import { type NodeReference, nowIso } from "../domain/types"
import { api } from "./api"
import { type SendDeps, scheduleSave } from "./flow"

export interface ReferenceDeps extends SendDeps {
  readonly getSimilar: () => readonly {
    mapId: string
    nodeId: string
    mapTitle: string
    title: string
    score: number
    excerpt: string
  }[]
  readonly setSimilar: (
    nodes: readonly {
      mapId: string
      nodeId: string
      mapTitle: string
      title: string
      score: number
      excerpt: string
    }[],
  ) => void
  readonly setSimilarOpen: (open: boolean) => void
}

export const runLoadSimilar = async (deps: ReferenceDeps): Promise<void> => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null) return
  try {
    deps.setSimilar(await api.similar(String(current.id), activeNodeId))
    deps.setSimilarOpen(true)
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "相似节点加载失败")
  }
}

export const runAddReference = (
  candidate: {
    mapId: string
    nodeId: string
    title: string
    excerpt: string
  },
  deps: SendDeps,
): void => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null) return
  const node = current.nodes[activeNodeId]
  if (node === undefined) return
  const existing = node.references ?? []
  if (existing.some((r) => r.nodeId === candidate.nodeId && r.mapId === candidate.mapId)) return
  const ref: NodeReference = {
    mapId: candidate.mapId,
    nodeId: candidate.nodeId,
    title: candidate.title,
    excerpt: candidate.excerpt,
  }
  const next = {
    ...current,
    nodes: {
      ...current.nodes,
      [activeNodeId]: {
        ...node,
        references: [...existing, ref],
        updatedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  }
  deps.setCurrent(next)
  scheduleSave(next, deps.setError)
}

export const runRemoveReference = (nodeId: string, deps: SendDeps): void => {
  const { current, activeNodeId } = {
    current: deps.getCurrent(),
    activeNodeId: deps.getActiveNodeId(),
  }
  if (current === null || activeNodeId === null) return
  const node = current.nodes[activeNodeId]
  if (node === undefined || node.references === undefined) return
  const next = {
    ...current,
    nodes: {
      ...current.nodes,
      [activeNodeId]: {
        ...node,
        references: node.references.filter((r) => r.nodeId !== nodeId),
        updatedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  }
  deps.setCurrent(next)
  scheduleSave(next, deps.setError)
}

export const makeReferenceDeps = (
  base: SendDeps,
  get: () => {
    readonly similar: readonly {
      mapId: string
      nodeId: string
      mapTitle: string
      title: string
      score: number
      excerpt: string
    }[]
  },
  set: (partial: {
    similar?: readonly {
      mapId: string
      nodeId: string
      mapTitle: string
      title: string
      score: number
      excerpt: string
    }[]
    similarOpen?: boolean
  }) => void,
): ReferenceDeps => ({
  ...base,
  getSimilar: () => get().similar,
  setSimilar: (similar) => set({ similar }),
  setSimilarOpen: (similarOpen) => set({ similarOpen }),
})
