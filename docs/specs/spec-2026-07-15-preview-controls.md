# Preview viewport controls and shortcuts

- Status: Implemented
- Date: 2026-07-15
- Scope: Preview 右下角控件、源码撤销/前进、快捷键面板
- Visual reference: `CleanShot 2026-07-15 at 15.52.14@2x.png`

## 1. Summary

重构 Preview 右下角控件，使高频操作保持紧凑，低频操作进入百分比上方的垂直菜单：

```text
[ Undo ] [ Redo ] [ - | 100% | + ] [ Shortcuts ]
                         ↑
                hover / focus / touch menu
```

撤销与前进操作 Mermaid 源码编辑历史，并复用 Monaco 原生 undo/redo stack。缩放按钮在一组确定的比例档位之间跳转。百分比中间区域在桌面端同时承担“点击恢复 100%”和“hover/focus 展开菜单”的职责；触摸设备上点击中间区域只展开菜单，恢复 100% 作为菜单项提供。快捷键按钮打开一个局限在 Preview 内的响应式面板。

## 2. Current-state classification

| Request             | Classification          | Current state                                                          | Decision                                                  |
| ------------------- | ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| 撤销/前进按钮       | Accepted improvement    | Monaco 已有编辑历史，但 Preview 工具栏没有入口，也没有向上暴露历史状态 | 复用 Monaco history，不新增第二套历史模型                 |
| `- 100% +` 缩放控件 | Accepted improvement    | 当前只有点击 `100%` 重置；滚轮和双指可连续缩放                         | 新增离散档位按钮，保留连续手势缩放                        |
| 快捷键面板          | Accepted improvement    | 仅有局部 `Escape` 处理，没有集中说明面板                               | 新增可执行的首批快捷键和响应式说明面板                    |
| 收纳全屏、适应视口  | Accepted improvement    | 两个独立按钮已存在                                                     | 移入百分比触发的垂直菜单                                  |
| 透明背景入口        | Already works, relocate | 当前位于应用顶部栏                                                     | 从顶部栏移除，移入 Preview 垂直菜单，状态和持久化方式不变 |

## 3. Goals

1. 用户可以从 Preview 工具栏对 Mermaid 源码进行任意层级撤销和前进。
2. 用户可以用 `-` / `+` 在可预测的缩放档位间移动，同时继续使用滚轮、触控板和双指进行连续缩放。
3. Preview 右下角只保留四个视觉分组：撤销、前进、缩放组合、快捷键。
4. 全屏、适应视口和透明背景收纳在百分比上方的菜单中，并保持键盘可达。
5. 桌面端快捷键面板从 Preview 右侧进入；窄屏端改为底部 Sheet。
6. 所有列出的快捷键在对应上下文中真实可用，而不是静态说明。

## 4. Non-goals

- 不记录 Preview 的平移、缩放、全屏或输出模式历史。
- 不跨刷新、关闭标签页或重新打开项目持久化 undo/redo stack。
- 不实现选中图形元素或“缩放到选中”。
- 不改变 Mermaid 渲染器、导出格式或编辑器持久化数据结构。
- 不引入新的 UI、手势或状态管理依赖。
- 不重新设计 Preview 左上角的 SVG / Unicode / ASCII 切换器和 Export 菜单。

## 5. Final toolbar structure

从左到右固定为：

1. Undo icon button
2. Redo icon button
3. Zoom segmented control: `- | {currentPercent}% | +`
4. Shortcuts icon button，始终位于最右侧

工具栏继续定位在 Preview viewport 的右下角。全屏模式下，工具栏仍属于全屏 Preview viewport，而不是页面根节点。

### 5.1 Availability

- Undo / Redo 是否可用只取决于 Monaco history，不依赖 Preview 是否成功渲染。
- `-`、百分比和 `+` 在没有当前输出时禁用。
- Shortcuts 始终可用。
- 垂直菜单中的 Fullscreen 和 Fit 在没有当前输出时禁用。
- Transparent background 仅在 SVG 模式可用；Unicode / ASCII 模式下保留菜单项但显示禁用状态和说明。

## 6. Source undo and redo

### 6.1 State ownership

Monaco model 是历史记录的唯一事实来源。不得在 React state、`localStorage` 或 Preview 组件中复制源码快照栈。

`MermaidEditorHandle` 扩展为：

```ts
type MermaidEditorHandle = {
  focus: () => void;
  focusToEnd: () => void;
  layout: () => void;
  undo: () => void;
  redo: () => void;
};
```

