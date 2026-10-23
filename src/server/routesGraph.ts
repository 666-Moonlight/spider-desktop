import { Hono } from "hono"
import { z } from "zod"
import { rankCandidates } from "../domain/references"
import { cosine, rankByScore, similarNodes } from "../domain/similarity"
import type { ChatMap, ChatNode } from "../domain/types"
import { embeddings } from "./provider"
import { nodeText, referenceSources } from "./shared"
import { listMaps, loadMap, loadSettings } from "./store"
import { BUILTIN_TOOLS } from "./tools"

const chatReqZ = z.object({ mapId: z.string(), nodeId: z.string() })
const refsReqZ = z.object({
  mapId: z.string(),
  nodeId: z.string(),
  refs: z.array(z.object({ mapId: z.string(), nodeId: z.string() })),
})
const searchReqZ = z.object({
  query: z.string(),
  excludeMapId: z.string().optional(),
  excludeNodeId: z.string().optional(),
})

const safeParse = <S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> | undefined => {
  const result = schema.safeParse(raw)
  return result.success ? result.data : undefined
}

export const graphRoutes = new Hono()

graphRoutes.post("/references", async (c) => {
  const req = safeParse(refsReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid references request" }, 400)
  }
  const map = loadMap(req.mapId)
  if (map === null) return c.json({ error: "map not found" }, 404)
  return c.json({ picks: referenceSources(map, req.refs).picks })
})

graphRoutes.post("/similar", async (c) => {
  const req = safeParse(chatReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid similar request" }, 400)
  }
  const maps: ChatMap[] = []
  for (const meta of listMaps()) {
    const loaded = loadMap(meta.id)
    if (loaded !== null) maps.push(loaded)
  }
  const target = maps.find((m) => m.id === req.mapId)?.nodes[req.nodeId]
  if (target === undefined) return c.json({ nodes: [] })
  const pool: ChatNode[] = []
  for (const m of maps) {
    for (const n of Object.values(m.nodes)) {
      if (n.id !== req.nodeId) pool.push(n)
    }
  }
  const vecs = await embeddings([nodeText(target), ...pool.map(nodeText)])
  if (vecs !== null && vecs.length === pool.length + 1) {
    const targetVec = vecs[0] as number[]
    const scoreMap = new Map<string, number>()
    pool.forEach((n, idx) => {
      scoreMap.set(n.id, cosine(targetVec, vecs[idx + 1] as number[]))
    })
    return c.json({
      nodes: rankByScore(maps, req.mapId, req.nodeId, (node) => scoreMap.get(node.id) ?? 0, 8),
      mode: "vector",
    })
  }
  return c.json({
    nodes: similarNodes(maps, req.mapId, req.nodeId, 8),
    mode: "lexical",
  })
})

graphRoutes.post("/search-references", async (c) => {
  const req = safeParse(searchReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined || req.query.trim() === "") {
    return c.json({ candidates: [] })
  }
  const candidates: {
    mapId: string
    nodeId: string
    mapTitle: string
    title: string
    text: string
  }[] = []
  for (const meta of listMaps()) {
    const loaded = loadMap(meta.id)
    if (loaded === null) continue
    for (const node of Object.values(loaded.nodes)) {
      if (String(loaded.id) === req.excludeMapId && String(node.id) === req.excludeNodeId) continue
      candidates.push({
        mapId: String(loaded.id),
        nodeId: String(node.id),
        mapTitle: loaded.title,
        title: node.title,
        text: nodeText(node),
      })
    }
  }
  return c.json({ candidates: rankCandidates(req.query, candidates, 12) })
})

graphRoutes.get("/tools", (c) => {
  const settings = loadSettings()
  return c.json({
    enabled: settings.toolsEnabled,
    builtin: BUILTIN_TOOLS.map((t) => t.function.name),
    mcp: settings.mcpServers.map((s) => s.name),
  })
})
