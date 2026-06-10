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

# §5 多会话与聊天抽屉

## 1. 定位

按 `sessionId` 并行管理多个独立 Claude Agent 会话，每个会话拥有独立的 Driver、agent 树、model、permissionMode 与用量统计。聊天面板（ChatDrawer）以居中 Modal 形式作为输入与查看入口：左侧会话侧栏（列表/新建/归档复活）、右侧对话区（消息流+输入框）。当前选中会话（`currentSessionId`）即为房间渲染源：切换会话=切换渲染源。

SessionGrid 提供全会话总览（像素栅格列出所有未归档会话），点击卡片可进入对应会话内景。

## 2. 为什么

Claude Agent SDK 的 `query()` 是 streaming-input 长连接，每条 `sendMessage` 追加进同一个 streaming 队列；多任务必须通过多 Driver 实例并行，不能复用单 Driver 跨会话分发。

会话存在性不能依赖 SDK `system:init`：SDK 在 streaming-input 模式下要等第一条 user 消息才发 `init`，若 `session.created` 晚于消息路由则形成「没会话→发不了消息→不发 init→没会话」死锁。引擎必须在 `createSession` 时前置合成一条 `session.created`，把建会话时已知的 `title/model/cwd/project` 填上，客户端从此刻起即认识该会话。

聊天 Modal 设计动机：原型为右侧抽屉，T3.8 重构为居中 Modal（`ChatDrawer` 导出名保留以保持 Hud 层不变），统一与其他面板的视觉层级。

## 3. 功能点

- **`SessionManager` 管多 Driver**：`drivers` Map 按 `sessionId` 索引；每 `createSession` 建一个 `Driver` 实例，绑独立的 `DriverCallbacks`；`sendMessage`/`setModel`/`interrupt` 均按 id 路由到对应 Driver。
- **前置合成 `session.created` 破死锁**：`createSession` 立即 `emit` 一条 `session.created`（seq=1），携带 `title/model/cwd/project/permissionMode="default"`，不等 SDK `system:init`。
- **SDK init 派生的第二条 `session.created` 注入用户标题**：`onDraft` 回调检测 `d.type === "session.created"` 时，将建会话时的 `title/cwd/project` 注入，确保前端抽屉不显示裸 sessionId。
- **reducer 对 `session.created` 幂等合并**：前端 `reduce` 收到第二条 `session.created` 时，若 `sessions[sessionId]` 已存在则执行合并（补 `model/slashCommands/cwd/project/permissionMode`，绝不重建），保留已有 transcript、agents、todos；`permissionMode` 仅在 SDK init 带来的值非 `"default"` 时覆盖，避免把真实模式刷回默认。
- **新会话首现自动切焦点**：`session.created` 建新会话时，`reduce` 返回 `currentSessionId: e.sessionId`；延迟到达的第二条（existing != null 分支）不改 `currentSessionId`，不抢焦点。
- **聊天 Modal（ChatDrawer）**：
  - 左侧活跃会话列表（`activeList`），点击 `switchSession` 切换当前焦点；
  - 新建会话（`newSession`）：前端生成自增 `s<n>` id，发 `newSession` 命令，可携带可选 `cwd`；
  - 已归档区（`archivedList`）：搜索 + 一键 `unarchiveSession` 复活到大厅；
  - 右侧对话流：按 `role` 分 `user`（右/青色气泡）/ `assistant|system`（左/面板色气泡），`messages` 源自当前会话 `s.messages`；
  - 输入框：`Enter` 或点「发送」→ 乐观 `appendUserMessage`（本地立即追加用户气泡）+ 发 `sendMessage` 命令到引擎。
- **SessionGrid 全会话总览**：像素栅格列出所有未归档会话，带状态角标（busy/idle/done/error），点击卡片 `beginEnter` 进入会话内景传送门漩涡；左上导入卡入 ImportPanel。
- **`message.delta`/`message.final` 按归属落到对应 agent**：`reduce` 取 `e.agentId` 作为消息的 `agentId` 字段；`role === "user"` 时 `agentId` 固定为 `undefined`（用户消息无 agent 归属）。
- **`knownSessions` 花名册**：`createSession`/`importSession` 均写入 `knownSessions`；`deleteSession` 移除；`sessionIds()` 供 WsGateway 新连接时下发给客户端做重连对账（清幽灵会话）。
- **导入会话（`importSession`）**：读本地 CC transcript，零额度瞬时灌入事件流，不建 Driver；`session.created` payload 带 `imported: true`，对账豁免，不被引擎花名册清掉。（planned）完整导入 UI 交互见 §6。

## 4. 交互边界 ★

### 上游

