import { getNodeParentIds } from "./graphTraverse"
import { asMapId, asNodeId, edgeId, type NodeId } from "./ids"
import {
  assertNever,
  type ChatMap,
  type ChatNode,
  nowIso,
  type Position,
  type WritableMap,
  type WritableNode,
} from "./types"

export type Direction = "left" | "right" | "top" | "bottom"

let seq = 0

export const newNode = (
  title: string,
  position: Position,
  opts: {
    readonly parentId?: NodeId
    readonly parentIds?: readonly NodeId[]
    readonly anchorText?: string
  } = {},
): ChatNode => {
  const now = nowIso()
  const id = asNodeId(`node_${Date.now().toString(36)}_${(seq++).toString(36)}`)
  const node: WritableNode = {
    id,
    title,
    children: [],
    messages: [],
    status: "active",
    position,
    createdAt: now,
    updatedAt: now,
  }
  if (opts.parentId !== undefined) node.parentId = opts.parentId
  if (opts.parentIds !== undefined) node.parentIds = opts.parentIds
  if (opts.anchorText !== undefined) node.anchorText = opts.anchorText
  return node
}

export const createMap = (title: string): ChatMap => {
  const root = newNode(title || "根问题", { x: 0, y: 0 })
  const map: WritableMap = {
    id: asMapId(`map_${Date.now().toString(36)}_${(seq++).toString(36)}`),
    title,
    rootNodeId: root.id,
    nodes: { [root.id]: root },
    edges: [],
    updatedAt: nowIso(),
  }
  return map
}

/** User's mod §二: an independent root node placed below the current forest. */
export const createRootNode = (
  map: ChatMap,
  title = "独立根问题",
): { readonly map: ChatMap; readonly node: ChatNode } => {
  const values = Object.values(map.nodes)
  const maxY = values.reduce((m, n) => Math.max(m, n.position.y), Number.NEGATIVE_INFINITY)
  const minX = values.reduce((m, n) => Math.min(m, n.position.x), Number.POSITIVE_INFINITY)
  const node = newNode(title, {
    x: Number.isFinite(minX) ? minX : 0,
    y: (Number.isFinite(maxY) ? maxY : 0) + 260,
  })
  return {
    map: {
      ...map,
      nodes: { ...map.nodes, [node.id]: node },
      updatedAt: nowIso(),
    },
    node,
  }
}

/** User's mod §三.2: direction-aware spawn coordinates (zC algorithm). */
export const spawnPosition = (
  parent: ChatNode,
  siblingCount: number,
  direction: Direction,
): Position => {
  const k = siblingCount
  switch (direction) {
    case "right":
      return {
        x: parent.position.x + 360,
        y: parent.position.y + k * 180 - Math.max(0, k - 1) * 70,
      }
    case "left":
      return {
        x: parent.position.x - 360,
        y: parent.position.y + k * 180 - Math.max(0, k - 1) * 70,
      }
    case "top":
      return {
        x: parent.position.x + k * 240 - Math.max(0, k - 1) * 80,
        y: parent.position.y - 240,
      }
    case "bottom":
      return {
        x: parent.position.x + k * 240 - Math.max(0, k - 1) * 80,
        y: parent.position.y + 240,
      }
    default:
      return assertNever(direction)
  }
}

export const createChildNode = (
  map: ChatMap,
  opts: {
    readonly parentId: NodeId
    readonly direction: Direction
    readonly anchorText?: string
    readonly title?: string
  },
): { readonly map: ChatMap; readonly node: ChatNode } | null => {
  const parent = map.nodes[opts.parentId]
  if (parent === undefined) return null
  const siblings = parent.children.filter((c) => map.nodes[c] !== undefined)
  const anchor =
    opts.anchorText !== undefined && opts.anchorText.trim() !== "" ? opts.anchorText : undefined
  const node = newNode(
    opts.title ?? (anchor !== undefined ? anchor.trim().slice(0, 24) : "新分支"),
    spawnPosition(parent, siblings.length, opts.direction),
    anchor !== undefined ? { parentId: parent.id, anchorText: anchor } : { parentId: parent.id },
  )
  const nextParent: WritableNode = {
    ...parent,
    children: [...parent.children, node.id],
    updatedAt: nowIso(),
  }
  const edge = {
    id: edgeId(parent.id, node.id),
    from: parent.id,
    to: node.id,
  }
  return {
    map: {
      ...map,
      nodes: { ...map.nodes, [node.id]: node, [parent.id]: nextParent },
      edges: [...map.edges, edge],
      updatedAt: nowIso(),
    },
    node,
  }
}