`MermaidEditor` 通过新回调向 `App` 报告：

```ts
type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};
```

状态在以下时机同步：

- Monaco editor 创建完成后；
- model 内容变化后，包括输入、粘贴、undo 和 redo；
- model 被替换或编辑器销毁时。

### 6.2 Commands

- Undo 调用 Monaco 的原生 `undo` command。
- Redo 调用 Monaco 的原生 `redo` command。
- 执行工具栏命令后，焦点返回编辑器，用户可以继续输入。
- 连续撤销后再前进，可以逐层回到撤销前状态。
- 在用户撤销后输入新内容时，Monaco 按原生规则清空 redo branch。
- 页面刷新后，当前源码仍由现有 `localStorage` 恢复，但恢复后的文本是新会话基线，Undo / Redo 初始均禁用。

### 6.3 Accessibility

- Buttons use `aria-label="Undo source edit"` and `aria-label="Redo source edit"`.
- Disabled state must use the native `disabled` attribute.
- Tooltip displays the platform label: macOS uses `⌘Z` / `⌘⇧Z`; Windows and Linux use `Ctrl+Z` / `Ctrl+Shift+Z`.

## 7. Zoom model

### 7.1 Range and steps

整体缩放范围调整为 `5%–800%`。滚轮、触控板和双指缩放仍可产生范围内的任意比例。

`-` / `+` 使用以下离散档位：

```text
5, 10, 15, 25, 33, 50, 75, 100, 125, 150, ... , 800
```

精确定义：

```ts
const LOW_ZOOM_STEPS = [5, 10, 15, 25, 33, 50];
const HIGH_ZOOM_STEPS = [75, 100, 125, ...800]; // inclusive, increment 25
```

实现时由纯函数生成完整数组，源码中不手写 75 到 800 的每个值。

### 7.2 Step selection

- `+` 选择严格大于当前显示比例的最小档位。
- `-` 选择严格小于当前显示比例的最大档位。
- 当前比例来自 Fit 或连续缩放、并不在档位上时，仍按上面的“相邻档位”规则处理。
- 在 `5%` 时 `-` 禁用，在 `800%` 时 `+` 禁用。
- 比较时使用小 epsilon，避免浮点误差导致停留在同一档位。

Examples:

| Current |      `-` |      `+` |
| ------: | -------: | -------: |
|     63% |      50% |      75% |
|     50% |      33% |      75% |
|     33% |      25% |      50% |
|     12% |      10% |      15% |
|      5% | disabled |      10% |
|    800% |     775% | disabled |

### 7.3 Zoom anchor and modes

- `-` / `+` 以 Preview viewport 中心为缩放锚点，保持中心画布内容的屏幕位置稳定。
- 点击桌面端百分比区域恢复 `100%` 并重新居中，与当前 `zoomToOneHundredPercent` 行为一致。
- Fit 保持现有逻辑：保留 36px padding，最大不超过 100%，最小可降至 5%。
- 执行 `-`、`+` 或恢复 100% 后退出 auto-fit；后续容器尺寸变化不自动覆盖用户选择。
- 显示值继续使用四舍五入后的整数百分比。

## 8. Percentage flyout menu

### 8.1 Contents

桌面端菜单从上到下为：

1. Fullscreen — `Shift+F`
2. Fit — `Shift+1`
3. Transparent — 无默认快捷键

触摸设备额外在第一项加入：

1. Reset zoom to 100% — `Shift+0`

Transparent background 使用 checkbox/menuitemcheckbox 语义，显示当前开关状态。进入或退出全屏后，Fullscreen 文案和 icon 要同步变为 Exit / Enter 状态。

### 8.2 Desktop interaction

桌面能力条件为 `(hover: hover) and (pointer: fine)`：

- 只有百分比中间区域可以展开菜单；`-` 和 `+` 不触发。
- hover 中间区域或键盘 focus 中间区域时，菜单在控件正上方垂直展开。
- 指针可以从触发器移动到菜单，不得因为间隙立即关闭。
- 指针离开触发器与菜单后延迟 150ms 关闭，减少斜向移动造成的误关。
- 点击百分比立即恢复 100%；只要指针仍在触发区，菜单可以保持打开。
- `Escape` 关闭菜单并将焦点返回百分比按钮。
- 使用键盘 Tab 可进入菜单；方向键按标准 menu pattern 移动，Enter / Space 执行当前项。

### 8.3 Touch interaction — provisional but executable

