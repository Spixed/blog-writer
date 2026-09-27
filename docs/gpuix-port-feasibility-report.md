# GPUIX 桌面移植可行性调研报告

> 调研对象：blog-writer（React + TipTap/ProseMirror + CodeMirror 6 的 Hugo 博客编辑器）
> 调研时间：2026-09-26 ｜ GPUIX 当前最新版：**0.7.0**（2026-09-01 发布）

---

## 一、结论（TL;DR）

**不支持。当前项目无法通过 GPUIX 最新版（0.7.0）进行"移植"。**

核心原因一句话：GPUIX 是"无 DOM、无 HTML/CSS"的原生 GPU 渲染方案，而本项目的技术核心——TipTap v3（ProseMirror）与 CodeMirror 6——是**直接操纵真实 DOM 的编辑器内核**，在 GPUIX 环境下完全无法运行。所谓"移植"实质上是**推倒重写一个新应用**，且重写对象是一个 pre-1.0、存在架构级限制（单窗口、禁嵌套滚动）的年轻框架。

GPUIX 对本项目唯一真实的吸引力：后端 `server-node` 可嵌入 Bun 进程，与 UI 合并为单一二进制发布。

---

## 二、GPUIX 0.7.0 是什么

| 项目 | 内容 |
|---|---|
| 仓库 | `remorses/gpuix`（~1.4k–1.6k stars，Apache-2.0） |
| 定位 | 用 React + TypeScript 写 GPUI（Zed 编辑器的 GPU UI 框架）原生桌面应用 |
| 包 | `@gpuix/react`（react-reconciler 自定义渲染器）、`@gpuix/native`（Rust 渲染器，napi-rs，按平台分包如 `@gpuix/native-win32-x64-msvc`）、`@gpuix/cli`（脚手架） |
| 渲染链路 | React → reconciler → napi 桥 → Rust 持久元素树 → GPUI（Taffy 布局）→ Metal / DirectX / Vulkan |
| 元素集 | 容器、原生 input / textarea、虚拟列表、image、SVG、code、diff、**markdown** —— 是"有限的 UI 词汇表"，不是 Web 平台 |
| 样式 | Taffy flexbox + style 对象子集（hover/active、仅双色线性渐变；不支持 radial/conic/repeating/多 stop） |
| 分发 | `bun build --compile` → 单二进制（内含渲染器，目标机器无需 Node/Bun/Rust） |
| Windows 支持 | ✅ 官方支持（0.7.0 修复了 >100% DPI 文字模糊、最后窗口关闭退出进程；测试渲染器覆盖 macOS/Windows）。Linux 尚有 GNOME 标题栏缺失（#49）、源码构建失败等问题 |

### 0.7.0 的硬性架构限制

1. **单窗口、单根**：一个渲染器只能拥有一个 window / 一个 root，开第二个根必须卸载第一个。
2. **不支持嵌套垂直滚动**：重叠的 GPUI 命中区域会同时收到同一滚轮事件。
3. **无 canvas 元素**、无完整 HTML/CSS、第三方 React 组件库（Ant Design / MUI）不可用。
4. GPUI 本体 pre-1.0，锁定 Zed fork，频繁 breaking changes。
5. `bun --hot` 热重载后事件失效问题（#37）历史上反复出现。

---

## 三、本项目技术栈 vs GPUIX 兼容性逐项判定

前端实测：`packages/frontend/src` 下 **28 个源文件**直接使用 DOM API（`document.*`、`querySelector`、`getBoundingClientRect`、`ResizeObserver`、`MutationObserver`、`useLayoutEffect`、`createPortal`、`getComputedStyle`、window 监听等）——覆盖几乎全部 UI 组件。

