# Roguent PRD 文档集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `docs/prds/` 写出以子系统为单位的工程产品真相源——§1–§13 共 13 篇 PRD + 1 篇 §0 索引,每篇含真相源型 frontmatter + 标准 8 节正文,交互边界明确、status 真假分明、code_refs 可核实。

**Architecture:** 纯文档任务,不改源码。每篇 PRD = 一个 task,步骤为「读码核实 → 写 frontmatter+8 节正文 → 自检(字段齐/§4 与 frontmatter 一致/code_refs 指向真实文件)→ commit」。§0 索引(Task 14)在 §1–§13 全部写完后据各篇最终 frontmatter 汇总。结构规范见 spec:[docs/superpowers/specs/2026-06-06-product-prds-design.md](../specs/2026-06-06-product-prds-design.md)。

**Tech Stack:** Markdown + YAML frontmatter;核实用 `grep`/`Read`;无构建/测试,验收靠规约清单 + grep 抽查。

---

## PRD 写作规约(所有 §1–§13 task 共用)

### frontmatter schema(真相源型,固定字段)

```yaml
---
id: "§N"
title: <中文子系统名>
status: implemented | partial | mock | planned
layer: engine | web | shared | tauri | cross
updated: 2026-06-06
depends_on: ["§X"]      # 硬依赖上游(缺它本系统不成立);无则 []
related: ["§Y"]         # 有交互非硬依赖;无则 []
code_refs:
  - <真实文件路径,可带 :line>
specs:
  - <关联设计/计划文档路径>   # 无则 []
---
```

### 正文模板(标准 8 节,H1 用 `# §N <中文名>`)

```
## 1. 定位          一句话:是什么 / 产品角色
## 2. 为什么        解决的问题 / 用户价值 / 不做会怎样
## 3. 功能点        已提供能力清单(动词开头);规划中标 (planned)
## 4. 与其它子系统的交互边界  ★必填  上游依赖 / 下游消费 / 契约(事件·命令·数据结构);须与 frontmatter depends_on/related 一致
## 5. 数据流与关键约定   关键流程箭头链 + 特有约定/不变量/反直觉点
## 6. 现状与边界(真 / mock / 取舍)  接真部分 / 显著标注 mock / 已知取舍 / 明确不做
## 7. 代码锚点      file:line 列主要实现,可核实
## 8. 验收          对应 test 文件名 / 回放断言,"怎么证明它能工作"
```

各节按繁简伸缩,不凑字数;但 8 节标题齐全。

### 每篇通用写作流程(每个 task 的步骤套这个)

1. **核实**:对该篇 code_refs 跑 `grep`/`Read`,确认文件存在、status 初判属实、交互边界(消费/产出哪些事件·命令)准确;精确 file:line 以核实为准,不照搬本 plan 的示意行号。
2. **写文件**:`docs/prds/§N-<slug>.md`,先 frontmatter(用本 task 给的完整块,updated=核实当天)再 8 节正文。
3. **自检**(验收清单):
   - frontmatter 含全部字段;`status` 取值合法且与正文 §6 一致;`depends_on`/`related` 用 `"§N"` 字符串。
   - 正文 8 节标题齐;§4 的上游/下游与 frontmatter `depends_on`/`related` 一致。
   - `code_refs` 每条 `ls`/`grep` 可定位(无已删除文件)。
   - partial 篇:mock/planned 子项在 §6 显著标注。
4. **commit**:`git add docs/prds/§N-<slug>.md && git commit`,message `docs: 📝 PRD §N <子系统名>`。

> ⚠️ 提交纪律:每个 task 只 `git add` 本篇文件,不裹挟工作区其它改动。`§` 是全角 U+00A7,文件名照抄。

---

## File Structure(14 个文件)

| 文件 | 职责 |
| --- | --- |
| `docs/prds/§0-index.md` | 索引:13 篇一览表 + 依赖关系图(ascii)+ 真假速查 |
| `docs/prds/§1-core-driver.md` | 核心驱动与订阅模式 |
| `docs/prds/§2-event-protocol.md` | 事件协议与归一化主链路(枢纽) |
| `docs/prds/§3-room-render.md` | 房间可视化(内景) |
| `docs/prds/§4-overworld.md` | 总览世界与导航 |
| `docs/prds/§5-sessions-chat.md` | 多会话与聊天抽屉 |
| `docs/prds/§6-lifecycle-reconcile.md` | 会话生命周期与重连对账 |
| `docs/prds/§7-hud-shell.md` | 游戏化 HUD 外壳与面板路由 |
| `docs/prds/§8-model-mode-skills.md` | 模型·权限模式·技能控制 |
| `docs/prds/§9-usage-limits.md` | 用量与限额 |
| `docs/prds/§10-output-panels.md` | 任务·背包·排行榜(产出与计量) |
| `docs/prds/§11-import.md` | 本地会话导入 |
| `docs/prds/§12-visual-theme.md` | 视觉系统·主题·设置 |
| `docs/prds/§13-desktop-packaging.md` | 桌面打包(Tauri sidecar) |

