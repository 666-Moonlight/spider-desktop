import { describe, expect, test } from "bun:test"
import {
  buildContext,
  DEFAULT_ENGINE_SETTINGS,
  type EngineSettings,
  resolveTeachingPrompt,
} from "../src/domain/contextEngine"
import { createChildNode, createConvergentNode, createMap } from "../src/domain/graphOps"
import type { NodeId } from "../src/domain/ids"
import type { ChatMap } from "../src/domain/types"
import { appendMessage } from "./helpers"

const rootIdOf = (map: ChatMap): NodeId =>
  map.rootNodeId ?? (Object.values(map.nodes)[0]?.id as NodeId)

const withTalk = (map: ChatMap, nodeId: string, q: string, a: string): ChatMap => {
  let cur = map
  cur = appendMessage(cur, nodeId, "user", q)
  return appendMessage(cur, nodeId, "assistant", a)
}

const settings = (over: Partial<EngineSettings> = {}): EngineSettings => ({
  ...DEFAULT_ENGINE_SETTINGS,
  ...over,
})

describe("buildContext ancestor chain", () => {
  test("includes the parent's real conversation, not only its title", () => {
    // Given root -> child, where the root has a real exchange
    const base = createMap("t")
    const root = rootIdOf(base)
    const talked = withTalk(base, root, "什么是DDNS", "DDNS 是动态域名解析…")
    const child = createChildNode(talked, {
      parentId: root,
      direction: "right",
    })
    // When the child's context is built
    const ctx = buildContext(child?.map as ChatMap, child?.node.id as NodeId, settings())
    // Then the parent's question and answer text are both present
    const ancestor = ctx.parts.find((p) => p.label.startsWith("上级 L1"))
    expect(ancestor?.content).toContain("什么是DDNS")
    expect(ancestor?.content).toContain("DDNS 是动态域名解析")
  })

  test("keeps deep ancestors as compact summary lines past the depth limit", () => {
    // Given a chain root -> a -> b -> c (three levels above the leaf)
    const base = createMap("t")
    const root = rootIdOf(base)
    let cur = withTalk(base, root, "q0", "a0".repeat(50))
    const a = createChildNode(cur, { parentId: root, direction: "right" })
    cur = withTalk(a?.map as ChatMap, a?.node.id as NodeId, "q1", "a1".repeat(50))
    const b = createChildNode(cur, {
      parentId: a?.node.id as NodeId,
      direction: "right",
    })
    cur = withTalk(b?.map as ChatMap, b?.node.id as NodeId, "q2", "a2".repeat(50))
    const c = createChildNode(cur, {
      parentId: b?.node.id as NodeId,
      direction: "right",
    })
    // When depth is limited to 2
    const ctx = buildContext(
      c?.map as ChatMap,
      c?.node.id as NodeId,
      settings({ maxAncestorDepth: 2 }),
    )
    // Then the third-level ancestor appears only as a compact line and is reported clipped
    const compact = ctx.parts.find((p) => p.label.includes("仅摘要"))
    expect(compact).toBeDefined()
    expect(ctx.clippedAncestors.length).toBe(1)
  })

  test("compresses the deepest ancestor parts first when the budget is exceeded", () => {
    // Given a deep chain with heavy content
    const base = createMap("t")
    const root = rootIdOf(base)
    let cur = withTalk(base, root, "q0", "长答".repeat(400))
    let parent: NodeId = root
    const ids: NodeId[] = []
    for (let i = 0; i < 4; i++) {
      const ch = createChildNode(cur, {
        parentId: parent,
        direction: "right",
      })
      if (ch === null) break
      cur = withTalk(ch.map, ch.node.id, `q${i + 1}`, "长答".repeat(400))
      parent = ch.node.id
      ids.push(ch.node.id)
    }
    // When the budget is far below the assembled size
    const ctx = buildContext(cur, parent, settings({ maxChars: 3000, maxAncestorDepth: 5 }))
    // Then total chars stay within budget and at least one part got compressed
    const head = ctx.parts[0]
    expect(ctx.chars).toBeLessThanOrEqual(3000 + (head?.content.length ?? 0))
    expect(ctx.parts.some((p) => p.content.includes("预算压缩"))).toBe(true)
  })
})

describe("buildContext convergent aggregation", () => {
  test("carries both parent branches' recent exchanges", () => {
    // Given two branch nodes that each hold their own exchange, plus a convergent child
    const base = createMap("t")
    const root = rootIdOf(base)
    const a = createChildNode(base, { parentId: root, direction: "right" })
    const talkedA = withTalk(a?.map as ChatMap, a?.node.id as NodeId, "问A", "答A内容")
    const b = createChildNode(talkedA, { parentId: root, direction: "bottom" })
    const talkedB = withTalk(b?.map as ChatMap, b?.node.id as NodeId, "问B", "答B内容")
    const m = createConvergentNode(talkedB, [a?.node.id as NodeId, b?.node.id as NodeId])
    // When the convergent node's context is built
    const ctx = buildContext(m?.map as ChatMap, m?.node.id as NodeId, settings())
    // Then both branches' answer text is inside the convergent part
    const conv = ctx.parts.find((p) => p.source === "convergent")
    expect(conv?.content).toContain("答A内容")
    expect(conv?.content).toContain("答B内容")
  })
})

describe("teaching prompts", () => {
  test("resolves zh styles and honors custom prompts", () => {
    // Given zh settings across styles
    // When resolved
    // Then teacher/socratic/concise return distinct prompts, custom returns the user text, default empty
    expect(resolveTeachingPrompt(settings({ teachingStyle: "teacher" }))).toContain(
      "耐心的专业老师",
    )
    expect(resolveTeachingPrompt(settings({ teachingStyle: "socratic" }))).toContain("苏格拉底")
    expect(resolveTeachingPrompt(settings({ teachingStyle: "concise" })).length).toBeGreaterThan(20)
    expect(
      resolveTeachingPrompt(
        settings({
          teachingStyle: "custom",
          customSystemPrompt: "  只谈历史  ",
        }),
      ),
    ).toBe("只谈历史")
    expect(resolveTeachingPrompt(settings())).toBe("")
  })

  test("injects the teaching prompt as a labeled part", () => {
    // Given a map and socratic style
    const map = createMap("t")
    // When context is built
    const ctx = buildContext(map, rootIdOf(map), settings({ teachingStyle: "socratic" }))
    // Then a teaching part exists and is also present in the wire messages
    expect(ctx.parts.some((p) => p.source === "teaching")).toBe(true)
    expect(ctx.messages.some((m) => m.role === "system" && m.content.includes("苏格拉底"))).toBe(
      true,
    )
  })
})
