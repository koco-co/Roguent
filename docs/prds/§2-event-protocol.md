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

# §2 事件协议与归一化主链路

## 1. 定位

连接引擎与前端的单一事件契约枢纽:将 §1 的 SDK 消息与 hooks 归一化为带权威序号的 `RoomEvent` 信封,经 WebSocket 广播到前端,再由 `store.reduce` 确定性地折叠成渲染源状态。

## 2. 为什么

**乱序与解耦两个核心问题:**

- hooks 回调(PreToolUse / PostToolUse / SubagentStart / SubagentStop)并发触发,没有天然先后顺序,前端直接接收会产生乱序渲染(agent 状态跳变、tool 气泡错位)。服务端用 `(sessionId, seq)` 单调递增序号作为**权威排序键**,前端按 seq 顺序折叠即可得到确定性状态。
- SDK 消息结构(`system:init`、`assistant`、`result`)与前端渲染需求差异大;hooks 消息格式与 SDK 消息格式又是两套。归一化层把两种来源统一成单一 `RoomEvent` 信封,引擎内部细节不泄漏到前端,前后端可各自演进。

## 3. 功能点

- **统一事件信封** `{ seq, ts, sessionId, type, agentId?, payload }`:跨层共用单一消息结构,前端只依赖信封契约,不感知 SDK / hook 原始格式。
- **归一化(normalize.ts)**:把 SDK 消息(`system:init` / `assistant` / `result`)和 hook 事件(`SubagentStart` / `SubagentStop` / `PreToolUse` / `PostToolUse` / `PostToolUseFailure`)分别映射为一条或多条 `DraftEvent`;`TodoWrite` 的 `PreToolUse` 同时产出两条事件(`tool.started` + `todos.updated`)。
- **防御性解析**:`parseTodos` 逐项校验 `content`/`status` 合法性,非法项丢弃;`summarizeToolInput` 截断 60 字符;非法 JSON 帧直接丢弃不崩溃。
- **定序(Sequencer)**:每个 `sessionId` 维护独立单调计数器;`stamp()` 接受 `DraftEvent` + `ts` + `agentId`,输出完整 `RoomEvent`(seq 从 1 递增,不回绕,不跨会话)。
- **广播(WsGateway)**:维护已连接 WebSocket 集合;新连接时回放 `lastLimits`(若存在)并下发当前会话花名册(`roster` 控制消息);`broadcast()` 向所有 OPEN 客户端发送 JSON 序列化后的 `RoomEvent`。
- **命令上行通道(onCommand)**:接收前端 JSON 命令,经 `parseCommand` 验证后路由到 `SessionManager`——支持 `newSession` / `sendMessage` / `setModel` / `interrupt` / `deleteSession` / `listLocalSessions` / `importSession` 共 7 种命令。
- **旁路消息(pushLimits)**:账户级限额(`LimitsMessage`)不走 `RoomEvent` 信封(不带 seq),由 `WsGateway.pushLimits()` 独立广播,前端 `ws-client` 以 `kind==="limits"` 分支处理,存入 `store.limits`(last-write-wins)。
- **控制消息旁路**:会话花名册(`roster`)、本地会话列表(`localSessions`)、导入错误(`importError`)以 `kind==="control"` 帧传递,前端路由到 `useUiStore`,不进 `reduce`。
- **前端折叠(store.reduce)**:纯函数;按事件类型 switch,把到达的 `RoomEvent` append-only 地折叠进 `sessions` 状态;`session.error` 可在 `session.created` 之前到达,自动创建占位会话。
- **`session.created` 幂等合并**:引擎前置合成一条 `session.created`(解决 streaming-input 死锁),SDK `system:init` 到达后又产出第二条;前端对第二条执行合并(补 `model`/`slashCommands`/`cwd`/`project`/`permissionMode`),绝不重建会话、不清 transcript,且不抢焦点(`currentSessionId` 不变)。
- **重连对账**:客户端重连时引擎下发 `roster`;前端 `reconcileSessions` 清掉不在花名册且非 `imported` 的幽灵会话;若当前内景会话被清掉则退回大厅。
- **新增事件类型「改三处」约定**(planned 预防):每次新增 `RoomEventType` 必须同步改 `shared/events.ts`(类型联合) → `engine/normalize.ts`(产出) → `web/store.ts`(消费);三处缺一不可。

