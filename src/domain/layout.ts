import dagre from "@dagrejs/dagre"
import { getNodeParentIds } from "./graphTraverse"
import type { NodeId } from "./ids"
import type { ChatMap, Position } from "./types"

const NODE_W = 260
const NODE_H = 110
const RANKSEP = 120
const NODESEP = 56
const COMPONENT_GAP = 160

type Side = "LR" | "RL"

const collectSide = (
  map: ChatMap,
  rootId: NodeId,
  seeds: readonly NodeId[],
  assigned: ReadonlySet<string>,
): Set<string> => {
  const ids = new Set<string>([rootId])
  const queue: NodeId[] = [...seeds]
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === undefined || ids.has(cur)) continue
    const node = map.nodes[cur]
    if (node === undefined) continue
    if (assigned.has(cur) && cur !== rootId) continue
    ids.add(cur)
    for (const c of node.children) if (!ids.has(c)) queue.push(c)
  }
  return ids
}

const layoutSide = (
  map: ChatMap,
  ids: ReadonlySet<string>,
  dir: Side,
  rootId: NodeId,
): Map<string, Position> => {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: dir,
    nodesep: NODESEP,
    ranksep: RANKSEP,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))
  for (const id of ids) g.setNode(id, { width: NODE_W, height: NODE_H })
  for (const id of ids) {
    const node = map.nodes[id]
    if (node === undefined) continue
    for (const c of node.children) if (ids.has(c)) g.setEdge(id, c)
  }
  dagre.layout(g)
  const rootPos = g.node(rootId)
  const out = new Map<string, Position>()
  for (const id of ids) {
    if (id === rootId) continue
    const p = g.node(id)
    out.set(id, { x: p.x - rootPos.x, y: p.y - rootPos.y })
  }
  return out
}

/** One connected component, root pinned at (0,0): right children LR, left children RL (user's mod §三.3). */
const layoutComponent = (
  map: ChatMap,
  rootId: NodeId,
  assigned: ReadonlySet<string>,
): Map<string, Position> => {
  const root = map.nodes[rootId]
  if (root === undefined) return new Map()
  const children = root.children.filter((c) => map.nodes[c] !== undefined)
  const left = children.filter((c) => (map.nodes[c]?.position.x ?? 0) < root.position.x)
  const right = children.filter((c) => (map.nodes[c]?.position.x ?? 0) >= root.position.x)
  const positions = new Map<string, Position>([[rootId, { x: 0, y: 0 }]])
  const sides: Array<{ readonly ids: ReadonlySet<string>; readonly dir: Side }> = []
  if (right.length > 0) {
    sides.push({
      ids: collectSide(map, rootId, right, assigned),
      dir: "LR",
    })
  }
  if (left.length > 0) {
    sides.push({
      ids: collectSide(map, rootId, left, assigned),
      dir: "RL",
    })
  }
  for (const side of sides) {
    for (const [id, p] of layoutSide(map, side.ids, side.dir, rootId)) {
      if (!positions.has(id)) positions.set(id, p)
    }
  }
  return positions
}

/** Undirected components (children + parents), so convergent merges stay inside one component. */
const componentsOf = (map: ChatMap): NodeId[][] => {
  const visited = new Set<string>()
  const comps: NodeId[][] = []
  for (const start of Object.values(map.nodes)) {
    if (visited.has(start.id)) continue
    const comp: NodeId[] = []
    const queue: NodeId[] = [start.id]
    visited.add(start.id)
    while (queue.length > 0) {
      const cur = queue.shift()
      if (cur === undefined) continue
      const node = map.nodes[cur]
      if (node === undefined) continue
      comp.push(cur)
      const neighbors: NodeId[] = [...node.children, ...getNodeParentIds(map, cur)]
      for (const n of neighbors) {
        if (!visited.has(n) && map.nodes[n] !== undefined) {
          visited.add(n)
          queue.push(n)
        }
      }
    }
    comps.push(comp)
  }
  return comps
}

/** Full-canvas auto layout: bidirectional per root, components stacked vertically. */
export const layoutPositions = (map: ChatMap): Readonly<Record<string, Position>> => {
  const out: Record<string, Position> = {}
  const assignedGlobal = new Set<string>()
  const comps = componentsOf(map).sort((a, b) => {
    const minA = Math.min(...a.map((id) => map.nodes[id]?.position.y ?? 0))
    const minB = Math.min(...b.map((id) => map.nodes[id]?.position.y ?? 0))
    return minA - minB
  })
  let cursorY = 0
  for (const comp of comps) {
    const root = comp.find((id) => getNodeParentIds(map, id).length === 0) ?? comp[0]
    if (root === undefined) continue
    const local = layoutComponent(map, root, assignedGlobal)
    if (local.size === 0) continue
    const xs = [...local.values()].map((p) => p.x)
    const ys = [...local.values()].map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    for (const [id, p] of local) {
      out[id] = { x: p.x - minX, y: p.y - minY + cursorY }
      assignedGlobal.add(id)
    }
    cursorY += Math.max(...ys) - minY + (Math.max(...xs) - minX) * 0 + NODE_H + COMPONENT_GAP
  }
  return out
}
