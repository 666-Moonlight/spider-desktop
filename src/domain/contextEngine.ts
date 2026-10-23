import { getNodeParentIds } from "./graphTraverse"
import type { NodeId } from "./ids"
import type { ApiMessage, ChatMap, ChatNode } from "./types"

export type TeachingStyle = "default" | "teacher" | "socratic" | "concise" | "custom"

export interface EngineSettings {
  readonly language: "zh-CN" | "en"
  readonly includeParentContext: boolean
  readonly teachingStyle: TeachingStyle
  readonly customSystemPrompt: string
  readonly maxAncestorDepth: number
  readonly maxChars: number
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  language: "zh-CN",
  includeParentContext: true,
  teachingStyle: "default",
  customSystemPrompt: "",
  maxAncestorDepth: 3,
  maxChars: 48000,
}

const teachingPrompts: Record<
  "zh-CN" | "en",
  Record<"teacher" | "socratic" | "concise", string>
> = {
  "zh-CN": {
    teacher:
      "你是一位耐心的专业老师，帮助学生从零建立对一个领域的系统认识。先说明概念在知识体系中的位置和必要的前置知识，再用直观类比、具体例子解释，最后给出关键结论和适合继续探索的相关概念。循序渐进，明确区分事实、推测和存在争议的观点；不要编造文献。",
    socratic:
      "你是一位采用苏格拉底式教学的老师。先简要回应学生的问题，再提出一个有针对性的引导问题，帮助学生自己发现概念之间的联系。根据学生已展示的理解逐步推进，必要时提供例子和提示，不要一次提出大量问题。明确区分事实和推测；不要编造文献。",
    concise:
      "你是一位善于提炼概念的专业老师。优先用简短定义、一个具体例子和少量关键要点回答。说明概念与上层主题的联系，保留必要的术语，避免无关延伸。对不确定的信息明确说明，不要编造文献。",
  },
  en: {
    teacher:
      "You are a patient expert teacher helping a student build a systematic understanding of a field from the ground up. Locate the concept in the wider topic and explain prerequisites, then use an intuitive analogy and a concrete example. Finish with key takeaways and related concepts to explore. Distinguish facts, hypotheses, and disputed claims; do not invent references.",
    socratic:
      "You are a teacher using Socratic guidance. Briefly address the student's question, then ask one focused question to help them discover connections. Adapt to their demonstrated understanding, offering examples or hints when needed. Avoid asking many questions at once. Distinguish facts from hypotheses; do not invent references.",
    concise:
      "You are an expert teacher who explains concepts concisely. Prefer a short definition, one concrete example, and a few key points. Connect the concept to the wider topic and preserve essential terminology. Avoid unrelated tangents. Acknowledge uncertainty and do not invent references.",
  },
}

export const resolveTeachingPrompt = (settings: EngineSettings): string => {
  if (settings.teachingStyle === "custom") {
    return settings.customSystemPrompt.trim()
  }
  if (settings.teachingStyle === "default") return ""
  return teachingPrompts[settings.language][settings.teachingStyle]
}

export const summaryPrompt = (zh: boolean, content: string): readonly ApiMessage[] => [
  {
    role: "system",
    content: zh
      ? "用一句简洁的简体中文总结这个对话节点。只返回总结本身。"
      : "Summarize this chat node in one concise sentence. Return only the summary.",
  },
  { role: "user", content },
]

export const titlePrompt = (zh: boolean): readonly ApiMessage[] => [
  {
    role: "system",
    content: zh
      ? "为这个对话节点生成一个简短中文标题。只返回标题，不要解释，不要引号，不要句号，不超过 8 个字。"
      : "Create a short title for this chat node. Return only the title, no quotes, no period, under 8 words.",
  },
]

export type ContextSource = "language" | "teaching" | "ancestor" | "convergent" | "current"

