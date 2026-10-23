import type { ChatMap } from "../domain/types"

export interface MapMetaDto {
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  readonly nodeCount: number
}

export interface SettingsDto {
  readonly apiBaseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly embeddingsModel?: string
  readonly language: "zh-CN" | "en"
  readonly includeParentContext: boolean
  readonly teachingStyle: "default" | "teacher" | "socratic" | "concise" | "custom"
  readonly customSystemPrompt: string
  readonly toolsEnabled: boolean
  readonly mcpServers: readonly McpServerDto[]
}

export interface McpServerDto {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd?: string
}

export interface SimilarNodeDto {
  readonly mapId: string
  readonly nodeId: string
  readonly mapTitle: string
  readonly title: string
  readonly score: number
  readonly excerpt: string
}

export interface ReferenceCandidateDto {
  readonly mapId: string
  readonly nodeId: string
  readonly mapTitle: string
  readonly title: string
  readonly score: number
  readonly excerpt: string
}

export interface ToolEvent {
  readonly type: "tool_call" | "tool_result" | "delta" | "final" | "error"
  readonly name?: string
  readonly args?: string
  readonly ok?: boolean
  readonly content?: string
  readonly text?: string
  readonly message?: string
}

export interface ImportReportDto {
  readonly imported: readonly string[]
  readonly failed: readonly {
    readonly file: string
    readonly reason: string
  }[]
}

export interface ContextPartDto {
  readonly source: "language" | "teaching" | "ancestor" | "convergent" | "current"
  readonly label: string
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export interface ContextDto {
  readonly parts: readonly ContextPartDto[]
  readonly chars: number
  readonly clipped: readonly string[]
}

export interface ExportDto {
  readonly dir: string
  readonly files: readonly string[]
}

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

export const api = {
  async maps(): Promise<readonly MapMetaDto[]> {
    const res = await fetch("/api/maps")
    if (!res.ok) throw new Error(`maps ${res.status}`)
    return (await res.json()) as MapMetaDto[]
  },
  async createMap(title: string): Promise<ChatMap> {
    const res = await post("/api/maps", { title })
    if (!res.ok) throw new Error(`createMap ${res.status}`)
    return (await res.json()) as ChatMap
  },
  async map(id: string): Promise<ChatMap | null> {
    const res = await fetch(`/api/maps/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`map ${res.status}`)
    return (await res.json()) as ChatMap
  },
  async saveMap(map: ChatMap): Promise<void> {
    const res = await fetch(`/api/maps/${map.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(map),
    })
    if (!res.ok) throw new Error(`saveMap ${res.status}`)
  },
  async deleteMap(id: string): Promise<void> {
    await fetch(`/api/maps/${id}`, { method: "DELETE" })
  },
  async renameMap(id: string, title: string): Promise<ChatMap> {
    const res = await fetch(`/api/maps/${id}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`renameMap ${res.status}`)
    const data = (await res.json()) as { map: ChatMap }
    return data.map
  },
  async importMaps(source: string): Promise<ImportReportDto> {
    const res = await post("/api/import", { source })
    if (!res.ok) throw new Error(`import ${res.status}`)
    return (await res.json()) as ImportReportDto
  },
  async settings(): Promise<SettingsDto> {
    return (await (await fetch("/api/settings")).json()) as SettingsDto
  },
  async saveSettings(next: SettingsDto): Promise<SettingsDto> {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    if (!res.ok) throw new Error(`settings ${res.status}`)
    return (await res.json()) as SettingsDto
  },
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return (await (await post("/api/test", {})).json()) as {
      ok: boolean
      message: string
    }
  },
  async contextOf(mapId: string, nodeId: string): Promise<ContextDto> {
    const res = await post("/api/context", { mapId, nodeId })
    if (!res.ok) throw new Error(`context ${res.status}`)
    return (await res.json()) as ContextDto
  },
  async summarize(mapId: string, nodeId: string): Promise<string> {
    const res = await post("/api/summarize", { mapId, nodeId })
    const data = (await res.json().catch(() => ({}))) as {
      summary?: string
      error?: string
    }
    if (!res.ok) throw new Error(data.error ?? `summarize ${res.status}`)
    return data.summary ?? ""
  },
  async exportMap(mapId: string, target?: string): Promise<ExportDto> {
    const res = await post(`/api/maps/${mapId}/export`, target === undefined ? {} : { target })
    if (!res.ok) throw new Error(`export ${res.status}`)
    return (await res.json()) as ExportDto
  },
  async similar(mapId: string, nodeId: string): Promise<readonly SimilarNodeDto[]> {
    const res = await post("/api/similar", { mapId, nodeId })
    if (!res.ok) throw new Error(`similar ${res.status}`)
    const data = (await res.json()) as {
      nodes?: readonly SimilarNodeDto[]
    }
    return data.nodes ?? []
  },
  async searchReferences(
    query: string,
    excludeMapId: string,
    excludeNodeId: string,
  ): Promise<readonly ReferenceCandidateDto[]> {
    const res = await post("/api/search-references", {
      query,
      excludeMapId,
      excludeNodeId,
    })
    if (!res.ok) throw new Error(`search refs ${res.status}`)
    const data = (await res.json()) as {
      candidates?: readonly ReferenceCandidateDto[]
    }
    return data.candidates ?? []
  },
  async tools(): Promise<{ enabled: boolean; builtin: readonly string[]; mcp: readonly string[] }> {
    return (await (await fetch("/api/tools")).json()) as {
      enabled: boolean
      builtin: readonly string[]
      mcp: readonly string[]
    }
  },
  async title(mapId: string, nodeId: string): Promise<string> {
    const res = await post("/api/title", { mapId, nodeId })
    if (!res.ok) throw new Error(`title ${res.status}`)
    const data = (await res.json()) as { title?: string }
    return data.title ?? ""
  },
  async chat(
    mapId: string,
    nodeId: string,
    text: string,
    onEvent: (e: ToolEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is the message just typed: the map save is debounced, so the server cannot
      // rely on its own copy of the node to contain it yet.
      body: JSON.stringify({ mapId, nodeId, text }),
      signal,
    })
    if (!res.ok || res.body === null) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string
      }
      throw new Error(err.error ?? `chat ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (payload === "[DONE]") continue
        try {
          const parsed = JSON.parse(payload) as ToolEvent & {
            delta?: string
          }
          if (parsed.delta !== undefined) {
            onEvent({ type: "delta", text: parsed.delta })
          } else onEvent(parsed)
        } catch {
          // skip malformed frame
        }
      }
    }
  },
}