执行顺序:Task 1–13 顺序不限(同构、互不阻塞);Task 14 必须最后。

---

### Task 1: §1 核心驱动与订阅模式

**Files:** Create `docs/prds/§1-core-driver.md`

- [ ] **Step 1: 核实** — `grep -nE "stripSubscriptionEnv|usesApiKey|setModel|setPermissionMode" src/engine/driver.ts`;`Read` `session.ts`/`credentials.ts`/`proxy.ts` 确认订阅 OAuth、代理注入、凭据读取仍在。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§1"
title: 核心驱动与订阅模式
status: implemented
layer: engine
updated: 2026-06-06
depends_on: []
related: ["§2", "§8", "§13"]
code_refs:
  - src/engine/driver.ts
  - src/engine/session.ts
  - src/engine/credentials.ts
  - src/engine/proxy.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

8 节要点:
- **定位**:用 Claude Agent SDK `query()` streaming-input 驱动订阅模式会话的引擎底座。
- **为什么**:streaming-input 是「运行时切模型/模式 + 多轮发消息」的决定性约束;订阅 OAuth 让可视化「白送」(不额外烧 API key 计费)。
- **功能点**:起/管 Driver 实例;`send` 多轮消息;`setModel`/`setPermissionMode`;skill 触发;`stripSubscriptionEnv` 抹 `ANTHROPIC_API_KEY`/`AUTH_TOKEN`;反向 `usesApiKey` auth 校验;macOS 系统代理注入;凭据读取。
- **交互边界**:上游 [];下游产出 SDK 消息 + hooks 给 §2 归一化;接收 §8 的 setModel/setMode/skill 命令;§13 打包时经 `ROGUENT_CLI_PATH` 注入 CLI 路径、依赖代理注入避免 403。
- **数据流**:UI 命令 → §2 onCommand → SessionManager → `Driver.send` → SDK → hooks/消息 → §2 normalize。
- **现状与边界**:全真;`--bare` 禁用(会关 hooks/skills);auth 反向判定(`none/oauth` 算正常)。
- **代码锚点**:`driver.ts`(stripSubscriptionEnv/usesApiKey/send/setModel)、`proxy.ts`(系统代理)、`credentials.ts`。
- **验收**:`src/engine/driver.test.ts`、`credentials.test.ts`、`proxy.test.ts`。

- [ ] **Step 3: 自检** — 套规约验收清单。
- [ ] **Step 4: Commit** — `git add docs/prds/§1-core-driver.md && git commit -m "docs: 📝 PRD §1 核心驱动与订阅模式"`

---

### Task 2: §2 事件协议与归一化主链路

**Files:** Create `docs/prds/§2-event-protocol.md`

- [ ] **Step 1: 核实** — `Read` `src/shared/events.ts`(信封 + 事件类型联合);`grep -nE "seq|Sequencer" src/engine/sequencer.ts`;`grep -n "broadcast\|onCommand" src/engine/ws-gateway.ts`;`grep -n "case \"" src/web/store.ts`(reduce 消费的事件类型)。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§2"
title: 事件协议与归一化主链路
status: implemented
layer: cross
updated: 2026-06-06
depends_on: ["§1"]
related: ["§3", "§4", "§5", "§6", "§9", "§10"]
code_refs:
  - src/shared/events.ts
  - src/engine/normalize.ts
  - src/engine/sequencer.ts
  - src/engine/ws-gateway.ts
  - src/web/store.ts
  - src/web/ws-client.ts
  - src/shared/domain.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

