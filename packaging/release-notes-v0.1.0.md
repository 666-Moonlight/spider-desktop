## Spider Standalone v0.1.0

本地优先的分支对话知识图谱应用——把 Obsidian 插件 [Spider](https://github.com/111pointer111/spider) 的分支对话画布，重写成可在浏览器和 Windows 桌面独立运行的完整应用。

### 下载

| 文件 | 说明 |
|---|---|
| `Spider-0.1.0-portable-x64.zip` | **免安装绿色版**，解压双击 `Spider.exe` 即可运行，数据存在 `%APPDATA%\com.spider.standalone\data` |
| `Spider_0.1.0_x64-setup.exe` | NSIS 安装向导版，自动建快捷方式与卸载入口 |

校验和见 `SHA256SUMS.txt`。

### 功能

**画布与布局**
- 多根森林：`+ 根节点` 建独立根，删主根自动交接
- 四向分支：卡片四边 `+` 手柄，`Tab` / `Shift+Tab` / `Alt+方向键` 向任意方向发散
- 双向平衡布局：一阶左子树 RL、右子树 LR，多连通分量纵向堆叠
- 视线锥导航：方向键按方向锥 + 距离评分跳转，无匹配降级层级导航
- 汇聚节点：卡片「汇」两次点击合成多父节点，引用计数删除保护

**对话与上下文**
- SSE 流式输出、选中文字拉分支、AI 自动起标题、历史持久化
- 上下文引擎 v2：祖先链真实对话进入上下文（近 3 层全文 + 更深层摘要压缩），汇聚节点聚合所有父分支；「上下文」按钮可预览模型将看到的确切内容
- 教学风格：循序渐进 / 启发提问（苏格拉底）/ 简明要点 / 自定义系统提示词
- 手动总结、折叠展开子树、重试重新生成

**工具与扩展**
- OpenAI tools 协议 + 服务端多轮执行（上限 4 轮），内置 `search_notes` / `get_node` / `list_maps` / `append_note`
- MCP stdio 客户端：按「名称|命令|参数」注册，工具自动命名 `mcp__<server>__<tool>`
- 工具轨迹可视化：画布上渲染只读虚线节点，随消息持久化
- 跨图引用（＠引用）与本地词法相似节点（CJK 二元组 + 拉丁词，Dice 系数）

**数据与导出**
- 导入/导出 `.spider/maps` 兼容格式（父指针为唯一事实源重建子边）
- 导出包：`index.md` / `brief.md` / `notes.md` / `nodes/*.md` / `map.canvas` / `map.svg` / `map.json`
- 明暗双主题（暖纸 / 陶土 token）

### 配置模型

首次启动后点右上「设置」填 API Base URL / Key / 模型，任意 OpenAI 兼容端点均可（本地 Ollama、各家云 API、自建网关）。字段说明见仓库内 `settings.example.json`。

### 已知限制

- 首字延迟取决于上游网关：走 CLI agent 类网关时首个 token 可能要 30-95 秒，界面会显示「正在生成…」
- 相似节点目前是本地词法相似度，未接 `/v1/embeddings`
- 桌面版仅验证了 Windows 产物，macOS / Linux 未测

### 来源与许可

基于 Obsidian 插件 Spider（作者 huangtao）以 MIT 许可独立重构，**非原作者官方版本**。仓库内 `LICENSE`（MIT 双版权声明）与 `NOTICE`（逐项说明继承与新写的内容）详述了来源关系。

