import type { ApiMessage } from "../domain/types"
import { loadSettings } from "./store"

const providerEndpoint = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/chat/completions`

const providerHeaders = (apiKey: string): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
})

export const completion = async (
  messages: readonly ApiMessage[],
  streamMode: boolean,
  signal?: AbortSignal,
): Promise<Response> => {
  const settings = loadSettings()
  const init: RequestInit = {
    method: "POST",
    headers: providerHeaders(settings.apiKey),
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: streamMode,
    }),
  }
  if (signal !== undefined) init.signal = signal
  return fetch(providerEndpoint(settings.apiBaseUrl), init)
}

export const extractContent = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) return ""
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const first = choices[0] as {
    delta?: { content?: unknown }
    message?: { content?: unknown }
  }
  const delta = first.delta?.content ?? first.message?.content
  return typeof delta === "string" ? delta : ""
}

/** Relay an upstream OpenAI-compatible SSE body as `data: {"delta":...}` frames. Returns delta count. */
export const relaySse = async (
  upstream: Response,
  write: (chunk: string) => Promise<void>,
): Promise<number> => {
  const reader = upstream.body?.getReader()
  if (reader === undefined) {
    await write("data: [DONE]\n\n")
    return 0
  }
  const decoder = new TextDecoder()
  let buffer = ""
  let written = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const payload = trimmed.slice(5).trim()
      if (payload === "" || payload === "[DONE]") continue
      let delta = ""
      try {
        delta = extractContent(JSON.parse(payload))
      } catch {
        delta = ""
      }
      if (delta !== "") {
        written += 1
        await write(`data: ${JSON.stringify({ delta })}\n\n`)
      }
    }
  }
  await write("data: [DONE]\n\n")
  return written
}

const embeddingsEndpoint = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, "")}/embeddings`

/** Embed texts via POST /embeddings; null on any failure so callers fall back. */
export const embeddings = async (texts: readonly string[]): Promise<readonly number[][] | null> => {
  const settings = loadSettings()
  if (settings.embeddingsModel === "" || texts.length === 0) return null
  try {
    const res = await fetch(embeddingsEndpoint(settings.apiBaseUrl), {
      method: "POST",
      headers: providerHeaders(settings.apiKey),
      body: JSON.stringify({
        model: settings.embeddingsModel,
        input: texts,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const payload = (await res.json()) as { data?: unknown }
    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
      return null
    }
    const vectors: number[][] = []
    for (const row of payload.data) {
      const vec = (row as { embedding?: unknown }).embedding
      if (!Array.isArray(vec) || vec.length === 0 || !vec.every((x) => typeof x === "number")) {
        return null
      }
      vectors.push(vec as number[])
    }
    return vectors
  } catch {
    return null
  }
}

export const completionWithTools = async (
  messages: readonly ApiMessage[],
  tools: readonly Record<string, unknown>[],
  signal?: AbortSignal,
): Promise<Response> => {
  const settings = loadSettings()
  const init: RequestInit = {
    method: "POST",
    headers: providerHeaders(settings.apiKey),
    body: JSON.stringify({
      model: settings.model,
      messages,
      tools,
      tool_choice: "auto",
      stream: false,
    }),
  }
  if (signal !== undefined) init.signal = signal
  return fetch(providerEndpoint(settings.apiBaseUrl), init)
}
