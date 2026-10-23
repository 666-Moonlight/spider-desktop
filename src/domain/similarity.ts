import type { ChatMap, ChatNode } from "./types"

const STOP = new Set([
  "的",
  "了",
  "是",
  "在",
  "和",
  "与",
  "我",
  "你",
  "他",
  "这",
  "那",
  "就",
  "都",
  "也",
  "不",
  "有",
  "个",
  "上",
  "中",
  "下",
  "to",
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "is",
  "are",
  "be",
  "for",
  "in",
  "on",
  "with",
  "that",
  "this",
])

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim()

/** CJK bigrams + latin words; stopwords dropped. Used for local lexical similarity. */
export const tokenize = (text: string): readonly string[] => {
  const norm = normalize(text)
  const tokens: string[] = []
  for (const word of norm.match(/[a-z0-9_]{2,}/g) ?? []) {
    if (!STOP.has(word)) tokens.push(word)
  }
  const cjk = norm.replace(/[^\u4e00-\u9fff]/g, " ")
  for (const run of cjk.split(" ")) {
    if (run.length < 2) continue
    for (let i = 0; i < run.length - 1; i++) {
      const bi = run.slice(i, i + 2)
      if (!STOP.has(bi)) tokens.push(bi)
    }
  }
  return tokens
}

export const nodeText = (node: ChatNode): string =>
  [node.title, node.summary ?? "", node.note ?? "", ...node.messages.map((m) => m.content)].join(
    " ",
  )

/** Dice coefficient over token sets (0..1). */
export const similarity = (a: string, b: string): number => {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return (2 * inter) / (ta.size + tb.size)
}

export interface SimilarNode {
  readonly mapId: string
  readonly nodeId: string
  readonly mapTitle: string
  readonly title: string
  readonly score: number
  readonly excerpt: string
}

/** Cosine similarity over equal-length numeric vectors (0..1). */
export const cosine = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export const rankByScore = (
  maps: readonly ChatMap[],
  targetMapId: string,
  targetNodeId: string,
  scoreOf: (node: ChatNode) => number,
  limit = 8,
): readonly SimilarNode[] => {
  const targetMap = maps.find((m) => m.id === targetMapId)
  const target = targetMap?.nodes[targetNodeId]
  if (target === undefined) return []
  const out: SimilarNode[] = []
  for (const map of maps) {
    for (const node of Object.values(map.nodes)) {
      if (node.id === targetNodeId) continue
      const score = scoreOf(node)
      if (score <= 0) continue
      const excerpt = (
        node.summary ??
        node.messages.find((m) => m.role === "assistant")?.content ??
        node.title
      )
        .replace(/\s+/g, " ")
        .slice(0, 120)
      out.push({
        mapId: String(map.id),
        nodeId: String(node.id),
        mapTitle: map.title,
        title: node.title,
        score,
        excerpt,
      })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Rank nodes across maps by lexical similarity to the target node. */
export const similarNodes = (
  maps: readonly ChatMap[],
  targetMapId: string,
  targetNodeId: string,
  limit = 8,
): readonly SimilarNode[] => {
  const target = maps.find((m) => m.id === targetMapId)?.nodes[targetNodeId]
  if (target === undefined) return []
  const targetText = nodeText(target)
  return rankByScore(
    maps,
    targetMapId,
    targetNodeId,
    (node) => similarity(targetText, nodeText(node)),
    limit,
  )
}
