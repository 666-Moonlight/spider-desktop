import { z } from "zod"
import { asMapId, asNodeId, edgeId, type NodeId } from "./ids"
import { type ChatMap, nowIso, type Role, type WritableNode } from "./types"

const roles = ["user", "assistant", "system"] as const satisfies readonly Role[]

const toolTraceZ = z.object({
  kind: z.enum(["call", "result"]),
  name: z.string(),
  args: z.string().optional(),
  result: z.string().optional(),
  ok: z.boolean().optional(),
})

const messageZ = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string().optional(),
  toolTrace: z.array(toolTraceZ).optional(),
})

const nodeZ = z.object({
  id: z.string(),
  title: z.string().default(""),
  parentId: z.string().optional(),
  parentIds: z.array(z.string()).optional(),
  children: z.array(z.string()).default([]),
  messages: z.array(messageZ).default([]),
  status: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  anchorText: z.string().optional(),
  summary: z.string().optional(),
  note: z.string().optional(),
  references: z
    .array(
      z.object({
        mapId: z.string(),
        nodeId: z.string(),
        title: z.string(),
        excerpt: z.string().default(""),
      }),
    )
    .optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

const mapZ = z.object({
  id: z.string(),
  title: z.string().default("导入图谱"),
  rootNodeId: z.string().optional(),
  nodes: z.record(z.string(), nodeZ),
  edges: z
    .array(
      z.object({
        id: z.string().optional(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .default([]),
  updatedAt: z.string().optional(),
})

/** Parse a `.spider/maps/*.json` payload into the domain ChatMap (boundary parse; throws ZodError). */
export const parseSpiderMap = (raw: unknown): ChatMap => {
  const parsed = mapZ.parse(raw)
  const now = nowIso()
  const nodes: Record<string, WritableNode> = {}
  for (const [id, n] of Object.entries(parsed.nodes)) {
    const parents: NodeId[] = []
    if (n.parentId !== undefined && parsed.nodes[n.parentId] !== undefined) {
      parents.push(asNodeId(n.parentId))
    }
    for (const p of n.parentIds ?? []) {
      if (parsed.nodes[p] !== undefined && !parents.some((x) => x === p)) {
        parents.push(asNodeId(p))
      }
    }
    const node: WritableNode = {
      id: asNodeId(id),
      title: n.title,
      status: n.status === "understood" || n.status === "archived" ? n.status : "active",
      children: [],
      messages: n.messages
        .filter((m) => (roles as readonly string[]).includes(m.role))
        .map((m) => ({
          id: m.id,
          role: m.role as Role,
          content: m.content,
          createdAt: m.createdAt ?? now,
          ...(m.toolTrace !== undefined
            ? {
                toolTrace: m.toolTrace.map((t) => ({
                  kind: t.kind,
                  name: t.name,
                  ...(t.args !== undefined ? { args: t.args } : {}),
                  ...(t.result !== undefined ? { result: t.result } : {}),
                  ...(t.ok !== undefined ? { ok: t.ok } : {}),
                })),
              }
            : {}),
        })),
      position: n.position ?? { x: 0, y: 0 },
      createdAt: n.createdAt ?? now,
      updatedAt: n.updatedAt ?? now,
    }
    const first = parents[0]
    if (first !== undefined) node.parentId = first
    if (parents.length > 1) node.parentIds = parents
    if (n.anchorText !== undefined) node.anchorText = n.anchorText
    if (n.summary !== undefined) node.summary = n.summary
    if (n.note !== undefined) node.note = n.note
    if (n.references !== undefined) {
      node.references = n.references.map((r) => ({
        mapId: r.mapId,
        nodeId: r.nodeId,
        title: r.title,
        excerpt: r.excerpt,
      }))
    }
    nodes[id] = node
  }
  // Children + edges are rebuilt from parent pointers: single source of truth.
  const edges: ChatMap["edges"][number][] = []
  for (const node of Object.values(nodes)) {
    for (const p of node.parentIds ?? (node.parentId !== undefined ? [node.parentId] : [])) {
      const parent = nodes[p]
      if (parent === undefined) continue
      parent.children = [...parent.children, node.id]
      edges.push({ id: edgeId(p, node.id), from: p, to: node.id })
    }
  }
  let rootNodeId: NodeId | undefined =
    parsed.rootNodeId !== undefined && nodes[parsed.rootNodeId] !== undefined
      ? asNodeId(parsed.rootNodeId)
      : undefined
  if (rootNodeId === undefined) {
    rootNodeId = Object.values(nodes).find((n) => n.parentId === undefined)?.id
  }
  const map: ChatMap = {
    id: asMapId(parsed.id),
    title: parsed.title,
    nodes,
    edges,
    updatedAt: parsed.updatedAt ?? now,
    ...(rootNodeId !== undefined ? { rootNodeId } : {}),
  }
  return map
}
