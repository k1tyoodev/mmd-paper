# UI/UX polish: feedback overlap, theme flash, empty state, mobile panes, a11y

- Status: Implemented
- Date: 2026-07-16
- Scope: 全局 UI/UX 打磨 —— 缺陷修复、空态与错误反馈、移动端布局、键盘可达性、System 主题
- Evidence: 代码通读 + Chrome headless 截图（desktop light/dark、empty、error、unicode、mobile 390px）

## 1. Summary

本轮不改变产品边界（仍是"贴 Mermaid、看渲染、导出"的单页工具），只修已证实的问题并补齐交互欠账：

1. 错误/警告横幅与 Preview 右下角控件重叠，长错误文本被按钮截断（截图实证）。
2. 暗色用户每次刷新先看到一帧亮色（`data-theme` 在 `useEffect` 才设置）。
3. 空编辑器时 Preview 完全空白，无任何引导。
4. 移动端 50/50 上下分屏写死，无法单面板全高；部分触控目标 < 44px。
5. 分隔条不可键盘操作；Export 菜单键盘导航不完整（viewport 菜单已做全套，两者不一致）。
6. 主题仅亮/暗硬切换，补 System 跟随模式。

## 2. Current-state classification

| Item                                      | Classification       | Evidence                                                                                                | Decision                                        |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 错误横幅被右下控件截断                    | Bug                  | `.feedback-layer` 贴底全宽（`global.css:1149`），控件 z-index 6 压盖；截图文本断在按钮后                | 横幅整体上移到控件行之上，文本 3 行截断         |
| 暗色首屏闪白                              | Bug                  | `App.tsx:383` 在 effect 中设置 `data-theme`，首帧按 `:root` 亮色渲染                                    | `index.html` 加阻塞内联脚本                     |
| 死代码                                    | Cosmetic debt        | `.transparent-toggle-button`、`.preview-toolbar-left`、两条 `:fullscreen`、`#app-popover-root` 均无引用 | 删除                                            |
| 字体重复加载                              | Perf defect          | `global.css:1` `@import`（缺 Noto Sans SC）与 `App.tsx:98` JS 注入重复，且 `@import` 阻塞首绘           | 收敛为 `index.html` link + preconnect           |
| 空态无引导                                | Accepted improvement | 空 code → 空白点阵画布 + 全部禁用（截图实证）                                                           | 居中空态卡片 + Insert example                   |
| 错误文案原始透传、无播报                  | Accepted improvement | renderer chunk 加载失败与语法错误未分级；`role="alert"` 缺失                                            | 加载失败给固定人话文案；错误块加 `role="alert"` |
| 移动端分屏不可调                          | Accepted improvement | `global.css:1261-1278` 强制 50/50，分隔条隐藏，收起状态被覆盖（截图：3 行代码占半屏）                   | 改为 Editor/Preview 单面板分段切换              |
| 移动端触控目标不足                        | Bug (a11y)           | `.segmented-button` min-height 26px；export 按钮 28px；主题切换 28px                                    | 触控目标提升到 ≥40px，canvas 内 44px            |
| 分隔条无键盘操作                          | Accepted improvement | `role="separator"` 无 tabIndex / aria-valuenow / 方向键                                                 | 补 WAI window-splitter 模式                     |
| Export 菜单键盘不完整                     | Accepted improvement | 无方向键导航、打开不移焦、关闭不回焦（viewport 菜单已全套实现）                                         | 对齐 viewport 菜单的 menu pattern               |
| System 主题                               | Accepted improvement | 仅 light/dark 硬切换，无存储值时不监听系统变化                                                          | 三态 light/dark/system                          |
| 分享链接（URL hash）                      | Out of scope (本轮)  | 提问未选择                                                                                              | 记为 deferred，另立 spec                        |
| PNG 倍率选择 / 文本 .txt 下载             | Out of scope (本轮)  | 提问未选择                                                                                              | 不做                                            |
| hover 打开 viewport 菜单、undo 在 Preview | Already works        | 前一版 spec 的明确决定                                                                                  | 保持，不动                                      |

