import { describe, expect, test } from "bun:test"
import { buildExportFiles } from "../src/domain/exporter"
import { createChildNode, createMap } from "../src/domain/graphOps"
import type { NodeId } from "../src/domain/ids"
import type { ChatMap } from "../src/domain/types"

const rootIdOf = (map: ChatMap): NodeId =>
  map.rootNodeId ?? (Object.values(map.nodes)[0]?.id as NodeId)

const builtMap = (): ChatMap => {
  const base = createMap("导出测试图")
  const root = rootIdOf(base)
  const child = createChildNode(base, {
    parentId: root,
    direction: "right",
    title: "子节点一",
  })
  return child?.map as ChatMap
}

describe("buildExportFiles", () => {
  test("emits the full bundle with parseable canvas and svg", () => {
    // Given a two-node map
    const map = builtMap()
    // When exported
    const files = buildExportFiles(map)
    // Then the bundle contains index/brief/notes/node files/canvas/svg/json
    const paths = files.map((f) => f.path)
    for (const expected of [
      "index.md",
      "brief.md",
      "notes.md",
      "map.canvas",
      "map.svg",
      "map.json",
    ]) {
      expect(paths).toContain(expected)
    }
    expect(paths.filter((p) => p.startsWith("nodes/")).length).toBe(2)
    const canvas = JSON.parse(files.find((f) => f.path === "map.canvas")?.content ?? "{}") as {
      nodes: unknown[]
      edges: unknown[]
    }
    expect(canvas.nodes.length).toBe(2)
    expect(canvas.edges.length).toBe(1)
    const svg = files.find((f) => f.path === "map.svg")?.content ?? ""
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("导出测试图")
    expect(svg).toContain("子节点一")
  })

  test("node notes reference their parents and children bidirectionally", () => {
    // Given the two-node map
    const map = builtMap()
    // When exported
    const files = buildExportFiles(map)
    // Then the child note links to the parent and vice versa
    const childNote =
      files.find((f) => f.path.startsWith("nodes/") && f.path.includes("子节点一"))?.content ?? ""
    const rootNote =
      files.find((f) => f.path.startsWith("nodes/") && !f.path.includes("子节点一"))?.content ?? ""
    expect(childNote).toContain("上级：")
    expect(childNote).toContain("[[")
    expect(rootNote).toContain("子节点：")
  })
})
