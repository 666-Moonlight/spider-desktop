import { describe, expect, test } from "bun:test"
import { TOOL_NODE_ID_PREFIX, toolCallCount, toolShowNodes } from "../src/domain/toolNodes"
import type { ChatMap, ChatNode, ToolTraceEntry } from "../src/domain/types"

const trace: readonly ToolTraceEntry[] = [
  { kind: "call", name: "mcp__mock__echo", args: '{"text":"hi"}' },
  { kind: "result", name: "mcp__mock__echo", result: "hi", ok: true },
]

const node = (over: Partial<ChatNode>): ChatNode => ({
  id: "n1" as ChatNode["id"],
  title: "节点",
  children: [],
  messages: [],
  status: "active",
  position: { x: 100, y: 50 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const withTrace = node({
  messages: [
    {
      id: "m1",
      role: "user",
      content: "问",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content: "答",
      createdAt: "2026-01-01T00:00:01.000Z",
      toolTrace: trace,
    },
  ],
})

describe("toolShowNodes", () => {
  test("emits one display node per active node carrying a trace", () => {
    const out = toolShowNodes([withTrace], "n1")
    expect(out.length).toBe(1)
    expect(out[0]?.id).toBe(`${TOOL_NODE_ID_PREFIX}m2`)
    expect(out[0]?.entries.length).toBe(2)
    expect(out[0]?.position).toEqual({ x: 400, y: 50 })
  })

  test("skips nodes without any trace", () => {
    const plain = node({
      messages: [
        {
          id: "m3",
          role: "assistant",
          content: "答",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    })
    expect(toolShowNodes([plain], "n1")).toEqual([])
  })

  test("filters to the active node only", () => {
    const other = { ...withTrace, id: "n2" as ChatNode["id"] }
    expect(toolShowNodes([withTrace, other], "n2").map((n) => n.sourceNodeId)).toEqual(["n2"])
  })

  test("picks the newest assistant message that carries a trace", () => {
    const older = node({
      messages: [
        {
          id: "a1",
          role: "assistant",
          content: "旧",
          createdAt: "2026-01-01T00:00:00.000Z",
          toolTrace: trace,
        },
        {
          id: "a2",
          role: "assistant",
          content: "新",
          createdAt: "2026-01-01T00:00:02.000Z",
          toolTrace: [trace[0] as ToolTraceEntry],
        },
      ],
    })
    expect(toolShowNodes([older], "n1")[0]?.messageId).toBe("a2")
  })

  test("counts only call entries", () => {
    expect(toolCallCount(trace)).toBe(1)
  })

  test("never mutates the source map", () => {
    const map: ChatMap = {
      id: "map1" as ChatMap["id"],
      title: "图",
      nodes: { n1: withTrace },
      edges: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    const before = JSON.stringify(map)
    toolShowNodes(Object.values(map.nodes), "n1")
    expect(JSON.stringify(map)).toBe(before)
  })
})