| 层 | 依赖 | 在 GPUIX 0.7.0 下 | 判定 |
|---|---|---|---|
| WYSIWYG 编辑器 | TipTap v3.31 + ProseMirror + 10 个自研扩展（table-move / drop-cap / ruby / qmoji / lone-image / code-block / math-inline…） | ProseMirror 是 contenteditable + DOM Selection 内核，GPUIX 没有 `document`，无法实例化 | ❌ **硬阻塞** |
| 源码编辑器 | CodeMirror 6（`@codemirror/view`） | view 层基于 DOM Observer / contentDOM，同样需要真实 DOM | ❌ **硬阻塞** |
| UI 组件层 | ~30 个组件：Portal 工具栏、fixed 弹层 + rect 计算、BlockHandle 指针探测、TableDrag、滚动同步 | 全部依赖 DOM 测量与定位，GPUIX 无对应物 | ❌ 需全部重写 |
| CSS 主题 | `theme.css` + `app.css`（`:first-letter`、scoped 选择器、媒体查询、overflow 滚动） | 仅 style 对象子集，伪元素/选择器系统不存在 | ❌ 不可迁移 |
| 分屏预览 | markdown-it + shiki → HTML → `innerHTML`，Web Worker（`render/worker.ts`） | 须换成 GPUIX 原生 `<markdown>` 元素；Polymer 主题样式不可复用；Web Worker 支持不明 | ❌ 重写 |
| 状态层 | zustand 5、@tanstack/react-query 5 | 纯 JS，与渲染器无关 | ✅ **可保留** |
| 共享逻辑 | `@blog-writer/shared`（markdown 序列化、schema 校验） | 纯 TS | ✅ **可保留** |
| 后端 | `server-node`（Node fs 读写博客目录） | GPUIX 本就跑在 Bun/Node 上，fs 可用，可与 UI 合并为单进程 → 单二进制 | ✅ **可保留（唯一亮点）** |

### 根因归纳

1. **编辑器内核不可换壳**：ProseMirror / CodeMirror 不是"渲染到 DOM 的 React 组件"，而是自带 DOM 事务、Selection、MutationObserver 的独立内核。换渲染器 ≠ 换 UI 库，是换掉它们存在的地基。
2. **GPUIX 的 `<markdown>`/`<code>` 原生元素 ≠ 本项目的预览**：Hugo Polymer 主题的全部 CSS（含 drop-cap、代码块定制）无法表达。
3. **多窗格编辑器 UI 撞上"禁嵌套滚动 + 单窗口"两条架构限制**：编辑区 / 预览 / TOC / 文件列表 / frontmatter 面板全是嵌套垂直滚动，这是 GPUIX 明确标记 unsupported 的场景。

---

## 四、若坚持上 GPUIX：实际工作量评估

等价于**新开一个项目**，而非移植：

- 用 `@gpuix/react` 原语重写全部 UI（jsxImportSource 替换，所有 DOM 组件重造）。
- 编辑器基于 GPUIX 原生 input/markdown/code 元素重建：表格、链接、图片、气泡菜单、斜杠菜单、撤销栈等 TipTap 能力**全部重造**。
- 预览换 `<markdown>` 原生元素 + GPUIX 内置高亮（Tree-sitter），放弃 Shiki 主题。
- 风险项需 PoC 先行验证：**中文输入法**在原生 input/textarea 中的表现（对本项目关键）、Windows 实机滚动与 DPI、`bun --compile` 打包体积、GPUI fork 升级成本。
- 合理定位：2 天 PoC 验证后大概率仍会放弃，不建议投入。

---

## 五、替代方案对比（目标：把现有应用桌面化）

| 方案 | DOM 兼容 | 改动量 | 产物体积 | 主要工作 |
|---|---|---|---|---|
| **Electron**（推荐） | ✅ 完整 Chromium | 极小 | 大（~100MB+ / 内存高） | BrowserWindow 加载 Vite build；server-node 移入 main process 或作为子进程；加应用菜单/文件对话框 |
| **Tauri 2** | ✅ WebView2（Win 自带） | 小 | 小（~10MB 级） | 前端零改动；Node 后端需 `bun build --compile` 成 sidecar exe，或改写为 Tauri commands |
| GPUIX 0.7.0 | ❌ 无 DOM | 全量重写 | 小（单二进制） | 见第四节，不推荐 |
| 维持现状（Bun 双服务 + 浏览器） | ✅ | 零 | — | 无桌面壳，仅本地 Web 应用 |

**建议**：
- 只求"桌面化、零风险"→ **Electron**，改动集中在壳层，TipTap/CodeMirror/全部 CSS 原样保留。
- 在意体积与内存、能接受少量胶水工作 → **Tauri 2 + bun sidecar**。
- **GPUIX 列入观察名单**：它适合"从零新做"的原生小工具（聊天客户端、diff 查看器、日志查看器），等它解决多窗口、嵌套滚动、CSS 覆盖面并到达 1.0 后，再评估用于新的编辑器项目。

---

## 六、其他原生方案全景（追加调研）

