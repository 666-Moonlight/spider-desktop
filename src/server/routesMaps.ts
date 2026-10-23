import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Hono } from "hono"
import { z } from "zod"
import { buildExportFiles } from "../domain/exporter"
import { createMap } from "../domain/graphOps"
import { parseSpiderMap } from "../domain/importer"
import type { ChatMap } from "../domain/types"
import { deleteMapFile, EXPORT_ROOT, importSpiderMaps, listMaps, loadMap, saveMap } from "./store"

const importReqZ = z.object({ source: z.string().min(1) })
const newMapReqZ = z.object({ title: z.string().default("新图谱") })
const renameReqZ = z.object({ title: z.string().trim().min(1) })

const safeParse = <S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> | undefined => {
  const result = schema.safeParse(raw)
  return result.success ? result.data : undefined
}

const safeParseMap = (raw: unknown): ChatMap | undefined => {
  try {
    return parseSpiderMap(raw)
  } catch {
    return undefined
  }
}

export const mapRoutes = new Hono()

mapRoutes.get("/", (c) => c.json(listMaps()))

mapRoutes.post("/", async (c) => {
  const body = newMapReqZ.parse(await c.req.json())
  const map = createMap(body.title)
  saveMap(map)
  return c.json(map, 201)
})

mapRoutes.get("/:id", (c) => {
  const map = loadMap(c.req.param("id"))
  if (map === null) return c.json({ error: "map not found" }, 404)
  return c.json(map)
})

mapRoutes.put("/:id", async (c) => {
  const id = c.req.param("id")
  const map = safeParseMap(await c.req.json().catch(() => undefined))
  if (map === undefined) return c.json({ error: "invalid map payload" }, 400)
  if (map.id !== id) return c.json({ error: "id mismatch" }, 400)
  saveMap(map)
  return c.json({ ok: true })
})

mapRoutes.patch("/:id/title", async (c) => {
  const id = c.req.param("id")
  const map = loadMap(id)
  if (map === null) return c.json({ error: "map not found" }, 404)
  const parsed = safeParse(renameReqZ, await c.req.json().catch(() => undefined))
  if (parsed === undefined) {
    return c.json({ error: "invalid title: must be non-empty string" }, 400)
  }
  const next: ChatMap = {
    ...map,
    title: parsed.title,
    updatedAt: new Date().toISOString(),
  }
  saveMap(next)
  return c.json({ ok: true, map: next })
})

mapRoutes.delete("/:id", async (c) => c.json({ ok: await deleteMapFile(c.req.param("id")) }))

mapRoutes.post("/import", async (c) => {
  const { source } = importReqZ.parse(await c.req.json())
  return c.json(importSpiderMaps(source))
})

mapRoutes.post("/:id/export", async (c) => {
  const map = loadMap(c.req.param("id"))
  if (map === null) return c.json({ error: "map not found" }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { target?: unknown }
  const target =
    typeof body.target === "string"
      ? body.target
      : join(EXPORT_ROOT, map.title.replace(/[\\/:*?"<>|]/g, "-"))
  const files = buildExportFiles(map)
  for (const f of files) {
    const full = join(target, f.path).replaceAll("\\", "/")
    const dir = full.slice(0, full.lastIndexOf("/"))
    mkdirSync(dir === "" ? "." : dir, { recursive: true })
    writeFileSync(full, f.content, "utf8")
  }
  return c.json({ dir: target, files: files.map((f) => f.path) })
})

export { safeParse }
