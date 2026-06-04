# Roguent 总览世界(Overworld Hub)设计 spec — S3 + 最小 S1

> 状态:已通过 brainstorming 并获用户批准(2026-06-04)。本 spec 为整体游戏化重构的第一块,落地后走 writing-plans 出分阶段实现计划。

## Context(为什么做这件事)

今天 Roguent 的整个画面**就是一个会话**:地牢房间渲染当前会话的 agent 在走动,切会话则重渲染房间。这本质是 SaaS 的「一个详情页」。用户要把 Roguent 重构成一个**游戏**——把 vibe coding 本身当成游戏:你以**自己的主角**在一个大厅世界里走动,**每个编码会话 = 一个 NPC**,按**项目聚成多个房间**(元气骑士式多房间地牢)。

这份 spec 覆盖整个愿景里**第一块、也是中枢的子项目——总览世界**,它确立了其余一切所依附的新空间模型。

**整体分解(已与用户对齐,各自单独成 spec):** S1 数据/生命周期、S2 askuser 管线、**S3 总览世界(本 spec)**、S4 游戏化 HUD/排行榜/菜单、S5 聊天游戏化重皮;另有一份单独的**持久化 + SDK resume** spec(用于"翻历史/复活旧会话",是前置/后续依赖)。本文 = **S3 + 它所需的最小 S1 数据**。

## 已锁定的决策(brainstorming 产出)

1. **双层缩放**:总览大厅(你 + 会话 NPC) ↔ 会话内景(**现有 Room/Scene 原封复用**)。subagent 只在进入会话后的内景里出现。
2. **导航**:相机跟随大地图;**项目 = 房间**,走廊连通。
3. **控制**:键盘 WASD/方向键自由走 + **A\* 自动寻路**(点击远处走过去,也供未来「前往」按钮)。
4. **范围**:本 spec **全量**——相机 + 多房间走廊 + NPC 全交互 + 进出会话 + A\* + 生命周期(≤10/LRU 剔除/归档/删除动画)。
5. **项目来源**:每会话带 `cwd` → `project` = 该 cwd 的 git 根。扩展 `newSession` 携 cwd;`SessionManager` 按会话存 cwd。
6. **持久化:不在本 spec**。只操作"活着 + 本会话软归档"的集合;跨重启历史 / 复活旧会话(SDK resume)= 独立的持久化前置 spec。刷新即重置(已接受)。

## 代码现状(已核实,file:line)

- 单一全局 cwd:[driver.ts:86](../../../src/engine/driver.ts)、[session.ts:22](../../../src/engine/session.ts) — 所有会话同目录,今天**没有"多项目"**。
- 多会话并发 ✓:`SessionManager` 持 `Map<id, Driver>`,事件广播给所有客户端([ws-gateway.ts](../../../src/engine/ws-gateway.ts)),client store 持 `Record<sessionId, Session>` — **大厅可同时显示全部 NPC**。
- 零持久化:纯内存,刷新/重启全丢。
- `newSession` 当前 `{ sessionId, title, model }`([ws-gateway.ts](../../../src/engine/ws-gateway.ts)),由 [ChatDrawer.tsx](../../../src/web/hud/ChatDrawer.tsx) 发出。
- `Session` 字段见 [domain.ts](../../../src/shared/domain.ts);`createSession` 工厂 `createdAt` 恒为 0。无 `project/cwd/lastActiveAt/archived`。
- 渲染:固定 384×224 视口整数缩放、无相机([Room.tsx](../../../src/web/room/Room.tsx));素材 = 0x72 DungeonTileset II(public/assets),英雄/敌人精灵充足。

## 架构

### 视图层(顶层)
- 新增 UI 状态 `view: "overworld" | { interior: sessionId }`(ui-store.ts),默认 overworld。
- [App.tsx](../../../src/web/App.tsx) 据 `view` 渲染 `<Overworld/>` 或把现有 Scene 喂入被进入的会话(现 Room 读 currentSessionId → 改为接收 enteredId)。
- 进出过渡:淡出 + 缩放(往 NPC 处 zoom-in 进入,Esc/门 zoom-out 返回)。
- HUD:会话级面板(Info/Model/Skills/Loot/AgentCard)只在内景或选中 NPC 时有意义;**本 spec 不重建 HUD**(那是 S4)。ChatDrawer 两个视图都可开(它是会话中枢)。

