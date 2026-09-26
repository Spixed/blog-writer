# Writer Test 修复与验证（2026-09-24）

依据：`D:/Projects/blog/content/zh/post/writer-test.md` 末尾的最新问题清单。

## 实现

- Ctrl / Cmd + 单击链接在 ProseMirror 的 DOM 事件阶段处理，避免点击先被编辑器插件消费。
- 渲染 worker 的异常、消息错误与超时均有终止路径；首次失败重启并恢复 Qmoji 映射，连续失败提供可见错误和重试。渲染继续留在 worker，不回退到 UI 线程解析大文档。
- MathJax 初始化和脚本加载失败不再留下永不结束的 Promise；显式加载化学公式扩展。启动时禁止自动扫描编辑器，由各渲染节点排队处理。
- Lottie 动画离屏或页面不可见时暂停，节点卸载时销毁。切换模式不会积累旧动画实例。
- 代码块的语言标签和行号独立于可编辑代码。横向滚动只移动代码；行号不进入编辑器文档、复制文本或 Markdown。预览同步补上行号，滚动条和工具栏沿用 Polymer 规则。
- 文章列表展示作者。
- UI 使用墨绿文章资料栏、暖色工作区、清晰的文章标题和保存状态。重做主题菜单及配图面板：地址预览、加载失败恢复、媒体搜索与选中状态、图注、键盘取消和焦点约束。

## 验证

- 全工作区 typecheck、前端生产构建通过。构建仍提示部分 bundle 超过 500KB。
- 15 篇中英文文章的 prose round-trip、schema、block 测试通过。往返测试断言稳定性与文本保留，不等同于字节级相等。
- Hugo 渲染结构对照通过（草稿 Writer Test 不由常规 Hugo 构建输出，另用真实浏览器检查）。
- 服务端原有测试通过；UI SSR smoke 通过，仍有 TipTap 的 SSR useLayoutEffect 提示。
- `browser-writer-test.cjs` 在开发版及最终生产构建均通过：5 个公式（包含化学）、4 个 Qmoji（2 个动画）、作者、Ctrl 单击、固定代码标签、行号随编辑更新、撤销、即时渲染、深浅色、图片预览从错误恢复、媒体选择与插入、窄屏无页面横向溢出。
- 同一测试确认离屏动画暂停，WYSIWYG 卸载后只剩预览自己的两个动画实例。
- `browser-render-recovery.cjs` 在开发版和生产构建均通过：连续 worker 故障结束 loading；手动重试恢复；单次故障自动重启且保留短码映射。
- `browser-writer-performance.cjs` 使用 Writer Test 的实际块重复构造混合文档，含 48 个代码块、48 张表格、120 个公式、96 个 Qmoji。2026-09-24 修正字节计数以包含 raw block 源文本后，实测 40,656 字节。完成初始渲染后记录 40 次输入及 20 次滚动：命令 P95 3.2ms，最大 3.7ms，无观测到的 >50ms 长任务。初始加载不包括在该输入性能数字中。

## 范围与限制

- 原问题中的空白渲染在干净启动后没有持续复现，因此没有把任何猜测当作唯一根因；本次补齐渲染失败的生命周期，并用故障注入验证恢复行为。
- MathJax、字体和 Qmoji 仍使用现有的外部 CDN。完整渲染测试在允许网络访问的浏览器中执行；断网时公式保留 TeX，不冒充渲染成功。
- 缺失的英文 Writer Test 仍会产生 `/api/posts/en/writer-test` 404。这是现有双语预取行为，不影响中文测试。
- 浏览器测试使用临时上下文，禁止 POST/PUT 等写入 API。图片选择和插入仅发生在内存文档中；本轮未对真实博客上传素材或保存测试编辑。
- 本目录没有 Git 元数据，因此没有生成提交或 PR。

## 运行浏览器检查

先启动 `bun dev`。脚本使用 `playwright-core`；如它未安装在项目中，使用 `PLAYWRIGHT_MODULE` 指定已安装模块的位置。`CHROME_PATH` 可指向已安装的 Chromium，`WRITER_URL` 默认为 `http://localhost:5173`。

```text
node packages/frontend/test/browser-writer-test.cjs
node packages/frontend/test/browser-render-recovery.cjs
node packages/frontend/test/browser-writer-performance.cjs
```

截图保存在项目根目录 `.shots/writer-test/`。

## 2026-09-24 UI 与维护性复查

- 工作区、主题、文章排序、作者筛选、代码语言、Qmoji 显示方式及文章作者选择改用同一个键盘可操作的菜单组件。弹层使用顶层定位，避免被工具栏和 Front Matter 面板裁切。应用操作图标统一为 Lucide；格式含义明确的 B/I/H 与注音文字仍保留文字标识。
- 修复子菜单按 Esc 时误关整个对话框；切换工作区后清除旧工作区的查询结果和文章选中状态，并以工作区名称隔离未保存草稿；作者筛选值失效时自动清空。
- 参照实际 Hugo 构建的 Writer Test 代码块，校准即时预览中的 C 类型、函数名、预处理指令以及 Python 内置函数和字符串颜色。浏览器测试断言 C 代码 token 的计算后颜色。
- `test:render` 曾因 Hugo 将相对输出目录解析到博客目录、而检查脚本读取另一目录，导致所有缺失页面被误当草稿跳过。现改为固定的项目临时目录，并要求至少比较到一个 Hugo 页面；复跑结果为 15 篇渲染、14 篇与 Hugo 比较、1 篇草稿跳过、0 个问题。
- 性能脚本曾用 `editor.getText()` 估算文档大小，漏算 raw block 源文本；现遍历文档计入这些内容，生产浏览器复跑为 40,656 字节、P95 3.2ms、0 个长任务。worker 故障恢复回归也再次通过。
- 删除不再使用的旧 Hugo 构建目录、临时差异文件、误生成的 `nul` 文件与失效 CSS 规则。生成的渲染测试站点位于 `.runtime/render-testsite/`，由 `.gitignore` 忽略。
- 全工作区类型检查、生产构建、15 篇文章的 prose/schema/block 检查、Hugo 渲染对照、UI smoke 和最终生产浏览器回归通过。构建仍提示主包超过 500KB；UI smoke 仍有 TipTap 在 SSR 环境下的 `useLayoutEffect` 提示。
