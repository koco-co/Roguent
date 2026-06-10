---
title: Roguent Web 端游戏化呈现重构 — 大厅相机 / 氛围 / 传送门 / HUD / 面板
date: 2026-06-05
status: design-pending-approval
authors: [koco-co]
scope: web-only（不碰 engine / 协议 / Tauri 打包）
---

# Web 端游戏化呈现重构 · 设计 spec

> 一句话:**功能已通,呈现崩了。** 这份 spec 把 Roguent 的 web 端从「漂在黑洞里的后台 demo」重做成「像游戏」——只改总览大厅这一层的视觉执行与排版/交互,**完全不动底层功能、事件协议、engine**。

## Context — 为什么做(亲测诊断,2026-06-05 回放模式)

亲自跑 `dev:engine --replay fixtures/multi-session.jsonl` + `dev:web`、逐项交互后核实:

- **功能在代码层是通的**:点 NPC → 主角 A\* 走过去 + 弹信息卡(项目/模型/模式/状态/子智能体/Token/花费 + 进入/聊天/归档/删除);💬 → 聊天抽屉 + 会话列表;进入会话 → 满屏地牢内景(主控★ + 装饰 + 光照)。
- **但第一眼看到的总览大厅彻底崩**:整个世界缩成一张**邮票**钉在屏幕正中,~80% 是死黑;四个图标孤零零散在屏幕四角;面板是漂在黑底上的「后台管理系统」暗色 DOM。**用户因此判定「啥都没有、不像游戏」——成立。**

### 根因(file:line,已核实)

1. **大厅相机无缩放**(头号):内景 [room/Room.tsx:129](../../../src/web/room/Room.tsx) 有 `scale = floor(min(W/384, H/224))`(满屏放大 ~3×);大厅 [overworld/Player.tsx:167](../../../src/web/overworld/Player.tsx) + [camera.ts](../../../src/web/overworld/camera.ts) 的世界容器**根本没套 scale(=1)**,68 瓦片宽世界仅 ~1088px,`cameraOffset` 在「世界 < 视口」时只居中不放大 → 邮票。名牌字号 7px([SessionNpc.tsx:261](../../../src/web/overworld/SessionNpc.tsx))在 1:1 下不可读,放大后顺带解决。
2. **大厅无「大厅感」**:无中央地标 / 入口 / 传送门,无环境光,只有两个空房间 + 一条走廊,空旷冷清。
3. **进出会话瞬切无过渡**:[ui-store.ts:56](../../../src/web/ui-store.ts) `enterInterior` 直接换 view,没有「传送」的视觉。
4. **HUD 是四角散图标 + 顶部小药丸**([hud/Hud.tsx](../../../src/web/hud/Hud.tsx)),无外框、无聚簇,像浏览器按钮不像游戏 HUD。
5. **面板是后台暗面板**:信息卡 [NpcCard.tsx](../../../src/web/hud/NpcCard.tsx)(在 [App.tsx:75](../../../src/web/App.tsx) 渲染)、聊天抽屉 [ChatDrawer.tsx](../../../src/web/hud/ChatDrawer.tsx) 缺游戏窗口质感。

## 目标 / 非目标

**目标**:web 端总览大厅 + HUD + 面板 + 进出交互,**一眼看上去像《元气骑士》式 top-down 游戏**;沿用现有 0x72 像素素材与「主角/项目=房间/会话=NPC/进会话看 subagent」核心隐喻(已被内景证明可行)。

**非目标(明确不做)**:① 不改 engine / 事件协议 / domain / 命令;② 不加真游戏机制(数值/战斗/解锁);③ 不改内景 Room 的行为(可少量共享光照代码,但渲染逻辑不动);④ 不碰 Tauri 打包;⑤ 不做音效 / 精修帧动画 / 持久化。

## 不变量(承接既有约定,务必守住)

- 所有移动 / 相机 / 缩放纯客户端命令式 `useTick` + `container.position/scale.set`,**绝不进 React state**(spec §不变量;[Player.tsx](../../../src/web/overworld/Player.tsx) 既有模式)。
- 领域 / 事件 / replay **无 `Math.random`**;worldgen 仍是「输入 → 输出」的确定性纯函数,**对已存在 project 房间追加式、不挪位**(append-only)。
- Pixi v8 @pixi/react extend 模式;沿用 gotcha(换 textures 后 `play()`、翻内层精灵容器、勿绑 x/y props)。

---

## 工作流 1 · 大厅相机缩放 + 贴身跟随(最高优先)

