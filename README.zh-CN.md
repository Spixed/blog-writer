<div align="center">

# Blog Writer

**面向 Hugo 博客的本地优先编辑器。所见即所得、分栏渲染、双语模式 —— 带逐字节精确的 round-trip 保证。**

[![CI](https://github.com/Spixed/blog-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/Spixed/blog-writer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.2-f472b6)](https://bun.sh)

[English](README.md) · 简体中文

</div>

## 为什么做这个

Hugo 让你完全掌控自己的内容 —— 但写作只能在纯文本编辑器里进行，预览还要跑一次构建。Blog Writer 直接架在真实的 Hugo 工作区之上，提供 Notion 风格的编辑面：

- 内容用**主题自己的 CSS** 渲染和排版，编辑器看起来就是发布后的博客。
- 每次保存都**逐字节精确**：读取文章再写回，文件不会有任何变化。编辑器只重新序列化你真正编辑过的部分，其余一律逐字保留。
- Hugo shortcode 是**可编辑的原子**，不是一坨不透明的文本。

项目以 Web UI 为先：前端只与 `WorkspaceApi` 契约通信，因此同一套界面之后可以原样跑进 Electron / Tauri 壳 —— 切换壳只需换掉一个适配器。

## 特性

- **三种编辑模式** —— 所见即所得（TipTap，支持块拖拽排序、侧栏 `+`、斜杠命令面板、气泡菜单）、分栏渲染（Markdown | 实时预览，滚动同步）、双语模式（两个同步的 WYSIWYG 编辑面，重命名/删除感知双语配对）。
- **非文本块可编辑** —— 行内 `{{< qq-emoji >}}`、`{{< ruby >}}` shortcode，着色的 `{{% hl %}}` mark，主题样式图片（支持 `?width=`），真正的 GFM 表格。复杂块（块级公式、原始 HTML、缩进代码）经预览管线渲染，round-trip 逐字节还原。
- **Front-matter 面板** —— 每种模式均可用的可拖拽浮动面板；可视化表单与 Raw YAML 视图保持同步。
- **文章管理** —— 搜索 / 过滤 / 排序，感知双语配对的新建 / 重命名 / 删除，Ctrl+Z / Ctrl+Shift+Z 可撤销。
- **媒体管理** —— 媒体库、上传流程，以及打通两者的图片对话框。
- **查找与替换** —— Markdown 源码窗格内置的 CodeMirror 面板（`Ctrl/Cmd+F`），另有 Markdown 与 shortcode 补全、可见空白符与缩进。
- **忠实主题渲染** —— markdown-it 运行于 Web Worker，支持主题的三个 shortcode、MathJax v4、Shiki（Chroma/Monokai）、图片 figure 与 `<!--more-->`；主题字体栈与首字下沉尺寸实时重测量，主题跟随系统配色。
- **扎实的后端** —— Fastify + WebSocket：文章 CRUD、配置、分类法、文件监听（文章、媒体、data、配置、主题）与冲突状态 —— 绝不静默覆盖未保存的草稿 —— 外加 Hugo 集成。
- **用心的细节** —— Unicode slug（`birthday_δ-me13` 也可用）、可配置的自动保存（250–10,000 ms，默认 1,000 ms，默认关闭；Ctrl/Cmd+S 始终可用）、多工作区。

## 截图

<div align="center">
<table>
  <tr>
    <td><img src="docs/screenshots/wysiwyg.png" alt="所见即所得模式" /></td>
    <td><img src="docs/screenshots/split.png" alt="分栏渲染模式" /></td>
  </tr>
  <tr>
    <td align="center">所见即所得</td>
    <td align="center">分栏渲染</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/bilingual.png" alt="双语模式" /></td>
    <td><img src="docs/screenshots/front-matter.png" alt="Front-matter 浮动面板" /></td>
  </tr>
  <tr>
    <td align="center">双语模式</td>
    <td align="center">Front-matter 浮动面板</td>
  </tr>
</table>
</div>

## 快速开始

环境要求：[Bun](https://bun.sh) ≥ 1.2。[Hugo](https://gohugo.io) 可选 —— 仅校验/预览按钮和渲染测试需要。

```bash
bun install
bun dev
```

- 后端：<http://127.0.0.1:7841>（Fastify + WebSocket）
- 前端：<http://localhost:5173>（Vite，代理 `/api` 与 `/ws`）

如需在局域网内的其他设备上访问开发服务器：

```bash
bun dev --host                # 两个服务器均绑定 0.0.0.0
bun dev --host 192.168.1.10   # 绑定到指定地址
```

## 配置

在 `.env` 中把 `BLOG_ROOT`（见 [`.env.example`](.env.example)）指向你的 Hugo 博客根目录 —— 首次运行时用于预注册默认工作区。也可以在界面中选择目录；该选择会持久化到 `~/.blog-writer/config.json`。支持多工作区。

## 项目结构

```
packages/
  shared/        类型、WorkspaceApi 契约、front-matter schema、shortcode 规格
  frontend/      React + Vite UI（设计上可被 Electron/Tauri 原样复用）
  server-node/   Fastify 后端（可被 Electron 主进程复用）
```

## 开发

```bash
bun run typecheck    # 全部包的 TypeScript 检查
bun run lint         # Biome
bun run format       # Biome --write
```

### 测试

| 命令 | 验证内容 |
| --- | --- |
| `bun test` | 对每篇文章做逐字节一致的 round-trip（本地、安全） |
| `bun run --filter @blog-writer/server-node test:api` | 同上，走 HTTP 层 |

在 `packages/frontend` 下：

| 命令 | 验证内容 |
| --- | --- |
| `bun run test:blocks` | 每个块与 Hugo 渲染一致；编辑为逐字节等价的空操作 |
| `bun run test:prose` | 每篇文章：Markdown → WYSIWYG → Markdown 稳定且无损 |
| `bun run test:schema` | 每份 WYSIWYG 文档都是合法的 ProseMirror 文档 |
| `bun run test:render` | 完整 Hugo 构建 + 逐块 HTML diff（需要 Hugo） |
| `bun run test:ui` | 三种编辑模式的 SSR 冒烟测试 |
| `bun test test/editor-regressions.test.ts` | 源码补全 / 标题滚动回归 |

浏览器回归（先启动 `bun dev`；脚本使用 Playwright CLI）：

```bash
playwright-cli -s=ui open http://localhost:5173/
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-layout.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-editor.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-interactions.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance-p4.js
```

这些脚本覆盖媒体稳定性、双向标题对齐、caption 与语言编辑、Qmoji 替换、斜杠命令和保存防抖。编辑/保存测试中的写请求会被拦截 —— 博客文件不是测试 fixture。脚本假定已配置好样例博客。

P4 性能探针对一个 62 KiB 的混合文档进行输入和滚动，并记录 `longtask` 条目。参考本地测量结果：插入耗时中位数 0.4 ms / p95 0.7 ms / 最大 2.7 ms，无 long task。它是可重复的验收探针；硬件与浏览器差异会改变数值。

## 路线图

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| P0 | 基础设施：monorepo、Workspace API 契约、Fastify 后端、Vite 壳 | ✅ |
| P1 | 文章管理、可视化 front matter、自动保存、Ctrl+S | ✅ |
| P2 | 渲染管线：Web Worker、shortcode、MathJax、Shiki、Hugo 校验 | ✅ |
| P3 | 三种编辑模式、浮动 front-matter 面板、可撤销的重命名/删除 | ✅ |
| P4 | 媒体管理、查找与替换、性能打磨 | ✅ |
| P5 | Electron / Tauri 壳 | ⏳ |
| P6 | gpui 原生（待生态就绪） | 🔭 |

已知限制：WYSIWYG 编辑面与实时渲染之间的像素级视觉一致性尚未成为自动化验收保证。

## 参与贡献

欢迎贡献 —— 环境搭建、PR 前需要运行的检查，以及对解析/序列化改动的 round-trip 保证要求，请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢

编辑器的交互设计参考了 [Lexical](https://github.com/facebook/lexical)（键盘驱动的组件选择器）、[BlockSuite](https://github.com/toeverything/BlockSuite)（块操作与上下文控件）和 [Editor.js](https://github.com/codex-team/editor.js)（块插入与设置），并持续构建在 ProseMirror / TipTap 之上。

## 许可证

[MIT](LICENSE)