## 3. Goals

1. 任何渲染错误/警告文本都不被控件遮挡，超长文本可预期地截断且可读全文。
2. 暗色用户刷新无亮色闪帧。
3. 空编辑器时 Preview 给出明确下一步动作。
4. 移动端可以单面板全高查看或编辑，所有触控目标 ≥40px。
5. 仅键盘可完成：移动分隔条、打开并操作 Export 菜单。
6. 主题支持跟随系统，系统主题变化时实时生效。

## 4. Non-goals

- 不做分享链接、PNG 倍率选择、文本文件下载（本轮明确排除）。
- 不重排桌面端布局，不动 viewport 菜单 hover 交互、undo/redo 位置等既有 spec 决定。
- 不替换渲染器、不改 `EditorState` storage key、不迁移用户数据。
- 不引入新依赖、新语言或新服务。

## 5. Phase 1 — 缺陷修复 + System 主题

### 5.1 反馈横幅避让控件

- 横幅（错误块与警告栈）bottom 偏移改为控件行上方：
  - 桌面：`bottom: 52px`（控件 bottom 12 + 高 32 + 间距 8）。
  - ≤960px：`bottom: 62px`（10 + 44 + 8）。
- 错误/警告文本 3 行截断：`-webkit-line-clamp: 3`，完整文本放 `title` 属性。
- z-index 层级不变（横幅 4，控件 6），只改位置，不新增层叠上下文。

### 5.2 暗色闪白

`index.html` `<head>` 内、任何可绘制元素之前加阻塞内联脚本（逻辑与 `App.getInitialColorMode` 对齐，有意重复——阻塞脚本不能 import 模块，两处用注释互相引用）：

```html
<script>
  // Keep in sync with src/App.tsx getInitialColorMode.
  try {
    var t = localStorage.getItem('mmd-paper-theme');
    if (t !== 'light' && t !== 'dark' && t !== 'system') {
      t = 'system';
    }
    var resolved =
      t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  } catch (e) {}
</script>
```

`App.tsx` 的 effect 保持幂等设置，不变。

### 5.3 死代码与字体加载

- 删除 CSS：`.transparent-toggle-button` 规则（`global.css:293`）、`.preview-toolbar-left` 及其共享选择器中的该分支（`:620`、`:630`）、`.preview-stage:fullscreen`（`:602`）、`.preview-viewport:fullscreen`（`:608`）。
- 删除 `index.html` 中 `<div id="app-popover-root">`。
- 字体：`APP_FONTS_HREF`（含 Noto Sans SC 的完整 URL）移入 `index.html`，配 `preconnect` 到 `fonts.googleapis.com` 与 `fonts.gstatic.com`（crossorigin）；删除 `global.css:1` 的 `@import url(...)`（保留 `@import "tailwindcss"`）。
- `ensureGeistFontsLoaded` 改名为 `warmupAppFonts`，删除 link 注入逻辑，仅保留三个 `document.fonts.load` 预热调用。

### 5.4 System 主题

- `ColorMode` 扩展为 `"light" | "dark" | "system"`，storage key 不变，允许存入 `"system"`。
- 新增 `src/utils/colorMode.ts` 纯函数：
  - `parseStoredColorMode(value: unknown): ColorMode` —— 非法值归一为 `"system"`。
  - `resolveColorMode(mode, prefersDark): "light" | "dark"`。
  - `nextColorMode(mode): ColorMode` —— light → dark → system 循环。
