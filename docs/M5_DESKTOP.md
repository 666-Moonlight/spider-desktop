# M5 桌面应用（Tauri 原生壳）交付记录

日期：2026-10-22　主机：win32 x64（Intel Ultra 5 125H）　WebView2：155.0.4283.62（已存在）

## 结构

| 组成 | 位置 | 作用 |
| --- | --- | --- |
| 前端 | `dist/`（vite build） | 打入资源，随安装包分发 |
| 后端 sidecar | `src-tauri/binaries/spider-server-x86_64-pc-windows-msvc.exe` | `bun build --compile` 产物，独立可执行，不依赖全局 bun |
| 外壳 | `src-tauri/src/lib.rs` | spawn sidecar → 等端口 → 建窗口 → 退出时 kill |
| 配置 | `src-tauri/tauri.conf.json` | externalBin + resources + nsis 打包 |
| 数据 | `%APPDATA%\com.spider.standalone\data` | 首次启动从 `seed/settings.json` 播种 |

## 关键实现约束（踩过的坑）

1. **`current_exe()` 返回 `\\?\D:\...` 扩展长度前缀**，把它原样塞进 `SPIDER_STATIC_DIR` 会让 Bun 打不开文件、页面 500。必须先剥掉前缀。
2. **资源映射不能写成 `"../data/settings.json": "data/"`**：tauri-build 会在 target 目录里生成一个名为 `data` 的**文件**；下次启动要建同名目录时，Windows 直接报 access denied（os error 5），构建彻底卡死。改成 `"seed/settings.json"` 后解决。
3. **Cargo 包名 = exe 名**：包名保持 `spider` 才产出 `spider.exe`；`--no-bundle` 产物不会自带资源，需要把 `dist/` 放在 exe 旁边（打包安装后由 resources 提供）。
4. **就绪判定必须看端口**，不能固定 sleep——外壳在 spawn 之后轮询 TCP，最大 40 秒。

## 验收（实测）

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| 冷启动真实窗口 | `qa-window.ps1` 启动 `spider.exe` 并截图 | 窗口 1295x897，标题「Spider 独立版」，页面渲染出「新建」「导入」与画布 → 见 `window.png` |
| 页面可达 | 同上脚本内 `Invoke-WebRequest http://127.0.0.1:4319/` | 200，内容含 Spider |
| sidecar 就位 | 同上 | `spider-server.exe` 进程数 1 |
| 关闭回收 | `qa-close.ps1` 调 `CloseMainWindow()` | 主进程退出、sidecar 0、端口 CLOSED |
| 搬迁可用 | 复制到 `%TEMP%\spider-portable` 后启动 | 200 + 正常界面 → 见 `window-portable.png` |
| 环境变量契约 | sidecar 直跑 `SPIDER_STATIC_DIR`/`SPIDER_DATA_DIR` | 200，settings 从 seed 播种，maps 目录独立 |

## 构建

```bash
bun run sidecar     # 后端 -> src-tauri/binaries/
bun run build       # 前端 -> dist/
bun run app:build   # 两者 + tauri build（含 nsis 安装包）
```


## 最终验收补充（实测）

| 场景 | 结果 |
| --- | --- |
| NSIS 静默安装 `/S` | exit 0，装到 `D:\\spider`（含 spider.exe / spider-server.exe / dist / seed / uninstall.exe） |
| 从安装目录启动 | 窗口 1295x897，HTTP 200，界面渲染正常 → `window-installed.png` |
| 真实交互 | UIA 点击「新建图谱」→ AppData\\com.spider.standalone\\maps 落盘 1 个 JSON，`/api/maps` 返回 1 |
| 双开 | 启动第二个实例：spider 进程 2、sidecar 仍 1、HTTP 200（端口复用，不重复起服务） |
| 卸载入口 | `D:\\spider\\uninstall.exe` 存在 |

## 清理回执

spider 进程 0、spider-server 进程 0、4319/4411/4412 端口全部 CLOSED、QA 临时目录已删。

## 门禁

`bun test` 57 pass / 0 fail；`bun run lint` exit 0（58 files）；`bun run typecheck` exit 0。
