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

# §9 用量与限额

## 1. 定位

LimitBars 是 HUD 左上角的三条进度条,展示用户账户及当前会话的限额占用:

- **5h**(❤ hp):5 小时滚动窗口使用量,账户级,源自 OAuth poll。
- **CTX**(💎 shield):当前会话的上下文窗口占用百分比,会话级,源自 `context.updated` 事件,仅内景显示。
- **WEEK**(💠 mp):7 天滚动窗口使用量,账户级,源自 OAuth poll。

三条 bar 统一显示「已用%」,与 claude-hud 对齐。

## 2. 为什么

Claude 订阅（Pro / Max / Team）有 5 小时滚动窗口和 7 天滚动窗口两条限额。限额用尽时 Claude Code 会被短暂限速甚至拒绝请求,用户需要实时感知「已用多少」以便决策——继续、暂停或等待重置。

CTX 反映当前会话的上下文窗口占用:接近 100% 时 Claude 会裁剪旧消息,用户需提前意识到这一情况。CTX 是会话级概念,大厅（overworld）无「当前会话」语境,故不展示。

Roguent 底层走订阅 OAuth、不走 API key,因此账户用量无法从 API key 信头直接读取,必须借助:
1. OAuth keychain 轮询 `/api/oauth/usage`(权威源)。
2. SDK `rate_limit_event` 的 `rate_limit_info`(兜底)。

## 3. 功能点

- 账户级 5h / WEEK 两条 bar 在大厅与内景**始终显示**。
- CTX bar **仅内景显示**;大厅无当前会话语境,隐藏该条。
- 三条 bar 统一显示「已用%」格式:`<label> <整数>%`(无数据时显 `<label> —`)。
- 已用 ≥ 85% 时 5h / WEEK bar 触发警示闪烁（`bar-low` 样式），CTX 不触发。
- 顶部展示 planName（Pro / Max / Team），数据过期时附「同步中」、请求失败时附「同步失败」。
- 5h / WEEK bar 右侧显示重置倒计时，格式 `<h>h<m>m` 或 `<m>m`，到期或无数据显 `—`。
- **OAuth poll 是权威源**：每 5 分钟轮询 `/api/oauth/usage`,一次返回 5h + 7day 两窗口完整快照及 planName。poll 一旦以真实 utilization 认领某窗口,该窗口**锁定**,后续 SDK 事件不再覆盖。
- **SDK `rate_limit_event` 仅兜底**：仅在 poll 从未成功认领的窗口（如受限环境读不到 keychain）时填充。
- 后端错误退化:429 → 沿用旧值并标 `stale`;401/403 → 清空并标 `apiError: "unauthorized"`;网络 / 其他错误 → 沿用旧值并标 `apiError`。
- 自定义 API 端点（非 `api.anthropic.com`）时跳过 OAuth poll，不适用。
- （planned）5h / WEEK 重置倒计时动态刷新（当前只在组件挂载时取 `Date.now()`）。

## 4. 交互边界★

### 上游

| 来源 | 提供内容 | 注 |
|---|---|---|
| **§1 Core Driver** | SDK `rate_limit_event` → `RateLimitInfoLike`（`rateLimitType`, `utilization`, `resetsAt`） | 经 `Driver.onRateLimit` → `LimitsAggregator.applyRateLimit`,仅兜底 |
| **OAuth poll**（`UsagePoller`）| `/api/oauth/usage` 完整快照 → `AccountLimits`（`planName`, `fiveHour`, `sevenDay`） | 权威源,5 分钟一次 |
| **§1 SDK `context.updated` 事件** | `ContextUpdatedPayload`（`usedTokens`, `windowSize`, `utilization: 0-100`） | 经 §2 `context.updated` RoomEvent 流,前端 reducer 存入 `session.context.utilization` |

### 下游

| 接收方 | 消费内容 |
|---|---|
| **§7 HUD** → `LimitBars` | `store.limits`（`AccountLimits | null`）+ `session.context.utilization` + `uiStore.view` |

### 关键契约

