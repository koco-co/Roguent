---
id: "§3"
title: 房间可视化(内景)
status: implemented
layer: web
updated: 2026-06-06
depends_on: ["§2"]
related: ["§4", "§12"]
code_refs:
  - src/web/room/Room.tsx
  - src/web/room/DungeonRoom.tsx
  - src/web/room/Character.tsx
  - src/web/room/Particles.tsx
  - src/web/room/atlas.ts
  - src/web/room/motion.ts
specs:
  - docs/superpowers/specs/2026-06-04-room-visual-polish-design.md
---

# §3 房间可视化(内景)

## 1. 定位

PixiJS v8 内景渲染——把当前会话的 agent 树渲染成「一屋子小人在干活」。

## 2. 为什么

内景是 Roguent 的可视化核心载体。主屏零正文,完全靠动作、朝向、头顶图标来表达每个 agent 在干什么、状态如何。用户扫一眼房间就能判断工作进展,不必打开任何文字日志。

## 3. 功能点

- **PixiJS `<Application>` 宿主**:整个房间挂在一个 `<div style="inset:0">` 内,`Application resizeTo` 自适应容器,背景色 `0x0b0a12`。
- **atlas 守卫与错误覆盖层**:首次加载 atlas 失败时,在画布之上叠一层半透明覆盖(红色错误文本 + 灰色详情 + 「重试」按钮);重试调用 `resetAtlas()` 再次 `loadAtlas()`——失败非静默黑屏。
- **整数缩放 + 居中**:虚拟舞台 384×224(24×14 tiles,16px/tile);按 `Math.floor(min(canvasW/VW, canvasH/VH))` 整数缩放后居中,保证像素清晰。
- **主控 orchestrator 常驻中央**:始终出现在房间中心(`roomLayout` 保证),使用 `ORCHESTRATOR_HERO` 皮肤,蜡烛金地圈标识。
- **subagent 动态进出**:新 agent 从门口位置(`DOOR_COL * TILE, 2 * TILE`)生成,走向分配的 home 锚点;被移除时走回门口淡出消失。
- **游走与朝向翻转**:每个角色在 home 半径内随机游走(orchestrator radius=6,subagent radius=24),通过 `flipRef.scale.x = facing` 翻转精灵方向;速度 0.4 px/frame。
- **工具气泡**(`ToolBubble`):agent 有 `currentTool` 且未在离场时,在头顶弹出带工具图标的小泡泡(pop-in 动画 ~6 帧 + 轻微漂浮);idle 时不显示气泡,改用 `Emote`(zzz/...)。
- **表情气泡**(`Emote`):idle 显示间歇脉冲「zzz」,thinking 显示稳定闪烁「...」,其余状态不渲染;与工具气泡互斥。
- **动画速度分级**:`working`/`thinking` 状态 animationSpeed ×1.8 倍速,idle 正常速。
- **地板脚步扬尘**:粒子层每 8 帧对 `moving=true` 的角色生成一枚微尘粒子。
- **工作火花**:粒子层每 7 帧对 `status=working` 的角色生成上浮金色火花。
- **门口进场烟尘**:agentCount 增加时在门口生成 12 粒蓝白尘粒(poof 效果)。
- **战利品硬币爆炸**:lootCount 增加时在房间中央生成 16 枚金币 + 10 枚火花,硬币有重力与地面弹跳。
- **地图渲染**(`DungeonRoom`):24×14 tile 砖墙地板,背墙红/蓝旗帜,双侧动态喷泉(wall_fountain_*_anim),居中拱门入口,宝箱装饰,地板道具(箱子/烧瓶/头骨)。
- **灯光层**(`GlowLayer` + `Vignette`):门口蓝光池 + 两侧喷泉蓝光池(additive blendMode),角色自身暖木色 glow 随角色移动;画布层叠全屏 vignette。
- **点选角色**:点击角色触发 `useUiStore.select` 切换选中态;选中者脚下显示青色光环,hover 显示淡白光环,lead 常驻金色光环。
- **幽灵清除**(planned):重连时引擎下发花名册;store 清空不在花名册内的 actor,room 侧 ghost 自动走出。

## 4. 与其它子系统的交互边界

### 上游依赖——§2 事件协议 → store 折叠态

Room 组件**不直接消费原始 RoomEvent**,仅读取 `§2` 事件经 `store.reduce` 折叠后的派生状态:

