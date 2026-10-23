import { describe, expect, test } from "bun:test"
import { cosine, rankByScore } from "../src/domain/similarity"
import type { ChatMap, ChatNode } from "../src/domain/types"

const mkNode = (id: string, title: string): ChatNode => ({
  id: id as ChatNode["id"],
  title,
  children: [],
  messages: [],
  status: "active",
  position: { x: 0, y: 0 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
})

describe("cosine similarity", () => {
  test("returns 1 for identical unit vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5)
  })

  test("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  test("handles zero vector gracefully without NaN", () => {
    expect(cosine([0, 0], [1, 2])).toBe(0)
    expect(cosine([], [])).toBe(0)
  })

  test("rejects mismatched dimensions with 0", () => {
    expect(cosine([1, 2], [1, 2, 3])).toBe(0)
  })
})

describe("rankByScore", () => {
  test("excludes the target node and sorts descending", () => {
    const map: ChatMap = {
      id: "map1" as ChatMap["id"],
      title: "图",
      nodes: {
        t: mkNode("t", "目标"),
        a: mkNode("a", "高分"),
        b: mkNode("b", "低分"),
        c: mkNode("c", "零分"),
      },
      edges: [],
      updatedAt: "2026-01-01T00:00:00Z",
    }
    const scores: Record<string, number> = { a: 0.9, b: 0.4, c: 0, t: 1.0 }
    const ranked = rankByScore([map], "map1", "t", (n) => scores[n.id] ?? 0, 2)
    expect(ranked.map((r) => r.nodeId)).toEqual(["a", "b"])
    expect(ranked[0]?.score).toBe(0.9)
  })

  test("returns empty when target node is not found", () => {
    const map: ChatMap = {
      id: "map1" as ChatMap["id"],
      title: "图",
      nodes: {},
      edges: [],
      updatedAt: "2026-01-01T00:00:00Z",
    }
    expect(rankByScore([map], "map1", "missing", () => 1)).toEqual([])
  })
})
