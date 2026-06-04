# Roguent 房间画面打磨 · 设计 spec

> 🧭 **现状(2026-06-05)**:本 spec 已实现并合入 `main`(`src/web/room/*`:motion/ToolBubble/Emote/进出门/扬尘/小表情)。设计参考,非 backlog。最新现状见 [docs/ROADMAP.md](../../ROADMAP.md)。

日期:2026-06-04
状态:已通过 brainstorming 讨论并获用户批准
分支基线:`main`（已含 Soul-Knight 美术重做 Step A–D + 审查修复）

## 1. 概述与目标

让房间从"静止摆放的小人"变成"有生命的地牢现场":子智能体在房间里走动、用工具时头顶弹出对话气泡、从门口走入/走出、走路扬尘、待命时打盹。全部为**纯客户端装饰**——引擎不下发位置，移动逻辑不进入领域模型，也不参与 record/replay 的确定性。

成功标准:打开实时房间，能直观看到角色四处走动、工具气泡随用随弹随角色移动、召唤从门口走入、完成走出门口、`session.cleared` 时集体退场、脚步扬尘、待命/思考小表情——且不引入崩溃、卡顿、内存泄漏，现有测试保持绿、并新增 motion 与 agent.thinking 单测（实现后合计 46 项全绿）。

## 2. 范围

**包含**
1. 围绕各自"据点"游走的移动系统（走时播奔跑动画）
2. 朝向翻转（精灵面朝移动方向）
3. 工具图标做成对话气泡（带下尾巴，pop-in，跟随角色）
4. 进场（从门口走入）/ 离场（走向门口后消失）
5. 脚步扬尘
6. 待命/思考小表情（`zzz` / `...`）

**不包含（YAGNI / 明确排除）**
- 全房间自由漫游、按状态走到"工位"等更复杂移动模型
- 道具精确碰撞（只 clamp 到地板矩形）
- 服务端位置事件 / 领域模型加位置字段
- 气泡内显示工具名文字（16px 尺度读不清）
- 角色间避让/寻路

## 3. 决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 移动行为 | 围绕各自据点游走 | 队形保留、谁是谁可辨、选中不乱跳、指挥官居中 |
| 气泡样式 | 对话气泡（带下尾巴） | 走动时尾巴把气泡锚定到具体角色，归属清晰 |
| 附加细节 | 走入/走出门口 + 脚步扬尘 + 小表情（全选） | 仪式感 + 手感 + 待命表现 |
| 内部架构 | 方案 1：角色自走 + 共享 motionRef + Scene 管生命周期 | 贴合现有自包含写法，改动面最聚焦 |

**用户已确认的默认值**
1. 指挥官 `R≈6px` + 长停顿，基本居中当锚点，不满场跑。
2. 气泡内只放 emoji，不放工具名。
3. 游走参数（半径/速度/停顿）取本文 §7，后续可调。
4. 工具气泡只做 pop-in 进场动画，消失从简（瞬隐或快速淡出）。

## 4. 架构与数据流

```
Store(离散智能体集)
   │  agent.spawned / tool.* / agent.done / session.cleared
   ▼
Scene 调和 → actors[]（含正在离场的"幽灵"，React state，仅增删时变）
   │  每个 actor 渲一个 Character
   ▼
Character（自走，useTick + ref 命令式移动自己的容器）
   │  每帧写入
   ▼
motionRef: Record<id, Live>（useRef，逐帧可变，不触发 React 重渲染）
   │  每帧读取
   ▼
Particles（working 火花 + moving 脚步扬尘）
```

- **位置永不进 React state**:逐帧移动用 `useTick` + `container.position.set(...)` 命令式更新。
- `roomLayout()` 契约不变:仍确定性产出每个 id 的"据点"锚（home），`layout.test.ts` 不受影响。
- 跟随物:本角色暖光做成 Character 子节点（自动跟随）；Particles 通过 `motionRef` 读实时坐标。

## 5. 模块划分

### 新增

**`src/web/room/motion.ts`** — 纯函数，可单测，无 React/Pixi 依赖
- `floorBounds(): { minX; maxX; minY; maxY }` — 由 config 常量推导出"地板内界"（脚部可达矩形，避开砖墙）。
- `clampToFloor(p: Pos, b: Bounds): Pos`
- `pickWanderTarget(home: Pos, radius: number, b: Bounds, rng?: () => number): Pos` — home 半径内随机点，clamp 到 bounds；`rng` 默认 `Math.random`，可注入以便测试。
- `stepToward(pos: Pos, target: Pos, speed: number): { x; y; vx; vy; arrived: boolean }` — 朝目标移动一步；`arrived` 在距离 < epsilon 时为真。
- `faceDir(vx: number, current: 1 | -1): 1 | -1` — `vx` 显著非零时取其符号，否则保持 `current`。