8 节要点:
- **定位**:连接引擎与前端的单一事件契约 + 归一化/定序/广播/折叠主链路。**枢纽子系统**。
- **为什么**:hooks 并行到达会乱序;需服务端权威 `(sessionId,seq)` 定序 + 单一信封让前后端解耦。
- **功能点**:统一信封 `{seq,ts,sessionId,type,agentId?,payload}`;`normalize` 把 SDK 消息+hooks → RoomEvent;`Sequencer` 打单调序号;`WsGateway` broadcast + `onCommand`;`store.reduce` 折叠成 sessions;新增事件类型「改三处」约定(events/normalize/store)。
- **交互边界**:上游 §1(SDK 消息/hooks);下游被 §3/§4/§5/§6/§9/§10 消费(各取所需事件类型);命令上行通道供 §5/§8 用。**列出关键事件类型**:`session.created/updated/cleared`、`agent.spawned/thinking/idle/done`、`tool.started/ended/failed`、`loot.dropped`、`todos.updated`、`message.delta/final`、`usage.updated`;并注明 limits 走非 seq 的 `LimitsMessage`(§9)。
- **数据流**:见 §1 数据流尾段 → `(sid,seq)` → broadcast → ws-client → reduce → 渲染源。
- **现状与边界**:全真;append-only/确定性 reduce;`session.created` 幂等合并(不重建 transcript)。
- **代码锚点**:`events.ts`、`normalize.ts`、`sequencer.ts`、`ws-gateway.ts`、`store.ts`。
- **验收**:`normalize.test.ts`、`sequencer.test.ts`、`ws-gateway.test.ts`、`store.test.ts`、`events.test.ts`、`replay.e2e.test.ts`。

- [ ] **Step 3: 自检** — 套规约;特别核对列出的事件类型与 `events.ts` 实际一致。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §2 事件协议与归一化主链路"`

---

### Task 3: §3 房间可视化(内景)

**Files:** Create `docs/prds/§3-room-render.md`

- [ ] **Step 1: 核实** — `Read` `src/web/room/Room.tsx`(atlas 错误覆盖层 :218、sheet 守卫);`ls src/web/room/`;确认 Character/Particles/Lights/Emote/ToolBubble 存在。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
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
```

8 节要点:
- **定位**:PixiJS v8 内景渲染——把当前会话的 agent 树渲染成「一屋子小人在干活」。
- **为什么**:可视化核心载体;主屏零正文,用动作/图标表达 agent 状态。
- **功能点**:主控★ + subagent 小人;游走/朝向翻转/工具气泡(tool→图标)/门口进出/脚步扬尘/待命表情;粒子/辉光/灯光;atlas 失败的**可见错误覆盖层**(P1-1,非静默)。
- **交互边界**:上游 §2(消费 `agent.spawned/idle/done`、`tool.started/ended/failed` → actors reconcile);related §4(大厅↔内景切换由 §4 视图状态驱动)、§12(暖木 token/atlas 资源)。
- **数据流**:§2 事件 → store actors → `<Character>` 挂载/卸载 + 头顶图标。
- **现状与边界**:全真;atlas 失败有错误覆盖层 + 重试(`Room.tsx:218`);PixiJS 组件不走 bun:test(无 DOM),可测逻辑下沉纯函数。
- **代码锚点**:`Room.tsx`(渲染主控 + atlas 守卫)、`Character.tsx`、`motion.ts`、`atlas.ts`。
- **验收**:`atlas.test.ts`、`layout.test.ts`、`motion.test.ts`;回放冒烟看到房间渲染。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §3 房间可视化(内景)"`

---

### Task 4: §4 总览世界与导航

**Files:** Create `docs/prds/§4-overworld.md`

- [ ] **Step 1: 核实** — `grep -n "LobbyView\|enterInterior\|exitOverworld" src/web/lobby/HubPlaza.tsx src/web/ui-store.ts`;`ls src/web/lobby/ src/web/overworld/`;**确认 `overworld/Overworld.tsx` 已不存在、入口是 `lobby/HubPlaza.tsx`**。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
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
  - src/web/ui-store.ts
specs:
  - docs/superpowers/specs/2026-06-04-overworld-hub-design.md
  - docs/superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md
---
```

8 节要点:
- **定位**:双层缩放(大厅 ↔ 内景)的 hub——项目=房间、会话=NPC,玩家走动进出会话。
- **为什么**:多会话/多项目需要一个空间化的导航与切换载体,而非列表。
- **功能点**:大厅 DOM 渲染(`LobbyView`,**非历史 PixiJS Overworld**);项目房 + 走廊 + 相机跟随;主角 WASD + A\* 寻路;会话 NPC + 信息卡;漩涡过场;中央任务台 E 键开 SessionGrid。
- **交互边界**:上游 §2(session/agent 事件 → 房间/NPC);related §3(`enterInterior` 进内景)、§5(NPC=会话、切换渲染源)、§6(生命周期门动画进出)、§12(像素皮/缩放)。
- **数据流**:`store.sessions` → projectOrder → 房间/NPC;`ui-store.enterInterior/exitOverworld` 切视图。
- **现状与边界**:全真;**保留现有 hub 作唯一可玩大厅**,未在 DOM 重建走动大厅之外的原型;Codex 相关为视觉占位。
- **代码锚点**:`lobby/HubPlaza.tsx`(LobbyView)、`overworld/portal.ts`、`ui-store.ts`(视图状态)。
- **验收**:`portal.test.ts`、`ui-store.test.ts`(enterInterior/exitOverworld)。

- [ ] **Step 3: 自检** — 套规约;确认无 `Overworld.tsx` 引用。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §4 总览世界与导航"`

