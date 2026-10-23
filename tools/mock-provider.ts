/**
 * Mock OpenAI-compatible provider used for QA of the tool loop.
 * Round 1: asks for the search_notes tool. Round 2 (after tool result): answers with the tool content.
 * Also exposes /mcp-tool to exercise an MCP tool when requested via the first user message.
 */
const port = Number(process.env["MOCK_PORT"] ?? 4400)

const sse = (chunks: string[]): Response => {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()
      for (const c of chunks) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: c } }],
            })}\n\n`,
          ),
        )
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  })
}

const json = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  })

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/health") return json({ ok: true })
    if (url.pathname === "/v1/embeddings" || url.pathname === "/embeddings") {
      const body = (await req.json().catch(() => ({}))) as {
        input?: string | string[]
      }
      const raw = Array.isArray(body.input)
        ? body.input
        : typeof body.input === "string"
          ? [body.input]
          : []
      // 8-dim deterministic bag-of-character hash vector
      const data = raw.map((text, idx) => {
        const vec = new Array(8).fill(0)
        for (let i = 0; i < text.length; i += 1) {
          vec[text.charCodeAt(i) % 8] += 1
        }
        const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1
        return {
          object: "embedding",
          index: idx,
          embedding: vec.map((x) => x / norm),
        }
      })
      return json({ object: "list", data, model: "mock-embed" })
    }
    if (url.pathname !== "/v1/chat/completions") {
      return json({ error: "not found" })
    }
    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>
      tools?: Array<{ function: { name: string } }>
      stream?: boolean
    }
    const messages = body.messages ?? []
    const toolNames = (body.tools ?? []).map((t) => t.function.name)
    const toolResult = messages.filter(
      (m) => m.role === "user" && m.content.startsWith("【工具结果"),
    )

    if (toolResult.length === 0) {
      const name = toolNames.find((n) => n.startsWith("mcp__")) ?? "search_notes"
      if (name !== undefined) {
        const payload = {
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_qa_1",
                    type: "function",
                    function: {
                      name,
                      arguments: name.startsWith("mcp__")
                        ? JSON.stringify({
                            text: "QA MCP 调用",
                          })
                        : JSON.stringify({
                            query: "DDNS",
                          }),
                    },
                  },
                ],
              },
            },
          ],
        }
        if (body.stream === true) return json(payload)
        return json(payload)
      }
    }

    const toolText = toolResult.map((m) => m.content).join("\n")
    const answer =
      toolResult.length === 0
        ? "（mock）没有可用工具，直接回答。"
        : `（mock）已调用工具，结果摘要：${toolText.slice(0, 160)}`
    if (body.stream === true) {
      return sse([answer.slice(0, 8), answer.slice(8)])
    }
    return json({
      choices: [{ message: { role: "assistant", content: answer } }],
    })
  },
})

console.log(`mock provider on http://127.0.0.1:${port}`)