触摸设备没有 hover，因此当前决定为：

- 点击百分比只打开或关闭菜单，不立即恢复 100%。
- “Reset zoom to 100%”作为菜单第一项提供。
- 点击菜单项后关闭菜单并将焦点返回百分比触发器。
- 点击菜单外部关闭菜单。

这是唯一需要在实现后重点产品验收的交互。验收负责人为产品维护者；验收目标是确认“点击百分比打开菜单”比“点击百分比直接重置”更符合触摸端预期。若验收失败，后续替代方案是为百分比增加独立 chevron，而不是采用不可发现的长按手势。本次实现仍严格按上述当前决定完成。

## 9. Shortcut panel

### 9.1 Trigger

- 使用键盘形状 icon，`aria-label="Open keyboard shortcuts"`。
- 位于整个右下角工具栏最右侧。
- 点击按钮或按 `?` 打开；再次点击按钮、再次按 `?`、按 `Escape` 或点击 Close button 关闭。
- 打开后焦点进入面板的 Close button；关闭后焦点返回 Shortcuts button。
- 同一时间只允许 Export menu、percentage flyout、shortcut panel 三者中的一个打开。

### 9.2 Desktop presentation

在 `min-width: 961px` 下：

- 面板限制在 Preview viewport 内，从右侧滑入。
- `top: 0; right: 0; bottom: 0`，高度等于 Preview viewport。
- 固定宽度 `320px`，同时使用 `max-width: 80%` 防止覆盖过多画布。
- 覆盖画布，不推动或重新计算 editor / preview split layout。
- 不显示遮罩，不因点击面板外部而关闭。
- 右上角提供明确的 Close button。
- 面板打开时，Preview 的其余交互区域设为 inert，避免视觉上无遮罩但键盘或指针操作落到被面板管理的画布上。

### 9.3 Narrow-screen presentation

沿用项目现有 `max-width: 960px` 响应式断点：

- 面板改为底部 Sheet，`left: 0; right: 0; bottom: 0`。
- 宽度 100%，最大高度 `75dvh`，内容超出时面板内部滚动。
- 不显示视觉遮罩；Sheet 外 Preview 保持可见，但设为 inert，不接收指针或键盘操作。
- 右上角保留 Close button。
- 顶部显示 drag handle；向下拖动超过 80px 时关闭，否则回弹。
- `prefers-reduced-motion: reduce` 下禁用滑入和回弹动画，但关闭阈值不变。

### 9.4 Dialog semantics

- Container uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- 面板标题为 `Keyboard shortcuts`。
- 焦点限制在面板内部；Tab / Shift+Tab 循环。
- 页面滚动不应因面板打开而跳动。

## 10. Initial shortcut set

面板按 Editing、Preview、Panels 三组显示。macOS 用 `⌘`，Windows/Linux 用 `Ctrl`；显示文案由平台判断生成，命令语义相同。

| Group   | Action                     | Shortcut             | Scope                                                      |
| ------- | -------------------------- | -------------------- | ---------------------------------------------------------- |
| Editing | Undo source edit           | `⌘/Ctrl + Z`         | Monaco 编辑器原生处理；工具栏按钮可从任意 Preview 状态触发 |
| Editing | Redo source edit           | `⌘/Ctrl + Shift + Z` | Monaco 编辑器原生处理                                      |
| Editing | Redo source edit alias     | `Ctrl + Y`           | Windows/Linux only                                         |
| Preview | Zoom out one step          | `-`                  | Preview 或其工具栏拥有焦点时                               |
| Preview | Zoom in one step           | `+`                  | Preview 或其工具栏拥有焦点时                               |
| Preview | Reset zoom to 100%         | `Shift + 0`          | Preview 或其工具栏拥有焦点时                               |
| Preview | Fit diagram to viewport    | `Shift + 1`          | Preview 或其工具栏拥有焦点时                               |
| Preview | Toggle viewport fullscreen | `Shift + F`          | Preview 或其工具栏拥有焦点时                               |
| Panels  | Toggle keyboard shortcuts  | `?`                  | 页面中非可编辑区域拥有焦点时                               |
| Panels  | Dismiss current surface    | `Escape`             | 当前 Preview surface                                       |

### 10.1 Shortcut safety rules

