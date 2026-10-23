import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { existsSync } from "node:fs"

export interface McpServerConfig {
  readonly name: string
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string | undefined
}

export interface McpToolSpec {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

const CALL_TIMEOUT_MS = 20000
const INIT_TIMEOUT_MS = 15000

class McpClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private seq = 0
  private pending = new Map<number, Pending>()
  private buffer = ""
  private closed = false
  private tools: McpToolSpec[] = []

  constructor(private readonly cfg: McpServerConfig) {}

  private send(payload: Record<string, unknown>): void {
    if (this.child === null || this.closed) {
      throw new Error(`MCP ${this.cfg.name} 未启动`)
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP ${this.cfg.name} 调用超时: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.send({ jsonrpc: "2.0", id, method, params })
    })
  }

  private onLine(line: string): void {
    if (line.trim() === "") return
    let msg: {
      id?: number
      result?: unknown
      error?: { message?: string }
    }
    try {
      msg = JSON.parse(line) as typeof msg
    } catch {
      return
    }
    if (typeof msg.id !== "number") return
    const entry = this.pending.get(msg.id)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    this.pending.delete(msg.id)
    if (msg.error !== undefined) {
      entry.reject(new Error(msg.error.message ?? "MCP error"))
    } else entry.resolve(msg.result)
  }

  async start(): Promise<void> {
    if (this.child !== null) return
    if (
      !existsSync(this.cfg.command) &&
      !this.cfg.command.includes("/") &&
      !this.cfg.command.includes("\\")
    ) {
      // bare commands (e.g. "node") rely on PATH; nothing to verify here
    }
    const child = spawn(this.cfg.command, [...(this.cfg.args ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(this.cfg.env ?? {}) },
      ...(this.cfg.cwd !== undefined ? { cwd: this.cfg.cwd } : {}),
      shell: false,
    })
    this.child = child
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk
      const lines = this.buffer.split(/\r?\n/)
      this.buffer = lines.pop() ?? ""
      for (const line of lines) this.onLine(line)
    })
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", () => {
      // MCP servers log to stderr by spec; nothing to do with it here
    })
    child.on("exit", () => {
      this.closed = true
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`MCP ${this.cfg.name} 进程退出`))
        this.pending.delete(id)
      }
    })
    await this.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "spider-standalone", version: "0.3.0" },
      },
      INIT_TIMEOUT_MS,
    )
    this.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })
    const listed = (await this.request("tools/list", {}, INIT_TIMEOUT_MS)) as {
      tools?: McpToolSpec[]
    }
    this.tools = listed.tools ?? []
  }

  listTools(): readonly McpToolSpec[] {
    return this.tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request(
      "tools/call",
      { name, arguments: args },
      CALL_TIMEOUT_MS,
    )) as {
      content?: Array<{ type?: string; text?: string }>
      isError?: boolean
    }
    const text = (result.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n")
    if (result.isError === true) {
      throw new Error(text === "" ? "MCP tool error" : text)
    }
    return text === "" ? JSON.stringify(result) : text
  }

  stop(): void {
    this.closed = true
    if (this.child !== null) {
      try {
        this.child.kill()
      } catch {
        // the process may already be gone; nothing else to release
      }
      this.child = null
    }
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error("MCP client stopped"))
      this.pending.delete(id)
    }
  }
}

export interface McpRuntime {
  readonly clients: readonly {
    readonly cfg: McpServerConfig
    readonly client: McpClient
  }[]
  readonly tools: readonly {
    readonly qualifiedName: string
    readonly server: string
    readonly spec: McpToolSpec
  }[]
  call(qualifiedName: string, args: Record<string, unknown>): Promise<string>
  stop(): void
}

export const startMcp = async (configs: readonly McpServerConfig[]): Promise<McpRuntime> => {
  const clients: { cfg: McpServerConfig; client: McpClient }[] = []
  const tools: {
    qualifiedName: string
    server: string
    spec: McpToolSpec
  }[] = []
  const failures: string[] = []
  for (const cfg of configs) {
    if (cfg.name.trim() === "" || cfg.command.trim() === "") continue
    const client = new McpClient(cfg)
    try {
      await client.start()
      clients.push({ cfg, client })
      for (const spec of client.listTools()) {
        tools.push({
          qualifiedName: `mcp__${cfg.name}__${spec.name}`,
          server: cfg.name,
          spec,
        })
      }
    } catch (e) {
      client.stop()
      failures.push(`${cfg.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    clients,
    tools,
    async call(qualifiedName, args) {
      const hit = tools.find((t) => t.qualifiedName === qualifiedName)
      if (hit === undefined) {
        throw new Error(`未知 MCP 工具: ${qualifiedName}`)
      }
      const client = clients.find((c) => c.cfg.name === hit.server)?.client
      if (client === undefined) {
        throw new Error(`MCP server 未连接: ${hit.server}`)
      }
      return client.callTool(hit.spec.name, args)
    },
    stop() {
      for (const c of clients) c.client.stop()
    },
  }
}
