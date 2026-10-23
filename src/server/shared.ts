import type { EngineSettings } from "../domain/contextEngine"
import { excerptOf, type ReferencePick } from "../domain/references"
import type { ChatMap } from "../domain/types"
import { loadMap, type Settings } from "./store"

export const engineOf = (raw: Settings): EngineSettings => ({
  language: raw.language,
  includeParentContext: raw.includeParentContext,
  teachingStyle: raw.teachingStyle,
  customSystemPrompt: raw.customSystemPrompt,
  maxAncestorDepth: 3,
  maxChars: 48000,
})

export const nodeText = (node: {
  readonly title: string
  readonly messages: readonly { readonly content: string }[]
  readonly summary?: string
  readonly note?: string
}): string =>
  [node.title, node.summary ?? "", node.note ?? "", ...node.messages.map((m) => m.content)].join(
    " ",
  )

export const referenceSources = (
  map: ChatMap,
  refs: readonly { mapId: string; nodeId: string }[],
): {
  sources: readonly {
    mapTitle: string
    nodeTitle: string
    content: string
    score: number
  }[]
  picks: readonly ReferencePick[]
} => {
  const sources: {
    mapTitle: string
    nodeTitle: string
    content: string
    score: number
  }[] = []
  const picks: ReferencePick[] = []
  for (const r of refs) {
    const target = r.mapId === String(map.id) ? map : loadMap(r.mapId)
    const node = target?.nodes[r.nodeId]
    if (target === null || target === undefined || node === undefined) {
      continue
    }
    const content = [
      node.summary ?? "",
      ...node.messages.slice(-4).map((m) => `${m.role}: ${m.content}`),
    ]
      .filter(Boolean)
      .join("\n")
    sources.push({
      mapTitle: target.title,
      nodeTitle: node.title,
      content,
      score: 1,
    })
    picks.push({
      mapId: r.mapId,
      nodeId: r.nodeId,
      title: node.title,
      excerpt: excerptOf(content),
    })
  }
  return { sources, picks }
}