| store 字段 | 来源事件 | room 用途 |
|---|---|---|
| `session.agents[id]` 挂载 | `agent.spawned` | `Scene` reconcile → 新增 Actor,`bornAtDoor=true`,从门口进场 |
| `agent.status` = `working` | `tool.started` | Character animationSpeed 加速;粒子层发火花;Emote 隐藏 |
| `agent.currentTool` | `tool.started` | ToolBubble 挂载并显示对应图标 |
| `agent.currentTool = undefined` | `tool.ended` / `tool.failed` | ToolBubble 卸载 |
| `agent.status` = `thinking` | `agent.thinking` | Emote 显示「...」 |
| `agent.status` = `idle` | `agent.idle` | Emote 显示间歇「zzz」 |
| `session.agents[id]` 删除 | `agent.done` | `Scene` reconcile → Actor.leaving=true,走回门口淡出 |
| `session.loot.length` | `loot.dropped` | Particles 触发硬币爆炸 |

Room 通过两个 zustand selector 读取:

```ts
const session = useRoomStore((s) =>
  s.currentSessionId ? s.sessions[s.currentSessionId] : undefined
);
const selectedId = useUiStore((s) => s.selectedAgentId);
```

### 下游消费——§3 向 §4 写入

- 角色点击调用 `useUiStore.select(agentId)` → §4 HUD 信息卡联动。

### 相关——§4 视图状态

- `ui-store.view` 为 `{ interior: sessionId }` 时,§4 视图层才挂载 `<Room />`。内外景切换逻辑在 §4 (`enterInterior` / `exitOverworld`),§3 无感知。

### 相关——§12 资源与缩放

- Atlas 来自 `public/assets/0x72/dungeon.json`(0x72 DungeonTileset II,CC0),`scaleMode="nearest"` 保证放大后像素清晰。
- 舞台缩放由 `Room.tsx` 计算整数倍数,外层 `#stage` 的 CSS `transform:scale` 由 §12 负责;两层缩放互不干涉(`clientWidth/Height` 而非 `getBoundingClientRect`)。

### 契约

- `MotionMap`:Character 每帧向 `motionRef.current[id]` 写入 `{x,y,facing,moving,status}`;Particles 同帧读取;Character 卸载时删除自身键——零 React 状态、零重渲染。
- `roomLayout(ids, VW, VH)`:接收 agentId 数组,返回确定性 home 锚点 map;orchestrator 居中,其余按等角环排列。

## 5. 数据流与关键约定

```
§2 RoomEvent 流
  → store.reduce → session.agents / session.loot (zustand)
    → Scene(useRoomStore) → reconcile actors[]
      → Character(status, currentTool, home, leaving)
        ├─ useLayoutEffect:挂载时设门口/home 初始位置(mount-once)
        ├─ useTick:帧循环推进 pos/facing/phase,写 motionRef
        ├─ ToolBubble(currentTool) / Emote(status)
        └─ onExited → setActors(filter)
      → Particles(motionRef, lootCount, agentCount)
        └─ useTick:读 motionRef,生成尘/火花/硬币,imperatively draw
```

**关键约定**:

- **位置永不入 React state**:`pos` / `target` / `facing` 全为 `useRef`,帧循环直接写 `container.position`——store 重渲染不会 reset 位置坐标或造成跳变。
- **textures 数组引用稳定**:idle/run 帧数组用 `useMemo` 固定引用;`@pixi/react` 按引用 diff,新数组会触发 `gotoAndStop(0)` 重置动画。
- **leaving ghost**:store 删掉 agent 时 Actor 不立即删除,而是 `leaving=true`——角色走回门口淡出后 `onExited` 才从 `actors[]` 移除。
- **home 锚点 reconcile**:keyed on `agentKey`(id set 的排序 join),不随 status tick 重新 reconcile,避免频繁 layout 计算。
- **粒子上限 500**:超出则静默丢弃,保证帧率。

## 6. 现状与边界

**全真实现**:

- PixiJS 房间渲染、角色进出、工具气泡、表情气泡、粒子系统、灯光层、atlas 错误覆盖层均已实装。
- Atlas 加载失败有覆盖层 + 重试:Room.tsx L173 `atlasError` state,L218–L250 错误 overlay div,L176–L185 `retryAtlas` 函数。

**取舍与边界**:

- PixiJS 组件(Character、Particles、DungeonRoom 等)不接受 `bun:test`(无 DOM/WebGL),可测逻辑已下沉到纯函数单测(atlas.ts、layout.ts、motion.ts)。
- 粒子系统不保证帧精确回放——粒子是纯装饰,不进 store,不走事件协议。
- 暖木 token 颜色、atlas 资源路径属 §12 范畴,§3 引用但不管理。

**mock/planned**:

- 幽灵清除(断线重连后清除孤儿 actor)已在架构设计中确认,前端 store 侧已预留,room 侧展示层跟随 store 变化即可,标注 (planned)。

