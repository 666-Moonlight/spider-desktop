import {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Direction } from "../domain/graphOps"
import { ancestorIds, visibleNodeIds } from "../domain/graphTraverse"
import type { NavKey } from "../domain/nav"
import { toolShowNodes } from "../domain/toolNodes"
import { useStore } from "../state/store"
import { NodeCard, type NodeCardData, type SpiderFlowNode } from "./NodeCard"
import { type ToolFlowNode, ToolNode } from "./ToolNode"

const EMPTY_POSITIONS: Readonly<Record<string, XYPosition>> = {}
const ZERO_DELTA: XYPosition = { x: 0, y: 0 }

const nodeTypes = { spider: NodeCard, tool: ToolNode }
const DISPLAY_ONLY = new Set(["tool"])

const mapNodesHas = (map: Parameters<typeof visibleNodeIds>[0], id: string): boolean =>
  map.nodes[id] !== undefined

const handlesFor = (
  source: { x: number; y: number },
  target: { x: number; y: number },
): { readonly sourceHandle: string; readonly targetHandle: string } => {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "s-right", targetHandle: "t-left" }
      : { sourceHandle: "s-left", targetHandle: "t-right" }
  }
  return dy >= 0
    ? { sourceHandle: "s-bottom", targetHandle: "t-top" }
    : { sourceHandle: "s-top", targetHandle: "t-bottom" }
}

