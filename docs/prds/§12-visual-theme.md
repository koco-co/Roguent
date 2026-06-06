---
id: "§12"
title: 视觉系统·主题·设置
status: partial
layer: web
updated: 2026-06-06
depends_on: []
related: ["§3", "§4", "§7", "§13"]
code_refs:
  - src/web/styles.css
  - src/web/hud/icons.tsx
  - src/web/settings-store.ts
  - src/web/stage-scale.ts
  - src/web/hud/Settings.tsx
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---

# §12 视觉系统·主题·设置

## 1. 定位

全站视觉基础设施。为 Roguent 所有界面层提供统一的暖木 RPG 主题 token、自绘像素图标、自托管中文像素字体、固定逻辑舞台等比缩放机制以及前端外观偏好的持久化存储。所有子系统(房间渲染、大厅、HUD shell 等)消费本层产出;本层不依赖其它业务子系统。

## 2. 为什么

**严格对齐 Claude Design 原型**:设计原型(含 Fusion Pixel 字体、暖木调色板、像素 chrome)是 Roguent 观感的权威来源。若由各子系统自行维护颜色/字体/图标,极易漂移。集中到一个基础层能保证原型还原精度。

**修复小屏人物/HUD 过大**:没有固定逻辑舞台时,像素人物和 HUD 在低分辨率屏幕上因 CSS 布局流动而过大,失去像素地牢的比例感。固定 1920×1080 逻辑舞台 + 等比 scale 让任意屏幕都保持设计比例,letterbox 居中,不裁切。

**CDN 不可靠**:Fusion Pixel 字体若走 CDN,在离线/内网环境下会回落系统字体,破坏像素风。自托管到 `public/fonts/` 确保字体始终可用。

## 3. 功能点

- **暖木 token + 像素 chrome**:在 `styles.css` 的 `:root` 定义全套 CSS 自定义属性(设计 token):`--ink`(深背景 `#0b0a12`)、`--panel`/`--panel-2`(木质面板)、`--edge-dark`/`--edge-light`(像素斜角边框)、`--gold`/`--cyan`/`--pink`/`--green`/`--purple`(语义调色板)、`--text`/`--muted`(文字层级)、`--hp`/`--shield`/`--mp`(状态栏语义色)、`--accent`/`--core-glow`(运行时可覆盖的强调色)。提供 `.bevel-frame` 像素斜角边框通用 chrome。
- **自绘 SVG 图标(33 个)**:在 `icons.tsx` 以矩形组合(`Rect` = `{x,y,w,h,c}`)描述图标形状,在 16px 网格上手绘,深色轮廓 `#2c1c10`,左上光源高光/阴影层次。图标名集合:`heart / gem / coins / gemcur / laurel / spellbook / pouch / chat / crystal / import / quest / shop / trophy / gear / menu / account / pause / read / write / bash / search / task / mcp / ask / todo / idle / done / error / compact / claude / codex / save / vault`。导出 `ICON_ART`、`IconName`、`ICON_NAMES`、`Icon` 组件(支持 `size`/`glow`/`className`)。
- **自托管 Fusion Pixel 中文字体(不走 CDN)**:`public/fonts/fusion-pixel-12px-proportional-sc-400-normal.woff2`(TakWolf,OFL-1.1)。`styles.css` `@font-face` 挂载为 `"Fusion Pixel 12px Proportional SC"`,`--font-cjk`/`--font-px` 两个 token 均优先引用此字体;`cjk-sys` 类可将 `--font-cjk` 回落到系统中文字体(PingFang SC 等)。
- **settings-store(外观偏好持久化)**:`src/web/settings-store.ts` 提供 Zustand store `useSettingsStore`,管理以下字段:
  - `accent: string`(强调色 hex,默认 `#36c5e0`,驱动 `--accent`)
  - `theme: "teal" | "forest" | "cyber"`(辉光色主题,默认 `"teal"`,驱动 `--core-glow`)
  - `motion: boolean`(动效开关,`false` → `no-motion` 类)
  - `density: "comfy" | "compact"`(HUD 密度,`"compact"` → `hud-compact` 类)
  - `cjkPixel: boolean`(像素中文字体,`false` → `cjk-sys` 类回落系统字体)
  - `avatarHero: string | null`(英雄头像选择,回落 HubPlaza 默认)
  持久化到 `localStorage` 键 `"roguent:settings"`;不用 zustand persist 中间件(bun:test 无 localStorage 全局,手动守卫)。导出 `settingsRootClass()`(生成 `#stage` 的根 class 字符串)和 `settingsRootStyle()`(生成 `--accent`/`--core-glow` inline style 对象)。
