# M3 QA evidence

| artifact | proves |
|---|---|
| qa-m3/01-tool-trace-collapsed.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/02-tool-trace-open.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/03-ref-search.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/04-ref-chip.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/05-ref-context.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/06-similar.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/07-ref-persisted.png | see docs/M3_ULW_NOTEPAD.md §QA |
| qa-m3/08-ref-context.png | see docs/M3_ULW_NOTEPAD.md §QA |

## API-level evidence
- Builtin tool loop: events = tool_call:search_notes → tool_result(ok) → final (see notepad)
- MCP stdio: events = tool_call:mcp__mock__echo → tool_result("echo: QA MCP 调用") → final; mcp-log.jsonl shows connected=["mock"], tools=["mcp__mock__echo"]
- Cross-graph reference: PUT map with references → persisted (refs=1) → /api/context parts include "跨图引用"; UI chip + preview verified
- Similar nodes: /api/similar returns 8 ranked nodes; UI panel lists them with scores

## Gates
tsc 0 · biome 0 · bun test 29/29 · vite build 0 · all src/tools files <= 250 pure LOC (styles.css is a pure stylesheet)

## Mock harness (shipped as debugging tools)
- `tools/mock-provider.ts` (port 4400): OpenAI-compatible; first round requests an MCP tool when available, else search_notes
- `tools/mock-mcp-server.ts`: MCP stdio server exposing `echo`