const CanvasInner = () => {
  const current = useStore((s) => s.current)
  const activeNodeId = useStore((s) => s.activeNodeId)
  const mergeSourceId = useStore((s) => s.mergeSourceId)
  const collapsedIds = useStore((s) => s.collapsedIds)
  const toggleCollapse = useStore((s) => s.toggleCollapse)
  const setActive = useStore((s) => s.setActive)
  const createChild = useStore((s) => s.createChild)
  const deleteActive = useStore((s) => s.deleteActive)
  const moveNode = useStore((s) => s.moveNode)
  const navKey = useStore((s) => s.navKey)
  const beginMerge = useStore((s) => s.beginMerge)

  // Live drag overlay: React Flow is a controlled component here, so a drag only reports
  // `position` changes through onNodesChange. Mirror them locally so the node tracks the
  // pointer frame by frame; the store is committed once, on drag stop.
  // Positions are tagged with the map they belong to, so switching maps drops them for free.
  const currentId = current?.id ?? null
  const [live, setLive] = useState<{
    readonly mapId: string | null
    readonly positions: Readonly<Record<string, XYPosition>>
  }>({ mapId: null, positions: EMPTY_POSITIONS })
  const livePositions = live.mapId === currentId ? live.positions : EMPTY_POSITIONS

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let next: Record<string, XYPosition> | null = null
      let ended = false
      for (const change of changes) {
        if (change.type !== "position") continue
        if (change.dragging === false) {
          // the drag finished (or was aborted) without a stop callback: drop the overlay
          ended = true
          continue
        }
        if (change.dragging !== true || change.position === undefined) continue
        next = next ?? {}
        next[change.id] = change.position
      }
      if (ended) {
        setLive({ mapId: currentId, positions: EMPTY_POSITIONS })
        return
      }
      if (next === null) return
      const patch = next
      setLive((prev) =>
        prev.mapId === currentId
          ? { mapId: currentId, positions: { ...prev.positions, ...patch } }
          : { mapId: currentId, positions: patch },
      )
    },
    [currentId],
  )

  const livePositionOf = useCallback(
    (id: string, base: { readonly x: number; readonly y: number }): XYPosition =>
      livePositions[id] ?? { x: base.x, y: base.y },
    [livePositions],
  )

  // Shift a derived (display-only) node by however far its source node has been dragged.
  const dragDeltaOf = useCallback(
    (id: string, base: { readonly x: number; readonly y: number }): XYPosition => {
      const live = livePositions[id]
      if (live === undefined) return ZERO_DELTA
      return { x: live.x - base.x, y: live.y - base.y }
    },
    [livePositions],
  )

  const visible = useMemo(
    () => (current === null ? new Set<string>() : visibleNodeIds(current, new Set(collapsedIds))),
    [current, collapsedIds],
  )
  const pathSet = useMemo(() => {
    const set = new Set<string>()
    if (current !== null && activeNodeId !== null) {
      for (const id of ancestorIds(current, activeNodeId as never)) {
        set.add(id)
      }
    }
    return set
  }, [current, activeNodeId])

  // Card data is memoised apart from positions: a live drag only changes `position`, so the
  // memoised NodeCard instances of every other node keep their referential identity and skip
  // re-rendering while one node follows the pointer.
  const nodeCards = useMemo(() => {
    const out = new Map<string, { readonly data: NodeCardData; readonly position: XYPosition }>()
    if (current === null) return out
    const collapsed = new Set(collapsedIds)
    for (const node of Object.values(current.nodes)) {
      if (!visible.has(node.id)) continue
      out.set(node.id, {
        position: node.position,
        data: {
          node,
          isActive: node.id === activeNodeId,
          onPath: pathSet.has(node.id),
          mergeSource: node.id === mergeSourceId,
          isCollapsed: collapsed.has(node.id),
          childCount: node.children.filter((cc) => mapNodesHas(current, cc)).length,
          onToggleCollapse: () => toggleCollapse(node.id),
          onSpawn: (d: Direction) => createChild(d),
          onMerge: () => beginMerge(node.id),
        },
      })
    }
    return out
  }, [
    current,
    activeNodeId,
    pathSet,
    mergeSourceId,
    visible,
    createChild,
    beginMerge,
    toggleCollapse,
    collapsedIds,
  ])

  const nodes = useMemo<SpiderFlowNode[]>(() => {
    const out: SpiderFlowNode[] = []
    for (const [id, card] of nodeCards) {
      out.push({
        id,
        type: "spider",
        position: livePositionOf(id, card.position),
        data: card.data,
      })
    }
    return out
  }, [nodeCards, livePositionOf])

  const toolNodes = useMemo<ToolFlowNode[]>(() => {
    if (current === null) return []
    const shown = toolShowNodes(Object.values(current.nodes), activeNodeId)
    const out: ToolFlowNode[] = []
    for (const show of shown) {
      if (!visible.has(show.sourceNodeId)) continue
      const source = current.nodes[show.sourceNodeId]
      const delta =
        source === undefined ? ZERO_DELTA : dragDeltaOf(show.sourceNodeId, source.position)
      out.push({
        id: show.id,
        type: "tool",
        position: {
          x: show.position.x + delta.x,
          y: show.position.y + delta.y,
        },
        data: { show },
        selectable: false,
        draggable: false,
        deletable: false,
      })
    }
    return out
  }, [current, activeNodeId, visible, dragDeltaOf])

  const allNodes = useMemo(() => [...nodes, ...toolNodes], [nodes, toolNodes])

  const toolEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    for (const tn of toolNodes) {
      const show = tn.data?.show
      if (show === undefined) continue
      out.push({
        id: `edge:${tn.id}`,
        source: show.sourceNodeId,
        target: tn.id,
        sourceHandle: "s-right",
        targetHandle: "t-left",
        className: "edge-tool",
      })
    }
    return out
  }, [toolNodes])

  const edges = useMemo<Edge[]>(() => {
    if (current === null) return []
    const out: Edge[] = []
    for (const e of current.edges) {
      if (!visible.has(e.from) || !visible.has(e.to)) continue
      const from = current.nodes[e.from]?.position
      const to = current.nodes[e.to]?.position
      if (from === undefined || to === undefined) continue
      const s = livePositionOf(e.from, from)
      const t = livePositionOf(e.to, to)
      const onPath = pathSet.has(e.from) && (pathSet.has(e.to) || e.to === activeNodeId)
      out.push({
        id: e.id,
        source: e.from,
        target: e.to,
        ...handlesFor(s, t),
        ...(onPath ? { className: "edge-on-path" } : {}),
      })
    }
    return [...out, ...toolEdges]
  }, [current, visible, pathSet, activeNodeId, toolEdges, livePositionOf])

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".canvas-focus")
    el?.focus()
  }, [])

  const onNodeClick: NodeMouseHandler = (_e, node) => setActive(node.id)

  return (
    <div
      className="canvas-focus"
      role="application"
      aria-label="图谱画布：方向键导航，Tab 建分支，Alt+方向键定向建分支，Delete 删除"
      onKeyDown={(e) => {
        if (current === null) return
        const dirs: Record<string, Direction> = {
          ArrowLeft: "left",
          ArrowRight: "right",
          ArrowUp: "top",
          ArrowDown: "bottom",
        }
        const dir = dirs[e.key]
        if (e.key === "Tab") {
          e.preventDefault()
          createChild(e.shiftKey ? "left" : "right")
        } else if (e.altKey && dir !== undefined) {
          e.preventDefault()
          createChild(dir)
        } else if (dir !== undefined) {
          e.preventDefault()
          // navKey keys off the arrow key name ("ArrowRight"), not the Direction ("right").
          navKey(e.key as NavKey)
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault()
          deleteActive()
        }
      }}
    >
      <ReactFlow
        nodes={allNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_e, node) => {
          setLive({ mapId: currentId, positions: EMPTY_POSITIONS })
          if (DISPLAY_ONLY.has(node.type ?? "")) return
          const before = current?.nodes[node.id]?.position
          if (
            before !== undefined &&
            before.x === node.position.x &&
            before.y === node.position.y
          ) {
            return
          }
          moveNode(node.id, node.position)
        }}
        minZoom={0.15}
        nodeDragThreshold={0}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={28} size={1.4} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

const GraphCanvasInner = () => {
  const { fitView } = useReactFlow()
  const mapId = useStore((s) => s.current?.id ?? null)
  useEffect(() => {
    if (mapId === null) return
    const id = window.setTimeout(() => {
      void fitView({
        padding: 0.18,
        minZoom: 0.55,
        maxZoom: 1,
        duration: 220,
      })
    }, 60)
    return () => window.clearTimeout(id)
  }, [mapId, fitView])
  return <CanvasInner />
}

export const GraphCanvas = () => (
  <ReactFlowProvider>
    <GraphCanvasInner />
  </ReactFlowProvider>
)

export type { Node }