- **现状**:世界容器 scale=1,`cameraOffset(focus, view, world)` 只在世界小于视口时居中。
- **目标**:大厅像内景一样套**整数缩放**、相机**贴身跟随主角**、世界**铺满屏幕**;走一格有明显位移,主角 / 名牌看得清。
- **改法**:
  - 新增纯函数 [overworld/zoom.ts](../../../src/web/overworld/zoom.ts) `lobbyZoom(view): number` —— 以「目标可见行数 ≈ 内景的 14 行」为基准:`clamp(floor(view.h / (TARGET_ROWS * TILE)), 2, 4)`(1491×812 → 3,与内景一致)。**纯函数、可单测**。
  - 改 [camera.ts](../../../src/web/overworld/camera.ts) `cameraOffset` 增 `scale` 参数:屏幕坐标 = `scale * worldPoint + offset`;聚焦居中 = `view/2 - scale*focus`,夹到 `[view - scale*world, 0]`(当 `scale*world > view`),否则居中 `(view - scale*world)/2`。仍是纯函数 → **扩 [camera.test.ts](../../../src/web/overworld/camera.test.ts)**。
  - 改 [Player.tsx](../../../src/web/overworld/Player.tsx) tick:`const z = lobbyZoom(view); wr.scale.set(z); wr.position.set(...cameraOffset(pos, view, worldPx, z))`(scale 每帧 set 是幂等廉价 no-op)。
- **可测**:`lobbyZoom` 边界(小/大视口、夹取);`cameraOffset` 带 scale 的居中 / 跟随 / 夹边四类断言。

## 工作流 2 · 大厅氛围 + 中央 Hub 大厅(「大厅感」)

- **现状**:worldgen 只产 project 房间;无地标、无环境光。
- **目标**:有一个**中央 Hub 广场**(永远存在,主角在此出生,有中央地标如喷泉/篝火),project 房间由走廊接到 Hub;墙上火把光、地面装饰、暗角,让大厅有人气。**直接回答「主页大厅呢?」。**
- **改法**:
  - 改 [worldgen.ts](../../../src/web/overworld/worldgen.ts):保留 append-only,**预留 slot 0 为 Hub 广场**(无 project、固定尺寸、带 `landmarkPx` 中心点),project 房间占 slot 1..n;走廊 Hub→room1→room2…。`WorldModel` 增 `hub: RoomBox`(或 `rooms[0]` 标 `isHub`)+ `landmarkPx`。主角 `spawn` 改为 Hub 中心。**0 个 project 时也站在一个大厅里,不再是空黑。** → **扩 [worldgen.test.ts](../../../src/web/overworld/worldgen.test.ts)**:Hub 恒存在、project 房间仍 append-only 不挪位、walkable 连通含 Hub、spawn 落在 Hub floor。
  - 新增 [overworld/LobbyLights.tsx](../../../src/web/overworld/LobbyLights.tsx):复用 [room/Lights.tsx](../../../src/web/room/Lights.tsx) 的 `Glow` + [effects.ts](../../../src/web/room/effects.ts),按 world 给 Hub 地标、各房门口、传送门撒辉光(world 空间,放进相机容器内)。`Vignette` 已是屏幕空间,大厅复用。
  - 在 [Overworld.tsx](../../../src/web/overworld/Overworld.tsx) 挂 Hub 地标精灵(喷泉/篝火,取 0x72 现有 decor 帧)+ `LobbyLights`。地面装饰沿用 [WorldTilemap.tsx](../../../src/web/overworld/WorldTilemap.tsx) 的确定性变体思路。
- **可测**:worldgen 的 Hub / append-only / 连通 / spawn 落点断言;装饰/光照是 `.tsx` → `build` + `check` + 回放冒烟。

## 工作流 3 · 传送门(进出会话)

- **现状**:NPC 脚下有状态色环([SessionNpc.tsx:234](../../../src/web/overworld/SessionNpc.tsx));进出瞬切无动画。
- **目标**:每个会话 NPC 站在一个**发光传送阵**(由现有色环升级:旋转/脉冲光圈,颜色 = 状态色);走近高亮 + 「[E] 进入」;进入播**传送 zoom + 淡入过渡**,Esc/门反向退出。
- **改法**:
  - 升级 [SessionNpc.tsx](../../../src/web/overworld/SessionNpc.tsx) 脚下色环为传送阵(`pixiGraphics`/glow 叠加,脉冲用 `useTick` 改 alpha/scale,不进 state);near 时加重。把现有 `[E] 信息` 提示语义调成 `[E] 进入`(卡片仍含「聊天/归档/删除」)。
  - 过渡:[ui-store.ts](../../../src/web/ui-store.ts) 增 `transition` 态(`{ phase: "in"|"out"|null, sessionId }`);新增纯函数计算过渡时序(可单测)。新增 DOM 覆盖层 [overworld/PortalTransition.tsx](../../../src/web/overworld/PortalTransition.tsx):传送门色径向擦除/淡入淡出,**中点真正切 view**(解耦 Pixi 生命周期,robust)。`enterInterior`/`exitOverworld` 触发过渡;[App.tsx](../../../src/web/App.tsx) 挂 `PortalTransition`。