- `App` 持有 `colorMode`（三态）与 `resolvedColorMode`（二态）；`resolvedColorMode` 驱动 tokens、Monaco、`data-theme`。`colorMode === "system"` 时监听 `matchMedia("(prefers-color-scheme: dark)")` 的 `change` 事件实时更新。
- 头部主题按钮改为单击循环 light → dark → system，图标依次 `Sun` / `Moon` / `SunMoon`；`title` 与 `aria-label` 显示当前模式与下一跳（如 `Theme: system. Switch to light theme`）。不做三选一分段控件（头部空间与操作频率不匹配，见 Risks）。
- 5.2 的内联脚本已按三态写好，两个 phase 不重复触碰。

## 6. Phase 2 — 空态与错误反馈

### 6.1 空态引导

- 新组件 `src/components/PreviewEmptyState.tsx`（纯展示）：`Workflow` 图标（20px、`--muted`）、标题 `No diagram yet`（13px/500）、说明 `Paste Mermaid source in the editor, or start from the example.`、次按钮 `Insert example`（高 32px）。
- `MermaidPreview` 新增 props：`isEmpty: boolean`（`state.code.trim() === ""`）、`onInsertExample: () => void`。`isEmpty` 时在 viewport 居中渲染该卡片，点阵背景保留；缩放等控件维持禁用（现有 `hasCurrentOutput` 逻辑不变）。
- `App.handleInsertExample`：`updateState` 写入默认示例 code，并触发 `editorFocusToEndToken` 聚焦编辑器。`usePlaygroundState.ts` 导出 `DEFAULT_CODE`（当前模块私有）。
- 卡片仅在 code 为空时渲染，不存在覆盖用户内容的路径。

### 6.2 错误反馈分级

- renderer chunk 加载失败（`isRendererLoadError`）文案固定为：`Renderer failed to load. Check your connection and reload the page.`，原始错误只进 console。语法/布局错误继续透传渲染器消息（配合 5.1 的 3 行截断与 `title` 全文）。
- 错误块加 `role="alert"`；警告栈不加 live region（持续性上下文，避免重复播报）。

## 7. Phase 3 — 移动端布局

### 7.1 单面板分段切换（≤960px）

- `App` 新增会话内状态 `mobilePane: "editor" | "preview"`（不持久化），默认 `"preview"`（落地先看到示例渲染结果；已有 code 几乎总是存在）。
- Header 中部增加 `Editor / Preview` 分段切换（复用 `.segmented-button` 视觉），仅 ≤960px 显示（`display: none` ≥961px），`aria-pressed`/`data-active` 表达当前面板。
- workspace 根加 `data-mobile-pane` 属性；≤960px 时：非激活面板 `display: none`，激活面板 `flex: 1 1 100%`；删除现有 50/50 强制覆盖块（`global.css:1261-1278`），移动端忽略 `workspaceMode`（保持现状语义）。
- 切到 editor 时调用 `editorRef.current?.layout()` 强制 Monaco 重排；切到 preview 由现有 `ResizeObserver` + auto-fit 自动 refit。
- App mount 时的 `focusToEnd` 增加 `(min-width: 961px)` 门槛：移动端不在加载时抢焦（避免弹出软键盘 + 默认面板是 preview）。

### 7.2 触控目标

- ≤960px：`.segmented-button` min-height 44px（canvas 内输出模式切换）；`.export-menu-button` min-height 40px、`.panel-header` min-height 48px；`.header-icon-button` 40px（`.mmd-header` 52px 不变）。
- 已有的 viewport 控件组（44px）与 shortcuts sheet 不变。

## 8. Phase 4 — 键盘与无障碍

### 8.1 分隔条 window-splitter 模式

- divider 加 `tabIndex={0}`、`aria-valuenow={Math.round(splitRatio * 100)}`、`aria-valuemin={0}`、`aria-valuemax={100}`（`aria-orientation="vertical"` 与动态 `aria-label` 已有）。
- `useSplitPane` 新增 `handleDividerKeyDown`：
  - split 模式：`ArrowLeft` / `ArrowRight` 以 0.02 步进调 ratio（Shift 为 0.10），走现有 `setHealthyRatio` 钳制路径。
  - hidden 稳定态：任意方向键触发 `restoreToLastSplit()`。
