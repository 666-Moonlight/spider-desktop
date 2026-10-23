import type { ChatMap, ChatNode } from "./types"

const xml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] ?? c,
  )

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

const W = 400
const H = 320

export const renderMapSvg = (
  map: ChatMap,
  positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
): string => {
  const nodes = Object.values(map.nodes)
  const pos = (id: string): { x: number; y: number } => positions[id] ?? { x: 0, y: 0 }
  const margin = 80
  const header = 200
  const width = Math.max(1000, ...nodes.map((n) => pos(n.id).x + W)) + margin * 2
  const height = Math.max(H, ...nodes.map((n) => pos(n.id).y + H)) + header + margin
  const palette: Record<string, string> = {
    "6": "#66508f",
    "5": "#377e94",
    "4": "#377b59",
    "3": "#667085",
  }
  const svgParts = nodes.map((n) => {
    const p = pos(n.id)
    const fill = palette[nodeColor(n, map.rootNodeId)] ?? "#377e94"
    const isRoot = n.id === map.rootNodeId
    const status =
      n.status === "understood" ? "已理解" : n.status === "archived" ? "已归档" : "进行中"
    const preview = plain(
      n.messages.find((m) => m.role === "assistant")?.content ?? n.summary ?? "",
    ).slice(0, 80)
    return `<g transform="translate(${p.x + margin} ${
      p.y + header
    })"><rect width="${W}" height="${H}" rx="12" fill="${
      isRoot ? "#66508f" : "#ffffff"
    }" stroke="${fill}" stroke-width="1.5"/><circle cx="28" cy="34" r="5" fill="${fill}"/><text x="44" y="40" font-size="17" fill="#536174">${xml(
      status,
    )}</text><text x="24" y="86" font-size="26" font-weight="650" fill="#25324a">${xml(
      n.title.slice(0, 24),
    )}</text><text x="24" y="150" font-size="19" fill="#536174">${xml(
      preview,
    )}</text><text x="24" y="300" font-size="17" fill="${fill}">${xml(
      `${slug(n.title, n.id)}.md`,
    )}</text></g>`
  })
  const edgeParts = map.edges.flatMap((e) => {
    const a = pos(e.from)
    const b = pos(e.to)
    const x1 = a.x + margin + W
    const y1 = a.y + header + H / 2
    const x2 = b.x + margin
    const y2 = b.y + header + H / 2
    const mid = (x1 + x2) / 2
    return [
      `<path d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${
        x2 - 10
      } ${y2}" stroke="#377e94" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>`,
    ]
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${xml(
    map.title,
  )}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#377e94" stroke-width="1.5"/></marker></defs><rect width="${width}" height="${height}" fill="#f6f8fb"/><text x="${margin}" y="80" font-size="40" font-weight="650" fill="#25324a">${xml(
    map.title,
  )}</text><text x="${margin}" y="130" font-size="20" fill="#536174">${xml(
    `${nodes.length} 节点 · ${map.edges.length} 连线 · spider 导出`,
  )}</text>${edgeParts.join("")}${svgParts.join("")}</svg>\n`
}