- Preview-specific shortcuts不得在 Monaco、`input`、`textarea`、`select` 或 contenteditable 内触发。
- Preview viewport 增加可见的 keyboard focus ring 和 `tabIndex=0`，使快捷键上下文可以被明确激活。
- `Shift+0` 替代 `⌘/Ctrl+0`，避免与浏览器页面缩放重置冲突。
- `+` / `-` 只有在 Preview 上下文内才阻止默认行为。
- `Escape` 每次只关闭最上层 surface，优先级为：shortcut panel → percentage flyout → Export menu → fullscreen。
- 打开一个 surface 时主动关闭其他非全屏 surface，避免层级叠加。

## 11. Transparency relocation

从应用顶部栏移除透明背景按钮以及只为该按钮存在的 Header props。透明状态本身继续保存在现有 `EditorState.transparent` 中，不修改 storage key 或迁移数据。

Preview 新增/保留以下 props：

```ts
type MermaidPreviewProps = {
  // existing props omitted
  transparentApplied: boolean;
  canToggleTransparentBackground: boolean;
  onToggleTransparentBackground: () => void;
};
```

菜单操作继续调用 `App.toggleTransparentBackground()`，确保导出 PNG、SVG 渲染和持久化行为与当前实现一致。

## 12. Component and state flow

```text
MermaidEditor
  ├─ owns Monaco model + undo/redo stack
  ├─ exposes undo()/redo() through ref
  └─ reports canUndo/canRedo
             ↓
            App
  ├─ coordinates editor history controls
  ├─ owns persisted transparent state
  └─ passes commands/state into Preview
             ↓
MermaidPreview
  ├─ owns scale, offset, autoFit, fullscreen
  ├─ renders bottom-right controls + flyout
  └─ owns shortcut panel open state
             ↓
PreviewShortcutsPanel
  └─ presentational dialog + responsive sheet behavior
```

没有反向依赖：Preview 不直接导入 Editor，Editor 不知道 Preview 的存在。

## 13. File-level implementation plan

本功能预计触及 8 个文件，不新增服务、运行时或第三方依赖：

1. `src/components/MermaidEditor.tsx`
   - 扩展 imperative handle。
   - 执行 Monaco 原生 undo/redo。
   - 报告 `canUndo` / `canRedo`。
2. `src/App.tsx`
   - 保存轻量 `EditorHistoryState`。
   - 将 undo/redo command 和状态传给 Preview。
   - 从 Header 移除 transparent control，并把 toggle callback 传给 Preview。
3. `src/components/MermaidPreview.tsx`
   - 重构右下角工具栏。
   - 接入离散缩放、百分比 flyout、快捷键和 surface arbitration。
4. `src/components/PreviewShortcutsPanel.tsx`
   - 新增纯 UI dialog，负责分组列表、焦点循环、Close button 和移动端拖动关闭。
5. `src/utils/previewControls.ts`
   - 提供 zoom step 生成、上一步/下一步选择和可测试的 shortcut resolution。
6. `src/styles/global.css`
   - 工具栏 segmented layout、垂直菜单、右侧 dialog、底部 Sheet、focus ring 和 reduced-motion 样式。
7. `test/preview-controls.test.ts`
   - 覆盖 zoom ladder、非整档选择、边界、shortcut mapping 和 editable-target guard。
8. `test/workspace-layout-css.test.ts`
   - 扩展布局断言，保证面板限制在 Preview、桌面宽度和窄屏 Sheet 定位不回归。

本需求作为一个合并单元实施；拆分会让“移除旧入口”和“提供新入口”在中间阶段产生不可用状态。

## 14. Acceptance criteria

### 14.1 Editing history

- 连续输入三次后可以逐层 Undo 三次，再逐层 Redo 三次。
- Undo 后输入新内容，Redo 立即禁用。
- 键盘命令与按钮共享同一 history stack。
- Mermaid 语法错误导致 Preview 无输出时，Undo / Redo 仍可用。
- 刷新页面后源码恢复，但 Undo / Redo 初始禁用。

### 14.2 Zoom

- `50 → 33 → 25 → 15 → 10 → 5` 可通过连续点击 `-` 得到。
- `50 → 75 → 100 → 125` 可通过连续点击 `+` 得到。
- Fit 得到 63% 时，`-` 到 50%，`+` 到 75%。
- 达到 5% / 800% 时相应按钮禁用。
- 连续手势仍可产生 63% 等非档位值。
- 缩放按钮保持 viewport 中心内容稳定，不发生明显跳边。

### 14.3 Flyout