---

### Task 5: §5 多会话与聊天抽屉

**Files:** Create `docs/prds/§5-sessions-chat.md`

- [ ] **Step 1: 核实** — `grep -nE "createSession|session.created|SessionManager" src/engine/session.ts`;`Read` `src/web/hud/ChatDrawer.tsx` 顶部;`grep -n "activeSession\|switchSession" src/web/store.ts`。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§5"
title: 多会话与聊天抽屉
status: implemented
layer: cross
updated: 2026-06-06
depends_on: ["§1", "§2"]
related: ["§4", "§6", "§8"]
code_refs:
  - src/engine/session.ts
  - src/web/hud/ChatDrawer.tsx
  - src/web/hud/SessionGrid.tsx
  - src/web/store.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

8 节要点:
- **定位**:按 sessionId 并行管多个独立会话,聊天 Modal 作输入/查看入口。
- **为什么**:每会话=独立 Driver/agent 树/model/mode/usage;切会话=切渲染源。
- **功能点**:`SessionManager` 管多 Driver;前置合成 `session.created` 破「没会话→发不了消息→不发 init→没会话」死锁;reducer 对 `session.created` 幂等合并 + 首现切焦点;聊天 Modal(消息流/输入/新建/切换);message.delta/final 按 `parent_tool_use_id` 归 agent。
- **交互边界**:上游 §1(每会话一个 Driver)、§2(message 事件 + 命令上行);related §4(会话=NPC)、§6(生命周期)、§8(每会话独立 model/mode)。
- **数据流**:newSession 命令 → SessionManager.createSession(合成 session.created)→ §2 → store.sessions;切会话 → activeSession → 渲染源。
- **现状与边界**:全真;运行中 subagent 不能插话(CC 限制),subagent 弹窗以查看为主。
- **代码锚点**:`session.ts`(createSession/花名册)、`store.ts`(sessions/activeSession/switchSession)、`ChatDrawer.tsx`。
- **验收**:`session.test.ts`、`store.test.ts`(switchSession、message.delta agentId)。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §5 多会话与聊天抽屉"`

---

### Task 6: §6 会话生命周期与重连对账

**Files:** Create `docs/prds/§6-lifecycle-reconcile.md`

- [ ] **Step 1: 核实** — `grep -nE "archive|unarchive|LRU|remove|reconcile|roster|花名册" src/web/store.ts src/engine/session.ts`;`grep -n "reconnect\|reconcile" src/web/ws-client.ts`。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§6"
title: 会话生命周期与重连对账
status: implemented
layer: cross
updated: 2026-06-06
depends_on: ["§2", "§5"]
related: ["§4"]
code_refs:
  - src/web/store.ts
  - src/engine/session.ts
  - src/web/ws-client.ts
specs:
  - docs/superpowers/specs/2026-06-04-overworld-hub-design.md
---
```

8 节要点:
- **定位**:会话的归档/删除/LRU 上限与断连重连后的状态对账。
- **为什么**:长期运行会积累会话需 LRU 控量;WS 重连后客户端可能残留「幽灵会话」,需与引擎花名册对账清理。
- **功能点**:归档/删除/LRU ≤10/再激活走回;门动画进出;**重连对账**(引擎下发会话花名册,客户端清幽灵会话,最近 commit `bdde286`);WS 重连 + 事件缓冲补发。
- **交互边界**:上游 §2(事件)、§5(会话集合);related §4(门动画进出大厅);消费引擎下发的 roster。
- **数据流**:重连 → 引擎发花名册 → store 对账(删除花名册外的本地会话)。
- **现状与边界**:全真;纯内存,刷新即重置(持久化/`--resume` 为 planned)。
- **代码锚点**:`store.ts`(archive/LRU/unarchive/remove/reconcile)、`session.ts`(花名册)、`ws-client.ts`。
- **验收**:`store.test.ts`(archive/LRU/unarchive/remove)、`ws-client.test.ts`。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §6 会话生命周期与重连对账"`

---

### Task 7: §7 游戏化 HUD 外壳与面板路由

