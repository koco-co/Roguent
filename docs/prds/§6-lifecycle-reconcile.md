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
  - src/engine/ws-gateway.ts
  - src/web/ws-client.ts
  - src/shared/local-sessions.ts
specs:
  - docs/superpowers/specs/2026-06-04-overworld-hub-design.md
---

# §6 会话生命周期与重连对账

## 1. 定位

本节描述会话从建立到消亡的完整生命周期管理,以及 WebSocket 断连重连后客户端与引擎之间的状态对账机制。具体覆盖:

- **软归档(archive)**:将会话移出大厅、隐入已归档区,Driver 继续后台运行。
- **取消归档(unarchive)**:会话重返大厅活跃状态,触发 LRU 检查。
- **硬删除(remove/delete)**:客户端从 store 移除会话;引擎侧停掉对应 Driver。
- **大厅 ≤10 / LRU 上限**:大厅最多同时显示 10 个活跃(未归档)会话,第 11 个触发软归档活跃度最低者。
- **重连对账(reconcile)**:WS 重连时引擎下发会话花名册(roster),客户端据此清理花名册外的幽灵会话,`imported` 会话豁免。

## 2. 为什么

**LRU 控量**:长期运行会持续累积会话,大厅房间无限增长会让总览世界失控(房间太多 → 布局崩、NPC 密度失真)。硬性上限 ≤10 活跃会话、超出软归档最不活跃者,保证大厅始终可读。

**重连对账**:WebSocket 是有状态连接。引擎进程重启(如 `--watch` 热重载)、客户端网络抖动后重连,或用户从 replay 模式切到 live 模式,均可能导致客户端本地 store 残留「幽灵会话」——引擎已经不认识的会话对象。这些幽灵会占用大厅槽位、让焦点指向不存在的会话、造成空画布黑屏。引擎在每个新 WS 连接建立时立即下发当前花名册,客户端对账清除幽灵,是最低成本的健壮性保证。

**导入会话豁免**:`imported` 会话是客户端载入的本地 transcript 静态存档,没有对应的 Driver,引擎重启后花名册为空,但存档仍在客户端有效。若不豁免,引擎 `--watch` 重启后空花名册会误删用户正在回看的存档(回看变黑屏)。

## 3. 功能点

- **软归档(archiveSession)**:标记 `archived: true`,移出大厅;Driver 后台继续运行,不停掉 SDK query。焦点若在被归档会话则归 `null`。
- **取消归档(unarchiveSession)**:清除 `archived` 标记,刷新 `lastActiveAt`,触发 `enforceActiveCap` 检查(可能再挤掉当前 LRU);焦点切到该会话。
- **硬删除客户端侧(removeSession)**:从 `sessions` map 删除;`projectOrder` 保持追加式不修剪(删掉某项目最后一个会话会留空房间直到刷新,已接受的 tradeoff)。
- **引擎侧硬删除(deleteSession)**:停 Driver(`driver.end()`)、从 `drivers` map 和 `knownSessions` set 删除;由 WsGateway `deleteSession` 命令触发。
- **大厅 ≤10 / LRU 上限**:`ACTIVE_CAP = 10`;`enforceActiveCap` 统计未归档且有 `project` 的会话,活跃度(lastActiveAt)最低者为牺牲品,新建/激活的会话受 `protectId` 保护不被自己挤掉(防时钟回拨);无 project 的占位会话(如早到的 `session.error`)不计入上限。
- **lastActiveAt 刷新**:任何 `message/tool/agent/usage` 事件都刷新对应会话的 `lastActiveAt`,供 LRU 排序;乐观回显的用户消息也刷新。
- **重连对账(reconcileSessions)**:引擎花名册(ids 数组)到达后,遍历本地 `sessions`,只保留 `ids` 集合内的或 `imported === true` 的;无幽灵时不触发重渲染;焦点指向被清会话则归 `null`。
- **内景视图保护**:对账后若当前视图(interior)对应的会话被清除,自动退回大厅(`ui.exitOverworld()`)。
- **(planned) 持久化**:刷新即重置,会话历史不跨页面存活。
- **(planned) SDK `--resume` 复活**:让已死会话在引擎侧恢复 Driver,使导入的历史会话可再激活发言。