- **`LimitsMessage` 走非 seq 信道**:`{ kind: "limits", ts, limits: AccountLimits }` 由 `WsGateway.pushLimits` 广播,**不经 `Sequencer`、不做成 `RoomEvent`**,前端 `ws-client.ts` 单独识别 `kind === "limits"` 后调 `setLimits`,与 `(sessionId, seq)` 顺序契约无关。
- **`context.updated` 走 seq 信道**:是标准 `RoomEvent`(§2),携带 `sessionId`,前端 reducer 按 `case "context.updated"` 更新对应 session 的 `context` 字段。
- `LimitsMessage` 不含 sessionId;账户限额是全局单例,与会话无关。
- 新客户端连接时,`WsGateway` 立即推送 `lastLimits`（如有），避免首屏空值。
- `depends_on` §1(Driver/rate_limit_event 源头)、§2(事件协议/信封/context.updated)、§7(HUD 渲染层);`related` §10(Currency,同为 HUD 数值展示)。

## 5. 数据流与关键约定

```
┌─────────────────────────────────────────────────────────────┐
│ Engine                                                      │
│                                                             │
│  UsagePoller ──(5min poll /api/oauth/usage)──► applyPoll   │
│                                                    │        │
│  SDK rate_limit_event ─► Driver.onRateLimit ─► applyRateLimit
│                                                    │        │
│                                          LimitsAggregator  │
│                                          (onChange callback)│
│                                                    │        │
│                                        SessionManager      │
│                                        .emitLimits()       │
│                                                    │        │
│                                        WsGateway           │
│                                        .pushLimits()       │
│                                           │                 │
│              LimitsMessage { kind:"limits", ts, limits }   │
│              (非 seq,独立信道,新连接时推 lastLimits 回放)   │
└───────────────────────────────────────────────────┼─────────┘
                                                    ▼ WS
┌─────────────────────────────────────────────────────────────┐
│ Web                                                         │
│                                                             │
│  ws-client: kind==="limits" ──► store.setLimits()          │
│  ws-client: context.updated (RoomEvent) ──► reduce()       │
│             → session.context.utilization                  │
│                                                             │
│  LimitBars:                                                 │
│    limits.fiveHour.utilization ──► 5h bar                  │
│    limits.sevenDay.utilization ──► WEEK bar                 │
│    session.context.utilization (内景) ──► CTX bar          │
└─────────────────────────────────────────────────────────────┘
```

**关键约定**：

1. **poll 认领锁定**：`LimitsAggregator` 维护 `pollOwned: { fiveHour, sevenDay }` 标志。`applyPoll` 写入真实 utilization 后置 `pollOwned[key] = true`；`applyRateLimit` 先检查 `pollOwned[key]`，已锁定则直接 return。这防止了「5h 显 42% 而真值 14%」的历史 bug（SDK 事件单窗口、高频、可能跨 reset 陈旧，会刷掉 5 分钟一次的权威值）。

2. **退化 poll 不认领**：`applyPoll` 只在 `utilization != null` 时才认领并锁定。poll 失败降级时（stale/apiError）产出的空 utilization 不会把 `pollOwned` 置位。

3. **去抖广播**：`LimitsAggregator.commit` 用 `JSON.stringify` 比较,值未变则不调 onChange,避免无意义广播。

4. **planName 唯一来源**：只有 poll 带 planName（通过 `subscriptionType → planNameFor()`），SDK `rate_limit_event` 不带。`applyPoll` 以 `limits.planName ?? this.cur.planName` 合并，防止 planName 被 null 覆盖已有值。

5. **LimitsMessage 是旁路消息**：`kind: "limits"` 与 `RoomEvent` 并行发送，前端 ws-client 以 `parsed.kind === "limits"` 识别并直接调 `setLimits`，不进 reducer 的 RoomEvent 处理路径。

## 6. 现状与边界

| 项目 | 状态 | 说明 |
|---|---|---|
| 5h / WEEK bar 展示 | **真实** | 源自 OAuth `/api/oauth/usage` poll + SDK 兜底 |
| CTX bar 展示 | **真实** | 源自 SDK `context.updated` 事件的 `utilization` 字段 |
| planName 展示 | **真实** | 源自 OAuth keychain 的 `subscriptionType` |
| 重置倒计时 | **真实** | `formatCountdown` 计算 `resetsAt - Date.now()` |
| CTX 大厅隐藏 | **已实现** | `uiStore.view !== "overworld"` 控制条件渲染 |
| 警示闪烁 | **已实现** | ≥ 85% 触发 `bar-low` 样式（5h / WEEK；CTX 豁免） |
| 自定义端点跳过 poll | **已实现** | `usingCustomEndpoint()` 检测非 `api.anthropic.com` 时 return |
| 系统代理支持 | **已实现** | `defaultFetchUsage` 走 `createProxyTunnelAgent` |
| 倒计时动态刷新 | **未实现（planned）** | `now = Date.now()` 仅在组件渲染时取值，不自动 tick |
| keychain 不可达时退化 | **已实现** | `apiError` / `stale` 标记，前端灰显并提示 |

