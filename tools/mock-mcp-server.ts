/**
 * Minimal MCP stdio server for QA: implements initialize, tools/list, tools/call (echo).
 * Run: bun tools/mock-mcp-server.ts
 */
const send = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

let buffer = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk: string) => {
  buffer += chunk
  const lines = buffer.split(/\r?\n/)
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (line.trim() === "") continue
    let msg: {
      id?: number
      method?: string
      params?: { name?: string; arguments?: Record<string, unknown> }
    }
    try {
      msg = JSON.parse(line) as typeof msg
    } catch {
      continue
    }
    if (typeof msg.id !== "number") continue
    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mock", version: "0.1.0" },
        },
      })
    } else if (msg.method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo the provided text back (QA).",
              inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
            },
          ],
        },
      })
    } else if (msg.method === "tools/call") {
      const text = typeof msg.params?.arguments?.text === "string" ? msg.params.arguments.text : ""
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: `echo: ${text}` }] },
      })
    } else {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { message: `unknown method ${msg.method ?? ""}` },
      })
    }
  }
})