- **固定 1920×1080 逻辑舞台等比缩放**:`src/web/stage-scale.ts` 导出 `STAGE_W=1920`、`STAGE_H=1080`、`stageScale(winW,winH)=Math.min(winW/1920,winH/1080)`。`App.tsx` 的 `useStageScale` hook 监听 resize 事件,命令式写入 `#viewport` 的 CSS 变量 `--stage-scale`;`styles.css` 的 `#stage` 以 `transform:translate(-50%,-50%) scale(var(--stage-scale,1))` + `transform-origin:center center` 实现 letterbox 居中。`>1920` 屏幕等比放大(不 clamp)。
- **Settings.tsx(CONFIG 面板 UI)** *(CONFIG 面板整体为 mock — 见 §6)*:渲染「CONFIG」面板 UI,展示 claude/codex 运行时的配置项(模型、Hooks、自定义配置等)的可视化控件。**(planned)** 待 settings-store 接入真实引擎配置读写接口后升级为真实功能。

## 4. 交互边界★

**上游(依赖方向)**:无 — 本层是基础设施,不依赖其它业务子系统。

**下游(消费方)**:
| 消费方 | 消费内容 |
|---|---|
| §3 房间渲染 | CSS token(`--ink`/`--panel`/`--accent` 等)、`stageScale`、`useSettingsStore` |
| §4 大厅/Overworld | CSS token、`Icon` 组件、`useSettingsStore`(`avatarHero`) |
| §7 HUD shell | `Icon` 组件(全部 33 图标)、`useSettingsStore`(`density`/`motion`)、`hud-compact`/`no-motion` 类 |
| §13 打包/Tauri | `public/fonts/` 作 bundle.resources 打包资源;字体路径不得改动 |

**契约**:
- CSS token 名(`--ink`/`--panel`/`--accent` 等)为公开 API;重命名需同步所有消费处。
- `settingsRootClass()`/`settingsRootStyle()` 是 `App.tsx` 与 settings-store 的唯一接口;新增 class/CSS var 在此函数扩展,不散落各处。
- `stageScale` 纯函数,仅依赖 `(winW,winH)`;不能引入副作用。
- `ICON_ART`/`IconName` 为 `icons.tsx` 的公开协议;增删图标名需同步 icons.test.ts。

## 5. 数据流与关键约定

```
用户操作(偏好变更)
  → useSettingsStore.set(patch)
  → persistSettings(s)     # 写 localStorage["roguent:settings"]
  → settingsRootClass(s)   # 返回 root class string
  → settingsRootStyle(s)   # 返回 {--accent, --core-glow}
  → App.tsx 将 class/style 注入 #stage
  → CSS var 级联到全站所有消费者
```

```
window resize / 初次挂载
  → useStageScale(viewportRef)   # App.tsx 注册 ResizeObserver
  → stageScale(winW, winH)       # = Math.min(W/1920, H/1080)
  → #viewport.style["--stage-scale"] = scale   # 命令式,不触发 React 重渲染
  → CSS: #stage { transform: translate(-50%,-50%) scale(var(--stage-scale)) }
  → 全站在任意分辨率保持 1920×1080 比例
```

**关键约定**:
- `--stage-scale` 通过命令式 DOM 写入(非 React state),避免 resize 每帧触发 React 树重渲染。
- settings-store 不用 zustand persist 中间件;所有 `localStorage` 访问均有 `typeof localStorage === "undefined"` 守卫(兼容 bun:test 无全局环境)。
- `cjk-sys` class 已完全接线(`styles.css` 有对应规则);`hud-compact` 和 `no-motion` 的 CSS 规则部分待补全(见 §6)。
- `theme` 字段通过 `GLOW` map 映射为 `--core-glow` 具体色值;`--accent` 直接取 `accent` hex 字段。

## 6. 现状与边界

**已实现(真)**:
- `styles.css`:暖木 token 完整定义;`@font-face` Fusion Pixel;`.viewport`/`.stage` 缩放规则;`.bevel-frame` pixel chrome;`.cjk-sys` 切换规则。
- `public/fonts/`:字体文件自托管(`fusion-pixel-12px-proportional-sc-400-normal.woff2`),不走 CDN。
- `icons.tsx`:33 个自绘像素图标,`Icon` 组件完整。
- `settings-store.ts`:6 个字段全部实现,localStorage 持久化真实可用;`settingsRootClass()`/`settingsRootStyle()` 已接入 `App.tsx`。
- `stage-scale.ts`:`stageScale()` 纯函数完整;`useStageScale` 命令式 resize hook 在 `App.tsx` 接入。