### 总览世界(新目录 `src/web/overworld/`,与 room/ 平行)
- `worldgen.ts`(**纯函数,可单测**):输入项目集合(+ 各自会话数)→ 房间矩形 + 走廊 + 瓦片网格 + **可行走网格**。以项目 id 作种子的确定性 PRNG(不进领域/replay)。**布局对已存在项目稳定/追加式**——新项目追加新房间,不挪动既有房间(避免抖动)。
- `camera.ts`(**纯函数**):主角位置 + 视口 + 世界边界 → 容器偏移(夹到边界)。可单测。
- `pathfind.ts`(**纯函数**):可行走网格上的 A\* → 路点序列。可单测。供点击走 + 未来「前往」。
- `Overworld.tsx`:Pixi 场景宿主——世界容器、相机、瓦片图、主角、NPC。
- `WorldTilemap.tsx`:渲染生成的瓦片网格(复用 0x72 tileset 与 DungeonRoom 的 `structureName`/atlas 思路,泛化到任意房间矩形 + 走廊)。
- `Player.tsx`:**主角 = 用户**。WASD 速度驱动 + 撞墙(查可行走网格);位置/相机**命令式 useTick、绝不进 React state**;主角 skin 用一个**与 NPC/orchestrator 区分**的固定形象(`ORCHESTRATOR_HERO=knight_m` 有冲突 → 主角另选;NPC 用 hash(sessionId) 取英雄池获得每会话不同外观)。
- `SessionNpc.tsx`:每个活跃(未归档)会话一个,放进它的项目房间。绕锚点 idle 游走(**复用 [motion.ts](../../../src/web/room/motion.ts)**);头顶名牌 = 自动 session name + 状态色环 + **「?」占位槽**(S2 接真 askuser);靠近高亮;主角在旁按键/点击 → 信息卡;门/光圈 → 进入会话。
- 测试:`worldgen.test.ts` / `camera.test.ts` / `pathfind.test.ts`(bun:test,仿 [layout.test.ts](../../../src/web/room/layout.test.ts) / [motion.test.ts](../../../src/web/room/motion.test.ts))。
- 复用:`motion.ts`、`atlas.ts`、`effects.ts`、`config.ts`、0x72 素材。**内景的 roomLayout/DungeonRoom/Character 全不动。**

### 主角与 NPC 交互
- 靠近(主角距 NPC < N px)→ NPC 显交互提示;按键(E/Enter)→ **信息卡**。
- 信息卡(DOM 浮层,复用 [AgentCard](../../../src/web/hud/AgentCard.tsx) 风格,新建 NpcCard):头像(会话 skin)、标题、**项目**、模型、模式(permissionMode)、会话状态、task 摘要(subagent 数 + 各状态)、usage(tokens/cost)。按钮:**进入** / **聊天**(开现有 ChatDrawer 该会话)/ 归档 / 删除。
- 进入会话:踩 NPC 门/按键 → `view = {interior: id}` + zoom 过渡 → 现有 Scene(该会话 subagent 在走动)→ Esc/内景门返回大厅原位。
- 点击走 / 「前往」:点地面或 NPC → A\* 路径 → 主角按路点自动走;`walkTo(npcId)` 供未来任务面板「前往」复用。

### 生命周期 & 最小数据(S1)
- `Session` 增 `project?: string`、`cwd?: string`、`lastActiveAt?: number`、`archived?: boolean`([domain.ts](../../../src/shared/domain.ts))。
- 活跃度:reducer 在该会话的 message/tool/agent 事件上 `lastActiveAt = e.ts`([store.ts](../../../src/web/store.ts))。
- 项目派生:服务端扩展 `newSession` 带 `cwd`;`SessionManager.createSession(id,{title,model,cwd})` 存 cwd 并传给 `driverFactory(cb,model,cwd)`;`session.created` 载荷加 `cwd` + 服务端算出的 `project`(git 根 basename);reducer 落到 Session。**ChatDrawer 新建会话 UI 增目录/项目输入**(默认 = 服务端 cwd)。
- **≤10 活跃**:大厅按 `lastActiveAt` 取前 10 个未归档会话;新建/激活第 11 个 → 把活跃度最低者**软归档**("走出门"退场动画),新 NPC 由其项目房间门口入场。
- **归档(软)**:信息卡/NPC 菜单 → `archived=true` → 走出动画 → 移出大厅;仍在 store,ChatDrawer「已归档」区可搜可见;再激活 → 走回(挤掉当前 LRU)。**归档为客户端可见性**,driver 后台继续(不杀)。
- **删除(硬)**:信息卡 → 确认 → 新命令 `deleteSession`(停 driver)+ store 移除。
- "聊天区找回更久远会话":v1 = ChatDrawer 列已归档会话(可过滤搜索),点选即激活。**跨重启 / 复活已死会话 = 持久化 spec**。