- 只有中间百分比区域触发菜单。
- Desktop hover、focus 和键盘导航均可使用菜单。
- Fullscreen、Fit、Transparency 的行为与原有入口一致。
- 顶部应用栏不再显示透明背景按钮。
- Touch 点击百分比打开包含 Reset 100% 的菜单。

### 14.4 Shortcut panel

- Desktop 面板宽 320px、不超过 Preview 的 80%，高度等于 Preview viewport，无遮罩。
- Narrow screen 显示不超过 75dvh 的底部 Sheet，无遮罩。
- Close button、`?` 和 `Escape` 都能关闭并恢复焦点。
- 面板外 Preview 在打开期间不可交互。
- 所有列出的快捷键实际生效，并且在 Monaco 输入时不误触 Preview 命令。

### 14.5 Accessibility and motion

- 所有 icon-only buttons 有明确 accessible name 和 native disabled state。
- 菜单、dialog 和 checkbox item 使用正确语义。
- 仅使用键盘可完成打开、导航、执行和关闭。
- Reduced-motion 环境没有滑入、回弹或 flyout 动画。

## 15. Verification

Automated:

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

Manual desktop checks:

1. 在 Monaco 中建立至少三层编辑历史，交叉使用按钮和键盘验证同一 stack。
2. 验证 SVG、Unicode、ASCII 以及 Mermaid error 四种状态下的 enable/disable 行为。
3. 用 mouse wheel 产生非档位比例，再用 `-` / `+` 验证相邻档位选择。
4. 验证 hover 菜单的 pointer safe path、keyboard focus、Escape 和 fullscreen 状态。
5. 打开快捷键面板，确认不改变 split ratio、不显示遮罩、Preview 背景不可交互。

Manual responsive checks at `960px` and below:

1. 验证底部 Sheet 的高度、内部滚动、Close button 和 80px 下滑阈值。
2. 验证点击百分比打开菜单，Reset 100% 可达。
3. 验证没有 hover 依赖，触摸目标不小于 44×44 CSS px。
4. 记录移动端百分比触发是否容易理解，作为暂定交互的产品验收结果。

## 16. Risks and rejected alternatives

### Primary risk

移动端百分比同时无法自然承担“立即重置”和“打开菜单”两种点击行为。当前选择优先菜单可发现性，并把 Reset 100% 放进菜单；若真实设备验收不通过，再采用显式 chevron，不使用长按。

### Other risks

- Monaco history availability must be sampled after every model change;只在 React code state 上推断会产生错误的 disabled state。
- Hover menu 如果没有关闭延迟和触发器到菜单的连续 hover region，会难以点击。
- `Shift+1`、`+`、`-` 在编辑器中有文本含义，因此必须执行 editable-target guard。
- Shortcut panel 没有视觉遮罩但具有 modal/inert 行为，需要清晰边界、阴影和 Close button 表达状态。

### Rejected alternatives

- **Custom source snapshot history**: 与 Monaco 原生 stack 重复，容易造成键盘与按钮历史分叉。
- **Keep Fullscreen and Fit as separate buttons**: 不满足收拢工具栏的目标，并继续挤占右下角空间。
- **Use `⌘/Ctrl+0` for 100%**: 会与浏览器页面缩放命令冲突。
- **Long press percentage on touch**: 可发现性差，且与拖动 Preview 手势冲突。
- **Push Preview content when shortcut panel opens**: 会触发重新布局和 auto-fit，打开说明面板不应改变用户的画布状态。

## 17. Dependencies and rollback

- No external APIs, credentials, services, migrations, or new packages.
- 变更只涉及前端组件、样式和测试。
- 回滚时应作为一个整体恢复：顶部透明入口、旧的三个 viewport controls、Preview props 和新增测试必须同步回退。
- `EditorState` schema 和 storage key 不变，因此回滚不需要清理用户数据。

## 18. Approval record

The following decisions were explicitly confirmed during specification:

- Undo / Redo targets Mermaid source history.
- Shortcut panel is contained by Preview.
- Initial listed shortcuts must be implemented.
- Desktop percentage center alone opens the flyout; click still resets to 100%.
- Flyout contains Fullscreen, Fit, and Transparent background.
- The original header transparency button is removed.
- Desktop shortcut panel is 320px / max 80%, with no visual overlay and a Close button.
- Narrow screens use a no-overlay bottom Sheet; outside Preview is visible but inert.
- Touch percentage behavior is provisionally “tap to open menu; reset inside menu.”
- Zoom uses low-end custom steps followed by 25-point steps from 50% upward.
- Undo / Redo history is session-only and backed by Monaco.
