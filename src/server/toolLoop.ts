import type { ApiMessage } from "../domain/types"
import type { McpRuntime } from "./mcp"
import { extractContent } from "./provider"
import {
  BUILTIN_TOOLS,
  runBuiltinTool,
  type ToolCallRequest,
  type ToolResult,
  type ToolSpec,
} from "./tools"

export type ChatEvent =
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "tool_call"
      readonly name: string
      readonly args: string
    }
  | {
      readonly type: "tool_result"
      readonly name: string
      readonly ok: boolean
      readonly content: string
    }
  | { readonly type: "final"; readonly text: string }
  | { readonly type: "error"; readonly message: string }

export interface ToolLoopDeps {
  readonly request: (
    messages: readonly ApiMessage[],
    tools: readonly ToolSpec[],
  ) => Promise<Response>
  readonly ctx: Parameters<typeof runBuiltinTool>[1]
  readonly mcp: McpRuntime | null
  readonly maxRounds?: number
  readonly onEvent: (e: ChatEvent) => Promise<void>
}

interface AssistantTurn {
  readonly content: string
  readonly calls: readonly {
    readonly id: string
    readonly name: string
    readonly arguments: string
  }[]
}

const parseTurn = (payload: unknown): AssistantTurn => {
  if (typeof payload !== "object" || payload === null) {
    return { content: "", calls: [] }
  }
  const choice = (
    payload as {
      choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>
    }
  ).choices?.[0]
  const msg = choice?.message
  const content = typeof msg?.content === "string" ? msg.content : ""
  const rawCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  const calls = rawCalls
    .map((c) => {
      const call = c as {
        id?: unknown
        function?: { name?: unknown; arguments?: unknown }
      }
      const name = typeof call.function?.name === "string" ? call.function.name : ""
      if (name === "") return null
      return {
        id: typeof call.id === "string" ? call.id : `call_${Math.random().toString(36).slice(2)}`,
        name,
        arguments: typeof call.function?.arguments === "string" ? call.function.arguments : "{}",
      }
    })
    .filter((c): c is { id: string; name: string; arguments: string } => c !== null)
  return { content, calls }
}

const mcpSpecs = (mcp: McpRuntime | null): readonly ToolSpec[] =>
  (mcp?.tools ?? []).map((t) => ({
    type: "function" as const,
    function: {
      name: t.qualifiedName,
      description: `[MCP ${t.server}] ${t.spec.description}`,
      parameters: t.spec.inputSchema,
    },
  }))

const executeCall = async (call: ToolCallRequest, deps: ToolLoopDeps): Promise<ToolResult> => {
  if (call.name.startsWith("mcp__")) {
    if (deps.mcp === null) {
      return {
        id: call.id,
        name: call.name,
        ok: false,
        content: "MCP 未启用",
      }
    }
    try {
      const args = (() => {
        try {
          return JSON.parse(call.arguments === "" ? "{}" : call.arguments) as Record<
            string,
            unknown
          >
        } catch {
          return {}
        }
      })()
      const content = await deps.mcp.call(call.name, args)
      return { id: call.id, name: call.name, ok: true, content }
    } catch (e) {
      return {
        id: call.id,
        name: call.name,
        ok: false,
        content: e instanceof Error ? e.message : "MCP 调用失败",
      }
    }
  }
  return runBuiltinTool(call, deps.ctx)
}

/**
 * Agent loop: ask the model, execute every requested tool, feed results back,
 * repeat until it answers without tools (bounded by maxRounds).
 */
export const runToolLoop = async (
  baseMessages: readonly ApiMessage[],
  deps: ToolLoopDeps,
): Promise<{ readonly content: string; readonly trace: readonly ToolResult[] }> => {
  const maxRounds = deps.maxRounds ?? 4
  const specs: readonly ToolSpec[] = [...BUILTIN_TOOLS, ...mcpSpecs(deps.mcp)]
  const messages: ApiMessage[] = [...baseMessages]
  const trace: ToolResult[] = []
  let content = ""
  for (let round = 0; round < maxRounds; round++) {
    const res = await deps.request(messages, specs)
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`provider ${res.status} ${detail.slice(0, 200)}`)
    }
    const turn = parseTurn(await res.json())
    content = turn.content
    if (turn.calls.length === 0) return { content, trace }
    for (const call of turn.calls) {
      await deps.onEvent({
        type: "tool_call",
        name: call.name,
        args: call.arguments,
      })
      const result = await executeCall(call, deps)
      trace.push(result)
      await deps.onEvent({
        type: "tool_result",
        name: call.name,
        ok: result.ok,
        content: result.content.slice(0, 4000),
      })
      messages.push({ role: "assistant", content: "" })
      messages.push({
        role: "user",
        content: `【工具结果 ${call.name}】\n${result.content}`,
      })
    }
  }
  return {
    content: content === "" ? "（工具轮次达到上限，未生成最终回答）" : content,
    trace,
  }
}

export { extractContent }