- **§1 Driver**：`SessionManager` 是 Driver 的生命周期管理者。`createSession` 调 `driverFactory(cb, model, cwd)` 建 Driver 并 `start()`；`sendMessage(id, text)` → `driver.send(text)`；`setModel(id, model)` → `driver.setModel(model)`；`interrupt(id)` → `driver.interrupt()`；`deleteSession(id)` → `driver.end()` 终止 SDK query。
- **§2 事件协议**：`createSession` 前置合成 `session.created` 并经 `Sequencer` 打 `(sessionId, seq)` 后 emit；`onDraft` 把所有 Driver 产出事件（含 SDK init 派生的第二条 `session.created`）同样经 Sequencer 打序 emit；WsGateway 订阅 `SessionManager.subscribe` 得到所有 `RoomEvent` broadcast 给前端。命令上行：WsGateway `onCommand` 把 `newSession`/`sendMessage`/`setModel`/`interrupt`/`deleteSession` 路由到 `SessionManager` 对应方法。

### 下游（消费方）

- **§4 总览世界**：会话的 `project` 字段决定房间归属；`currentSessionId` 决定当前渲染源（哪个房间显示内景 NPC）；`SessionGrid` 提供进入会话内景的入口（`beginEnter`）。
- **§6 生命周期/归档/LRU**：`ACTIVE_CAP=10` 在 `reduce(session.created)` 和 `unarchiveSession` 时执行 `enforceActiveCap`，软归档活跃度最低者；`archiveSession`/`unarchiveSession`/`removeSession` 是 store 动作，`deleteSession` 命令终止引擎侧 Driver；导入会话归 §6 Import 流程管辖。
- **§8 ModelPicker/PermissionMode**：每会话独立的 `model`/`permissionMode`；`setModel` 命令发到引擎更换当前会话 Driver 的模型；`permissionMode` 由 SDK init 派生的 `session.created` 带入，`reduce` 在非 `"default"` 时覆盖。

### 契约（与 frontmatter 一致）

- depends_on §1（Driver 接口）、§2（事件+命令协议）。
- related §4（会话=NPC 渲染源）、§6（归档/LRU/导入生命周期）、§8（model/mode 选择）。

## 5. 数据流与关键约定

```
UI "newSession" 命令
  → WsGateway.onCommand
  → SessionManager.createSession(id, {title, model, cwd})
      ① emit seq.stamp(id, "session.created", {title,model,cwd,project,"default",...})
         → 所有订阅方 (WsGateway → 客户端)
         → 客户端 reduce: 新建 session 对象; currentSessionId = id (首现切焦点)
      ② driverFactory(cb, model, cwd).start()
         → SDK query() 开启 streaming-input 连接
         → 等待第一条 sendMessage 才触发 system:init
      ③ SDK system:init → onDraft([{type:"session.created", payload:{...}}])
         → engine 注入 title/cwd/project
         → emit seq.stamp(id, "session.created", {...})
         → 客户端 reduce: existing 分支 → 幂等合并(补 slashCommands/permissionMode); 不抢焦点

UI "sendMessage" 命令
  → SessionManager.sendMessage(id, text) → driver.send(text)
  → SDK → message.delta / message.final events
  → onDraft → seq.stamp → broadcast
  → 客户端 reduce(message.delta): s.messages.push({agentId: e.agentId, role:"assistant", ...})

UI switchSession(id) → store.currentSessionId = id → 渲染源切换 → 房间/HUD 重渲染

重连对账:
  WsGateway 新连接 → 下发 {cmd:"roster", ids: sessionManager.sessionIds()}
  → 客户端 reconcileSessions(ids): 清幽灵(不在册且非 imported); 保留 imported 存档
```

**关键约定**：
- `session.created` 的 `permissionMode` 合成时恒为 `"default"`；reducer 只在 SDK init 带来的值非 `"default"` 时覆盖（防把真实 `bypassPermissions` 刷回默认）。
- `message.delta`/`message.final` 的 `agentId` 透传到 `s.messages[].agentId`，供 ChatDrawer 按 agent 分组（当前 UI 仅按 role 显示气泡，agentId 已在数据层就位）。
- subagent 会话（`imported: false`，有 Driver）的输入框可发消息；**运行中 subagent 无法插话**（CC 限制），subagent 弹窗（若后续实现）以查看为主；**只有主控会话能在 SDK 运行间隙发新消息**。
- 乐观回显：`appendUserMessage` 本地直接追加用户气泡，不依赖服务端事件；服务端无对应事件回传用户消息，不会重复。

## 6. 现状与边界