**Files:** Create `docs/prds/§7-hud-shell.md`

- [ ] **Step 1: 核实** — `grep -n "activePanel" src/web/ui-store.ts`;`Read` `src/web/hud/Hud.tsx` 顶部;`grep -c "export" src/web/hud/icons.tsx`(图标数量级)。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§7"
title: 游戏化 HUD 外壳与面板路由
status: implemented
layer: web
updated: 2026-06-06
depends_on: ["§2"]
related: ["§8", "§9", "§10", "§11", "§12"]
code_refs:
  - src/web/hud/Hud.tsx
  - src/web/hud/icons.tsx
  - src/web/hud/ButtonDock.tsx
  - src/web/hud/Hotbar.tsx
  - src/web/hud/Minimap.tsx
  - src/web/ui-store.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

8 节要点:
- **定位**:图标化 HUD 外壳 + 单一 `activePanel` 面板路由,承载所有功能面板。
- **为什么**:主屏零正文原则;图标代替文字、hover 显名;面板复用 Modal 单路由避免多布尔状态。
- **功能点**:自绘像素 SVG 图标注册表(~33);`activePanel` 单路由 + 复用 Modal;Hotbar/Minimap/ButtonDock/SessionBanner/RosterCard/HeroPortrait。
- **交互边界**:上游 §2(渲染源/状态);related §8/§9/§10/§11/§12(各面板挂在本路由下,由 activePanel 切换)。
- **数据流**:`ui-store.activePanel` → Hud 渲染对应面板;按钮 → setActivePanel。
- **现状与边界**:全真(外壳);hotbar badge 等真实角标数据待引擎补(planned)。
- **代码锚点**:`Hud.tsx`、`icons.tsx`、`ui-store.ts`(activePanel)、`ButtonDock/Hotbar/Minimap`。
- **验收**:`icons.test.ts`、`tool-icons.test.ts`、`ui-store.test.ts`。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §7 游戏化 HUD 外壳与面板路由"`

---

### Task 8: §8 模型·权限模式·技能控制

**Files:** Create `docs/prds/§8-model-mode-skills.md`

- [ ] **Step 1: 核实** — `grep -nE "setModel|setPermissionMode|parseCommand" src/engine/ws-gateway.ts`;**确认 `setPermissionMode` 是否有独立 WS 命令**(ROADMAP 记其未实现、经 session.created 传 permissionMode);`Read` `src/web/hud/ModelPicker.tsx`/`Skills.tsx` 顶部。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§8"
title: 模型·权限模式·技能控制
status: partial
layer: cross
updated: 2026-06-06
depends_on: ["§1", "§2", "§7"]
related: ["§5"]
code_refs:
  - src/web/hud/ModelPicker.tsx
  - src/web/hud/Skills.tsx
  - src/engine/ws-gateway.ts
  - src/engine/driver.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

8 节要点:
- **定位**:运行时切模型/权限模式 + 触发技能到当前会话(streaming-input 专属能力)。
- **为什么**:streaming-input 才支持运行时 setModel/setPermissionMode,是架构选 A 的核心理由。
- **功能点**:ModelPicker 运行时 `setModel`;permissionMode 选择;技能格(`system:init.slash_commands` + model-invoke skills)触发。
- **交互边界**:上游 §1(命令落地到 Driver)、§2(命令上行通道 onCommand/parseCommand)、§7(面板宿主);related §5(每会话独立 model/mode)。
- **数据流**:面板 → sendCommand(setModel)→ §2 parseCommand → §1 Driver。
- **现状与边界(partial)**:setModel 真;**`setPermissionMode` 无独立 WS 命令**,permissionMode 经 `session.created` payload 传递(显著标注);skill 触发受 headless 限制,优先 model-invoke。
- **代码锚点**:`ModelPicker.tsx`、`Skills.tsx`、`ws-gateway.ts`(parseCommand setModel)、`driver.ts`。
- **验收**:`ws-gateway.test.ts`(parseCommand setModel)、`store.test.ts`(permissionMode via session.created)。

- [ ] **Step 3: 自检** — 套规约;确认 partial 点在 §6 标注。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §8 模型·权限模式·技能控制"`

---

### Task 9: §9 用量与限额

**Files:** Create `docs/prds/§9-usage-limits.md`

