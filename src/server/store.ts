import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { parseSpiderMap } from "../domain/importer"
import type { ChatMap } from "../domain/types"

const DATA_DIR = process.env["SPIDER_DATA_DIR"] ?? join(import.meta.dir, "..", "..", "data")
export const dataDir = (): string => DATA_DIR
export const MAPS_DIR = join(DATA_DIR, "maps")
const SETTINGS_FILE = join(DATA_DIR, "settings.json")

export const settingsZ = z.object({
  apiBaseUrl: z.string().default("http://127.0.0.1:8000/v1"),
  apiKey: z.string().default("agy"),
  model: z.string().default("agy-agent"),
  embeddingsModel: z.string().default(""),
  language: z.enum(["zh-CN", "en"]).default("zh-CN"),
  includeParentContext: z.boolean().default(true),
  teachingStyle: z.enum(["default", "teacher", "socratic", "concise", "custom"]).default("default"),
  customSystemPrompt: z.string().default(""),
  toolsEnabled: z.boolean().default(true),
  mcpServers: z
    .array(
      z.object({
        name: z.string().min(1),
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        env: z.record(z.string(), z.string()).default({}),
        cwd: z.string().optional(),
      }),
    )
    .default([]),
})

export type Settings = z.infer<typeof settingsZ>

const ensureDirs = (): void => {
  mkdirSync(MAPS_DIR, { recursive: true })
}

export const loadSettings = (): Settings => {
  ensureDirs()
  if (!existsSync(SETTINGS_FILE)) {
    const defaults = settingsZ.parse({})
    writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2))
    return defaults
  }
  return settingsZ.parse(JSON.parse(readFileSync(SETTINGS_FILE, "utf8")))
}

export const saveSettings = (raw: unknown): Settings => {
  ensureDirs()
  const next = settingsZ.parse(raw)
  writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2))
  return next
}

export interface MapMeta {
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  readonly nodeCount: number
}

export const listMaps = (): readonly MapMeta[] => {
  ensureDirs()
  const out: MapMeta[] = []
  for (const f of readdirSync(MAPS_DIR)) {
    if (!f.endsWith(".json")) continue
    try {
      const map = parseSpiderMap(JSON.parse(readFileSync(join(MAPS_DIR, f), "utf8")))
      out.push({
        id: String(map.id),
        title: map.title,
        updatedAt: map.updatedAt,
        nodeCount: Object.keys(map.nodes).length,
      })
    } catch {
      // skip unreadable map files; listed maps stay healthy
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const EXPORT_ROOT = process.env["SPIDER_EXPORT_DIR"] ?? join(DATA_DIR, "exports")

export const mapFile = (id: string): string => join(MAPS_DIR, `${id}.json`)

export const loadMap = (id: string): ChatMap | null => {
  const file = mapFile(id)
  if (!existsSync(file)) return null
  return parseSpiderMap(JSON.parse(readFileSync(file, "utf8")))
}

export const saveMap = (map: ChatMap): void => {
  ensureDirs()
  writeFileSync(mapFile(map.id), JSON.stringify(map, null, 2))
}

export const deleteMapFile = async (id: string): Promise<boolean> => {
  const file = mapFile(id)
  if (!existsSync(file)) return false
  await Bun.file(file).delete()
  return !existsSync(file)
}

export interface ImportReport {
  readonly imported: readonly string[]
  readonly failed: readonly {
    readonly file: string
    readonly reason: string
  }[]
}

export const importSpiderMaps = (sourceDir: string): ImportReport => {
  const imported: string[] = []
  const failed: Array<{ file: string; reason: string }> = []
  let files: string[] = []
  try {
    files = readdirSync(sourceDir).filter((f) => f.endsWith(".json"))
  } catch (e) {
    return { imported, failed: [{ file: sourceDir, reason: String(e) }] }
  }
  for (const f of files) {
    try {
      const map = parseSpiderMap(JSON.parse(readFileSync(join(sourceDir, f), "utf8")))
      saveMap(map)
      imported.push(map.title)
    } catch (e) {
      failed.push({
        file: f,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return { imported, failed }
}
