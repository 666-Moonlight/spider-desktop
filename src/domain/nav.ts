import { getNodeParentIds } from "./graphTraverse"
import type { NodeId } from "./ids"
import type { ChatMap } from "./types"

export type NavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"

const MIN_DELTA = 40
const CONE = 1.5

/**
 * User's mod §三.4: cone-of-sight navigation. Pick the nearest node inside the
 * directional cone (scored by distance + lateral offset); fall back to hierarchy moves.
 */
export const coneNavigate = (
  map: ChatMap,
  fromId: NodeId,
  key: NavKey,
  visible: ReadonlySet<string>,
): NodeId | null => {
  const from = map.nodes[fromId]
  if (from === undefined) return null
  let best: NodeId | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const node of Object.values(map.nodes)) {
    if (node.id === fromId || !visible.has(node.id)) continue
    const dx = node.position.x - from.position.x
    const dy = node.position.y - from.position.y
    const horizontal = key === "ArrowLeft" || key === "ArrowRight"
    const lateral = horizontal ? dy : dx
    const inCone =
      (key === "ArrowRight" && dx > MIN_DELTA && Math.abs(dy) <= dx * CONE) ||
      (key === "ArrowLeft" && dx < -MIN_DELTA && Math.abs(dy) <= -dx * CONE) ||
      (key === "ArrowDown" && dy > MIN_DELTA && Math.abs(dx) <= dy * CONE) ||
      (key === "ArrowUp" && dy < -MIN_DELTA && Math.abs(dx) <= -dy * CONE)
    if (!inCone) continue
    const score = Math.hypot(dx, dy) + Math.abs(lateral) * 0.5
    if (score < bestScore) {
      bestScore = score
      best = node.id
    }
  }
  if (best !== null) return best
  const parents = getNodeParentIds(map, fromId)
  const parent = parents[0]
  switch (key) {
    case "ArrowLeft":
      return parent ?? null
    case "ArrowRight":
      return from.children.find((c) => map.nodes[c] !== undefined) ?? null
    case "ArrowUp":
    case "ArrowDown": {
      if (parent === undefined) return null
      const siblings = map.nodes[parent]?.children.filter((c) => map.nodes[c] !== undefined) ?? []
      const idx = siblings.indexOf(fromId)
      return siblings[idx + (key === "ArrowDown" ? 1 : -1)] ?? null
    }
    default:
      return null
  }
}