## 4. 与其它子系统的交互边界

### 上游依赖

| 来源 | 内容 | 接口形式 |
|------|------|----------|
| **§1 SessionManager / Driver** | SDK 消息(`SdkMessageLike`)+ hooks(`HookLike`) | `normalize.ts` 的 `normalizeSdkMessage` / `normalizeHook` 函数入参 |
| **§1 SessionManager** | 会话生命周期事件(前置合成的 `session.created`、`session.error`、`session.updated`、`session.cleared`) | 直接构造 `DraftEvent` 传给 Sequencer |

### 下游消费

| 消费方 | 消费的事件类型 | 方式 |
|--------|---------------|------|
| **§3 房间渲染(PixiJS)** | `agent.spawned` / `agent.thinking` / `agent.idle` / `agent.done` / `tool.started` / `tool.ended` / `tool.failed` | `useRoomStore` selector |
| **§4 总览世界** | `session.created`(`project` 字段) / `session.updated` | `useRoomStore` sessions |
| **§5 聊天抽屉** | `message.delta` / `message.final` / `session.created` / `session.error` | `useRoomStore` sessions.messages |
| **§6 任务面板** | `todos.updated` / `agent.done`(清 todos) | `useRoomStore` sessions.todos |
| **§9 限额 HUD** | `LimitsMessage`(非 seq 旁路) | `ws-client` → `store.setLimits` |
| **§10 CTX / 用量 HUD** | `context.updated` / `usage.updated` | `useRoomStore` sessions.context / sessions.usage |

### 命令上行(供 §5/§8 使用)

前端通过 `sendCommand(cmd)` 发送 JSON 命令;`WsGateway.onCommand` 路由到 `SessionManager`。命令类型(全部为 `Command` 联合):

```
newSession      sendMessage    setModel
interrupt       deleteSession  listLocalSessions  importSession
```

### 旁路消息契约

- **`LimitsMessage`**:`{ kind: "limits", ts, limits: AccountLimits }` — 不带 seq,last-write-wins,§9 专用。
- **`ControlMessage`**:`{ kind: "control", type: "roster" | "localSessions" | "importError", ... }` — 定向单播(仅发给请求方或新连接客户端),不进 reduce。

### 完整 RoomEventType 联合(来自 `src/shared/events.ts`)

```typescript
type RoomEventType =
  | "session.created"   // 会话建立(前置合成 + SDK init 各一条,前端幂等合并)
  | "session.updated"   // 会话属性变更(model 切换等)
  | "session.cleared"   // 会话内容清空(子 agent 归零,status→done)
  | "session.error"     // 会话级错误(可在 created 之前到达)
  | "agent.spawned"     // subagent 出生
  | "agent.thinking"    // agent 进入 reasoning 状态
  | "agent.idle"        // agent 等待中
  | "agent.done"        // subagent 结束(从 agents map 删除,todos 清掉)
  | "tool.started"      // PreToolUse hook
  | "tool.ended"        // PostToolUse hook(ok=true)
  | "tool.failed"       // PostToolUseFailure hook(ok=false)
  | "loot.dropped"      // 产物掉落(file/diff/report/answer)
  | "message.delta"     // 助手/用户文字片段(或完整轮次)
  | "message.final"     // 完整一轮消息(与 delta 共用同一 case)
  | "usage.updated"     // SDK result 消息:tokens + cost
  | "context.updated"   // 上下文窗口占用(getContextUsage 派生)
  | "todos.updated";    // TodoWrite tool_input 快照
```

前端 `store.reduce` 已消费上述全部类型(`session.created` 和 `session.error` 在 switch 之前单独处理,`session.updated` 落入 default 分支静默忽略,其余均有明确 case)。

