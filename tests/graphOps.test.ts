import { describe, expect, test } from "bun:test"
import {
  createChildNode,
  createConvergentNode,
  createMap,
  createRootNode,
  deleteNode,
} from "../src/domain/graphOps"
import {
  ancestorIds,
  canAddParent,
  getNodeParentIds,
  visibleNodeIds,
} from "../src/domain/graphTraverse"
import type { NodeId } from "../src/domain/ids"
import type { ChatMap } from "../src/domain/types"

const rootIdOf = (map: ChatMap): NodeId =>
  map.rootNodeId ?? (Object.values(map.nodes)[0]?.id as NodeId)

describe("createChildNode", () => {
  test("wires parent, edge, and direction-aware position when creating a right child", () => {
    // Given a fresh map with one root
    const map = createMap("t")
    const root = rootIdOf(map)
    // When a right child is created
    const res = createChildNode(map, {
      parentId: root,
      direction: "right",
    })
    // Then parent/edge wiring and position respect the direction
    expect(res).not.toBeNull()
    const node = res?.node
    expect(node?.parentId).toBe(root)
    expect(map.nodes[root]?.children.length ?? 0).toBe(0)
    expect(res?.map.nodes[root]?.children).toContain(node?.id)
    expect(res?.map.edges.some((e) => e.from === root && e.to === node?.id)).toBe(true)
    expect((node?.position.x ?? 0) > (map.nodes[root]?.position.x ?? 0)).toBe(true)
  })

  test("stacks same-direction siblings vertically per the zC formula", () => {
    // Given a root
    const map = createMap("t")
    const root = rootIdOf(map)
    // When two right children are created
    const a = createChildNode(map, { parentId: root, direction: "right" })
    const b = createChildNode(a?.map ?? map, {
      parentId: root,
      direction: "right",
    })
    // Then the second child is offset downward by one slot
    const ay = a?.node.position.y ?? 0
    const by = b?.node.position.y ?? 0
    expect(by - ay).toBe(180)
  })
})

describe("convergent nodes", () => {
  const buildConvergent = (): {
    readonly map: ChatMap
    readonly a: NodeId
    readonly b: NodeId
    readonly m: NodeId
  } => {
    const map = createMap("t")
    const root = rootIdOf(map)
    const a = createChildNode(map, { parentId: root, direction: "right" })
    const b = createChildNode(a?.map ?? map, {
      parentId: root,
      direction: "bottom",
    })
    const m = createConvergentNode(b?.map ?? map, [a?.node.id as NodeId, b?.node.id as NodeId])
    return {
      map: m?.map as ChatMap,
      a: a?.node.id as NodeId,
      b: b?.node.id as NodeId,
      m: m?.node.id as NodeId,
    }
  }

  test("registers both parents and both edges", () => {
    // Given a convergent node over two branches
    const { map, a, b, m } = buildConvergent()
    // Then both parents list it as a child and both edges exist
    expect(getNodeParentIds(map, m)).toEqual([a, b])
    expect(map.edges.filter((e) => e.to === m).length).toBe(2)
  })

  test("keeps the convergent node alive when only one parent is deleted", () => {
    // Given a convergent node m over a and b, with a child d under m
    const { map, a, b, m } = buildConvergent()
    const withD = createChildNode(map, { parentId: m, direction: "right" })
    const d = withD?.node.id as NodeId
    // When parent a alone is deleted
    const next = deleteNode(withD?.map ?? map, a)
    // Then m survives, rebinds to b, and d survives with it
    expect(next?.nodes[m]).toBeDefined()
    expect(next?.nodes[d]).toBeDefined()
    expect(next?.nodes[a]).toBeUndefined()
    expect(getNodeParentIds(next as ChatMap, m)).toEqual([b])
    expect(next?.nodes[m]?.parentId ?? b).toBe(b)
  })
})

describe("cycle guard", () => {
  test("rejects making an ancestor a child-side parent and allows a legal convergent parent", () => {
    // Given root -> a -> b
    const map = createMap("t")
    const root = rootIdOf(map)
    const a = createChildNode(map, { parentId: root, direction: "right" })
    const b = createChildNode(a?.map ?? map, {
      parentId: a?.node.id as NodeId,
      direction: "right",
    })
    const m = b?.map as ChatMap
    const bid = b?.node.id as NodeId
    // When b is proposed as a parent of its own ancestor root, and root as a parent of b
    // Then the cycle is rejected and the legal convergent link is allowed
    expect(canAddParent(m, bid, root)).toBe(false)
    expect(canAddParent(m, root, bid)).toBe(true)
  })
})

describe("root protection and handover", () => {
  test("blocks deleting the only root", () => {
    // Given a map with a single root
    const map = createMap("t")
    // When that root is deleted
    // Then the delete is refused
    expect(deleteNode(map, rootIdOf(map))).toBeNull()
  })

  test("hands rootNodeId to another root after multi-root delete", () => {
    // Given two independent roots, the second created via createRootNode
    const base = createMap("t")
    const root = rootIdOf(base)
    const two = createRootNode(base)
    // When the original root is deleted
    const next = deleteNode(two.map, root)
    // Then rootNodeId moves to the surviving root
    expect(next?.rootNodeId).toBe(two.node.id)
  })
})

describe("visibility", () => {
  test("includes an independent root subtree in visible nodes (fR regression)", () => {
    // Given a map with a second, parentless root and a child under it
    const base = createMap("t")
    const two = createRootNode(base)
    const withChild = createChildNode(two.map, {
      parentId: two.node.id,
      direction: "right",
    })
    // When visibility is computed
    const visible = visibleNodeIds(withChild?.map as ChatMap)
    // Then the second root and its subtree are both visible
    expect(visible.has(two.node.id)).toBe(true)
    expect(visible.has(withChild?.node.id ?? "")).toBe(true)
  })
})

describe("ancestorIds", () => {
  test("walks the primary parent chain root-first", () => {
    // Given root -> child -> grandchild
    const map = createMap("t")
    const root = rootIdOf(map)
    const child = createChildNode(map, {
      parentId: root,
      direction: "right",
    })
    const grand = createChildNode(child?.map as ChatMap, {
      parentId: child?.node.id as NodeId,
      direction: "right",
    })
    // When the ancestor chain of the grandchild is requested
    // Then it is [root, child]
    expect(ancestorIds(grand?.map as ChatMap, grand?.node.id as NodeId)).toEqual([
      root,
      child?.node.id as NodeId,
    ])
  })
})
