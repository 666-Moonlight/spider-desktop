# M4 阻塞与实测记录

本文件记录 M4 计划中两项**在本机无法完成**的工作，以及支撑结论的实测命令与输出。
不是"还没做"，是"这台机器上做不到"——换环境后可直接按此清单复核。

复核日期：2026-10-22，主机 win32 x64（Intel Ultra 5 125H）。

## 1. Tauri v2 桌面壳：运行时阻塞（2026-10-22 修正）

M4 原计划"Tauri v2 桌面壳（本机 Rust 1.94 已具备）"。当日实测后修正结论：**构建链路可用，运行时缺失 WebView2**。

| 检查          | 命令                                                                                                   | 实测结果                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Rust 版本     | `C:\Users\10331\.cargo\bin\rustc.exe --version`                                                        | `rustc 1.94.1 (e408947bf 2026-03-25)` 通过                                                                     |
| 宿主三元组    | `rustc -vV`                                                                                            | `host: x86_64-pc-windows-msvc`                                                                                 |
| 链接器        | `where link.exe`；另做最小 crate 实测 `cargo build`                                                    | `where` 未找到 link.exe，但 **最小工程 `cargo build` exit 0（2026-10-22）** → rustc 自带链接器可用，构建不受阻 |
| Visual Studio | `ls "C:\Program Files\Microsoft Visual Studio"`、`vswhere.exe`                                         | 目录不存在，vswhere 不存在                                                                                     |
| WebView2      | 注册表 `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` | `ERROR: The system was unable to find the specified registry key or value`；`EdgeWebView` 目录也不存在         |

结论：最小 cargo 工程能编能链（早先"缺 link.exe 无法构建"的判断被实测证伪）；真正的阻塞是 **WebView2 运行时缺失**——Tauri 窗口应用运行时依赖 WebView2。装上 Evergreen Runtime 后即可尝试 `cargo tauri build`；完整 Tauri 工程（crates.io 拉包、WebView2 loader、打包器）尚未在本机验证，属于待办而非硬阻塞。

## 2. 本地向量嵌入：阻塞

M4 原计划"本地向量嵌入"。当前检索是纯词法（`src/domain/similarity.ts`，CJK 二元组 + Dice 系数），
升级为向量检索需要 embeddings 端点，而本机唯一的模型服务 agy 桥不提供。

| 检查         | 命令                                                                                  | 实测结果        |
| ------------ | ------------------------------------------------------------------------------------- | --------------- |
| agy 桥可达性 | `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:8000/v1/models` | `000`（未监听） |
| 根路径       | `curl ... http://127.0.0.1:8000/`                                                     | `000`           |
| 嵌入端点     | `curl -X POST ... http://127.0.0.1:8000/v1/embeddings`                                | `000`           |

结论：agy 桥本轮未启动，且即使启动也不实现 `/v1/embeddings`（后端是 CLI agent 接口，不是 chat/embeddings 服务）。
解阻路径：接一个真 OpenAI 兼容端点（支持 embeddings），在设置里换 `apiBaseUrl`；
或本地跑 Ollama（`nomic-embed-text`）后同样通过设置接入。`similarity.ts` 的接口已按"可替换打分器"设计，
换 embeddings 只需替换打分实现，不必动调用方。

## 3. 本轮已完成（原 M4/已知限制中的可做部分）

- Markdown 完整渲染：`src/domain/markdown.ts`（纯解析器）+ `src/ui/Markdown.tsx`，覆盖标题 h1-h3、
  有序/无序列表、链接（新窗口 + `rel="noopener noreferrer"` + scheme 白名单）、引用块、删除线、
  斜体；围栏码块保持原样不解析行内。
- 工具调用可视化：`src/domain/toolNodes.ts` + `src/ui/ToolNode.tsx`，激活节点的最后一条带
  `toolTrace` 的 assistant 消息在画布上以虚线只读节点呈现（`tool:` 前缀、不可选中/拖动/删除）。
  展示节点**不写入 ChatMap**，因此不触及 `importer.ts` 的数据往返不变量。
- 缺陷修正：`context-log.jsonl` / `mcp-log.jsonl` 现在遵守 `SPIDER_DATA_DIR`（此前硬编码仓库 `data/`）；
  `deleteMapFile` 改为 `async` 并在删除后复核 `existsSync`，重复删除返回 `ok: false`。