## 7. 代码锚点

| 文件 | 关键行 | 说明 |
|---|---|---|
| `src/web/room/Room.tsx` | L170–L253 | `Room()` 导出,atlas 加载、ResizeObserver、AtlasProvider |
| `src/web/room/Room.tsx` | L173 | `atlasError` state 声明 |
| `src/web/room/Room.tsx` | L176–L185 | `retryAtlas()`:resetAtlas + loadAtlas + catch→setAtlasError |
| `src/web/room/Room.tsx` | L188–L195 | 首次 `loadAtlas()` effect |
| `src/web/room/Room.tsx` | L218–L250 | atlasError 覆盖层 overlay div(红色错误文本 + 重试按钮) |
| `src/web/room/Room.tsx` | L44–L168 | `Scene()`:actors reconcile,Integer scale,Character/Particles 渲染树 |
| `src/web/room/Room.tsx` | L82–L122 | `useEffect([agentKey])`:actor 与 store.agents 的 reconcile 逻辑 |
| `src/web/room/Room.tsx` | L129 | 整数缩放计算 |
| `src/web/room/Character.tsx` | L56–L296 | 完整 Character 组件:进出门、游走、动画、ToolBubble/Emote |
| `src/web/room/Character.tsx` | L121–L139 | `useLayoutEffect` mount-once 位置种子(门口或 home) |
| `src/web/room/Character.tsx` | L157–L233 | `useTick` 帧循环:phase 状态机 + motionRef 写入 |
| `src/web/room/Character.tsx` | L213–L219 | textures swap(idle/run)仅在 moving flag 翻转时触发 |
| `src/web/room/motion.ts` | L1–L104 | 纯函数:floorBounds / pickWanderTarget / stepToward / faceDir |
| `src/web/room/motion.ts` | L23–L31 | `MotionMap` / `Live` 类型,Character→Particles 共享帧数据 |
| `src/web/room/atlas.ts` | L10–L21 | `loadAtlas()`:单例 promise + nearest scaleMode |
| `src/web/room/atlas.ts` | L62–L73 | `atlasErrorText()` + `resetAtlas()` |
| `src/web/room/Particles.tsx` | L53–L245 | 粒子系统:ambient dust / spark / footstep / door poof / coin burst |
| `src/web/room/DungeonRoom.tsx` | L58–L174 | 地图渲染:tiles / banner / fountain / door / props |
| `src/web/room/Lights.tsx` | L33–L73 | GlowLayer(门/喷泉静态光池) + Vignette |
| `src/web/room/layout.ts` | L8–L31 | `roomLayout()`:orchestrator 居中,subagent 等角环 |
| `src/web/room/config.ts` | L1–L13 | 虚拟舞台常量:TILE=16,VW=384,VH=224,DOOR_COL,FOUNTAIN_COLS |
| `src/web/room/ToolBubble.tsx` | L20–L63 | 工具气泡:pop-in 动画 + 图标绘制 + 漂浮 |
| `src/web/room/Emote.tsx` | L12–L50 | 表情气泡:idle zzz / thinking ... |

## 8. 验收

**单元测试(bun:test 可运行,无 DOM 依赖)**:

- `src/web/room/atlas.test.ts`:
  - `atlasErrorText` 正确格式化 `Error` 对象
  - `atlasErrorText` 对非 Error 值 coerce 为字符串
- `src/web/room/layout.test.ts`:
  - orchestrator 分配到房间中央 `(VW/2, round(VH*0.42))`
  - subagent 分配到不同位置,且结果确定性一致
- `src/web/room/motion.test.ts`:
  - `clampToFloor` 对越界点夹回边界、对内部点保持不变
  - `pickWanderTarget` 结果在 radius 内且在 floor bounds 内
  - `pickWanderTarget` 靠墙 home 仍能夹回 bounds
  - `stepToward` 不超出 target,按 speed 推进
  - `stepToward` 临近时 snap 并报告 arrived
  - `faceDir` 取 vx 符号,近零时保持当前朝向

**回放冒烟(肉眼验证)**:

```bash
bun run dev:engine -- --replay <fixture>
# 浏览器打开内景:
# 1. 房间中央出现 orchestrator 角色
# 2. subagent 从门口走入并分散到各自 home
# 3. tool.started → 头顶出现工具气泡,火花粒子产生
# 4. tool.ended → 气泡消失,切换为 emote
# 5. agent.done → 角色走回门口淡出
# 6. atlas 加载失败模拟:删除 /public/assets/0x72/dungeon.json 后刷新,
#    应显示红色覆盖层 + 「重试」按钮而非黑屏
```
