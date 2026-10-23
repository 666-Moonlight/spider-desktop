declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type NodeId = Brand<string, "NodeId">
export type MapId = Brand<string, "MapId">
export type EdgeId = Brand<string, "EdgeId">

// Brand construction is the one sanctioned assertion site (boundary), per branded-type practice.
export const asNodeId = (raw: string): NodeId => raw as NodeId
export const asMapId = (raw: string): MapId => raw as MapId
export const asEdgeId = (raw: string): EdgeId => raw as EdgeId
export const edgeId = (from: NodeId, to: NodeId): EdgeId => `edge_${from}_${to}` as EdgeId