- **可测**:过渡时序纯函数(in/out 各阶段时长、中点切换标志);视觉 → 回放冒烟。

## 工作流 4 · HUD 排版(游戏式)

- **现状**:四角散图标 + 顶部小药丸([Hud.tsx](../../../src/web/hud/Hud.tsx))。
- **目标**:**底部居中 hotbar 主操作坞** [📜技能][🎒背包][💬聊天][💎模型][📂导入] + 顶部状态条做成能量条样式 banner + 左上 ⚙ 设置 / `← 大厅`。带外框聚簇,hover 出名,整体像游戏 HUD。
- **改法**:重构 [Hud.tsx](../../../src/web/hud/Hud.tsx) 布局(把散落 `IconButton` 收进 hotbar dock + 顶部 bar);[styles.css](../../../src/web/styles.css) 加 `.px-hotbar` / `.px-dock` / 能量条样式;把 `← 大厅` 从 [App.tsx](../../../src/web/App.tsx) 内联按钮并入 HUD 体系。功能/onClick 不变。具体分组与间距在浏览器内调。
- **可测**:布局是 `.tsx`/CSS → `build` + `check` + 回放冒烟;按钮开关逻辑沿用既有 ui-store 单测。

## 工作流 5 · 面板重皮(游戏窗口)

- **现状**:`.px-panel` 暗面板,信息卡/聊天抽屉偏「后台」。
- **目标**:信息卡 → **角色档案卡**(NPC 头像精灵缩略 + 名/项目/模型/模式/状态/子智能体/usage + 动作按钮,厚边 + 标题栏);聊天抽屉 → 厚边带标题栏的游戏窗口。
- **改法**:[styles.css](../../../src/web/styles.css) 加 `.px-window`(标题栏 + 厚边)/ `.px-dossier`;改 [NpcCard.tsx](../../../src/web/hud/NpcCard.tsx) 加头像缩略(取该会话 hero 的 idle 帧,canvas/img)+ 重排;改 [ChatDrawer.tsx](../../../src/web/hud/ChatDrawer.tsx) 套窗口框 + 标题栏。纯 DOM/CSS,不动数据流。
- **可测**:`.tsx`/CSS → `build` + `check` + 回放冒烟。

---

## 改动文件清单(概要)

- **新增**:`overworld/zoom.ts` + `zoom.test.ts`;`overworld/LobbyLights.tsx`;`overworld/PortalTransition.tsx`;过渡时序纯函数(可并进 `ui-store` 或单独 util)+ 测试。
- **改**:`overworld/camera.ts`(+scale)+ `camera.test.ts`;`overworld/Player.tsx`(zoom+scaled camera);`overworld/worldgen.ts`(Hub)+ `worldgen.test.ts`;`overworld/Overworld.tsx`(Hub 地标 + 光照);`overworld/SessionNpc.tsx`(传送阵 + 提示语义);`ui-store.ts`(transition 态);`hud/Hud.tsx`(hotbar/dock 布局);`hud/NpcCard.tsx`(档案卡);`hud/ChatDrawer.tsx`(窗口);`styles.css`(dock/hotbar/window/dossier/能量条);`App.tsx`(挂 PortalTransition、`← 大厅` 并入 HUD)。
- **不动**:engine/* 、shared/events.ts、shared/domain.ts、room/* 的渲染行为(仅可能共享 Lights 代码)、Tauri。

## 验证(零额度优先)

1. **静态全绿**:`bun run check` 干净;`bun test` 全绿(现有 105 测试不回归 + 新增)。可下沉到纯函数的逻辑一律单测:`lobbyZoom`、带 scale 的 `cameraOffset`、worldgen Hub/append-only/连通/spawn、过渡时序。
2. **浏览器回放冒烟(人工目视/截图)**:① 大厅铺满屏、主角放大可控、相机跟随夹边;② Hub 广场 + 地标 + 环境光有「大厅感」,0 会话也不是空黑;③ 传送阵发光、进入播传送过渡、Esc 退出反向;④ 底部 hotbar + 顶部状态条 + 面板像游戏窗口;⑤ 既有交互(切会话/聊天/切模型/进出/归档)不回归。

## 分期实现建议(交 writing-plans 拆 task)

① 相机缩放(zoom.ts + camera scale + Player)——单独可见、风险低、先做 → ② 传送门过渡(ui-store transition + PortalTransition + SessionNpc 传送阵)→ ③ HUD hotbar 排版 → ④ 面板重皮(NpcCard/ChatDrawer/styles)→ ⑤ Hub 广场 + 大厅光照(worldgen 改动最大、依赖测试最重,压后单独做)。共享文件(styles.css / Player.tsx / worldgen.ts)的 task **串行**,不并行派实现 agent。
