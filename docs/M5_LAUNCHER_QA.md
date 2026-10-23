# Ultrawork Notepad — 一键启动 bat 显示成功但浏览器页面无法访问

Started: 2026-10-22T09:31:50.107Z

## Plan (exhaustively detailed)
1. Read 启动Spider.bat / 启动Spider(静默无黑框).vbs / tools/start.ps1 / src/server/index.ts  [DONE]
2. Prove root cause under Explorer-like env (no bun on registry PATH)  [DONE]
3. Rewrite tools/start.ps1: resolve bun from candidates (PATH, ~/.bun/bin, LOCALAPPDATA, .omo bundled-bun glob, SPIDER_BUN override), launch server with log redirect, poll port+HTTP until ready (<=30s), only then open browser, honest failure with exit 1.
4. Rewrite 启动Spider.bat: %~dp0 relative, ASCII, pause on failure.
5. Rewrite VBS: delegate to start.ps1 hidden, MsgBox on failure.
6. QA scenario 1 (happy): run bat with Explorer-like PATH (bun absent) -> exit 0, log "已就绪", GET the opened URL -> 200.
7. QA scenario 2 (edge): SPIDER_BUN=nonexistent -> exit 1, clear error, no browser, no "成功" line.
8. Cleanup: kill server pid, remove temp paths, record receipts.

## Success criteria + QA scenarios
LIGHT tier: one-spot launcher bugfix, no new module/schema/auth.
- C1 happy: `cmd /c "启动Spider.bat"` with PATH = Machine;User registry PATH only (no bun) -> console shows ready + exit 0; `curl -i http://127.0.0.1:4319/` -> 200 + index.html body.
- C2 edge: same but SPIDER_BUN=C:\nope\bun.exe -> exit 1, error line, no success line, no listener afterwards.
- C3 regression: 停止Spider.bat still stops the service (port closed).

## Now
step 3: rewrite tools/start.ps1

## Todo
- rewrite start.ps1
- rewrite bat
- rewrite vbs
- QA C1
- QA C2
- QA C3
- cleanup

## Findings
- 启动Spider.bat (97B, ASCII) -> powershell -File D:\ai\spider-new\tools\start.ps1
- start.ps1: $ErrorActionPreference='SilentlyContinue'; Start-Process -FilePath "bun" ... -WindowStyle Hidden; Start-Sleep -Seconds 1; Start-Process "http://127.0.0.1:4319/"; prints "已成功启动" unconditionally.
- PROVEN: bun is NOT on user/machine registry PATH (HKCU Path no bun; machine Path no bun). Only bun.cmd shim at C:\Users\10331\.omo\agent\bundled-bun\389d339fe0d53ae2\bun.cmd (wraps omo.exe with BUN_BE_BUN=1). No bun.exe found on disk (depth-4 search of USERPROFILE, Program Files, LOCALAPPDATA, D:\).
- PROVEN: under Explorer-like PATH, Start-Process -FilePath 'bun' throws "The system cannot find the file specified."; with ErrorActionPreference=SilentlyContinue the script continues, prints success, opens browser -> ERR_CONNECTION_REFUSED. Root cause.
- PROVEN: shim works with stripped env: PATH=shim;machine;user, no OMO_* vars -> bun --version = 1.4.3.
- start.ps1 also races: fixed 1s sleep; cold bun start with dist build can exceed it.
- Server: Bun.serve port 4319 (SPIDER_PORT), serves ./dist relative to cwd; needs WorkingDirectory = repo root.

## Learnings
- Start-Process on a .cmd with -RedirectStandardOutput fails (needs cmd.exe /c wrapper).