- `PreviewShortcutsPanel` 的 Panels 组加一行：`Resize split (divider focused)` — `←` `→`。

### 8.2 Export 菜单 keyboard pattern

- 对齐 viewport 菜单：打开后焦点移到第一个可用项；`ArrowUp` / `ArrowDown` 循环（`Home` / `End` 跳首尾）；`Escape` 关闭并回焦 Export 按钮；执行菜单项后也回焦 Export 按钮。
- `src/utils/previewControls.ts` 新增共享 helper `moveMenuFocus(items: HTMLElement[], current: HTMLElement | null, direction: 1 | -1): HTMLElement | null`，两个菜单共用（该函数依赖 DOM，不补单测，走人工 a11y 验收）。

## 9. File-level implementation plan

本需求触及 12 个文件（>8，明确知悉），不新增依赖；按 4 个 phase 独立合并，每个 phase 落地后系统均为可用状态：

Phase 1：

1. `index.html` — 内联主题脚本、字体 link + preconnect、删 `#app-popover-root`。
2. `src/styles/global.css` — 横幅 bottom 偏移与 3 行截断、删死代码、删 `@import` 字体。
3. `src/App.tsx` — 三态主题 + media 监听 + resolved mode；`warmupAppFonts` 简化。
4. `src/utils/colorMode.ts`（新）+ `test/color-mode.test.ts`（新）。

Phase 2：

5. `src/components/PreviewEmptyState.tsx`（新）。
6. `src/components/MermaidPreview.tsx` — `isEmpty` / `onInsertExample` 接线、`role="alert"`、错误 `title`。
7. `src/hooks/usePlaygroundState.ts` — 导出 `DEFAULT_CODE`。
8. `src/hooks/useBeautifulRenderer.ts` — 加载失败固定文案。
9. `src/App.tsx` — `handleInsertExample`。

Phase 3：

10. `src/App.tsx` — `mobilePane` 状态、Header 分段切换、`data-mobile-pane`、mount focus 门槛。
11. `src/styles/global.css` — ≤960px 单面板规则、删 50/50 覆盖块、触控目标。

Phase 4：

12. `src/hooks/useSplitPane.ts` + `src/App.tsx` — `handleDividerKeyDown` 与 aria 属性。
13. `src/components/MermaidPreview.tsx` + `src/utils/previewControls.ts` — Export 菜单键盘导航与共享 helper。
14. `src/components/PreviewShortcutsPanel.tsx` — 新增分隔条快捷键行。
15. `test/workspace-layout-css.test.ts` — 新增移动端单面板与横幅偏移的 CSS 断言。

（编号为去重后的实际文件清单；同一文件跨 phase 出现时按 phase 顺序小步提交。）

## 10. Acceptance criteria

### 10.1 Phase 1

- 构造 200+ 字符的语法错误：错误文本完整显示于控件行上方，不进入按钮区域；hover 可见 `title` 全文。
- 暗色模式刷新页面（含网络限速）：全程无亮色闪帧。
- System 模式下切换 macOS 外观，页面主题即时跟随；按钮循环三态且刷新后保持。
- `rg` 检索 `.transparent-toggle-button` / `.preview-toolbar-left` / `:fullscreen` / `app-popover-root` 零引用；网络面板无重复 Google Fonts CSS 请求。

### 10.2 Phase 2

- 清空编辑器：Preview 显示空态卡片；点 Insert example 后渲染示例图且编辑器聚焦到末尾。
- 断网刷新（模拟 chunk 加载失败）：错误显示固定人话文案；语法错误仍显示渲染器消息。
- 读屏软件（VoiceOver）在错误出现时自动播报。

### 10.3 Phase 3

