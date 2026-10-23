# Spider 独立版 DESIGN.md

## 0. Research Log

- Layer A: `taste-skill.md`（运营型工具档：克制、单强调色、无彩色边条、状态用墨色层次）— 已读核心段（0-6 节 + AI tells 前半）。
- Layer B: `claude.md`（Anthropic 暖羊皮纸/陶土系）— 经该目录 CLAUDE.md 全量注入获得（调色板/字体阶梯/按钮卡片规范完整）。
- 布局: `layout-skill.md` 全文（scroll-body-shell、min-block-size:0、内容压力测试）。
- 有名跳过: lazyweb / imagen 概念稿 / stylegallery 拉取 — 本项目为本地优先的桌面型运营工具，无 marketing/hero 面；品牌参照已由 claude.md 充分锁定。react-grab/react-doctor/react-scan 三件套以非交互方式尝试安装，失败则记录于此（见 §8）。
- Design Read: 本地知识图谱工具（中文用户），书卷气暖纸面 + 陶土单强调色，避免通用暗色 SaaS 味。

## 1. 色彩 token（CSS 变量，light / dark 双主题）

| Token         | Light   | Dark    | 用途                             |
| ------------- | ------- | ------- | -------------------------------- |
| --bg          | #f5f4ed | #141413 | 画布/页面底                      |
| --surface     | #faf9f5 | #30302e | 卡片、面板                       |
| --surface-2   | #ffffff | #262624 | 按钮/输入                        |
| --ink         | #141413 | #f5f4ed | 主文本                           |
| --ink-2       | #5e5d59 | #b0aea5 | 次文本                           |
| --ink-3       | #87867f | #87867f | 三级/占位                        |
| --line        | #f0eee6 | #3d3d3a | 发丝线                           |
| --accent      | #c96442 | #d97757 | 陶土强调（活动节点/主按钮/选中） |
| --accent-ink  | #faf9f5 | #faf9f5 | 强调面上的文字                   |
| --error       | #b53333 | #d97757 | 错误                             |
| --focus       | #3898ec | #3898ec | 焦点环（唯一冷色）               |
| --edge        | #d1cfc5 | #4d4c48 | 图谱连线                         |
| --edge-active | #c96442 | #d97757 | 路径高亮连线                     |
- 单强调色锁定：全站只有陶土一个彩色强调；状态用墨色深浅与字形（✓）表达，禁彩色边条。

## 2. 字体

- 标题/节点标题: Georgia, "Times New Roman", serif（Anthropic Serif 的替代，书卷气；weight 500）。
- UI/正文: system-ui 栈（"Segoe UI", "Microsoft YaHei", sans-serif）。
- 代码: ui-monospace, "Cascadia Mono", monospace。
- 阶梯: 节点标题 15px serif / 面板标题 13px 600 / 正文 13px / 次要 12px / 标签 11px（0.12px 字距）。

## 3. 间距 / 圆角 / 高度

- 圆角锁: 全站 8px（卡片/按钮/输入）；小元素 6px。无 pill。
- 间距: 4 的倍数（4/8/12/16/24）。
- 高度层次: ring 阴影 `0 0 0 1px var(--line)`；抬升面 `0 4px 24px rgba(20,20,19,.06)`；活动节点 ring `0 0 0 2px var(--accent)`（环非边条）。
- 节点卡: 260px 宽，padding 12；画布节点间距 nodesep 56 / ranksep 120。

## 4. 动效

- 只动 transform/opacity；150-220ms ease-out。流式光标 1s 闪烁。无装饰动画；hover 只在可交互元素上。

## 5. 原语与状态（全部命名）

- `btn`（默认 surface-2 + ring line；hover 变 bg 微降）、`btn-accent`（陶土实底）、`btn-ghost`（透明 + hover 墨色 6% 洗）。
- `card`（surface + ring line + 8px）。
- `input`（surface-2 + line 边；focus 环 --focus）。
- 节点状态: active=陶土 ring + 标题变 accent；understood=标题前 ✓ 字形；archived=50% 墨。
- 空态: 画布无图 → 居中卡片（说明 + 「导入 .spider 图谱」「新建图谱」两按钮）；侧栏空 → 引导文案。
- 加载: 侧栏骨架条（非转圈）；流式等待 = 输入区上方三连点。
- 错误: 聊天面板内嵌红条（--error 底 8% + --error 文字），可重试按钮。

## 6. 布局原语与滚动归属

- `scroll-body-shell`: 100dvh 网格 rows [48px header / minmax(0,1fr) body]；body 为 columns [264px sidebar | minmax(0,1fr) canvas | 400px chat]。
- 滚动归属: 侧栏列表滚（min-block-size:0）；聊天消息区滚（同）；画布 = React Flow 自管 pan/zoom；header/输入区固定不滚。
- 窄窗（<1080px）: chat 面板可折叠为 40px 竖条（点击展开 overlay），不做移动端适配（桌面应用）。

## 7. 无障碍约束

- 全部可交互元素可 Tab 聚焦并有 :focus-visible（--focus 环）；节点卡 role=button；键盘操作完整（Tab/Shift+Tab/Alt+方向/Delete 均有 aria-label 提示文案于 header 帮助气泡）。对比度：ink/bg ≥ 7:1，ink-2/bg ≥ 4.5:1，accent 面上用 accent-ink。

## 8. 已接受债务

- Anthropic 品牌字体不可用 → Georgia/system 替代（文档化）。
- 桌面优先：不承诺 <768px 移动布局；仅保证无横向滚动破坏。
- react dev 三件套若无法非交互安装则暂缺（记录于 Research Log）。
- Markdown 渲染为自研轻量版（段落/粗体/行内码/围栏码块），复杂语法 M2 换 marked 类方案 → **已兑现（M4）**：自研纯解析器 `src/domain/markdown.ts` 支持标题/列表/链接/引用/删除线/斜体，链接走 scheme 白名单与 `rel="noopener noreferrer"`，未引入第三方依赖。
