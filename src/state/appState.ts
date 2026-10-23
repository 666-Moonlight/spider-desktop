import type { Direction } from "../domain/graphOps"
import type { NavKey } from "../domain/nav"
import type { ChatMap, ToolTraceEntry } from "../domain/types"
import type { ImportReportDto, MapMetaDto, SettingsDto, SimilarNodeDto } from "./api"

export interface AppState {
  maps: readonly MapMetaDto[]
  current: ChatMap | null
  activeNodeId: string | null
  settings: SettingsDto | null
  settingsOpen: boolean
  mergeSourceId: string | null
  streamText: string | null
  sending: boolean
  summarizing: boolean
  error: string | null
  toast: string | null
  collapsedIds: readonly string[]
  toolTrace: readonly ToolTraceEntry[]
  similar: readonly SimilarNodeDto[]
  similarOpen: boolean
  refreshMaps: () => Promise<void>
  openMap: (id: string) => Promise<void>
  newMap: () => Promise<void>
  renameMap: (id: string, title: string) => Promise<void>
  removeMap: (id: string) => Promise<void>
  importFrom: (source: string) => Promise<ImportReportDto>
  setActive: (id: string) => void
  createChild: (direction: Direction, anchorText?: string) => void
  addRoot: () => void
  deleteActive: () => void
  beginMerge: (id: string) => void
  applyLayout: () => void
  moveNode: (id: string, position: { x: number; y: number }) => void
  send: (text: string) => Promise<void>
  navKey: (key: NavKey) => void
  openSettings: () => void
  closeSettings: () => void
  saveSettings: (next: SettingsDto) => Promise<void>
  clearError: () => void
  setToast: (msg: string | null) => void
  toggleCollapse: (id: string) => void
  updateNote: (id: string, note: string) => void
  appendToNote: (id: string, text: string) => void
  summarizeActive: () => Promise<void>
  loadSimilar: () => Promise<void>
  closeSimilar: () => void
  addReference: (candidate: {
    mapId: string
    nodeId: string
    title: string
    excerpt: string
  }) => void
  removeReference: (nodeId: string) => void
  retry: () => Promise<void>
  exportCurrent: () => Promise<void>
}

export const INITIAL_STATE = {
  maps: [],
  current: null,
  activeNodeId: null,
  settings: null,
  settingsOpen: false,
  mergeSourceId: null,
  streamText: null,
  sending: false,
  summarizing: false,
  error: null,
  toast: null,
  collapsedIds: [],
  toolTrace: [],
  similar: [],
  similarOpen: false,
} as const