## Execution log (append-only)
[2026-10-22T09:45:08.350Z] C1 PASS — cold start via 启动Spider.bat under Explorer-equivalent PATH (registry User+Machine PATH, no bun), exit 0, 4.1s, console shows "[4/4] 服务已就绪"; fetch http://127.0.0.1:4319/ -> 200, title "Spider 独立版"; browser tab title "Spider 独立版 - Google Chrome"; server.log = "Spider standalone: http://127.0.0.1:4319".
[2026-10-22T09:45:08.350Z] C2 PASS — SPIDER_BUN=C:\definitely\not\here\bun.exe -> exit 1, "[失败] SPIDER_BUN 指向的文件不存在", no "已成功启动", bat prints "Spider failed to start", no listener after.
[2026-10-22T09:45:08.350Z] C2b PASS — after fixing stale-log echo, early failure no longer prints a previous run's log ($script:LogOwned).
[2026-10-22T09:45:08.350Z] C3 PASS — 停止Spider.bat -> "Spider 服务 (端口 4319) 已成功停止！", port CLOSED, 0 server processes.
[2026-10-22T09:45:08.350Z] C4 PASS — first-run path (dist moved away): [2/4] build via vite (267 modules), dist rebuilt, then served 200.
[2026-10-22T09:45:08.350Z] VBS success PASS — cscript 启动Spider(静默无黑框).vbs exits 0 silently with service already up.
[2026-10-22T09:45:08.350Z] VBS failure PASS — bogus SPIDER_BUN -> modal dialog titled "Spider", cscript blocked, port CLOSED; dialog+cscript cleaned up.
[2026-10-22T09:45:08.350Z] Performance fix — Get-NetTCPConnection costs ~4.3s per call and IWR ~2s; readiness loop now uses TcpClient (400ms) then one IWR; cold start 6.5s -> 4.1s.
[2026-10-22T09:45:08.350Z] Regression tests — tests/launcher.test.ts (3 cases) green; mutation (readiness loop replaced by Start-Sleep 1 + $ready=$true) makes case 1 FAIL, so the test can fail for the named regression. Restored file byte-identical, BOM restored, PARSE_OK.
[2026-10-22T09:45:08.350Z] Suite — bun test 54 pass / 0 fail; tsc --noEmit exit 0; biome lint exit 0 (57 files).
[2026-10-22T09:45:08.350Z] Test-order dependency found — launcher sandbox tests must not race the real 4319; each sandbox uses its own port (4391/4392/4393) and stopPort() in finally.
[2026-10-22T09:45:08.350Z] Cleanup receipt — 停止Spider.bat: port 4319 CLOSED, 0 omo server procs, cscript GONE, browser dialog closed.
[2026-10-22T09:45:08.350Z] Learnings — writing start.ps1 with Bun.write() strips the UTF-8 BOM; PowerShell 5.1 then misparses Chinese comments. Always re-add "\uFEFF" after programmatic edits and re-run the parser check.

[2026-10-22T09:47:16.459Z] Test hygiene fix — launcher tests now dispose() their sandbox (rm -rf); TEMP spider-launcher-* dirs before/after = 0/0.
[2026-10-22T09:47:16.459Z] Docs — README 增加「一键启动（Windows）」小节，说明 bun 定位/就绪轮询/失败行为/SPIDER_BUN|SPIDER_NO_BROWSER|SPIDER_READY_TIMEOUT。
[2026-10-22T09:47:16.459Z] Final gate — bun test 54 pass/0 fail; tsc --noEmit exit 0; biome check src tests exit 0 (57 files).

[2026-10-22T09:48:25.180Z] Encoding fix — start-server.cmd is written with -Encoding Default (ANSI) so a non-ASCII project path survives; re-ran C1 (200) + C3 (CLOSED) after the change.
[2026-10-22T09:48:25.180Z] FINAL TEARDOWN RECEIPT — port 4319 CLOSED, omo server procs 0, cscript GONE, TEMP sandboxes 0, run root LEFTOVER.
[2026-10-22T09:48:25.180Z] FINAL GATE — bun test 54 pass/0 fail; tsc --noEmit exit 0; biome check src tests exit 0.

[2026-10-22T09:50:34.478Z] Identity guard — readiness now also requires the page body to match 'Spider', so a foreign process squatting on 4319 can't fake readiness. Sandbox fixture updated to "<title>Spider sandbox</title>".
[2026-10-22T09:50:34.478Z] FINAL E2E (real double-click surface, real browser) — 启动Spider.bat cold under Explorer PATH: exit 0, "[4/4] 服务已就绪: http://127.0.0.1:4319/", fetch 200 title "Spider 独立版", Chrome tab "Spider 独立版 - Google Chrome", server.log "Spider standalone: http://127.0.0.1:4319".
[2026-10-22T09:50:34.478Z] Desktop shortcut check — "Spider 独立版.lnk" -> D:\ai\spider-new\启动Spider.bat (wd D:\ai\spider-new); no shortcut edit needed, fix lives in the target.
[2026-10-22T09:50:34.478Z] Destination port guard — 停止Spider.bat: port CLOSED, 0 server procs, TEMP sandboxes 0.
[2026-10-22T09:50:34.478Z] FINAL GATE — bun test 54 pass / 0 fail; bun run lint exit 0; bun run typecheck exit 0.
