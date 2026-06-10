---
id: "§4"
title: 总览世界与导航
status: implemented
layer: web
updated: 2026-06-06
depends_on: ["§2"]
related: ["§3", "§5", "§6", "§12"]
code_refs:
  - src/web/lobby/HubPlaza.tsx
  - src/web/lobby/PixelSprite.tsx
  - src/web/lobby/sprite-tick.ts
  - src/web/overworld/portal.ts
  - src/web/overworld/PortalTransition.tsx
  - src/web/overworld/skins.ts
  - src/web/ui-store.ts
  - src/web/App.tsx
specs:
  - docs/superpowers/specs/2026-06-04-overworld-hub-design.md
  - docs/superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md
---

# §4 总览世界与导航

## 1. 定位

§4 是 Roguent 的**双层视图切换枢纽**:顶层是可操控的暖色广场大厅(overworld),底层是进入某个会话后的内景(interior)。大厅是所有会话/项目的空间化入口——每个运行中的会话对应大厅里一个可交互的「NPC」,玩家在虚拟 1920×1080 坐标系里走动,靠近后触发进入或浏览信息卡;内景则复用 §3 的 Pixi Room 渲染该会话的实时状态。整套导航由 `ui-store` 的 `View`(`"overworld" | { interior: string }`)驱动,`App.tsx` 据此在 `<LobbyView />` 与 `<Room />` 之间切换,`<PortalTransition />` 挂载于两者之上提供全屏过场遮罩。

## 2. 为什么

多个 subagent 会话同时并行时,列表式 tab 缺乏空间感与状态感知:用户难以一眼判断「哪个房间正在忙、哪个在等待」。空间化导航把会话变成可见的「地牢居民」——玩家走进哪个 NPC 就进入哪个会话,符合《元气骑士》的像素地牢隐喻,同时提供比列表更直观的「当前焦点」语义。大厅还承载商店/排行榜/设置等全局入口,将所有一级导航收拢在同一个可玩场景里,而非分散在顶部导航栏。

## 3. 功能点

- **大厅渲染**(`LobbyView` → `HubPlaza`):无活跃会话时渲染空态(`EmptyState`),否则渲染暖色广场;固定 1920×1080 虚拟坐标系,按百分比映射到实际视口,自适应不黑边。
- **可操控主角**:WASD 或鼠标点击移动主角;速度 7 px/frame;边界限制(x ∈ [70, 1850]、y ∈ [150, 1040]);面向跟随水平移动方向;输入被模态面板或角色选择门阻断时暂停。
- **交互结构**(`INTERACT` 列表):6 个可交互场景物体——中央任务台(触发 `sessiongrid` 面板)、商店、排行榜、设置祭坛、Claude 项目门、Codex 项目门(视觉占位,实际开同一 `sessiongrid`);靠近半径 `r` 内显示 `E 进入 <label>` 提示。
- **E 键 / 点击交互**:靠近结构时按 E 或 Enter(`kd` handler)触发 `openPanel(action)`;点击结构若已在范围内立即触发,否则先走路过去。
- **装饰小人**(`DECOR`):4 个纯氛围 NPC(knight_f / dwarf_m / wizzard_f / goblin),不可交互,纯视觉填充。
- **黑猫跟随**(`CatPet`):独立跟随逻辑,保持在主角左后方约 40 px;距离超 55 px 时以 5 px/frame 补位。
- **共享帧计数器**(`useSpriteTick`):所有 DOM 精灵共用一个 150ms setInterval 帧计数器,懒启动、无订阅者时自动清除,避免每个精灵独立起定时器。
- **NPC 信息卡**(`NpcCard`):总览层点击会话 NPC 后弹出会话档案卡(标题/状态/model),提供「进入」按钮触发传送门过渡;由 `selectedNpcId` 驱动,Esc 关闭。
- **传送门漩涡过场**(`PortalTransition`):进/出内景时播放 900ms 全屏粒子漩涡动画;三角时序(前半淡入→遮罩满→中点真正切 view→后半淡出→清 transition);文案取真实会话标题/agent 数/model。
- **SessionGrid 面板**:任务台/项目门 E 键触发,列出所有未归档会话,支持直接点击进入(调 `beginEnter` 触发漩涡)。
- **会话 NPC 皮肤**(planned):按 `hash(sessionId) % 英雄池` 给每个会话 NPC 分配稳定外观(`sessionHero`),当前已在 `skins.ts` 实现但大厅 DOM 尚未渲染独立会话 NPC 精灵——会话通过 SessionGrid 面板而非大厅走动进入。
- **幽灵内景自动回落**:进入内景后若该会话被 LRU 归档/删除,`App.tsx` 监听 `interiorGone` 自动调 `exitOverworld()` 回落大厅,防止困在幽灵视图。