### 0. 判定前提与关键实测

**编辑器内核决定方案家族**：只要保留 ProseMirror + CodeMirror 6（DOM 内核），壳就必须带 DOM 引擎（Chromium 或系统 WebView）；一切"真原生自绘渲染"方案（GPUIX / Flutter / RN / Compose / Slint…）同根因排除。

**实测利好**：`server-node` 源码全部使用 `node:` 标准库（fs/path/os/child_process/url）+ Fastify + chokidar + smol-toml，**零 Bun 专有 API**——可直接跑在 Electron/NW.js 的 Node 环境里，也可用 `bun build --compile` 编译成 sidecar 单文件 exe。

### 1. WebView 壳家族（保留 100% 现有代码）

| 方案 | 内核 | 后端承载 | 体积 | 一句话评价 |
|---|---|---|---|---|
| **NW.js** | Chromium | Node 同进程直接起 Fastify（页面与 Node 互通，几乎无需 IPC） | 大（同 Electron） | Electron 的等价替代，改动最小之一；生态较小 |
| **Neutralino.js** | 系统 WebView2 | 无内置 Node → sidecar | ~2MB 级 | 极轻，但生态/文档/安全模型弱于 Tauri |
| **Photino.NET / 自制 WebView2 壳**（C# WinForms/WPF/WinUI3） | 系统 WebView2 | sidecar | 几百 KB~几 MB | Windows-only 极简壳，完全可控；窗口生命周期/托盘/更新需自理 |
| **Wails v3**（Go） | 系统 WebView | Go 重写（不推荐）或 sidecar | 小 | 只为壳不如 Tauri 成熟 |
| **零打包**：`msedge --app=http://127.0.0.1:7841` | 系统 Edge | 现有 Bun 双服务原样 | 0 | 非严格原生，但即刻获得独立无边框窗口，自用过渡可用 |

### 2. 真原生渲染家族（编辑器内核必须重写，均 ❌）

Flutter Desktop / React Native for Windows / Compose Multiplatform / Slint / egui / WinUI 3 —— 与 GPUIX 同一根因：无 DOM，ProseMirror/CodeMirror 无法运行，全部 TipTap 扩展需重造。除非未来决定换编辑器内核从零重写，否则不进入候选。

### 3. 壳家族落地的共性要点

1. **单端口同源**：生产模式由后端 Fastify 托管前端静态产物（替代 dev 期的 Vite 5173 + API 7841 双服务），规避 CORS 与端口冲突。
2. **BLOG_ROOT 配置**：现靠 `.env`；打包后改首次启动选择目录，存入用户数据目录（config-store 已具备基础）。
3. **Hugo 外部进程**：`spawn('hugo')` 的可执行文件路径打包后需随应用分发或探测 PATH。
4. WebSocket（@fastify/websocket）走 127.0.0.1，无证书问题；chokidar 在打包环境正常工作。

### 4. 结合本项目的最终推荐

| 优先级 | 方案 | 理由 |
|---|---|---|
| ★ 首选 | **Electron**：server-node 直接进 main process | 后端零改动零 sidecar；双服务合一只需 Fastify 托管静态产物；工程量约 1–2 天 |
| ★ 次选 | **Tauri 2 + bun sidecar**：`bun build --compile src/index.ts` → externalBin，启动后 health check 再加载页面 | 安装包 ~10MB 级、内存低；多一步 sidecar 与单端口改造 |
| 备选 | NW.js（Electron 等价）/ Photino 自制壳（极客向） | 看个人偏好与体积洁癖程度 |
| 观望 | GPUIX 及一切真原生渲染 | 等编辑器内核问题有解再说 |



- GitHub Releases: `remorses/gpuix`（@gpuix/react@0.7.0，2026-09-01）及 CHANGELOG.md
- npm: `@gpuix/native-win32-x64-msvc`（平台原生包存在，Windows 支持确认）
- 第三方实测评审（mrkeyoor.com/repos/gpuix，2026-09-07 基于 commit 2d6e599）：源码 Linux 构建失败、无嵌套滚动、单窗口、GNOME #49 等
- 技术分析文章（besthub.dev / CSDN / 今日头条，2026-08~09）：架构链路、5000 消息聊天 demo、生态成熟度评估
- 本项目实测：`packages/frontend/package.json` 依赖清单；`src` 全量 grep（28 文件命中 DOM API）