/** User's mod §四: convergent (multi-parent) node over two or more branches. */
export const createConvergentNode = (
  map: ChatMap,
  parents: readonly NodeId[],
  title = "汇聚节点",
): { readonly map: ChatMap; readonly node: ChatNode } | null => {
  const unique = [...new Set(parents)].filter((p) => map.nodes[p] !== undefined)
  if (unique.length < 2) return null
  const first = unique[0]
  if (first === undefined) return null
  const xs = unique.map((p) => map.nodes[p]?.position ?? { x: 0, y: 0 })
  const position = {
    x: Math.max(...xs.map((p) => p.x)) + 360,
    y: xs.reduce((s, p) => s + p.y, 0) / xs.length,
  }
  const node = newNode(title, position, {
    parentId: first,
    parentIds: unique,
  })
  const nodes = { ...map.nodes, [node.id]: node }
  const edges = [...map.edges]
  for (const p of unique) {
    const parent = nodes[p]
    if (parent === undefined) continue
    nodes[p] = {
      ...parent,
      children: [...parent.children, node.id],
      updatedAt: nowIso(),
    }
    edges.push({ id: edgeId(p, node.id), from: p, to: node.id })
  }
  return { map: { ...map, nodes, edges, updatedAt: nowIso() }, node }
}

/**
 * Reference-count delete (user's mod §四.5): a node cascades only when ALL its parents are
 * deleted; otherwise it is unbound from the deleted side and parentId migrates to a survivor.
 * Returns null when the delete would remove the last root (blocked).
 */
export const deleteNode = (map: ChatMap, targetId: NodeId): ChatMap | null => {
  const target = map.nodes[targetId]
  if (target === undefined) return map
  const rootsBefore = Object.values(map.nodes).filter(
    (n) => getNodeParentIds(map, n.id).length === 0,
  )
  if (rootsBefore.length === 1 && rootsBefore[0]?.id === targetId) {
    return null
  }

  const doomed = new Set<string>([targetId])
  const queue: NodeId[] = [targetId]
  while (queue.length > 0) {
    const cur = queue.shift()
    const node = cur === undefined ? undefined : map.nodes[cur]
    if (node === undefined) continue
    for (const c of node.children) {
      if (doomed.has(c)) continue
      const parents = getNodeParentIds(map, c)
      if (parents.every((p) => doomed.has(p))) {
        doomed.add(c)
        queue.push(c)
      }
    }
  }

  const nodes: Record<string, WritableNode> = {}
  for (const [id, node] of Object.entries(map.nodes)) {
    if (doomed.has(id)) continue
    const next: WritableNode = {
      ...node,
      children: node.children.filter((c) => !doomed.has(c)),
    }
    const parents = getNodeParentIds(map, node.id).filter((p) => !doomed.has(p))
    if (node.parentIds !== undefined) next.parentIds = parents
    if (node.parentId !== undefined && doomed.has(node.parentId)) {
      const survivor = parents[0]
      if (survivor !== undefined) next.parentId = survivor
      else delete next.parentId
    }
    nodes[id] = next
  }

  const edges = map.edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to))
  let rootNodeId = map.rootNodeId
  if (rootNodeId !== undefined && doomed.has(rootNodeId)) {
    const nextRoot = Object.values(nodes).find(
      (n) => getNodeParentIds({ ...map, nodes }, n.id).length === 0,
    )
    rootNodeId = nextRoot?.id
  }
  const nextMap: WritableMap = { ...map, nodes, edges, updatedAt: nowIso() }
  if (rootNodeId === undefined) delete nextMap.rootNodeId
  else nextMap.rootNodeId = rootNodeId
  return nextMap
}