- [ ] **Step 1: 核实** — `grep -nE "rate_limit_event|poll|planName|LimitsMessage" src/engine/usage-limits.ts src/engine/usage-poller.ts src/engine/limits-aggregator.ts`;`Read` `src/web/hud/LimitBars.tsx` 顶部。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§9"
title: 用量与限额
status: implemented
layer: cross
updated: 2026-06-06
depends_on: ["§1", "§2", "§7"]
related: ["§10"]
code_refs:
  - src/engine/usage-limits.ts
  - src/engine/usage-poller.ts
  - src/engine/limits-aggregator.ts
  - src/web/hud/LimitBars.tsx
  - src/web/hud/limits-format.ts
specs:
  - docs/superpowers/specs/2026-06-05-usage-and-limits-design.md
---
```

8 节要点:
- **定位**:展示账户 5h / CTX / 周三条限额用量。
- **为什么**:订阅有 5h/周额度,用户需实时看到「已用%」避免突然受限。
- **功能点**:OAuth poll 权威源(planName + 用量)+ SDK `rate_limit_event` 兜底;LimitBars 三条统一显示「已用%」;CTX 仅内景显示、账户级 5h/WEEK 始终显。
- **交互边界**:上游 §1(SDK rate_limit_event / OAuth poll)、§2(**limits 走非 seq 的 `LimitsMessage`,不做成 RoomEvent**)、§7(面板宿主);related §10(Currency)。
- **数据流**:poller(权威)+ rate_limit_event(兜底)→ LimitsMessage → store.limits → LimitBars。
- **现状与边界**:全真;读不到 keychain,故靠 SDK 事件 + poll(参照 claude-hud)。
- **代码锚点**:`usage-poller.ts`、`limits-aggregator.ts`、`LimitBars.tsx`、`limits-format.ts`。
- **验收**:`usage-limits.test.ts`、`usage-poller.test.ts`、`limits-aggregator.test.ts`、`limits-format.test.ts`。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §9 用量与限额"`

---

### Task 10: §10 任务·背包·排行榜(产出与计量)

**Files:** Create `docs/prds/§10-output-panels.md`

- [ ] **Step 1: 核实** — `grep -nE "todos.updated|Session.todos|loot.dropped" src/web/store.ts src/web/hud/todos-view.ts`;`Read` `src/web/hud/Leaderboard.tsx`/`Shop.tsx` 顶部确认聚合真/Shop mock banner。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§10"
title: 任务·背包·排行榜(产出与计量)
status: partial
layer: web
updated: 2026-06-06
depends_on: ["§2", "§7"]
related: ["§5", "§9"]
code_refs:
  - src/web/hud/TaskWindow.tsx
  - src/web/hud/Tasks.tsx
  - src/web/hud/LootPanel.tsx
  - src/web/hud/Leaderboard.tsx
  - src/web/hud/todos-view.ts
  - src/web/hud/Shop.tsx
specs:
  - docs/superpowers/plans/2026-06-06-roguent-real-data-and-stage-scaling.md
---
```

8 节要点:
- **定位**:展示 agent 产出与计量——任务清单、战利品背包、排行榜。
- **为什么**:把真实 TodoWrite/产物/统计游戏化呈现,真假分明地区分已接真与占位。
- **功能点**:TaskWindow/Tasks(接真 `todos.updated`/Session.todos);LootPanel(`loot.dropped` 真);Leaderboard(按会话真 + 按模型/runtime 聚合);Currency 完成数(已完成 todo 计数)。
- **交互边界**:上游 §2(`todos.updated`/`loot.dropped`)、§7(面板宿主);related §5(按会话聚合)、§9(Currency)。
- **数据流**:§2 todos.updated → Session.todos → TaskWindow;loot.dropped → s.loot → LootPanel。
- **现状与边界(partial)**:Tasks/loot/leaderboard/完成数**真**;**信箱 mock**(引擎无 inter-agent 信箱)、**Shop / gems mock**(`.task-mock-banner` + `shop-data.ts` 顶部注「全 mock」)——显著标注。
- **代码锚点**:`TaskWindow.tsx`、`todos-view.ts`、`LootPanel.tsx`、`Leaderboard.tsx`、`leaderboard-rows.ts`、`Shop.tsx`(mock)。
- **验收**:`todos-view.test.ts`、`leaderboard.test.ts`;reduce 级 todos.updated/loot e2e。

- [ ] **Step 3: 自检** — 套规约;mock 子项显著标注。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §10 任务·背包·排行榜"`

---

### Task 11: §11 本地会话导入

**Files:** Create `docs/prds/§11-import.md`

