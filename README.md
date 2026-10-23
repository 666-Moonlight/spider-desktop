# Spider 独立版

Local-first 独立应用：把 Obsidian 插件 [Spider](https://github.com/111pointer111/spider)
的分支对话画布搬到桌面/浏览器壳里，保留二开的全部能力（多根森林、四向发散、双向平衡布局、
视线锥导航、汇聚节点 DAG）。

> **来源与许可**：上游 Spider 插件为 MIT 许可（作者 huangtao）。本项目同样是 MIT，
> 保留上游版权声明；哪些内容源自上游、哪些是新写的，见 [NOTICE](NOTICE)。

## 运行

```bash
bun install
bun run build          # 前端产物 -> dist/
bun run src/server/index.ts   # http://127.0.0.1:4319
```

默认数据目录 `data/`（可用 `SPIDER_DATA_DIR` 覆盖），端口 `4319`（`SPIDER_PORT`）。

### 一键启动（Windows）

双击仓库根目录的 `启动Spider.bat`（或静默版 `启动Spider(静默无黑框).vbs`），停止用 `停止Spider.bat`。

启动脚本 `tools/start.ps1` 现在会：

1. 显式定位 bun（PATH、~/.bun/bin、winget 安装目录、omo 自带运行时），找不到就报错停下，而不是假装启动成功；
2. 需要时先构建 dist/；
3. 后台起服务并把 stdout/stderr 落到 `data/logs/server.log`；
4. **轮询到服务真的返回 HTTP 才打开浏览器**，超时则打印 `[失败]` + 日志尾部并以 exit 1 结束。

可调环境变量：`SPIDER_BUN`（指定 bun 可执行文件，设了就优先用它）、`SPIDER_NO_BROWSER=1`（只起服务不开浏览器）、`SPIDER_READY_TIMEOUT`（就绪等待秒数，默认 40）。

## 桌面应用（Tauri 原生壳）

把前端与后端一起打成一个独立 Windows 程序，双击即用、不依赖浏览器、不依赖全局 bun。

`tools/start.ps1` 那条浏览器路线仍然保留；桌面壳是另一条互不干扰的入口。

结构：

1. `bun build --compile` 把 `src/server/index.ts` 编译成 sidecar 可执行文件 `spider-server-x86_64-pc-windows-msvc.exe`；
2. Tauri 主进程启动时 spawn 该 sidecar，用环境变量把资源目录与用户数据目录传进去（`SPIDER_STATIC_DIR` / `SPIDER_DATA_DIR`）；
3. Rust 侧轮询 127.0.0.1:4319 直到端口就绪，才创建窗口加载页面（不会出现白屏或“无法访问”）；
4. 窗口关闭时 Tauri 退出事件里 kill sidecar，端口不残留。

构建：

```bash
bun run sidecar     # 编译后端 sidecar -> src-tauri/binaries/
bun run build       # 编译前端 -> dist/
bun run app:build   # 上面两步 + tauri build，产出安装包与 exe
```

产物位置：`src-tauri/target/release/`（exe）与 `src-tauri/target/release/bundle/nsis/`（安装包）。

数据目录：`%APPDATA%\\com.spider.standalone\\data`（首次启动时从内置 `settings.json` 播种）。
## 导入 Obsidian 里的旧图谱

侧栏「导入」需要一个目录路径（默认填的是 Obsidian 仓库里 `.obsidian` 同级习惯的
`<仓库>/.spider/maps`），也可以改成任意目录。
导入是幂等的：同一份 .spider JSON 会按原 id 覆盖写入。

## 设置

右上「设置」→ API Base URL / Key / 模型。任意 OpenAI 兼容端点都能用（本地 Ollama、
各家云 API、或自建网关均可）。字段说明见 [`settings.example.json`](settings.example.json)：

```json
{ "apiBaseUrl": "http://127.0.0.1:8000/v1", "apiKey": "your-api-key", "model": "your-model-name" }
```

设置保存在数据目录的 `settings.json`（默认 `data/`，可用 `SPIDER_DATA_DIR` 覆盖）。

## 已实现（M1）

- 多根森林：`+ 根节点`，独立根自动纵向排布；删主根自动交接
- 四向分支：卡片四边 `+` 手柄、`Tab` 右 / `Shift+Tab` 左 / `Alt+方向键` 任意向
- 双向平衡布局：一阶左子树 RL、右子树 LR，多连通分量纵向堆叠
- 视线锥导航：方向键按方向锥 + 距离评分跳转，无匹配降级层级导航
- 汇聚节点：卡片「汇」两次点击合成多父节点；引用计数删除保护
- 对话：SSE 流式、选中文字拉分支、AI 自动起标题、历史持久化
- 导入/导出数据模型与 `.spider/maps` 兼容（父指针为唯一事实源重建子边）
- 明暗双主题（Anthropic 暖纸/陶土 token，见 `DESIGN.md`）

## 已实现（M2）

- **上下文引擎 v2**：祖先链真实对话进入上下文（近 3 层全文 + 更深层摘要压缩），汇聚节点聚合所有父分支；
  聊天面板「上下文」按钮可预览模型将看到的确切内容（含字符数与分段来源）
- **教学风格**：循序渐进 / 启发提问（苏格拉底）/ 简明要点 / 自定义系统提示词（移植自原版）
- **节点随记**：随记编辑（自动保存）、选中回答文字「存为随记」
- **手动总结**：一键生成节点摘要（写入数据，供上下文深层压缩与导出 brief 使用）
- **折叠/展开**子树、**重试**重新生成最后回复
- **导出包**：index.md / brief.md / notes.md / nodes/*.md / map.canvas / map.svg / map.json
  （输出到 `data/exports/<图谱名>/`，可用 `SPIDER_EXPORT_DIR` 覆盖）

## 已实现（M3）

- **工具调用回路**：OpenAI tools 协议 + 服务端多轮执行（上限 4 轮）。内置工具：`search_notes`（图谱内检索）、`get_node`（读节点）、`list_maps`（跨图列表）、`append_note`（写随记）
- **MCP stdio 客户端**：设置里按「名称|命令|参数」注册 MCP server；工具自动命名 `mcp__<server>__<tool>`，随请求起停、20s 超时、进程清理
- **工具轨迹**：SSE 事件 `tool_call`/`tool_result`；回答气泡内可折叠展开每次调用的参数与结果，并随消息持久化
- **跨图引用**：＠引用按钮搜索全库节点，选中后以 chip 形式挂到节点；发送时注入「跨图引用」系统块，上下文预览同步显示
- **相似节点**：本地词法相似度（CJK 二元组 + 拉丁词，Dice 系数），面板列出跨图相似节点并支持跳转
- 调试工具：`tools/mock-provider.ts`（OpenAI 兼容 mock）与 `tools/mock-mcp-server.ts`（MCP echo server）

## 已实现（M4）

- **Markdown 完整渲染**：标题 h1-h3、有序/无序列表、链接（新窗口 + `rel="noopener noreferrer"` + scheme 白名单，挡掉 `javascript:`/`data:`）、引用块、删除线、斜体；围栏码块原样保留
- **工具调用可视化**：激活节点的工具轨迹在画布上渲染为只读虚线节点（随消息存在，不进 ChatMap）
- **SPIDER_DATA_DIR 一致性**：`context-log.jsonl` / `mcp-log.jsonl` 也遵循该变量（此前固定写仓库 `data/`）
- **删除更稳**：`DELETE /api/maps/:id` 等文件真正删除后返回，重复删除返回 `ok: false`
- **工具轨迹持久化修复**：`importer.ts` 的消息 schema 此前缺失 `toolTrace` 字段，轨迹在每次保存/读取时被 zod 静默剥掉（M3 遗留缺陷）；已补 schema + 拷贝逻辑并加回归测试

## 已实现（M5 / M6）

- **一键启动更可靠**：`tools/start.ps1` 定位 bun → 需要时构建 → 后台起服务 → 轮询到真的能返回 HTTP 才开浏览器，失败回显日志尾部并以 exit 1 结束
- **Tauri 桌面壳**：`spawn sidecar → 等端口就绪 → 建窗`，退出时回收 sidecar，端口不残留；NSIS 安装包实测可装
- **拖动跟手**：画布节点拖动实时跟随指针（受控组件补 `onNodesChange` 本地覆盖层，松手才落库），连线与派生的工具节点同步移动
- **聊天不再丢消息**：`/api/chat` 请求体携带正文，避免前端防抖保存导致模型看不到刚输入的问题

## 已知限制

- **首字延迟取决于上游**：走 CLI agent 类网关（如 agy 桥）时首个 token 可能要 30-95 秒，界面会显示「正在生成…」
- **本地向量嵌入未做**：相似节点目前是本地词法相似度（CJK 二元组 + 拉丁词，Dice 系数），没有调 `/v1/embeddings`；接支持 embeddings 的端点后可替换 `src/domain/similarity.ts` 的打分器
- **桌面版目前只构建了 Windows**：Tauri 壳的 Windows 产物与安装包已验证；macOS/Linux 未测
