import { Hono } from "hono"
import { z } from "zod"
import { summaryPrompt, titlePrompt } from "../domain/contextEngine"
import { nowIso } from "../domain/types"
import { completion, extractContent } from "./provider"
import { loadMap, loadSettings, saveMap, saveSettings } from "./store"

const chatReqZ = z.object({ mapId: z.string(), nodeId: z.string() })

const safeParse = <S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> | undefined => {
  const result = schema.safeParse(raw)
  return result.success ? result.data : undefined
}

export const aiRoutes = new Hono()

aiRoutes.post("/summarize", async (c) => {
  const req = safeParse(chatReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid summarize request" }, 400)
  }
  const map = loadMap(req.mapId)
  const node = map?.nodes[req.nodeId]
  if (map === null || node === undefined) {
    return c.json({ error: "node not found" }, 404)
  }
  const settings = loadSettings()
  const transcript = node.messages
    .map((m) => `${m.role === "user" ? "问" : "答"}: ${m.content}`)
    .join("\n")
  if (transcript === "") {
    return c.json({ error: "节点暂无对话，无法总结" }, 400)
  }
  try {
    const res = await completion(
      summaryPrompt(settings.language === "zh-CN", transcript),
      false,
      AbortSignal.timeout(120000),
    )
    if (!res.ok) return c.json({ error: `provider ${res.status}` }, 502)
    const summary = extractContent(await res.json())
      .trim()
      .slice(0, 200)
    saveMap({
      ...map,
      nodes: {
        ...map.nodes,
        [req.nodeId]: { ...node, summary, updatedAt: nowIso() },
      },
      updatedAt: nowIso(),
    })
    return c.json({ summary })
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : "summarize failed",
      },
      502,
    )
  }
})

aiRoutes.post("/title", async (c) => {
  const req = safeParse(chatReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid title request" }, 400)
  }
  const map = loadMap(req.mapId)
  const node = map?.nodes[req.nodeId]
  if (map === null || node === undefined) {
    return c.json({ error: "node not found" }, 404)
  }
  const settings = loadSettings()
  const messages = [
    ...titlePrompt(settings.language === "zh-CN"),
    ...node.messages.map((m) => ({ role: m.role, content: m.content })),
  ]
  try {
    const res = await completion(messages, false, AbortSignal.timeout(30000))
    if (!res.ok) return c.json({ error: `provider ${res.status}` }, 502)
    return c.json({
      title: extractContent(await res.json())
        .trim()
        .slice(0, 24),
    })
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : "title failed",
      },
      502,
    )
  }
})

aiRoutes.get("/settings", (c) => c.json(loadSettings()))

aiRoutes.put("/settings", async (c) => {
  try {
    return c.json(saveSettings(await c.req.json()))
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : "invalid settings",
      },
      400,
    )
  }
})

aiRoutes.post("/test", async (c) => {
  try {
    const res = await completion(
      [{ role: "system", content: "Reply with OK only." }],
      false,
      AbortSignal.timeout(15000),
    )
    if (!res.ok) {
      return c.json({ ok: false, message: `provider ${res.status}` })
    }
    const text = extractContent((await res.json()) as object)
    return c.json({
      ok: text.includes("OK") || res.ok,
      message: text || `status ${res.status}`,
    })
  } catch (e) {
    return c.json({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    })
  }
})
