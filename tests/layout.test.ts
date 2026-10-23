import { describe, expect, test } from "bun:test"
import { createChildNode, createMap, createRootNode } from "../src/domain/graphOps"
import type { NodeId } from "../src/domain/ids"
import { layoutPositions } from "../src/domain/layout"
import type { ChatMap } from "../src/domain/types"

const rootIdOf = (map: ChatMap): NodeId =>
  map.rootNodeId ?? (Object.values(map.nodes)[0]?.id as NodeId)

describe("bidirectional layout", () => {
  test("places right children to the right and left children to the left of the root", () => {
    // Given a root with one right and one left child
    const map = createMap("t")
    const root = rootIdOf(map)
    const r = createChildNode(map, { parentId: root, direction: "right" })
    const l = createChildNode(r?.map as ChatMap, {
      parentId: root,
      direction: "left",
    })
    // When auto layout runs
    const pos = layoutPositions(l?.map as ChatMap)
    // Then the root sits between its two children on the x axis
    expect(pos[l?.node.id ?? ""]?.x ?? Number.NaN).toBeLessThan(pos[root]?.x ?? Number.NaN)
    expect(pos[r?.node.id ?? ""]?.x ?? Number.NaN).toBeGreaterThan(pos[root]?.x ?? Number.NaN)
  })
})

describe("component stacking", () => {
  test("stacks two independent roots vertically without overlap", () => {
    // Given a map with two parentless roots
    const base = createMap("t")
    const root = rootIdOf(base)
    const two = createRootNode(base)
    // When auto layout runs
    const pos = layoutPositions(two.map)
    // Then the two components occupy disjoint y bands with a gap
    const gap = Math.abs((pos[two.node.id]?.y ?? 0) - (pos[root]?.y ?? 0))
    expect(gap).toBeGreaterThanOrEqual(110 + 160)
  })
})

describe("node separation", () => {
  test("keeps every pair of nodes visually separated inside a component", () => {
    // Given a root with three right children and a grandchild
    const map = createMap("t")
    const root = rootIdOf(map)
    let cur = map
    const ids: NodeId[] = []
    for (let i = 0; i < 3; i++) {
      const res = createChildNode(cur, {
        parentId: root,
        direction: "right",
        title: `c${i}`,
      })
      cur = res?.map as ChatMap
      if (res) ids.push(res.node.id)
    }
    const first = ids[0]
    if (first !== undefined) {
      const g = createChildNode(cur, {
        parentId: first,
        direction: "right",
      })
      cur = g?.map as ChatMap
      if (g) ids.push(g.node.id)
    }
    ids.push(root)
    // When auto layout runs
    const pos = layoutPositions(cur)
    // Then no two node bboxes (260x110) overlap
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i] as string]
        const b = pos[ids[j] as string]
        if (a === undefined || b === undefined) continue
        const dx = Math.abs(a.x - b.x)
        const dy = Math.abs(a.y - b.y)
        expect(dx >= 260 || dy >= 110).toBe(true)
      }
    }
  })
})