| 能力 | 状态 | 说明 |
|------|------|------|
| 多 Driver 并行 | **真** | `SessionManager.drivers` Map，每 sessionId 独立 Driver |
| 前置合成 `session.created` | **真** | `createSession` 第①步立即 emit，破死锁 |
| `session.created` 幂等合并 | **真** | `reduce` existing 分支合并，不清 transcript |
| 首现切焦点 / 第二条不抢 | **真** | `reduce` 新建分支返回 `currentSessionId: e.sessionId`；existing 分支透传原 id |
| ChatDrawer 消息流/发送/新建 | **真** | 全部接真引擎，无 mock |
| 已归档复活 / 搜索 | **真** | `unarchiveSession` + `search` 本地过滤 |
| SessionGrid 总览 / 进入内景 | **真** | `beginEnter` 触发传送门漩涡；Codex runtime 页签为禁用占位 |
| 导入会话查看 | **真** | `importSession` 零额度灌入；UI 入口在 ImportPanel（§6） |
| 运行中 subagent 插话 | **不支持** | CC SDK 限制，无法向运行中 subagent 插入消息 |
| Codex runtime | **占位** | 引擎只跑 Claude，SessionGrid 的 Codex 页签禁用 |
| 会话级 askuser 角标 | **不做** | 无真数据，SessionGrid 只做 error 角标 |

## 7. 代码锚点

| 文件 | 位置 | 说明 |
|------|------|------|
| `src/engine/session.ts` | `:65-122` | `createSession`：前置合成 `session.created`、构建 `DriverCallbacks`（onDraft 注入 title/project、onRateLimit 聚合）、建 Driver 并 start |
| `src/engine/session.ts` | `:96-111` | `onDraft` 回调：检测 `session.created` draft 并注入 `title/cwd/project` |
| `src/engine/session.ts` | `:129-131` | `sendMessage(id, text)`：路由到对应 Driver |
| `src/engine/session.ts` | `:136-160` | `importSession`：读 transcript、normalizeTranscript、带 `imported:true` 批量 emit |
| `src/engine/session.ts` | `:164-168` | `deleteSession`：`driver.end()` + 移出 `drivers`/`knownSessions` |
| `src/engine/session.ts` | `:170-172` | `setModel(id, model)` |
| `src/engine/session.ts` | `:124-127` | `sessionIds()`：返回花名册，供重连对账 |
| `src/web/store.ts` | `:61-135` | `reduce`：`session.created` 新建分支（建 session、切焦点、`enforceActiveCap`） |
| `src/web/store.ts` | `:71-106` | `reduce`：`session.created` existing 分支（幂等合并，不抢焦点） |
| `src/web/store.ts` | `:264-282` | `reduce`：`message.delta`/`message.final`，追加消息并保留 `agentId` |
| `src/web/store.ts` | `:317-341` | `RoomStore` 接口 + `switchSession` 实现 |
| `src/web/store.ts` | `:366-386` | `archiveSession`/`unarchiveSession` |
| `src/web/store.ts` | `:387-420` | `removeSession`/`reconcileSessions`（对账清幽灵，豁免 imported） |
| `src/web/hud/ChatDrawer.tsx` | `:1-199` | 全文：Modal 布局、会话侧栏、消息流、新建/归档复活、发送逻辑、乐观回显 |
| `src/web/hud/SessionGrid.tsx` | `:1-80+` | 全文：总览栅格、进入内景、导入入口、状态角标 |

## 8. 验收

### 单测（已有）

- **`src/engine/session.test.ts`**
  - `createSession wires a driver; drafts become sequenced RoomEvents`：第一个事件必须是 `session.created`（seq 1），后续 draft 接续序号。
  - `createSession synthesizes session.created up-front (no SDK init needed)`：无 onDraft 调用时 `got[0].type === "session.created"` 已存在。
  - `session.created draft from SDK init is enriched with the user title`：`got[1].type === "session.created"` 且 payload.title 等于建会话时的标题。
  - `createSession stamps cwd + derived project onto session.created`：payload 携带 cwd/project。

- **`src/web/store.test.ts`**
  - `session.created adds a session and sets currentSessionId once`：新建后 `currentSessionId === sessionId`。
  - `a second session.created (from SDK init) merges, keeping messages and filling slashCommands`：第二条到达后 transcript 不清空、slashCommands 补入、焦点不变。
  - `message.delta appends an assistant bubble to the session transcript`：`msgs[0].agentId === ORCHESTRATOR_ID`，验证 agentId 透传。
  - `switchSession changes currentSessionId without modifying sessions`：只改焦点，sessions 对象不变。

### 手动（回放 fixture）

```bash
bun run dev:engine -- --replay <fixture>
```

1. 观察 ChatDrawer 左侧出现多个会话卡，点击切换，右侧消息流跟着切换。
2. 新建会话（填 cwd 或留空）→ 会话立即出现在侧栏、房间切换到新会话内景。
3. 向活跃会话发消息 → 乐观气泡立即出现（蓝色 user 气泡），引擎回包后 assistant 气泡跟上。
4. 归档一个会话 → 移出活跃列表，进入「已归档」区；搜索归档名称能找到；点击复活后回到活跃列表。
5. SessionGrid（E 键）列出所有未归档会话，点卡进入内景传送门动画。
6. 断开/重连引擎 → 幽灵会话（引擎无该 id）被清除；导入的会话不受影响。