export interface ContextPart {
  readonly source: ContextSource
  readonly label: string
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export interface BuiltContext {
  readonly parts: readonly ContextPart[]
  readonly messages: readonly ApiMessage[]
  readonly chars: number
  readonly clippedAncestors: readonly string[]
}

const transcriptOf = (node: ChatNode, maxMessages: number, clip: number): string => {
  const recent = node.messages.slice(-maxMessages)
  return recent
    .map((m) => `${m.role === "user" ? "问" : "答"}: ${m.content.slice(0, clip)}`)
    .join("\n")
}

const compactLine = (node: ChatNode): string => {
  if (node.summary !== undefined && node.summary !== "") {
    return `摘要: ${node.summary}`
  }
  const firstAnswer = node.messages.find((m) => m.role === "assistant")
  return firstAnswer === undefined ? "（暂无内容）" : `开头: ${firstAnswer.content.slice(0, 200)}`
}

const primaryChain = (map: ChatMap, nodeId: NodeId): readonly ChatNode[] => {
  const chain: ChatNode[] = []
  const seen = new Set<string>([nodeId])
  let cur: NodeId | undefined = nodeId
  while (cur !== undefined) {
    const parents = getNodeParentIds(map, cur)
    const parent = parents[0]
    if (parent === undefined || seen.has(parent)) break
    const node = map.nodes[parent]
    if (node === undefined) break
    seen.add(parent)
    chain.push(node)
    cur = parent
  }
  return chain
}

/**
 * M2 context engine: the child node receives the ancestor chain's real conversation
 * (nearest levels in full transcript, deeper levels as summary lines), convergent nodes
 * aggregate every parent branch, and a character budget drops the deepest material first.
 */
export const buildContext = (
  map: ChatMap,
  nodeId: NodeId,
  settings: EngineSettings,
): BuiltContext => {
  const node = map.nodes[nodeId]
  if (node === undefined) {
    return { parts: [], messages: [], chars: 0, clippedAncestors: [] }
  }
  const parts: ContextPart[] = [
    {
      source: "language",
      label: "语言指令",
      role: "system",
      content:
        settings.language === "zh-CN"
          ? "除非用户明确要求其他语言，否则请默认使用简体中文回答。回答要清晰、适合学习场景，并尽量保留关键术语。"
          : "Unless the user explicitly asks for another language, respond in English. Keep answers clear and useful for learning.",
    },
  ]
  const teaching = resolveTeachingPrompt(settings)
  if (teaching !== "") {
    parts.push({
      source: "teaching",
      label: "教学风格",
      role: "system",
      content: teaching,
    })
  }

  const clipped: string[] = []
  const parents = getNodeParentIds(map, nodeId)

  if (parents.length > 1) {
    const branches = parents
      .map((p, idx) => {
        const parent = map.nodes[p]
        if (parent === undefined) return ""
        return [
          `### 【分支 ${idx + 1}】 ${parent.title}`,
          parent.summary !== undefined && parent.summary !== ""
            ? `分支结论: ${parent.summary}`
            : "",
          transcriptOf(parent, 6, 500) !== "" ? `近期探讨:\n${transcriptOf(parent, 6, 500)}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      })
      .filter(Boolean)
      .join("\n\n")
    parts.push({
      source: "convergent",
      label: `汇聚上下文（${parents.length} 个父分支）`,
      role: "system",
      content: `【核心提示】：当前节点是多个探讨分支的【汇聚综合节点】。请深度结合以下各个上级分支的研究成果、设计约束与结论，给出兼顾多分支上下文的综合解答：\n\n${branches}`,
    })
  } else if (settings.includeParentContext && parents.length === 1) {
    const chain = primaryChain(map, nodeId)
    chain.forEach((ancestor, idx) => {
      const depth = idx + 1
      if (depth > settings.maxAncestorDepth) {
        clipped.push(ancestor.title)
        parts.push({
          source: "ancestor",
          label: `上级 L${depth}（仅摘要）: ${ancestor.title}`,
          role: "system",
          content: `【更早的上级节点】${ancestor.title}\n${compactLine(ancestor)}`,
        })
        return
      }
      const body = transcriptOf(ancestor, 8, 1200)
      parts.push({
        source: "ancestor",
        label: `上级 L${depth}: ${ancestor.title}`,
        role: "system",
        content: `【上级节点对话记录 · 第 ${depth} 层】标题: ${ancestor.title}\n${
          ancestor.summary !== undefined && ancestor.summary !== ""
            ? `摘要: ${ancestor.summary}\n`
            : ""
        }${body === "" ? compactLine(ancestor) : body}`,
      })
    })
    if (node.anchorText !== undefined && node.anchorText !== "") {
      parts.push({
        source: "ancestor",
        label: "原文锚点",
        role: "system",
        content: `本次提问聚焦于上级回答中的这段原文：「${node.anchorText}」`,
      })
    }
  }

  const currentChars = node.messages.reduce((n, m) => n + m.content.length, 0)
  let used = parts.reduce((n, p) => n + p.content.length, 0) + currentChars
  const messages: ApiMessage[] = parts.map((p) => ({
    role: p.role,
    content: p.content,
  }))
  for (const m of node.messages) {
    if (m.role !== "system") {
      messages.push({ role: m.role, content: m.content })
    }
  }

  if (used > settings.maxChars) {
    const ancestorParts = parts
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.source === "ancestor" && x.p.label.includes("L"))
    for (const { p, i } of ancestorParts.reverse()) {
      if (used <= settings.maxChars) break
      const compact = `【上级节点（预算压缩）】${p.content.slice(0, 120)}…`
      used -= p.content.length - compact.length
      parts[i] = { ...p, content: compact }
      messages[i] = { role: "system", content: compact }
    }
  }
  return { parts, messages, chars: used, clippedAncestors: clipped }
}