## 5. 数据流与关键约定

### 事件下行主链路

```
§1 SDK 消息 / hooks
    │
    ▼
normalize.ts
  normalizeHook(HookLike) → DraftEvent[]
  normalizeSdkMessage(SdkMessageLike) → DraftEvent[]
    │  (可能一条原始消息 → 多条 DraftEvent,如 TodoWrite PreToolUse → 2 条)
    ▼
Sequencer.stamp(sessionId, type, payload, ts, agentId?)
  → RoomEvent { seq, ts, sessionId, type, agentId?, payload }
    │  (seq 在 sessionId 内严格单调,从 1 递增)
    ▼
WsGateway.broadcast(e)
  → JSON.stringify → 所有 OPEN WebSocket 客户端
    │
    ▼ (浏览器/Tauri WebSocket)
ws-client.handleIncoming(raw)
  kind === "limits"   → store.setLimits
  kind === "control"  → onControl (roster/localSessions/importError)
  (无 kind)           → store.applyEvent(RoomEvent)
    │
    ▼
store.reduce(state, e) — 纯函数,确定性折叠
  → sessions: Record<string, Session>
    │
    ▼
React 组件 (useRoomStore selector) → PixiJS 渲染 / HUD
```

### 命令上行链路

```
React UI → sendCommand(cmd: object)
    │
    ▼ (WebSocket)
WsGateway.onCommand → parseCommand(raw) → Command
    │
    ▼
SessionManager.createSession / sendMessage / setModel / interrupt
             / deleteSession / importSession
```

### 关键约定与不变量

1. **seq 是会话级单调序号**,不跨会话共享;前端不依赖全局 seq 大小,仅依赖同一 sessionId 内的相对顺序。
2. **`session.created` 必须幂等**:引擎 `createSession` 前置合成第一条(保证会话存在、解锁 sendMessage)；SDK `system:init` 到达时产出第二条；前端 reducer 以 `sessions[e.sessionId]` 是否存在为分支——存在则合并字段,不存在则新建并切换焦点。二条均到达时 `currentSessionId` 只在第一条时切换。
3. **`session.error` 先于 `session.created` 到达时**:reducer 自建占位会话(`createSession` with empty model),确保错误信息对用户可见。
4. **`LimitsMessage` 不走 RoomEvent 信封**:账户级限额与具体 sessionId 无关,不需要 seq 顺序保证,`kind="limits"` 走独立通道(last-write-wins);新连接客户端在 onconnection 时补发 `lastLimits`。
5. **hooks 全 async、永不阻塞**:`buildHooks` 注册的回调立即返回 `{}`,normalize → stamp → broadcast 异步完成,不影响真实 agent 执行。
6. **reduce 是 append-only 确定性函数**:不做网络调用、不产生副作用;`loot`/`messages` append-only;`agents` 仅在 `agent.done` 时 delete;`todos` 按 agentId 整体覆盖(每次 TodoWrite 是完整快照)。
7. **`imported` 会话豁免 `reconcileSessions`**:`reconcileSessions` 只清不在引擎花名册且 `imported !== true` 的会话,保护用户主动载入的静态存档。

## 6. 现状与边界(真 / mock / 取舍)

**全部已实现(implemented)**,无 mock 层。

