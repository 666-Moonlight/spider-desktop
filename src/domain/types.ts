import type { EdgeId, MapId, NodeId } from "./ids"

export type Role = "user" | "assistant" | "system"

export interface ToolTraceEntry {
  readonly kind: "call" | "result"
  readonly name: string
  readonly args?: string
  readonly result?: string
  readonly ok?: boolean
}

export interface ChatMessage {
  readonly id: string
  readonly role: Role
  readonly content: string
  readonly createdAt: string
  readonly toolTrace?: readonly ToolTraceEntry[]
}

export interface NodeReference {
  readonly mapId: string
  readonly nodeId: string
  readonly title: string
  readonly excerpt: string
}

export type NodeStatus = "active" | "understood" | "archived"

export interface Position {
  readonly x: number
  readonly y: number
}

export interface ChatNode {
  readonly id: NodeId
  readonly title: string
  readonly parentId?: NodeId
  readonly parentIds?: readonly NodeId[]
  readonly children: readonly NodeId[]
  readonly messages: readonly ChatMessage[]
  readonly status: NodeStatus
  readonly position: Position
  readonly anchorText?: string
  readonly summary?: string
  readonly note?: string
  readonly references?: readonly NodeReference[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface GraphEdge {
  readonly id: EdgeId
  readonly from: NodeId
  readonly to: NodeId
}

export interface ChatMap {
  readonly id: MapId
  readonly title: string
  readonly rootNodeId?: NodeId
  readonly nodes: Readonly<Record<string, ChatNode>>
  readonly edges: readonly GraphEdge[]
  readonly updatedAt: string
}

/** API wire message (what leaves the process). */
export interface ApiMessage {
  readonly role: Role
  readonly content: string
}

export type WritableNode = { -readonly [K in keyof ChatNode]: ChatNode[K] }
export type WritableMap = { -readonly [K in keyof ChatMap]: ChatMap[K] }

export const nowIso = (): string => new Date().toISOString()

export const assertNever = (x: never): never => {
  throw new Error(`unhandled variant: ${String(x)}`)
}