## 4. 交互边界★

### 上游
- **§2 事件协议 / store**:`store.sessions`(Zustand `useRoomStore`)是会话/NPC 数据的唯一来源。`LobbyView` 订阅 `sessions` 判断是否有活跃会话(决定渲染 `HubPlaza` 还是 `EmptyState`);`PortalTransition` 订阅 `sessions[id]` 取会话标题与 agent 数用于过场文案;`SessionGrid` 遍历 `sessions` 渲染卡片列表。

### 下游
- **§3 Room 渲染**:当 `ui-store.view` 切换为 `{ interior: id }` 时,`App.tsx` 渲染 `<Room />` 替代 `<LobbyView />`。内景的 Pixi 生命周期(`Room`)与过场(`PortalTransition`)解耦——`PortalTransition` 在中点调 `enterInterior` 后 Room 才挂载。
- **§5 NPC 选择 / 渲染源切换**:`enterInterior(id)` 进入内景前,`PortalTransition` 在中点同步调 `switchSession(id)`(来自 `useRoomStore`)切换渲染源,保证 Room 渲染目标会话。`exitOverworld()` 清掉 `selectedAgentId`。
- **§6 生命周期**:内景里该会话归档/删除时,`App.tsx` 监听 `interiorGone` 自动回落大厅(`exitOverworld`),对齐 §6 的 LRU 软归档语义。

### 契约
| 行为 | 触发方 | 消费方 |
|------|--------|--------|
| `beginEnter(id)` | `SessionGrid` / `NpcCard` | `PortalTransition`(监听 `transition`) |
| `enterInterior(id)` | `PortalTransition` 中点 | `App.tsx`(`inInterior` 判断) |
| `beginExit(id)` | `App.tsx` Esc 处理 / ← 大厅按钮 | `PortalTransition` |
| `exitOverworld()` | `PortalTransition` 中点 | `App.tsx`(回到 `LobbyView`) |
| `switchSession(id)` | `PortalTransition` 中点(enter) | `Room`(渲染源) |
| `openPanel("sessiongrid")` | `HubPlaza`(E 键/点击) | `Hud` → `SessionGrid` |

`depends_on: ["§2"]` — 大厅 NPC 渲染与过场文案直接依赖 §2 的 `sessions` 状态。
`related: ["§3","§5","§6","§12"]` 见上。

## 5. 数据流与关键约定

```
store.sessions
  └─ LobbyView: hasSessions? → HubPlaza : EmptyState
  └─ SessionGrid: 遍历未归档会话 → 卡片列表
  └─ PortalTransition: sessions[transition.sessionId] → 过场文案

ui-store.view
  "overworld"         → App 渲染 <LobbyView />
  { interior: id }    → App 渲染 <Room />

导航序列(进入):
  用户触发(E/点击) → beginEnter(id) → transition={kind:"enter",sessionId:id}
  → PortalTransition rAF: cover 0→1→0 (900ms)
  → 中点: switchSession(id) + enterInterior(id)  [view 切换]
  → 结束: endTransition()

导航序列(退出):
  Esc / ← 大厅按钮 → beginExit(id) → transition={kind:"exit",sessionId:id}
  → PortalTransition 中点: exitOverworld()  [view 切回 "overworld"]
  → 结束: endTransition()
```

**关键约定**:
- `View` 类型是 `"overworld" | { interior: string }`,`inInterior = view !== "overworld"`,内景 id 从 `view.interior` 取。
- `selectedNpcId`(总览 NPC 卡)与 `selectedAgentId`(内景 subagent 选中)是两个独立字段,语境不同;`enterInterior` 清前者,`exitOverworld` 清后者。
- 所有移动逻辑走命令式 DOM ref(`avRef.current.style.left/top`),不进 React state,只有 `near`/`moving`/`facing` 三个派生状态才 setState,避免 rAF 每帧触发 React 重渲染。
- 输入阻断(`blocked()`):有 `activePanel !== null` 或 `avatarHero === null` 时,方向键/E 键全部忽略。

## 6. 现状与边界

| 功能 | 状态 | 说明 |
|------|------|------|
| 大厅 DOM 广场渲染 | 真 | HubPlaza 完整实现,虚拟坐标 + 百分比映射 |
| 主角 WASD/点击移动 | 真 | rAF 循环,speed=7,边界约束 |
| 交互结构 + E 键 | 真 | 6 个结构,靠近提示 + 交互 |
| 任务台 SessionGrid | 真 | 真实会话列表,支持进入 |
| 传送门漩涡过场 | 真 | 900ms 粒子漩涡 + 中点切 view |
| NpcCard 会话档案卡 | 真 | selectedNpcId 驱动,Esc 关闭 |
| 黑猫跟随 | 真 | CatPet 组件 |
| 会话 NPC 精灵(大厅走动) | mock/planned | `sessionHero` 皮肤映射已实现,但大厅目前无独立会话 NPC 精灵渲染——进入会话走 SessionGrid 面板而非大厅内走路靠近 NPC |
| Codex 门 | 视觉占位 | 引擎只跑 Claude,Codex 门打开同一 SessionGrid |
| 商店/排行榜面板 | 视觉占位 | 面板入口真实可点,内容为 mock |
| 幽灵内景自动回落 | 真 | App.tsx interiorGone 监听 |

