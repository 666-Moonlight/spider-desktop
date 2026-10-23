import { renderMapSvg } from "./exportSvg"
import { layoutPositions } from "./layout"
import type { ChatMap, ChatNode } from "./types"

export interface ExportFile {
  readonly path: string
  readonly content: string
}

const plain = (text: string): string => text.replace(/\s+/g, " ").trim()

const slug = (title: string, id: string): string => {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "")
  return `${safe === "" ? "node" : safe.slice(0, 40)}-${id.slice(-6)}`
}

const nodeColor = (node: ChatNode, rootId: string | undefined): "6" | "5" | "4" | "3" =>
  node.id === rootId
    ? "6"
    : node.status === "understood"
      ? "4"
      : node.status === "archived"
        ? "3"
        : "5"

const canvasSide = (dx: number, dy: number, from: boolean): "top" | "right" | "bottom" | "left" => {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return from ? (dx >= 0 ? "right" : "left") : dx >= 0 ? "left" : "right"
  }
  return from ? (dy >= 0 ? "bottom" : "top") : dy >= 0 ? "top" : "bottom"
}

const conversation = (node: ChatNode): string =>
  node.messages.length === 0
    ? "_（暂无对话）_"
    : node.messages
        .map((m) => `${m.role === "user" ? "**问**" : "**答**"}\n\n${m.content}`)
        .join("\n\n---\n\n")

/** Build the full export bundle: index/brief/notes/nodes/*.md + map.canvas + map.svg + map.json. */
export const buildExportFiles = (map: ChatMap): readonly ExportFile[] => {
  const nodes = Object.values(map.nodes)
  const positions = layoutPositions(map)
  const pos = (id: string): { x: number; y: number } => positions[id] ?? { x: 0, y: 0 }

  const nodeFiles: ExportFile[] = nodes.map((n) => {
    const parents = n.parentIds ?? (n.parentId !== undefined ? [n.parentId] : [])
    const parentLinks = parents
      .map((p) => map.nodes[p])
      .filter((x): x is ChatNode => x !== undefined)
    const children = n.children
      .map((c) => map.nodes[c])
      .filter((x): x is ChatNode => x !== undefined)
    const lines = [
      `# ${n.title}`,
      "",
      `- 状态：${
        n.status === "understood" ? "已理解" : n.status === "archived" ? "已归档" : "进行中"
      }`,
      parentLinks.length > 0
        ? `- 上级：${parentLinks.map((p) => `[[${slug(p.title, p.id)}|${p.title}]]`).join("、")}`
        : "- 上级：无（根节点）",
      children.length > 0
        ? `- 子节点：${children.map((c) => `[[${slug(c.title, c.id)}|${c.title}]]`).join("、")}`
        : "",
      n.anchorText !== undefined && n.anchorText !== "" ? `- 原文锚点：「${n.anchorText}」` : "",
      n.summary !== undefined && n.summary !== "" ? `- 摘要：${n.summary}` : "",
      "",
      "## 随记",
      "",
      n.note !== undefined && n.note !== "" ? n.note : "_（空）_",
      "",
      "## 对话记录",
      "",
      conversation(n),
      "",
    ]
    return {
      path: `nodes/${slug(n.title, n.id)}.md`,
      content: lines.filter((l) => l !== "").join("\n"),
    }
  })

  const summarized = nodes.filter((n) => n.summary !== undefined && n.summary !== "")
  const leaves = nodes.filter((n) => n.children.length === 0 && n.status === "active")
  const brief = [
    `# ${map.title} · 研究简报`,
    "",
    `生成时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    "",
    "## 关键结论",
    "",
    ...(summarized.length > 0
      ? summarized.map((n) => `- **${n.title}**：${n.summary}`)
      : ["_（还没有节点总结；在应用里对节点点「总结」生成）_"]),
    "",
    "## 待研究",
    "",
    ...(leaves.length > 0
      ? leaves.map((n) => `- [[${slug(n.title, n.id)}|${n.title}]]`)
      : ["_（无待研究叶节点）_"]),
    "",
    "## 进度",
    "",
    `- 节点 ${nodes.length} · 连线 ${map.edges.length} · 已理解 ${
      nodes.filter((n) => n.status === "understood").length
    }`,
    "",
  ].join("\n")

  const noted = nodes.filter((n) => n.note !== undefined && n.note !== "")
  const notes = [
    `# ${map.title} · 随记汇总`,
    "",
    ...(noted.length > 0
      ? noted.flatMap((n) => [`## [[${slug(n.title, n.id)}|${n.title}]]`, "", n.note ?? "", ""])
      : ["_（暂无随记；在应用里选中回答文字点「存为随记」）_", ""]),
  ].join("\n")

  const roots = nodes.filter(
    (n) => (n.parentIds?.length ?? (n.parentId !== undefined ? 1 : 0)) === 0,
  )
  const walk = (n: ChatNode, depth: number): string[] => [
    `${"  ".repeat(depth)}- [[${slug(n.title, n.id)}|${n.title}]]${
      n.summary !== undefined && n.summary !== "" ? ` — ${n.summary}` : ""
    }`,
    ...n.children
      .map((c) => map.nodes[c])
      .filter((x): x is ChatNode => x !== undefined)
      .flatMap((c) => walk(c, depth + 1)),
  ]
  const mermaid = [
    "mindmap",
    `  root((${map.title}))`,
    ...nodes.map((n) => `  ${n.title.replace(/[()<>]/g, "")}`),
  ].join("\n")
  const index = [
    `# ${map.title}`,
    "",
    `> spider 导出包 · ${nodes.length} 节点 / ${map.edges.length} 连线`,
    "",
    "## 阅读路线",
    "",
    ...roots.flatMap((root) => walk(root, 0)),
    "",
    "## 结构",
    "",
    "- [[brief|研究简报]] · [[notes|随记汇总]] · [map.canvas](map.canvas) · [map.svg](map.svg)",
    "- Mermaid 预览：",
    "",
    "```mermaid",
    mermaid,
    "```",
    "",
  ].join("\n")

  const W = 400
  const H = 320
  const canvasNodes = nodes.map((n) => {
    const p = pos(n.id)
    const preview =
      n.summary ??
      plain(n.messages.find((m) => m.role === "assistant")?.content ?? "").slice(0, 120)
    return {
      id: n.id,
      type: "text" as const,
      x: Math.round(p.x),
      y: Math.round(p.y),
      width: W,
      height: H,
      color: nodeColor(n, map.rootNodeId),
      text: [n.title, "", preview, "", `[[${slug(n.title, n.id)}|完整笔记]]`]
        .filter(Boolean)
        .join("\n"),
    }
  })
  const canvasEdges = map.edges.map((e) => {
    const a = pos(e.from)
    const b = pos(e.to)
    return {
      id: e.id,
      fromNode: e.from,
      toNode: e.to,
      fromSide: canvasSide(b.x - a.x, b.y - a.y, true),
      toSide: canvasSide(b.x - a.x, b.y - a.y, false),
      toEnd: "arrow" as const,
    }
  })
  const canvas = { nodes: canvasNodes, edges: canvasEdges, version: "1.1" }

  return [
    { path: "index.md", content: index },
    { path: "brief.md", content: brief },
    { path: "notes.md", content: notes },
    ...nodeFiles,
    { path: "map.canvas", content: JSON.stringify(canvas, null, 2) },
    { path: "map.svg", content: renderMapSvg(map, positions) },
    { path: "map.json", content: JSON.stringify(map, null, 2) },
  ]
}