**`src/web/room/ToolBubble.tsx`** — 子组件
- 入参:`icon: string`（emoji）。
- 渲染:像素描边圆角矩形 + 向下小尾巴（Graphics）+ emoji（pixiText）。
- 行为:挂载时 pop-in（`scale 0→1` 约 6 帧，可加极轻上下浮动）。

**`src/web/room/Emote.tsx`** — 子组件
- 入参:`status: AgentStatus`。
- `idle → 偶发 "zzz"`;`thinking → "..."`;其它 → 渲染 `null`。
- 低频闪动的 pixiText，置于头顶。

### 改动

**`src/web/room/Character.tsx`**
- 新增 motion `useTick`:按状态机游走/行走/进场/离场（§6.1）。
- 朝向翻转:`rootRef.scale.x = facing`。
- **不再用 React props 绑定 `x`/`y`**（见 §8 gotcha）；初始位置在 `useLayoutEffect` 里 `rootRef.position.set(...)`，之后由 `useTick` 接管。
- 挂载子节点:本角色暖光（additive 光晕 sprite）、`ToolBubble`（icon 非空时）、`Emote`。
- 每帧把 `{x,y,facing,moving,status}` 写入 `motionRef.current[id]`；卸载时 `delete`。
- 新增 props:`home`、`bornAtDoor`、`leaving`、`status`、`onExited(id)`、`motionRef`。

**`src/web/room/Room.tsx`（Scene）**
- 用 actor 调和取代当前 `placed`:维护 `actors: Actor[]`（React state），在 store 智能体集变化的 effect 里 reconcile：
  - 新增 store 智能体 → 加 actor `{ bornAtDoor: true }`。
  - store 中消失的 actor → 置 `leaving: true`（暂不移除）。
  - `onExited(id)` 回调 → 真正移除。
- 建 `motionRef`，传给每个 Character 与 Particles。
- home 锚来自 `roomLayout`。

**`src/web/room/Particles.tsx`**
- 改读 `motionRef`:`status==="working"` → 火花；`moving===true` → 节流地在脚下 emit 小 dust（脚步扬尘）。
- 现有"召唤门口烟尘 poof"保留。

**`src/web/room/Lights.tsx`**
- 移除每角色暖光（迁入 Character）；保留门口/喷泉静态光。`GlowLayer` 不再需要 `characters` 入参。

## 6. 详细行为

### 6.1 移动状态机（每个 actor）

类型:
```ts
interface Actor { id: string; hero: string; isLead: boolean; home: Pos; bornAtDoor: boolean; leaving: boolean; }
type Live = { x: number; y: number; facing: 1 | -1; moving: boolean; status: AgentStatus | "leaving" };
```

- **进场**（`bornAtDoor`）:初始位 `(DOOR_COL*TILE, 2*TILE)`；首目标 = `home`，播奔跑走过去；到达后转入游走。
- **游走**（living）:`pickWanderTarget(home, R, bounds)` → 走到 → 停顿 `pause`（idle 动画）→ 再选。`working` 时 `pause` 短（更活跃），`idle` 时 `pause` 长（踱步）。
- **指挥官**:`R≈6px` + 长 `pause`，基本居中。
- **离场**（`leaving`）:目标 = 门口 `(DOOR_COL*TILE, 2*TILE)`；到达后淡出 + `onExited(id)`。`session.cleared` 时全体子智能体同时进入离场 → 集体走出门口。
- 每帧:`stepToward` 推进；`faceDir` → `scale.x` 翻转（anchor 已 0.5,1）。
- 动画驱动:`moving` 标志切 **纹理集** `*_run_anim`/`*_idle_anim`（两套各 `useMemo` 稳定引用，仅状态切换时换）；`working` 只影响 `animationSpeed` 与停顿长短。
- **纹理切换 gotcha**:idle↔run 换 `textures` 同样会触发 PixiJS `set textures` → `gotoAndStop(0)` 停播，故每次切换后必须重新 `play()`（与 §8 同源）。

### 6.2 工具气泡

- 仅 `currentTool` 存在时渲染（icon = `toolNameToIcon(currentTool)`），`tool.ended` 清空即卸载消失。
- 作为 Character 子节点 → 自动跟随移动。
- pop-in 进场;消失从简。

