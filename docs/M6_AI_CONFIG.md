# AI 模型配置（magpie）验证记录

日期: 2026-10-23

## 最终配置（三处 settings.json 内容一致）
```json
{ "apiBaseUrl": "http://127.0.0.1:3425/v1", "apiKey": "magpie", "model": "group/spider", "toolsEnabled": true, "mcpServers": [] }
```
- `D:/ai/spider-new/data/settings.json` —— 源码运行 / `启动Spider.bat`
- `%APPDATA%/com.spider.standalone/settings.json` —— 桌面版真实数据目录（注意：不是 data 子目录）
- `D:/spider/seed/settings.json` —— 安装包首次启动的种子；已装好的桌面版不读它

原来占位的 mock 配置（127.0.0.1:4400 / mock-1）与 mock MCP 已全部移除。
（API Key 填什么都行：实测 magpie 的 /v1/models 与 /v1/chat/completions 都不校验 Authorization。）

## magpie 侧新增配置
`C:/Users/10331/.config/magpie/providers.json`（已备份 `.bak-ulw-spider`）

```json
{ "id": "spider", "name": "Spider（图谱对话）",
  "members": ["workbuddy/deepseek-v4.1-flash", "zhipu/glm-5.3", "deepseek/deepseek-flash"],
  "routing": "order" }
```
并追加到 `groupOrder`。magpie 热加载该文件，**不需要重启**（写入后 /v1/models 立即出现 `group/spider`）。
用 order 路由：首选 workbuddy/deepseek-v4.1-flash（最快，1.3s），前面不可用时自动落到 GLM-5.3、DeepSeek Flash。

## 验证
| 判据 | 结果 |
|---|---|
| magpie 直连 `group/spider` 普通补全 | 200，served=deepseek-v4.1-flash，content=「收到」 |
| 流式 | 200，15 帧，文本完整 |
| 工具调用 | 200，finish=tool_calls，call=list_maps |
| 应用 `POST /api/test` | {"ok":true,"message":"OK"} |
| 源码运行 + UI 真发问 | 「中国的首都是哪里？」→「中国的首都是北京。」落盘；截图 `docs/qa/magpie-ai-config.png` |
| 应用内工具回路 | list_maps 调用成功，回答列出全部图谱 |
| 安装版桌面应用（D:/spider 的 spider.exe，端口 4319） | 同一问法同上，落盘 + 截图 `docs/qa/magpie-ai-config-desktop.png` |

## 附带修复（必须一起发布，否则"填好模型"仍不成立）
`/api/chat` 原来只收 `{mapId, nodeId}`，而前端保存有 400ms 防抖 —— 服务端读盘时经常读不到刚输入的那句话，模型会答非所问。
修复：请求体新增可选 `text`（`src/server/routesChat.ts`、`src/state/api.ts`、`src/state/flow.ts`），服务端在磁盘副本缺该消息时补进上下文。
桌面版已同步替换：`D:/spider/spider-server.exe`（重新编译）与 `D:/spider/dist`（重新构建），旧文件备份为 `*.bak-ulw`。

## 清理
QA 服务 pid 1804 / 13160 已杀，:4462、:4463 已关闭；临时数据目录与编译产物已删除；验证用的临时图谱已删除。
用户自己的桌面应用仍在运行（spider.exe 11412 + sidecar 29064，端口 4319），已确认其加载的是新配置。