## 4. 交互边界★

### 上游

| 来源 | 契约 |
|------|------|
| **§2 事件协议**(`ws-client.ts`) | WS `onopen` 后引擎即时发送 `{ kind:"control", type:"roster", sessionIds: string[] }`;客户端 `handleIncoming` 识别 `kind="control"` 后路由到 `onControl`,触发 `reconcileSessions`。 |
| **§5 SessionManager**(`session.ts`) | `sessionIds()` 返回 `knownSessions` set 的快照(`string[]`);`createSession` 和 `importSession` 都向 `knownSessions` 添加 id;`deleteSession` 从 `knownSessions` 删除 id。 |

### 下游

| 消费方 | 契约 |
|--------|------|
| **§3 Room 渲染** | `sessions` 状态变化触发 Zustand 订阅重渲染;归档/删除/对账均通过 `set()` 更新 `sessions`。 |
| **§4 总览世界门动画** | `archiveSession` 后 `archived: true` 的会话不再渲染门/NPC;`unarchiveSession` 后会话重返大厅,总览世界重绘对应项目房间。`projectOrder` 追加式保证既有房间不抖动(stable layout)。 |
| **UiStore**(`ui-store.ts`) | `reconcileSessions` 后若内景视图对应会话已清除,`ws-client.ts` 调用 `ui.exitOverworld()` 退回大厅。 |

### 花名册契约(Roster)

```typescript
// src/shared/local-sessions.ts
{ kind: "control"; type: "roster"; sessionIds: string[] }
```

- **触发时机**:WsGateway `wss.on("connection", ...)` 回调,每个新 WS 连接建立即立即发送(含首次连接、重连、多标签页新标签连入)。
- **内容**:`SessionManager.sessionIds()` 的当前快照——所有 `knownSessions`(live Driver + 已导入 transcript),不含已被 `deleteSession` 移除的。
- **客户端消费**:`useRoomStore.getState().reconcileSessions(c.sessionIds)`,之后重取 state 判断视图安全性。

## 5. 数据流与关键约定

### 重连对账流

```
WS 断线(引擎重启/网络抖动)
  → ws-client.ts onclose → closedByUser=false → setTimeout(open, 1000)
  → 新 WebSocket 建立
  → ws-gateway.ts on("connection") → reply(ws, { kind:"control", type:"roster", sessionIds })
  → ws-client.ts onmessage → handleIncoming → kind="control" → onControl
  → reconcileSessions(c.sessionIds)
    → 遍历 store.sessions:
        keep.has(id) || s.imported  → 保留
        否则                        → 删除(幽灵)
    → pruned=true → set({ sessions, currentSessionId })
  → 检查当前 ui.view:
        view.interior 不在新 sessions → ui.exitOverworld()
```

### LRU 软归档流

```
新会话建立(session.created) / unarchiveSession(id)
  → enforceActiveCap(sessions, protectId)
      while active(未归档+有project).length > ACTIVE_CAP:
        victim = argmin(lastActiveAt), skip(protectId)
        victim.archived = true
```

### 关键约定

- **归档是纯客户端可见性**:软归档只改 store,不向引擎发命令、不停 Driver——归档会话的 SDK query 继续在后台跑。
- **删除是双侧操作**:客户端 `removeSession` + 向引擎发 `deleteSession` 命令,两者由调用方协调,store 不内联 WS 调用(避免 store↔ws 耦合)。
- **`projectOrder` 追加式**:归档、删除、对账均不修剪 `projectOrder`。删掉某项目最后一个会话会留空房间直到刷新——已明确接受的 tradeoff(保证既有房间不挪位比去掉空房间更重要)。
- **重连退避**:`onclose` 后固定 1 秒重连(`setTimeout(open, 1000)`),无指数退避;命令缓冲(`buffer`) 在 `onopen` 后补发。
- **对账幂等**:无幽灵(所有 id 均在册)时 `reconcileSessions` 返回原 state 引用,不触发重渲染。
- **`imported` 标记传播**:`session.created` 幂等合并路径保证「一旦是导入会话恒为导入」(`existing.imported || p.imported`)。