- 390px 宽度：Header 分段切换可切 Editor / Preview 单面板全高；切回 Editor 时光标、选区、滚动位置无异常。
- 移动端加载后不自动弹出软键盘。
- canvas 内分段切换实测高度 44px，export 按钮 40px。

### 10.4 Phase 4

- 仅键盘：Tab 到分隔条 → 方向键按比例缩放（`aria-valuenow` 同步）→ 编辑器隐藏态下方向键恢复分屏。
- 仅键盘：打开 Export 菜单 → 方向键遍历 → Enter 执行 → 焦点回到 Export 按钮；`Escape` 同路径回焦。
- `prefers-reduced-motion` 下无新增动画（本轮不引入新动画）。

## 11. Verification

Automated:

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

Manual desktop checks（Chrome + Safari）:

1. 暗色刷新无闪白；System 模式跟随系统切换。
2. 长错误、多条警告与控件的位置关系（含全屏 preview 内）。
3. 空态 → Insert example → 渲染 → Undo 可回退。
4. 键盘-only 完成 10.4 全部路径。

Manual responsive checks（390×844，touch 模拟）:

1. 分段切换单面板，Monaco 重排无残影。
2. 输出模式切换与 export 菜单可单手操作，无 26px 高度目标。
3. 加载后不弹软键盘；点 Editor 后才弹出。

## 12. Risks and rejected alternatives

### Primary risk

移动端 `display: none` 隐藏 Monaco 后再显示可能出现尺寸/光标错位。缓解：激活 editor 面板时显式 `layout()` + 现有字体加载重测逻辑兜底；验收 10.3 覆盖。

### Other risks

- 内联阻塞脚本与 `App.getInitialColorMode` 逻辑重复，存在漂移风险 → 两处注释互相引用；三态解析抽到 `colorMode.ts` 并有单测，内联脚本只保留最小副本。
- 三态循环按钮的可发现性弱于三选一分段 → `title`/`aria-label` 明示当前与下一状态；主题属低频操作，可接受。
- 默认移动端落地为 preview，可能打断"回来继续编辑"的预期 → 切换一次即达，且会话内保持选择。
- 横幅上移后在超低高度视口可能遮挡更多画布 → 3 行截断封顶，可接受。

### Rejected alternatives

- **分享链接 / PNG 倍率 / .txt 下载**：本轮明确排除（提问未选择）；分享链接涉及 URL 长度上限与格式版本化，值得独立 spec。
- **头部三态分段控件替代循环按钮**：占用头部空间，主题切换为低频操作。
- **移动端保留 50/50 + 折叠按钮**：仍是上下堆叠，小屏下两个面板都不可用，不解决根本问题。
- **横幅改放顶部**：顶部有输出模式分段控件，同样冲突，且错误出现在视线底部符合既有布局。
- **修改 hover 打开 viewport 菜单、undo/redo 挪到 Editor 侧**：前一版 spec 的明确决定，不动。

## 13. Dependencies and rollback

- 无外部 API、凭证、服务、数据迁移或新包。
- `mmd-paper-theme` 存储值向后兼容：`light` / `dark` 原值语义不变，非法旧值归一为 `system`。
- 每个 phase 可独立 revert；`index.html` 内联脚本与三态主题同属 Phase 1，不存在跨 phase 的提交顺序依赖。
- 空态的 `DEFAULT_CODE` 导出为只读引用，不改变持久化结构。

## 14. Approval record

The following decisions were explicitly confirmed during specification:

- A（缺陷修复）、B（空态与错误反馈）、C（移动端布局）、D（键盘与无障碍）四组全部纳入。
- System 主题模式纳入；PNG 倍率、文本 .txt 下载不纳入。
- 分享链接本轮不纳入，记为 deferred。

Open items answered by recommendation (提问未作答，按推荐默认值处理，可在实现前修订):

- 移动端布局采用 Header `Editor / Preview` 分段切换（推荐方案），默认面板为 preview。
- 主题按钮采用三态循环单按钮（推荐方案），不做三选一分段。