- [ ] **Step 1: 核实** — `grep -nE "scan|parse|import" src/engine/local-sessions.ts src/engine/import.ts`;`Read` `src/web/hud/ImportPanel.tsx` 顶部;确认 `src/shared/local-sessions.ts`、`transcript.ts`。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§11"
title: 本地会话导入
status: implemented
layer: cross
updated: 2026-06-06
depends_on: ["§2", "§7"]
related: ["§5"]
code_refs:
  - src/engine/local-sessions.ts
  - src/engine/import.ts
  - src/engine/transcript.ts
  - src/shared/local-sessions.ts
  - src/web/hud/ImportPanel.tsx
specs:
  - docs/superpowers/specs/2026-06-05-import-local-sessions-design.md
---
```

8 节要点:
- **定位**:扫描/解析本机 Claude Code 历史会话,导入为可视化会话。
- **为什么**:让用户把已有 CLI 会话「搬进」Roguent 查看,而非只看新起的会话。
- **功能点**:扫描本地会话目录(local-sessions);transcript 解析;ImportPanel 选择/导入 UI。
- **交互边界**:上游 §2(导入注入事件流/会话)、§7(面板宿主);related §5(导入成会话进 SessionManager)。
- **数据流**:扫描 → 解析 transcript → 注入为 session + 事件 → store。
- **现状与边界**:全真。
- **代码锚点**:`local-sessions.ts`、`import.ts`、`transcript.ts`、`ImportPanel.tsx`。
- **验收**:`local-sessions.test.ts`、`import.test.ts`、`transcript.test.ts`、`import.e2e.test.ts`。

- [ ] **Step 3: 自检** — 套规约。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §11 本地会话导入"`

---

### Task 12: §12 视觉系统·主题·设置

**Files:** Create `docs/prds/§12-visual-theme.md`

- [ ] **Step 1: 核实** — `grep -nE "accent|theme|motion|density|cjkPixel|avatarHero" src/web/settings-store.ts`;`grep -n "1920\|stageScale" src/web/stage-scale.ts`;`ls public/fonts/`;`Read` `src/web/hud/Settings.tsx` 顶部确认 CONFIG mock banner。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
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
```

8 节要点:
- **定位**:全站视觉基础设施——暖木 RPG 主题 token、像素图标、中文字体、舞台缩放、设置持久化。
- **为什么**:严格按 Claude Design 原型(含字体)落地观感;固定逻辑舞台修复小屏人物/HUD 过大。
- **功能点**:暖木 token + 像素 chrome;自绘 SVG 图标;自托管 Fusion Pixel 中文字体(**不走 CDN**);settings-store(accent/theme/motion/density/cjkPixel/avatarHero,持久化);固定 1920×1080 舞台等比缩放(`stageScale=min(W/1920,H/1080)`,letterbox 居中)。
- **交互边界**:上游 [](基础设施);related §3/§4/§7(被所有渲染消费)、§13(字体作打包资源)。
- **数据流**:settings-store → CSS 变量/类 → 全站;stage-scale → `#viewport/#stage` 变换。
- **现状与边界(partial)**:视觉系统/字体/缩放/settings 真;**Settings CONFIG 整面板 mock**(标注,引擎无对应能力)。
- **代码锚点**:`styles.css`、`icons.tsx`、`settings-store.ts`、`stage-scale.ts`、`Settings.tsx`(CONFIG mock)。
- **验收**:`settings-store.test.ts`、`stage-scale.test.ts`、`icons.test.ts`。

- [ ] **Step 3: 自检** — 套规约;CONFIG mock 标注。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §12 视觉系统·主题·设置"`

---

### Task 13: §13 桌面打包(Tauri sidecar)

**Files:** Create `docs/prds/§13-desktop-packaging.md`

- [ ] **Step 1: 核实** — `ls src-tauri/ scripts/`;`grep -n "PORT=\|ROGUENT_CLI_PATH\|resolveEngineUrl" src/engine/port.ts src/web/engine-url.ts`;复核 ROADMAP P1-4/P1-6 现状(.app 黑屏未确认、DMG 失败)。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§13"
title: 桌面打包(Tauri sidecar)
status: partial
layer: tauri
updated: 2026-06-06
depends_on: ["§1", "§12"]
related: ["§9"]
code_refs:
  - src-tauri/
  - scripts/build-sidecar.ts
  - scripts/stage-cli.ts
  - src/engine/port.ts
  - src/web/engine-url.ts
specs:
  - docs/superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md