## 6. 现状与边界

| 功能 | 状态 | 说明 |
|------|------|------|
| 软归档 / 取消归档 | **真实** | store 维护 `archived` 字段 |
| LRU ≤10 上限 | **真实** | `ACTIVE_CAP=10`,`enforceActiveCap` |
| 硬删除(客户端+引擎) | **真实** | `removeSession` + `deleteSession` 命令 |
| 重连对账(roster) | **真实** | commit `bdde286`,ws-gateway → reconcileSessions |
| `imported` 会话豁免 | **真实** | `s.imported` 检查,防误删存档 |
| 内景视图安全退出 | **真实** | reconcile 后 `ui.exitOverworld()` |
| 持久化(刷新后存活) | **(planned)** | 纯内存,刷新即重置 |
| SDK `--resume` 复活 | **(planned)** | 导入会话无法再发言;需引擎侧支持 |

## 7. 代码锚点

| 符号 | 文件 : 行 |
|------|-----------|
| `ACTIVE_CAP = 10` | `src/web/store.ts:31` |
| `enforceActiveCap` | `src/web/store.ts:39-56` |
| `reduce` session.created + LRU 触发 | `src/web/store.ts:61-136` |
| `archiveSession` | `src/web/store.ts:366-375` |
| `unarchiveSession` + enforceActiveCap | `src/web/store.ts:376-386` |
| `removeSession` | `src/web/store.ts:387-399` |
| `reconcileSessions` | `src/web/store.ts:406-424` |
| `imported` 豁免注释 | `src/web/store.ts:400-405` |
| `lastActiveAt` 刷新 | `src/web/store.ts:308-310` |
| `SessionManager.knownSessions` | `src/engine/session.ts:29` |
| `SessionManager.sessionIds()` | `src/engine/session.ts:125-127` |
| `importSession` 加入花名册 | `src/engine/session.ts:142` |
| `imported:true` 标记下发 | `src/engine/session.ts:150-156` |
| `deleteSession` 从花名册移除 | `src/engine/session.ts:164-168` |
| WsGateway 新连接下发 roster | `src/engine/ws-gateway.ts:81-86` |
| `ControlMessage` roster 类型定义 | `src/shared/local-sessions.ts:15` |
| `handleIncoming` roster 路由 | `src/web/ws-client.ts:53-64` |
| WS 断线重连逻辑 | `src/web/ws-client.ts:72-90` |
| `reconnect()` 立即重连 | `src/web/ws-client.ts:101-111` |

## 8. 验收

### 单测覆盖(`src/web/store.test.ts`)

- `creating the 11th active session soft-archives the least-recently-active one`(行 293):LRU 上限
- `the just-created session is never the LRU victim even if the clock went backward`(行 530):protectId 防自挤
- `archive/unarchive/remove session actions`(行 325):三大操作
- `reconcileSessions: 清掉花名册外的幽灵会话,保留在册的;焦点被清→null`(行 346)
- `reconcileSessions: 空花名册清空所有会话(引擎重启/换引擎)`(行 375)
- `reconcileSessions: 在册会话与焦点原样保留(短抖重连不丢数据)`(行 394)
- `reconcileSessions: 导入会话豁免对账,空花名册不删它(引擎 --watch 重启)`(行 414)
- `reconcileSessions: 导入会话与 live 会话混存,只清 live 幽灵、留导入`(行 436)

### 单测覆盖(`src/web/ws-client.test.ts`)

- `handleIncoming routes control messages to onControl, not the event sink`(行 17):roster 消息路由

### 端到端验证

- 启动 engine(`bun run dev:engine`),建若干会话后 kill engine 再重启;前端重连后幽灵会话消失、存档不受影响。
- 导入本地 transcript 后 kill engine 重启(空花名册);存档会话不被清除。
- 建 11 个带 project 的会话,确认第 1 个(最旧)被软归档到 `archived: true`,大厅活跃数 ≤ 10。