**设计取舍**：

- `LimitsMessage` 刻意不进 `Sequencer` / `RoomEvent` 流。账户限额是全局单例，与特定会话的 `(sessionId, seq)` 严格有序语义无关；旁路推送更简洁，避免会话状态污染。
- 读不到 keychain 用量（受限环境、非 `api.anthropic.com` 端点）时靠 SDK `rate_limit_event` 兜底，与 claude-hud 同策略。

## 7. 代码锚点

| 文件 | 关键位置 | 说明 |
|---|---|---|
| `src/shared/events.ts:95-110` | `WindowUsage`、`AccountLimits`、`LimitsMessage` | 共享数据结构定义 |
| `src/shared/events.ts:82-86` | `ContextUpdatedPayload` | CTX 来源事件 payload |
| `src/engine/usage-limits.ts:4-7` | `RawUsage` | `/api/oauth/usage` 响应形状 |
| `src/engine/usage-limits.ts:23-30` | `planNameFor()` | `subscriptionType → planName` |
| `src/engine/usage-limits.ts:32-47` | `toAccountLimits()` | RawUsage → AccountLimits 转换 |
| `src/engine/usage-poller.ts:24-105` | `UsagePoller` | 5 分钟轮询主类；`tick()` 单次拉取 |
| `src/engine/usage-poller.ts:108-150` | `defaultFetchUsage()` | 真实 HTTPS 请求（系统代理） |
| `src/engine/limits-aggregator.ts:39-91` | `LimitsAggregator` | poll + SDK 两源合并；锁定逻辑 |
| `src/engine/limits-aggregator.ts:53-54` | `pollOwned` | 认领锁定标志 |
| `src/engine/limits-aggregator.ts:58-68` | `applyRateLimit()` | SDK 兜底入口；锁定检查 |
| `src/engine/limits-aggregator.ts:70-84` | `applyPoll()` | Poll 权威入口；条件认领 |
| `src/engine/session.ts:31,52-57` | `limitsSinks` / `emitLimits()` | SessionManager 广播 AccountLimits |
| `src/engine/ws-gateway.ts:64,98-103` | `lastLimits` / `pushLimits()` | WS 推送；新客户端回放 lastLimits |
| `src/web/ws-client.ts:22-23` | `kind === "limits"` 分支 | 前端识别 LimitsMessage |
| `src/web/hud/LimitBars.tsx:56-107` | `LimitBars` 组件 | 三条 bar 渲染；CTX 条件显示 |
| `src/web/hud/LimitBars.tsx:6` | `WARN_AT = 85` | 警示阈值 |
| `src/web/hud/LimitBars.tsx:63-64` | `inInterior` | 大厅/内景判断（CTX 可见性） |
| `src/web/hud/limits-format.ts:1-10` | `formatCountdown()` | 重置倒计时格式化 |

## 8. 验收

### 自动化测试

| 文件 | 覆盖点 |
|---|---|
| `src/engine/usage-limits.test.ts` | `parseUtilization`、`parseResetMs`、`planNameFor`、`toAccountLimits` 边界场景 |
| `src/engine/usage-poller.test.ts` | 200/429/401/403/网络错误各分支；stale/apiError 标记；自定义端点跳过；planName 传递 |
| `src/engine/limits-aggregator.test.ts` | poll 认领锁定；SDK 兜底；退化 poll 不认领；去抖；planName 不被 null 覆盖 |
| `src/web/hud/limits-format.test.ts` | `formatCountdown` 正常/过期/null 各分支 |

### 人工验收检查单

- [ ] 首次连接服务端后，LimitBars 在有 OAuth keychain 的环境中 5 秒内显示真实已用%（非 `—`）。
- [ ] 在 overworld（大厅）视图，仅显示 5h 和 WEEK 两条，CTX 条不可见。
- [ ] 进入任一会话内景后，CTX 条出现并显示当前会话上下文占用%。
- [ ] 任意一条 bar 已用 ≥ 85% 时出现警示闪烁，CTX 条不触发闪烁。
- [ ] 断开 keychain 可读性（如修改 token）后，LimitBars 顶部出现「同步失败」标注，数值保持旧值。
- [ ] 使用回放 fixture（`bun run dev:engine -- --replay <fixture>`）时，LimitBars 正常渲染 fixture 中的 limits 数据。