### 6.3 脚步扬尘 / 进出场

- 脚步扬尘由 Particles 承担:每帧对 `moving===true` 的 actor 节流（如每 N 帧）在脚下 emit 1 个小 dust，复用现有粒子类型与 500 上限。
- 进/出场门口坐标复用 `DOOR_COL`；进场恰好叠在现有门口召唤烟尘上。

### 6.4 小表情

- `idle → zzz`（偶发）;`thinking → ...`;`working/spawning/done → 无`。
- 与工具气泡天然不重叠:用工具（working+currentTool）时只有气泡;待命/思考时只有表情。

### 6.5 motionRef 契约

- Scene 持有 `useRef<Record<string, Live>>`。
- Character 每帧写自己项;卸载删除自己项。
- Particles 每帧读全表;读时容忍缺项。

## 7. 关键参数（可调）

| 参数 | 初值 | 说明 |
|---|---|---|
| 子智能体游走半径 `R` | `~24px` | home 周围 |
| 指挥官 `R` | `~6px` | 基本居中 |
| 移动速度 | `~0.4 px/帧` | run/idle 阈值约 `0.05` |
| 停顿（working / idle） | `0.6–1.2s / 1.2–2.4s` | 随机 |
| 脚步扬尘节流 | 每 `~8` 帧/移动中角色 | |
| 气泡 pop-in | `~6` 帧 `scale 0→1` | |
| 地板内界 margin | 数 px | 避免精灵压墙 |

> 数值为初值，实现期在浏览器内目测微调，不影响架构。

## 8. 边界、一致性与 gotcha

- **位置 gotcha（务必遵守）**:Character 根容器**不要**用 React props 绑定 `x`/`y`。一旦绑定，store 更新触发的重渲染会把 `container.position` 重置回 prop 值、产生跳变。初始位置用 `useLayoutEffect` 命令式设置，之后只由 `useTick` 改。（与已修复的 `set textures` 停播 gotcha 同类:命令式驱动的属性别再交给 React 受控。）
- 只 clamp 到地板矩形，不做道具碰撞（据点在外围、半径小，基本不压道具）。
- `Math.random` 用于装饰性游走属故意的非确定性，不触碰 replay 确定性;不在领域/事件层引入随机。
- `leaving` 幽灵不可选中;被选中者离场时 `AgentCard` 自带 `if (!id||!agent) return null` guard 会自动关闭。
- 性能:N 个 Character 各一个 `useTick`（N 很小）;粒子 500 上限沿用;无每帧 React 重渲染。
- `roomLayout` 契约不变 → `layout.test.ts` 仍过。

## 9. 测试计划

- **新增** `motion.test.ts`（纯函数单测）:
  - `pickWanderTarget` 结果落在半径内且被 clamp 进 bounds（注入确定性 rng）。
  - `clampToFloor` 越界点被夹回边界。
  - `stepToward` 朝目标收敛、近距离时 `arrived` 为真、不过冲。
  - `faceDir` 符号正确、`vx≈0` 时保持。
- 现有测试保持绿,新增 motion 与 agent.thinking 单测后合计 46 项全绿。
- 浏览器人工验收:进场走入 → 游走 → 工具气泡 pop 并跟随 → 脚步扬尘 → 离场走出 → `session.cleared` 集体退场 → idle/thinking 小表情。

## 10. 验收标准

1. 角色在房间内持续走动、停顿、转向，奔跑/待命动画与移动状态一致;经多次 store 更新后不冻结。
2. 用工具时头顶弹出带尾巴对话气泡，pop-in，且随角色移动;工具结束即消失。
3. 新智能体从门口走入据点;完成的子智能体走向门口后消失;`session.cleared` 时子智能体集体走出。
4. 移动中脚下有节流扬尘;待命/思考时头顶有 `zzz`/`...`。
5. 指挥官基本居中。
6. `tsc` 0、`biome` 干净、`bun test` 全绿（含新增 motion 单测）。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 命令式位置被 React 重渲染重置 | §8 gotcha:不绑定 x/y props，命令式驱动 |
| 离场幽灵与 store 状态不一致 | Scene 单独维护 actor 列表;leaving 项用末次已知值、不可选中 |
| 多 useTick / 粒子膨胀 | N 小;粒子 500 上限;脚步扬尘节流 |
| 游走把角色推进墙/道具 | clamp 到地板内界;半径小、据点在外围 |
| 装饰随机性污染确定性 | 随机只在渲染层;领域/事件/replay 不变 |