**当前大厅是 Roguent 唯一可玩大厅**。未在 DOM 走动大厅之外实现原型里的「项目房 + 走廊 + 相机跟随」——当前大厅是单一广场,所有会话通过 SessionGrid 面板管理,而非在大厅里分布独立会话 NPC 供玩家走路靠近。

## 7. 代码锚点

| 文件 | 关键位置 | 说明 |
|------|----------|------|
| `src/web/lobby/HubPlaza.tsx:427` | `LobbyView` | 大厅视图入口;无会话→EmptyState,有→HubPlaza |
| `src/web/lobby/HubPlaza.tsx:201` | `HubPlaza` | 可操控广场主组件;INTERACT 结构、rAF 移动循环 |
| `src/web/lobby/HubPlaza.tsx:39` | `INTERACT` | 6 个交互结构定义(id/x/y/r/action) |
| `src/web/lobby/HubPlaza.tsx:230` | `useEffect` rAF | 方向键监听 + 移动 + 邻近检测 + E 键交互 |
| `src/web/lobby/sprite-tick.ts:18` | `useSpriteTick` | 共享 150ms 帧计数器,懒启动/懒销毁 |
| `src/web/overworld/portal.ts:11` | `portalFrame` | 三角时序纯函数(cover/swapped/done),便于单测 |
| `src/web/overworld/PortalTransition.tsx:18` | `PortalTransition` | 全屏漩涡过场;中点调 enterInterior/exitOverworld |
| `src/web/overworld/skins.ts:20` | `sessionHero` | hash(sessionId) → 英雄池稳定皮肤 |
| `src/web/ui-store.ts:5` | `View` type | `"overworld" \| { interior: string }` |
| `src/web/ui-store.ts:57` | 初始状态 | `view: "overworld"`, `transition: null` |
| `src/web/ui-store.ts:65` | `enterInterior` | 切 view + 清 selectedNpcId |
| `src/web/ui-store.ts:67` | `exitOverworld` | 回 overworld + 清 selectedAgentId |
| `src/web/ui-store.ts:68-69` | `beginEnter/beginExit` | 设置 transition,触发 PortalTransition |
| `src/web/App.tsx:46` | `inInterior` | `view !== "overworld"` 判断切换渲染层 |
| `src/web/App.tsx:118` | JSX 分支 | `{inInterior ? <Room /> : <LobbyView />}` |
| `src/web/App.tsx:61` | `interiorGone` effect | 幽灵内景自动回落 `exitOverworld()` |
| `src/web/App.tsx:84` | Esc handler | 优先关面板,其次关 NpcCard,最后 beginExit |
| `src/web/hud/NpcCard.tsx:40` | `NpcCard` | selectedNpcId 驱动的会话档案卡 |
| `src/web/hud/SessionGrid.tsx:35` | `SessionGrid` | 全会话面板,beginEnter 进入会话 |

## 8. 验收

**单测**(`bun test`):
- `src/web/overworld/portal.test.ts` — `portalFrame` 四个 case:起点 cover=0/未到中点/未结束;中点 cover≈1/swapped=true;终点及之后 done=true/cover=0;前半升后半降线性插值。
- `src/web/ui-store.test.ts` — `enterInterior` 切 view 且清 selectedNpcId;`exitOverworld` 回 overworld 且清 selectedAgentId;往返 round-trip;`activePanel` 互斥开关。

**端到端行为验收**:
1. 启动 `bun run dev:engine` + `bun run dev:web`,初始无会话时大厅渲染 EmptyState。
2. 新建一个会话后,`LobbyView` 切换为 `HubPlaza` 广场。
3. WASD 可移动主角;靠近任务台显示「E 进入 任务台」提示;按 E 弹出 SessionGrid 面板。
4. SessionGrid 点击会话卡片,触发漩涡过场(900ms),结束后进入内景 Room 渲染。
5. 内景按 Esc 或点击「← 大厅」触发退出漩涡,结束后回到 `LobbyView`。
6. 进入内景后在 engine 侧强制归档该会话,`App.tsx` 自动调 `exitOverworld()` 回落大厅。
