import { similarity, tokenize } from "./similarity"

export interface ReferenceSource {
  readonly mapTitle: string
  readonly nodeTitle: string
  readonly content: string
  readonly score: number
}

export interface ReferencePick {
  readonly mapId: string
  readonly nodeId: string
  readonly title: string
  readonly excerpt: string
}

export interface ReferenceCandidate {
  readonly mapId: string
  readonly nodeId: string
  readonly mapTitle: string
  readonly title: string
  readonly score: number
  readonly excerpt: string
}

export const rankCandidates = (
  query: string,
  candidates: readonly {
    readonly mapId: string
    readonly nodeId: string
    readonly mapTitle: string
    readonly title: string
    readonly text: string
  }[],
  limit = 10,
): readonly ReferenceCandidate[] => {
  const q = query.trim()
  if (q === "") return []
  return candidates
    .map((c) => ({
      mapId: c.mapId,
      nodeId: c.nodeId,
      mapTitle: c.mapTitle,
      title: c.title,
      score: similarity(q, `${c.title} ${c.text}`),
      excerpt: c.text.replace(/\s+/g, " ").slice(0, 120),
    }))
    .filter((c) => c.score > 0 || c.title.includes(q))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export const referenceBlock = (refs: readonly ReferenceSource[]): string => {
  if (refs.length === 0) return ""
  const body = refs
    .map((r, i) => `### 引用 ${i + 1}：${r.mapTitle} › ${r.nodeTitle}\n${r.content.slice(0, 2000)}`)
    .join("\n\n")
  return `【跨图引用】以下内容来自其他图谱节点，仅作为参考资料；回答时如使用请说明来源：\n\n${body}`
}

export const excerptOf = (text: string, max = 160): string => {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export const hasTokens = (text: string): boolean => tokenize(text).length > 0
