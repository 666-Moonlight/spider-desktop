import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { z } from "zod"
import { buildContext } from "../domain/contextEngine"
import { asNodeId } from "../domain/ids"
import { referenceBlock } from "../domain/references"
import { type ApiMessage, type ChatMap, type NodeReference, nowIso } from "../domain/types"
import { startMcp } from "./mcp"
import { completion, completionWithTools, relaySse } from "./provider"
import { engineOf, referenceSources } from "./shared"
import { dataDir, loadMap, loadSettings, saveMap } from "./store"
import { type ChatEvent, runToolLoop } from "./toolLoop"

const chatReqZ = z.object({ mapId: z.string(), nodeId: z.string(), text: z.string().optional() })

const safeParse = <S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> | undefined => {
  const result = schema.safeParse(raw)
  return result.success ? result.data : undefined
}

const nodeReferences = (map: ChatMap, nodeId: string): readonly NodeReference[] =>
  map.nodes[nodeId]?.references ?? []

export const chatRoutes = new Hono()

chatRoutes.post("/chat", async (c) => {
  const req = safeParse(chatReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid chat request" }, 400)
  }
  const map = loadMap(req.mapId)
  if (map === null) return c.json({ error: "map not found" }, 404)
  const settings = loadSettings()
  // The client debounces map saves by 400ms, so this disk read can predate the message the
  // user just typed. The request carries that text so the model always sees the new question.
  const pending = req.text === undefined || req.text === "" ? null : req.text
  const builtBase = buildContext(map, asNodeId(req.nodeId), engineOf(settings))
  const already = (() => {
    if (pending === null) return true
    const last = builtBase.messages.at(-1)
    return last !== undefined && last.role === "user" && last.content === pending
  })()
  const built =
    pending === null || already
      ? builtBase
      : {
          ...builtBase,
          messages: [...builtBase.messages, { role: "user" as const, content: pending }],
        }
  const refs = nodeReferences(map, req.nodeId)
  const refSources =
    refs.length === 0
      ? []
      : referenceSources(
          map,
          refs.map((r) => ({ mapId: r.mapId, nodeId: r.nodeId })),
        ).sources
  const messages: readonly ApiMessage[] = (() => {
    if (refSources.length === 0) return built.messages
    const head = built.messages[0]
    if (head === undefined) return built.messages
    const refPart: ApiMessage = {
      role: "system",
      content: referenceBlock(refSources),
    }
    return [head, refPart, ...built.messages.slice(1)]
  })()

  appendFileSync(
    join(dataDir(), "context-log.jsonl"),
    `${JSON.stringify({
      at: new Date().toISOString(),
      mapId: req.mapId,
      nodeId: req.nodeId,
      parts: built.parts.length,
      chars: built.chars,
      refs: refs.length,
      tools: settings.toolsEnabled,
    })}\n`,
  )

  const mcp =
    settings.toolsEnabled && settings.mcpServers.length > 0
      ? await startMcp(settings.mcpServers)
      : null
  appendFileSync(
    join(dataDir(), "mcp-log.jsonl"),
    `${JSON.stringify({
      at: new Date().toISOString(),
      configured: settings.mcpServers.map((s) => s.name),
      connected: mcp === null ? [] : mcp.clients.map((c) => c.cfg.name),
      tools: mcp === null ? [] : mcp.tools.map((t) => t.qualifiedName),
    })}\n`,
  )
  c.header("X-Context-Chars", String(built.chars))
  c.header("X-Context-Parts", String(built.parts.length))
  c.header("X-Tools-Enabled", String(settings.toolsEnabled))
  c.header("X-Mcp-Tools", String(mcp === null ? 0 : mcp.tools.length))
  c.header("Content-Type", "text/event-stream; charset=utf-8")
  c.header("Cache-Control", "no-cache")
  c.header("Connection", "keep-alive")

  if (!settings.toolsEnabled) {
    let upstream: Response
    try {
      upstream = await completion(messages, true)
    } catch (e) {
      mcp?.stop()
      return c.json(
        {
          error: e instanceof Error ? e.message : "provider unreachable",
        },
        502,
      )
    }
    if (!upstream.ok || upstream.body === null) {
      mcp?.stop()
      const detail = await upstream.text().catch(() => "")
      return c.json(
        {
          error: `provider ${upstream.status} ${detail.slice(0, 200)}`,
        },
        502,
      )
    }
    return stream(c, async (s) => {
      await relaySse(upstream, async (chunk: string) => {
        await s.write(chunk)
      })
      mcp?.stop()
    })
  }

  return stream(c, async (s) => {
    const send = async (e: ChatEvent): Promise<void> => {
      await s.write(`data: ${JSON.stringify(e)}\n\n`)
    }
    try {
      const result = await runToolLoop(messages, {
        request: (msgs, tools) =>
          completionWithTools(msgs, tools as unknown as readonly Record<string, unknown>[]),
        ctx: {
          map,
          nodeId: req.nodeId,
          appendNote: (text) => {
            const node = map.nodes[req.nodeId]
            if (node === undefined) return
            const note =
              node.note !== undefined && node.note !== "" ? `${node.note}\n${text}` : text
            saveMap({
              ...map,
              nodes: {
                ...map.nodes,
                [req.nodeId]: {
                  ...node,
                  note,
                  updatedAt: nowIso(),
                },
              },
              updatedAt: nowIso(),
            })
          },
        },
        mcp,
        onEvent: send,
      })
      await send({ type: "final", text: result.content })
      await s.write("data: [DONE]\n\n")
    } catch (e) {
      await send({
        type: "error",
        message: e instanceof Error ? e.message : "对话失败",
      })
    } finally {
      mcp?.stop()
    }
  })
})

chatRoutes.post("/context", async (c) => {
  const req = safeParse(chatReqZ, await c.req.json().catch(() => undefined))
  if (req === undefined) {
    return c.json({ error: "invalid context request" }, 400)
  }
  const map = loadMap(req.mapId)
  if (map === null) return c.json({ error: "map not found" }, 404)
  const built = buildContext(map, asNodeId(req.nodeId), engineOf(loadSettings()))
  const refs = nodeReferences(map, req.nodeId)
  const sources =
    refs.length === 0
      ? []
      : referenceSources(
          map,
          refs.map((r) => ({ mapId: r.mapId, nodeId: r.nodeId })),
        ).sources
  const refBlock = sources.length === 0 ? "" : referenceBlock(sources)
  const parts =
    sources.length === 0
      ? built.parts
      : [
          ...built.parts,
          {
            source: "ancestor" as const,
            label: `跨图引用（${sources.length}）`,
            role: "system" as const,
            content: refBlock,
          },
        ]
  return c.json({
    parts,
    chars: built.chars + refBlock.length,
    clipped: built.clippedAncestors,
  })
})
