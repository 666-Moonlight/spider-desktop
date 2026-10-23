import type { NodeId } from "./ids"
import type { ChatMap, ChatNode } from "./types"

/** All parents of a node: parentIds + in-edges + parentId, deduped, existing only. */
export const getNodeParentIds = (map: ChatMap, id: NodeId): readonly NodeId[] => {
  const node = map.nodes[id]
  if (node === undefined) return []
  const out: NodeId[] = []
  const seen = new Set<string>()
  const push = (p: NodeId): void => {
    if (map.nodes[p] !== undefined && !seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  if (node.parentId !== undefined) push(node.parentId)
  for (const p of node.parentIds ?? []) push(p)
  for (const e of map.edges) if (e.to === id) push(e.from)
  return out
}

/** True when `maybeAncestorId` reaches `descendantId` by walking children (cycle guard for add-parent). */
export const reaches = (map: ChatMap, maybeAncestorId: NodeId, descendantId: NodeId): boolean => {
  const queue: NodeId[] = [maybeAncestorId]
  const seen = new Set<string>([maybeAncestorId])
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === undefined || cur === descendantId) {
      return cur === descendantId
    }
    const node: ChatNode | undefined = map.nodes[cur]
    if (node === undefined) continue
    for (const c of node.children) {
      if (!seen.has(c)) {
        seen.add(c)
        queue.push(c)
      }
    }
  }
  return false
}

export const canAddParent = (map: ChatMap, parentId: NodeId, childId: NodeId): boolean => {
  if (parentId === childId) return false
  if (map.nodes[parentId] === undefined || map.nodes[childId] === undefined) {
    return false
  }
  if (getNodeParentIds(map, childId).includes(parentId)) return false
  return !reaches(map, childId, parentId)
}

/** User's fR fix: visible = BFS from rootNodeId plus every parentless node, cycle-safe. */
export const visibleNodeIds = (
  map: ChatMap,
  collapsed?: ReadonlySet<string>,
): ReadonlySet<string> => {
  const visible = new Set<string>()
  const visit = (start: NodeId): void => {
    const queue: NodeId[] = [start]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (cur === undefined || visible.has(cur)) continue
      const node = map.nodes[cur]
      if (node === undefined) continue
      visible.add(cur)
      if (collapsed?.has(cur)) continue
      for (const c of node.children) queue.push(c)
    }
  }
  if (map.rootNodeId !== undefined && map.nodes[map.rootNodeId] !== undefined) visit(map.rootNodeId)
  for (const node of Object.values(map.nodes)) {
    if (getNodeParentIds(map, node.id).length === 0) visit(node.id)
  }
  return visible
}

/** Primary ancestor chain (parentId, falling back to parentIds[0]) root-first, cycle-safe. */
export const ancestorIds = (map: ChatMap, id: NodeId): readonly NodeId[] => {
  const chain: NodeId[] = []
  const seen = new Set<string>([id])
  let cur: NodeId | undefined = id
  while (cur !== undefined) {
    const node: ChatNode | undefined = map.nodes[cur]
    if (node === undefined) break
    const parent: NodeId | undefined = node.parentId ?? node.parentIds?.[0]
    if (parent === undefined || seen.has(parent)) break
    seen.add(parent)
    chain.push(parent)
    cur = parent
  }
  return chain.reverse()
}
