import { describe, expect, test } from "bun:test"
import { asNodeId } from "../src/domain/ids"
import { parseSpiderMap } from "../src/domain/importer"

const fixture = {
  id: "map_fix1",
  title: "fixture",
  rootNodeId: "n1",
  nodes: {
    n1: {
      id: "n1",
      title: "根",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hi",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      children: ["n2", "n3"],
      position: { x: 0, y: 0 },
    },
    n2: {
      id: "n2",
      title: "a",
      parentId: "n1",
      children: [],
      position: { x: 360, y: 0 },
    },
    n3: {
      id: "n3",
      title: "b",
      parentId: "n1",
      children: [],
      position: { x: 360, y: 200 },
    },
    n4: {
      id: "n4",
      title: "汇聚",
      parentIds: ["n2", "n3"],
      children: [],
      position: { x: 720, y: 100 },
    },
  },
  edges: [],
}

describe("parseSpiderMap", () => {
  test("rebuilds children and both convergent edges from parent pointers", () => {
    // Given the raw spider fixture
    // When parsed
    const map = parseSpiderMap(fixture)
    // Then node counts survive and edges are reconstructed from parents
    expect(Object.keys(map.nodes).length).toBe(4)
    expect(map.edges.length).toBe(4)
    expect(map.edges.filter((e) => e.to === asNodeId("n4")).length).toBe(2)
    expect(map.nodes["n1"]?.children).toContain(asNodeId("n2"))
    expect(map.rootNodeId ?? "").toBe("n1")
  })

  test("round-trips node ids through the domain shape", () => {
    // Given the parsed map
    const map = parseSpiderMap(fixture)
    // When re-serialized as plain JSON keys
    const ids = Object.keys(map.nodes).sort()
    // Then the fixture's node ids are intact
    expect(ids).toEqual(["n1", "n2", "n3", "n4"])
  })

  test("drops messages with unknown roles", () => {
    // Given a node carrying a bogus role
    const bad = structuredClone(fixture)
    bad.nodes["n1"]?.messages.push({
      id: "m2",
      role: "tool",
      content: "x",
      createdAt: "2026-01-01T00:00:00Z",
    })
    // When parsed
    const map = parseSpiderMap(bad)
    // Then only the valid message survives
    expect(map.nodes["n1"]?.messages.length).toBe(1)
  })

  test("throws ZodError on a payload without nodes", () => {
    // Given a payload missing the nodes record
    // When parsed
    // Then the boundary rejects it
    expect(() => parseSpiderMap({ id: "x", title: "t" })).toThrow()
  })

  test("preserves a message toolTrace through the round-trip", () => {
    // Given a node whose assistant message carries a tool trace
    const traced = structuredClone(fixture)
    const tracedMessages = traced.nodes["n1"]?.messages as Array<Record<string, unknown>>
    tracedMessages?.push({
      id: "m3",
      role: "assistant",
      content: "答",
      createdAt: "2026-01-01T00:00:01Z",
      toolTrace: [
        {
          kind: "call",
          name: "mcp__mock__echo",
          args: '{"text":"hi"}',
        },
        {
          kind: "result",
          name: "mcp__mock__echo",
          result: "hi",
          ok: true,
        },
      ],
    })
    // When parsed
    const map = parseSpiderMap(traced)
    // Then the trace survives with entries intact
    const last = map.nodes["n1"]?.messages.at(-1)
    expect(last?.toolTrace).toEqual([
      { kind: "call", name: "mcp__mock__echo", args: '{"text":"hi"}' },
      { kind: "result", name: "mcp__mock__echo", result: "hi", ok: true },
    ])
  })
})
