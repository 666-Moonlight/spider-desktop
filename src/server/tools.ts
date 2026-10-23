import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { NodeId } from "../domain/ids"
import type { ChatMap } from "../domain/types"
import { MAPS_DIR } from "./store"

export interface ToolSpec {
  readonly type: "function"
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export interface ToolCallRequest {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

export interface ToolResult {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly ok: boolean
}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

const loadAllMaps = (): readonly ChatMap[] => {
  if (!existsSync(MAPS_DIR)) return []
  const out: ChatMap[] = []
  for (const f of readdirSync(MAPS_DIR)) {
    if (!f.endsWith(".json")) continue
    try {
      out.push(JSON.parse(readFileSync(join(MAPS_DIR, f), "utf8")) as ChatMap)
    } catch {
      // unreadable map files are skipped so one bad file cannot break the tool
    }
  }
  return out
}

export const BUILTIN_TOOLS: readonly ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "在当前图谱中按关键词检索节点（标题、摘要、随记、对话），返回匹配节点与片段。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索关键词" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_node",
      description: "读取某个节点的完整信息（标题、摘要、随记、最近对话）。",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string", description: "节点 id" },
        },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_maps",
      description: "列出本机所有图谱（标题、节点数），用于跨图查找。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "append_note",
      description: "向当前节点追加一条随记（会持久化到图谱数据）。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要追加的随记内容" },
        },
        required: ["text"],
      },
    },
  },
]

export interface ToolContext {
  readonly map: ChatMap
  readonly nodeId: string
  readonly appendNote: (text: string) => void
}

const snippet = (s: string, n = 160): string => s.replace(/\s+/g, " ").trim().slice(0, n)

export const runBuiltinTool = (call: ToolCallRequest, ctx: ToolContext): ToolResult => {
  const args = (() => {
    try {
      return JSON.parse(call.arguments === "" ? "{}" : call.arguments) as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  const fail = (msg: string): ToolResult => ({
    id: call.id,
    name: call.name,
    content: msg,
    ok: false,
  })
  switch (call.name) {
    case "search_notes": {
      const query = text(args["query"]).trim().toLowerCase()
      if (query === "") return fail("query 不能为空")
      const hits = Object.values(ctx.map.nodes)
        .map((n) => {
          const haystack = [
            n.title,
            n.summary ?? "",
            n.note ?? "",
            ...n.messages.map((m) => m.content),
          ]
            .join(" ")
            .toLowerCase()
          const idx = haystack.indexOf(query)
          if (idx < 0) return null
          return {
            id: n.id,
            title: n.title,
            snippet: snippet(haystack.slice(Math.max(0, idx - 40), idx + 120)),
          }
        })
        .filter((x): x is { id: NodeId; title: string; snippet: string } => x !== null)
        .slice(0, 6)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: hits.length === 0 ? "未找到匹配节点" : JSON.stringify(hits, null, 2),
      }
    }
    case "get_node": {
      const id = text(args["nodeId"])
      const node = ctx.map.nodes[id]
      if (node === undefined) return fail(`节点不存在: ${id}`)
      const recent = node.messages.slice(-6).map((m) => `${m.role}: ${snippet(m.content, 300)}`)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: JSON.stringify(
          {
            id: node.id,
            title: node.title,
            summary: node.summary ?? "",
            note: node.note ?? "",
            recent,
          },
          null,
          2,
        ),
      }
    }
    case "list_maps": {
      const maps = loadAllMaps().map((m) => ({
        id: String(m.id),
        title: m.title,
        nodes: Object.keys(m.nodes).length,
      }))
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: JSON.stringify(maps, null, 2),
      }
    }
    case "append_note": {
      const note = text(args["text"]).trim()
      if (note === "") return fail("text 不能为空")
      ctx.appendNote(note)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: "已写入随记",
      }
    }
    default:
      return fail(`未知工具: ${call.name}`)
  }
}

export const builtinToolNames = (): readonly string[] => BUILTIN_TOOLS.map((t) => t.function.name)
