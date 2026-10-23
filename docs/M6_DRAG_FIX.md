# Ultrawork Notepad — 节点拖动应实时跟随指针
Started: 2026-10-23T01:08:56.874Z

## Plan (exhaustively detailed)
1. [x] Discovery: locate drag wiring in src/ui/GraphCanvas.tsx
2. [x] Read @xyflow/react v12 internal pipeline (updateNodePositions -> triggerNodeChanges -> onNodesChange)
3. [ ] Confirm root cause by reproducing the teleport in a real browser (mid-drag position sampling)
4. [ ] Implement local live-node mirror + onNodesChange(applyNodeChanges), commit on drag stop
5. [ ] Make display-only tool nodes track their source node during drag
6. [ ] typecheck + biome + bun test
7. [ ] Browser QA: drag node in 3+ move steps, sample node transform before mouseup -> must track pointer
8. [ ] Cleanup: kill server, remove run tmp, record receipts

## Success criteria + QA scenarios
S1 (happy): During an active drag (mouse still down), the node's rendered transform follows the pointer, and edges move with it.
  Scenario: browser: open map -> mousedown on .react-flow__node-spider -> 4 x mouse.move(+120,+40) -> after each move read node's data-id transform x/y deltas -> PASS when delta matches pointer delta within 2px BEFORE any mouseup.
S2 (persistence/regression): After mouseup the position persists to the store and the saved map JSON (data/maps/*.json) matches the dropped position; reload shows it there.
  Scenario: mouseup -> read node transform -> wait for save -> read map JSON position -> PASS on equality; then page reload -> still same.
S3 (regression): selection/click, keyboard nav, spawn buttons still work; bun run typecheck + biome + bun test green.

## Now
Confirm root cause / set up QA harness

## Todo
- reproduce, fix, verify, clean

## Findings
- src/ui/GraphCanvas.tsx:203 passes only onNodeDragStop -> moveNode(); no onNodesChange / applyNodeChanges anywhere in repo.
- @xyflow/react 12.12.0: store.updateNodePositions() emits {type:'position',dragging:true} changes through triggerNodeChanges; with a controlled `nodes` prop (no defaultNodes) it ONLY calls props.onNodesChange (hasDefaultNodes false) and does not mutate nodeLookup => rendered node stays at stored position until props change (drag stop -> moveNode). Root cause of the teleport.
- Tool nodes are derived (src/domain/toolNodes.ts: position = source.position + (300,0)); they inherit the same staleness during drag.

## Learnings

### Repro (pre-fix, real browser via Bun.WebView + CDP)
- Serve dist on :4419 with SPIDER_DATA_DIR=<run-tmp>/data (isolated copy of map_mviasdq5_1).
- mousedown on [data-id=node_mviasdq5_0], 4 x mouseMoved (+40/+80/+120/+160), sampling .style.transform each step:
  all four samples = translate(380px, 0px) while className contains "dragging" -> NOTHING follows the pointer.
- mouseup at final point -> transform becomes translate(598.182px, 109.091px) => teleport on release. CONFIRMED.
- artifact: .ulw-drag-qa/01-repro-after-drop.png

### Root cause (file:line)
- src/ui/GraphCanvas.tsx:198-208 passes a controlled `nodes` prop but no `onNodesChange`; only onNodeDragStop -> moveNode().
- @xyflow/react store triggerNodeChanges (dist/esm/index.js:3550): hasDefaultNodes=false (controlled) => skips setNodes and only calls props.onNodesChange; undefined => drop.
- XYDrag.updateNodes calls updateNodePositions(dragItems,true) on every move (system/dist/esm/index.js:2209) => changes are produced, then discarded.
- Consequence: node transform only changes when zustand current.nodes changes (on drag stop).
- tool nodes are derived from source position (src/domain/toolNodes.ts) => also stale; edges derive from current.nodes => also stale mid-drag.

### Design verdict
Not intentional: it is missing controlled-flow wiring. Fix = live local overlay fed by onNodesChange(position/dragging) + commit to store on stop.

### Fix applied (src/ui/GraphCanvas.tsx)
1. `onNodesChange` added: position changes with `dragging:true` feed a local overlay (`livePositions`), so the wrapper transform updates every frame; a `dragging:false` change or onNodeDragStop clears the overlay. The overlay is keyed by map id so switching maps discards it without an effect.
2. `nodeCards` memo split from positions, so mid-drag only the dragged node's wrapper re-renders (NodeCard instances keep referential identity).
3. Derived display-only tool node follows via `dragDeltaOf` (keeps its +300px offset); edges compute handles from live positions.
4. `nodeDragThreshold={0}`: without it the drag only starts after d3's default 1px distance and, more importantly, the very first pointer-down sampling lag kept the node anchored to the press point until the second move event.
5. onNodeDragStop skips `moveNode` when the position is unchanged (a plain click no longer rewrites the map/save).
6. Fixed a pre-existing bug found while regression-testing keys: the canvas passed `Direction` ("right") cast to `NavKey` ("ArrowRight"), so cone navigation always returned null. Now `navKey(e.key as NavKey)`.

### Verification (post-fix, bundle index-C0c90-4K.js, port 4419)
S1 PASS - 4 pointer steps (+20/+50/+90/+130 px) each matched pointerDelta/zoom (0.55) exactly; mid-drag screenshot docs/qa/drag-live/01-mid-drag.png; per-step log in docs/qa/drag-live/qa-log.txt.
S1b PASS - tool node kept its 300px offset and edges re-anchored at each step (07-tool-follows-final.png).
S1c PASS - at zoom 0.792 flowDelta 50.5/101.01 vs expected 50.51/101.01 (12-zoom-drag.png).
S2 PASS - no jump on release (616.364,118.182 before == after); data/maps JSON stored {616.36,118.18}; after reload same transform (02-after-reload.png).
S3 PASS - typecheck exit 0; biome check src tests: 58 files clean; bun test 57 pass / 0 fail; click-select works and does not rewrite the map file; spawn -> 4->5 nodes; collapse/expand works; Delete 5->3; arrow nav now 新分支 -> 新图谱 -> 独立根问题 -> 新分支 -> 新图谱.

### Cleanup receipts
- WebView closed; server pid 5772 killed; fetch http://127.0.0.1:4419/ refused afterwards (port closed). No bun.exe orphan matching src/server/index.ts.
- Run dir D:/ai/spider-new/.ulw-drag-qa removed at task end (see below); evidence kept in docs/qa/drag-live/.