**mock / 待完善**:
- **Settings.tsx CONFIG 面板:整面板为显式 mock 占位**。面板顶部有 `.task-mock-banner` 标注「示例数据,引擎不读写真实配置」。控件中的模型列表、Hooks 列表、自定义配置列表均为静态 mock,增删按钮不绑真实逻辑;底部「还原/保存」不写盘。引擎目前无对应配置读写能力。`settings-store`(前端外观持久化)是真实的,但 Settings.tsx CONFIG 面板的功能不依赖它。
- `hud-compact` 类规则:settings-store 已产出该 class,但 `styles.css` 中对应的 `.hud-compact` 选择器缩放规则尚未全部补全(T2.x 内景 HUD chrome 收尾)。
- `no-motion` 类规则:settings-store 已产出该 class,但 `styles.css` 的 `.no-motion * { animation: none }` 全局规则待补全(T0.5 收尾)。
- `--core-glow` CSS var:已在 `settingsRootStyle()` 产出并注入 `#stage`,但房间渲染(§3)消费侧的接线部分待完成。

**取舍**:
- `--bg-*` token(§9 token 列表中的背景色)已定义但目前为孤儿 token(地牢/木质背景由 PixiJS hex 承担),T5 收尾删除。
- `Press Start 2P` 字体未自托管(仍走 Google Fonts 或系统回落),因其仅用于纯英文/数字 pixel 标签,不影响中文渲染。

## 7. 代码锚点

| 文件 | 关键位置 |
|---|---|
| `src/web/styles.css:1` | 顶部说明 + `@font-face` Fusion Pixel(第 7–24 行) |
| `src/web/styles.css:25` | `:root` 设计 token 块(暖木 RPG 调色板、字体栈、语义色) |
| `src/web/styles.css:89` | `#viewport`/`#stage` 缩放规则 + `--stage-scale` 应用 |
| `src/web/styles.css:134` | `.cjk-sys` 字体切换规则 |
| `src/web/hud/icons.tsx:65` | `ICON_ART_DATA` 图标数据对象(33 个图标,第 65–644 行) |
| `src/web/hud/icons.tsx:657` | `Icon` 组件实现 |
| `src/web/settings-store.ts:7` | `Settings` 接口(6 个字段) |
| `src/web/settings-store.ts:25` | `DEFAULT_SETTINGS`(默认值) |
| `src/web/settings-store.ts:41` | `STORAGE_KEY = "roguent:settings"` |
| `src/web/settings-store.ts:54` | `settingsRootClass()` — 产出 `room-{theme}`/`no-motion`/`hud-compact`/`cjk-sys` |
| `src/web/settings-store.ts:70` | `settingsRootStyle()` — 产出 `--accent`/`--core-glow` inline style |
| `src/web/settings-store.ts:106` | `loadSettings()` — localStorage 读取 + 守卫 |
| `src/web/settings-store.ts:120` | `persistSettings()` — localStorage 写入 + 守卫 |
| `src/web/stage-scale.ts:5` | `STAGE_W=1920`/`STAGE_H=1080` 常量 |
| `src/web/stage-scale.ts:8` | `stageScale(winW,winH)` 纯函数 |
| `src/web/hud/Settings.tsx:16` | 模块顶部注释:明确标注整面板为 mock 占位 |
| `src/web/hud/Settings.tsx:346` | `title="CONFIG"` 面板渲染入口 |
| `src/web/hud/Settings.tsx:356` | `.task-mock-banner` — 显眼 mock 标注 div |

## 8. 验收

| 验收项 | 测试文件 / 方式 |
|---|---|
| settings-store 字段默认值、持久化读写、`settingsRootClass()`/`settingsRootStyle()` 输出正确 | `src/web/settings-store.test.ts` |
| `stageScale()` 在各分辨率返回正确 `min(W/1920,H/1080)` | `src/web/stage-scale.test.ts` |
| `ICON_NAMES` 包含全部 33 个图标名、`Icon` 组件无崩溃渲染 | `src/web/hud/icons.test.ts` |
| 页面加载后 `#stage` 存在 `--stage-scale` CSS 变量且值 ≤ 1(标准 1080p 屏幕) | 手动验证 / e2e |
| Fusion Pixel 字体从 `/fonts/` 自托管加载(Network 面板无 CDN 请求) | 手动验证 |
| 切换 `cjkPixel=false` 后 `#stage` 带 `cjk-sys` 类,中文回落系统字体 | `settings-store.test.ts` + 手动目视 |
| Settings CONFIG 面板顶部显示 mock banner,保存按钮不写盘 | 手动验证 |