- **已实现**:信封协议、全部 20 种 RoomEventType(含 payload 类型)、`normalize.ts` 的 hook + SDK 消息归一化、`Sequencer` 单调定序、`WsGateway` 广播 + 命令路由 + limits/roster 旁路、`ws-client` 三路分发、`store.reduce` 全事件类型折叠。
- **取舍说明**:
  - `message.delta` 与 `message.final` 在 reduce 中共用同一处理逻辑(均 append 到 messages)——SDK 以 `includePartialMessages=false` 运行时 delta = 完整轮次,区分意义不大;如需流式气泡可分开处理,当前不需要。
  - subagent 的 `assistant` 消息(`parent_tool_use_id != null`)当前路由到主控 orchestrator 的消息流(`agentId = undefined → 前端用 ORCHESTRATOR_ID`),MVP 不做 swimlane 区分。
  - `session.updated` 已在 `RoomEventType` 联合中,但 `store.reduce` 中落入 `default` 分支(静默忽略);引擎 `session.ts` 在切换 model 时产出此事件,前端目前不消费(显示 model 名称走 `session.created` 的 merge 路径)。
  - 没有客户端端序号重排缓冲:seq 到达乱序时不缓冲等待,直接按到达顺序 apply。实际上 WS TCP 保证同一连接有序,seq 仅用于调试追踪和 ChatMessage id 派生。

## 7. 代码锚点

| 文件 | 关键位置 |
|------|---------|
| `src/shared/events.ts` | `RoomEventType` 联合(L3-20)、`RoomEvent` 信封接口(L22-29)、各 payload 类型(L32-92)、`LimitsMessage` 旁路消息(L106-110)、`isToolEvent` helper(L112-118) |
| `src/shared/domain.ts` | `Session` / `Agent` / `TodoItem` / `ContextUsage` 实体(L1-115)、`ORCHESTRATOR_ID`(L82)、`createSession` / `createAgent` 工厂(L84-115) |
| `src/engine/normalize.ts` | `DraftEvent` 接口(L6-10)、`HookLike` / `SdkMessageLike` 结构(L13-38)、`parseTodos`(L48-68)、`normalizeHook`(L84-147)、`normalizeSdkMessage`(L149-189) |
| `src/engine/sequencer.ts` | `Sequencer` 类(L3-17)、`stamp()` 方法(L6-16) |
| `src/engine/ws-gateway.ts` | `Command` 联合类型(L8-21)、`parseCommand`(L23-58)、`WsGateway` 类(L60-142)、`broadcast`(L93-96)、`pushLimits`(L98-103)、`onCommand`(L105-137)、新连接 roster 下发(L82-86) |
| `src/web/ws-client.ts` | `handleIncoming` 三路分发(L6-31)、`connectRoom` 退避重连(L47-116)、`sendCommand`(L42-45)、`reconnectRoom`(L119-121) |
| `src/web/store.ts` | `reduce` 纯函数(L58-313)、`session.created` 幂等合并(L61-136)、`session.error` 占位建会话(L141-165)、`enforceActiveCap` LRU 软归档(L39-56)、`reconcileSessions`(L326) |
| `src/shared/local-sessions.ts` | `ControlMessage` 联合(roster / localSessions / importError)(L11-16) |

## 8. 验收

| 测试文件 | 覆盖点 |
|----------|--------|
| `src/engine/normalize.test.ts` | `normalizeHook` 各 hook 类型映射、`normalizeSdkMessage` SDK 消息类型映射、`parseTodos` 合法/非法输入、TodoWrite 双事件产出 |
| `src/engine/sequencer.test.ts` | `stamp()` 单调递增、多 sessionId 独立计数、seq 从 1 起始 |
| `src/engine/ws-gateway.test.ts` | `parseCommand` 各命令类型验证、broadcast 到 OPEN clients、`pushLimits` 独立广播、新连接 roster 下发 |
| `src/web/store.test.ts` | `reduce` 全事件类型折叠、`session.created` 幂等合并(第二条不重建/不清 transcript/不抢焦点)、`session.error` 先于 `created` 到达占位建会话、`reconcileSessions` 清幽灵/豁免 imported |
| `src/web/ws-client.test.ts` | `handleIncoming` limits / control / RoomEvent 三路分发 |
| `src/shared/events.test.ts` | `isToolEvent` helper 覆盖 `tool.started/ended/failed` |
| `src/web/replay.e2e.test.ts` | 端到端回放 fixture:normalize → seq → broadcast → reduce 全链路断言(零额度,不烧订阅) |
| `src/web/import.e2e.test.ts` | 导入会话 `imported` 标记、reconcile 豁免断言 |