### 服务端/协议改动(均为加法)
- `newSession` 命令加 `cwd?: string`(默认服务端 cwd),ws-gateway 校验;`session.created` 载荷加 `cwd`、`project`。
- 新命令 `deleteSession`(停 driver)。归档为客户端态,无服务端副作用。
- 注:服务端在任意 cwd 跑 `claude` 对本地单用户开发工具可接受;新建 UI 需能选目录。
- 不碰 replay/事件确定性(新字段可选;生命周期命令非 replay 域事件)。

### 不变量(承接上轮房间打磨)
- 所有移动/相机纯客户端命令式 `useTick` + `container.position.set`,**绝不进 React state**。领域/事件/replay 无 `Math.random`;worldgen 用项目 id 种子 PRNG(确定性)。
- 现有 Room/Scene/Character/motion/layout/DungeonRoom(内景)行为不变。
- Pixi v8 @pixi/react extend 模式;沿用上轮 gotcha(换 textures 后 `play()`、翻内层精灵容器、勿绑 x/y props)。

## 改动文件清单(概要)

- **新增**:`src/web/overworld/{Overworld,WorldTilemap,Player,SessionNpc}.tsx` + `{worldgen,camera,pathfind}.ts` + 三个 `.test.ts`;`hud/NpcCard.tsx`。
- **改**:`ui-store.ts`(view 态)、`App.tsx`(视图切换)、`shared/domain.ts`(+字段)、`shared/events.ts`(session.created +cwd/project;+deleteSession 命令类型)、`web/store.ts`(存 project/cwd/lastActiveAt/archived、活跃度 bump、归档/删除 action、≤10/LRU 选择)、`engine/{driver,session,ws-gateway}.ts`(按会话 cwd、newSession+cwd、deleteSession)、`hud/ChatDrawer.tsx`(新建 cwd 输入、已归档区)。
- **不动**:`room/*`(内景)、roomLayout、DungeonRoom。

## 明确不在本 spec(各自单独 spec)

- 持久化(SQLite/本地)、跨重启历史、SDK resume / 复活已死会话 —— **前置/后续 spec**。
- askuser/permission 管线 → 真「?」+ 任务面板(S2)。
- 游戏化 HUD:四角按钮簇、排行榜(需按模型聚合 usage)、菜单(S4)。
- 聊天游戏化重皮(S5)。

## 验证

1. **静态全绿**:`tsc` 0、biome 干净、`bun test` 全绿(含新 worldgen/camera/pathfind 单测;现有测试不回归)。
2. **浏览器人工验证**(参数本地迭代):
   - 在不同 cwd 建 2–3 个会话 → 看到多个项目房间。
   - WASD 走动,相机跟随并夹边界;点远处地面 → A\* 自动走。
   - 走到 NPC → 交互提示 → 信息卡(项目/模型/状态正确)→ **进入** → 掉进该会话内景(subagent 在走)→ Esc 返回。
   - 建第 11 个会话 → 活跃度最低 NPC 走出、新的走入;归档 → NPC 退场并进 ChatDrawer 已归档区 → 再激活走回。
- **门动画**:NPC 入场从项目房间门口(`RoomBox.doorPx`,底边中央)走到 home,LRU/归档退场走回门口再淡出,再激活从退场中恢复继续驻留 —— 已实现(非淡入淡出占位)。
- **worktree 分组**:`project = git rev-parse --show-toplevel` 的 basename,故同一仓库的不同 worktree 落进**不同房间**,属有意行为;`cwd` 的 git 根 basename 为空(如 `/`)时回退到目录名,绝不产出无名空房间。
- **硬删除空房间**:`removeSession` 不动 `projectOrder`(追加式、保证已存在房间不挪位),故删掉某项目最后一个会话后,该项目仍留一个空房间直到刷新页面 —— 已接受的 tradeoff,非泄漏。

## 实现分期建议(spec 全量,实现可分期)

① 视图层 + 空世界 + 主角 + 相机 → ② worldgen 多房间 + 瓦片 → ③ NPC + 信息卡 + 进出会话 → ④ A\* 寻路 → ⑤ 生命周期 ≤10/LRU/归档/删除 + 服务端 cwd/删除。