---
```

8 节要点:
- **定位**:把三层包成原生 macOS `.app`——Tauri 2 壳 + Bun sidecar + bundled CLI。
- **为什么**:让 Roguent 成为可分发桌面应用,而非只跑浏览器 + 手起 engine。
- **功能点**:Tauri 2 壳(WKWebView);engine 作 sidecar(`bun build --compile`);218MB claude CLI 作 `bundle.resources`、`ROGUENT_CLI_PATH` 传 SDK;端口经 stdout `PORT=` 握手 → `engine_url` 命令 → 前端 `resolveEngineUrl` 退避重试;孤儿 sidecar 回收;字体本地化。
- **交互边界**:上游 §1(sidecar 跑 engine、注入 CLI 路径)、§12(字体资源打包);related §9(系统代理影响 SDK 网络)。
- **数据流**:host spawn sidecar → engine 绑临时端口、打 `PORT=<n>` → host 解析 → `engine_url` → 前端连接。
- **现状与边界(partial)**:壳 + sidecar + 代理/孤儿回收已合入;**.app 主画布黑屏未确认(P1-4)**、**DMG 打包失败(P1-6)**——显著标注,链 ROADMAP。第一阶段仅 Apple Silicon。
- **代码锚点**:`src-tauri/*`、`scripts/build-sidecar.ts`、`scripts/stage-cli.ts`、`port.ts`、`engine-url.ts`。
- **验收**:`port.test.ts`、`engine-url.test.ts`;打包 .app 手动验收(P1-5 清单)。

- [ ] **Step 3: 自检** — 套规约;P1-4/P1-6 现状标注 + 链 ROADMAP。
- [ ] **Step 4: Commit** — `git commit -m "docs: 📝 PRD §13 桌面打包(Tauri sidecar)"`

---

### Task 14: §0 索引(最后做)

**Files:** Create `docs/prds/§0-index.md`

- [ ] **Step 1: 汇总** — 读 §1–§13 已写好的 frontmatter,提取每篇 `title`/`layer`/`status`/`depends_on`/`related`,据此填一览表与依赖图(不臆造,以已写文件为准)。

- [ ] **Step 2: 写文件** — frontmatter:

```yaml
---
id: "§0"
title: 索引
updated: 2026-06-06
---
```

正文结构:
- **# Roguent PRD 索引**
- **## 这是什么 / 怎么读**:`docs/prds/` 是以子系统为单位的工程产品真相源;与 `specs/`(设计)、`plans/`(历史实现)、`ROADMAP.md`(现状+backlog)的关系一句话各一行。
- **## 13 篇一览**:表格列 `§ | 子系统(title) | layer | status | 一句话定位`,13 行,链到各篇文件。
- **## 子系统依赖关系图(ascii)**:据各篇 depends_on 画——§1 源头 → §2 枢纽 → §3/§4/§5/§6/§9/§10 消费;§7 HUD 外壳挂 §8/§9/§10/§11/§12;§12 基础设施被渲染消费;§13 依赖 §1/§12。骨架见 spec §9,据最终 frontmatter 校正。
- **## 真假分明速查**:列出 partial 篇(§8/§10/§12/§13)及各自 mock/planned 子项一行。

- [ ] **Step 3: 自检** — 一览表/依赖图/速查与各篇 frontmatter 一致;无悬空引用(每个 `§N` 都有对应文件)。
- [ ] **Step 4: Commit** — `git add docs/prds/§0-index.md && git commit -m "docs: 📝 PRD §0 索引(13篇一览+依赖图+真假速查)"`

---

## Self-Review(写完计划后的检查,已执行)

**1. Spec coverage:** spec §3 命名清单 14 文件 ↔ File Structure 14 行 ↔ Task 1–14,一一对应 ✓;spec §8 每篇 frontmatter(status/layer/depends_on/related/code_refs/specs)↔ 各 Task Step 2 的 YAML 块,逐字搬入 ✓;spec §6 真假分明 ↔ partial 篇(§8/§10/§12/§13)的 §6 标注要求 ✓;spec §7 交互两处一致 ↔ 各 Task 自检项「§4 与 frontmatter 一致」✓;spec §9 §0 结构 ↔ Task 14 ✓。

**2. Placeholder scan:** 无 TBD/TODO;各 Task 给完整 frontmatter + 具体节要点 + 具体核实命令,无「参考某 task」式占位 ✓。

**3. Type consistency:** 文件名/slug 全程与 spec §3 权威表一致(`§N-<slug>.md`);depends_on/related 跨篇互指对称已核(如 §1.related 含 §2,§2.depends_on 含 §1)✓。status 取值全程 implemented/partial/mock/planned ✓。

**4. 已知核实点(执行时务必跑 grep,勿照搬):** §4 确认无 `Overworld.tsx`;§8 确认 `setPermissionMode` 无独立 WS 命令;各篇精确 file:line 以核实为准。
