# M4 阶段 1 完成报告（mass-ulw）

记录日期：2026-10-22
执行目标：完成 D:\ai\spider-new 的 M4 阶段 1 改进项，覆盖向量检索集成、UI 加固、地图重命名、Tauri 构建链路探测及严格门禁验证。

---

## 1. Lane A: 可选向量嵌入检索（Vector & Lexical Hybrid）

### 交付物与架构决策

- **配置扩展**：
  - `src/server/store.ts`：`settingsZ` 增加 `embeddingsModel`（字符串，默认为空）。
  - `src/state/api.ts`：`SettingsDto` 扩展 `embeddingsModel?: string`。
  - `src/ui/SettingsModal.tsx`：增加“向量嵌入模型（可选，留空使用词法相似度）”输入框及占位提示。
- **提供方调用**：
  - `src/server/provider.ts`：实现 `embeddings(texts)` 函数，调用 `POST {apiBaseUrl}/embeddings`，设 10 秒超时。若未配置模型或接口报错（如无此端点），优雅降级返回 `null`，不抛出异常阻断请求。
- **混合打分与回退**：
  - `src/domain/similarity.ts`：增加 `cosine(a, b)`（带分母非零保护与维度一致性校验）与通用 `rankByScore` 排序辅助器。
  - `src/server/routesGraph.ts`：`/api/similar` 接口重构为双模态——若配置了模型且嵌入成功，使用余弦相似度计算并返回 `mode: "vector"`；否则平滑回退到 CJK 二元组 Dice 系数词法检索，返回 `mode: "lexical"`。
- **测试支持与单测**：
  - `tools/mock-provider.ts`：实现确定性 8 维字符哈希向量端点 `POST /v1/embeddings`，供测试与本地 QA 使用。
  - `tests/embeddings.test.ts`：新增 6 个单测，覆盖余弦相似度正交、恒等、零向量、维度不匹配容错及打分降序排列。

### 实测证据

- HTTP 探针实测：
  1. `embeddingsModel` 留空时，POST `/api/similar` 返回 `{ mode: "lexical", nodes: [...] }`。
  2. 设置为 mock-embed 后，POST `/api/similar` 返回 `{ mode: "vector", nodes: [...] }`。

---

## 2. Lane B: UI 加固与图谱重命名

### 交付物与架构决策

- **React 错误边界**：
  - `src/ui/ErrorBoundary.tsx`：实现遵循 Anthropic 陶土/暖纸设计风格的通用类错误边界组件，显示错误概要并提供“重试”与“刷新页面”操作。
  - `src/ui/App.tsx`：包裹应用主体视图（Sidebar、GraphCanvas、ChatPanel），防止因 React 渲染异常导致整屏白屏。
  - `src/styles.css`：在末尾追加 `.error-boundary-fallback` 等样式。
- **图谱内联重命名**：
  - 服务端：`src/server/routesMaps.ts` 新增 `PATCH /api/maps/:id/title` 路由，采用 zod 校验标题非空且自动 trim，更新 `title` 与 `updatedAt` 并保存。
  - 状态层：`src/state/api.ts` 增加 `renameMap` API 调用；`src/state/maps.ts` 增加 `renameMapImpl`；`src/state/appState.ts` 与 `src/state/store.ts` 串联暴露 `renameMap` action。
  - 界面层：`src/ui/Sidebar.tsx` 支持双击图谱标题激活内联输入框（Enter 保存、Esc 取消、blur 保存），保留原有单选切换图谱逻辑。

### 实测证据

- HTTP 探针实测：
  1. POST `/api/maps` 创建图谱后，发送 PATCH `/api/maps/:id/title` 携带 `{ title: "新标题" }`，返回 200 且后续 GET 确认标题持久化成功。
  2. 携带空白字符 `{ title: "   " }`，服务端正确拒绝并返回 400 校验错误。

---

## 3. Lane C: Tauri 桌面壳构建链路实测

### 探测结果

- **Crates.io 连通性**：`cargo search tauri` 退出码 0，可正常访问并检索到 crates.io 依赖仓库。
- **CLI 工具链**：`bun x @tauri-apps/cli --version` 返回 `tauri-cli 2.12.4`，调用正常。
- **项目初始化**：在遵守写域隔离（不修改根目录 `package.json`）的前提下，通过 `--ci` 成功生成完整的 `src-tauri/` 结构（包含 `Cargo.toml`、`build.rs`、`tauri.conf.json`、`capabilities/` 等）。
- **依赖解析**：`src-tauri/Cargo.lock` 已成功生成，依赖锁已就绪。
- **构建环境与运行障碍记录**：
  - 机器上 Rust 编译器 (`rustc 1.94.1 x86_64-pc-windows-msvc`) 工作正常，链接器具备构建能力。
  - 运行时关键依赖：注册表与系统路径中均未检测到 Edge WebView2 Evergreen Runtime（`EdgeWebView` 目录不存在）。因此即便生成可执行文件，启动窗口应用时也会因缺少 WebView2 运行时而失败。用户需安装 WebView2 Runtime 方可正常使用独立桌面壳。

---

## 4. 全量质量门禁（Quality Gates）

经统一格式化（遵循项目无分号、2 空格配置），所有四项门禁全部以 exit code 0 通过：

| 门禁项       | 命令                | 结果   | 关键指标                                 |
| ------------ | ------------------- | ------ | ---------------------------------------- |
| **类型检查** | `bun run typecheck` | exit 0 | 0 errors                                 |
| **代码规范** | `bun run lint`      | exit 0 | 54 files checked, 0 errors, 0 warnings   |
| **单元测试** | `bun test`          | exit 0 | **51 pass**, 0 fail（全量 8 个测试文件） |
| **生产构建** | `bun run build`     | exit 0 | Vite 构建产物生成至 `dist/`              |

### 纯代码行数（Pure LOC）审计

根据项目约束（单个源码文件不超过 250 纯代码行，剔除空行和注释）：
- 检查范围：`src/**/*.{ts,tsx}` 全部文件
- 超过 250 行的文件数：**0**（超标数：none）
- 纯代码行最高的 5 个文件：
  1. `src/state/api.ts`: 241 行
  2. `src/state/store.ts`: 238 行
  3. `src/ui/ChatPanel.tsx`: 235 行
  4. `src/ui/GraphCanvas.tsx`: 227 行
  5. `src/domain/graphOps.ts`: 226 行
