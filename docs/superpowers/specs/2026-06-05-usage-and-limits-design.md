---
title: Roguent 子项 B · 用量与限额(显示层)设计
date: 2026-06-05
status: draft
revision: v2(经 5 镜头对抗式自审订正,见 §10)
related:
  - docs/ROADMAP.md (§4 Phase 2 · S4 游戏化 HUD「排行榜」/「额度预算 UI + 告警阈值」)
  - docs/superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md (HUD / hotbar / 游戏窗口 既有皮肤)
reference_impl:
  - ~/.claude/plugins/cache/claude-hud/claude-hud/0.1.0/dist/usage-api.js(账户限额取数参考)
  - node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts(getContextUsage / ModelUsage,已核实)
---

# 子项 B · 用量与限额(显示层)

## 1. 目标与动机

把《元气骑士》左上角的血条 / 蓝条隐喻引入 Roguent,**只做显示**:

1. **左上全局限额双条** —— 账户 5 小时限额 + 周限额,真实数据。
2. **每个 NPC 头顶上下文充能条** —— 当前会话上下文窗口占用 %,带阈值刻度。
3. **🏆 排行榜面板** —— 按会话(NPC)排序、按 token 数展示「谁在烧额度」。

动机:订阅模式下 Opus 默认 1M 上下文窗口、无法改回 200k,不可视化就无从感知额度消耗;同时把账户级 5h/周配额做成游戏血条,让「还能干多久」一目了然。这是 ROADMAP §4「排行榜」+「额度预算 UI + 告警阈值」的落地起点。

> **本 spec 是子项 B**。阈值设置 + 达阈值自动「终止 → `/compact` → 续跑」编排属于**子项 C**,见 §9 交接。

## 2. 范围

### 2.1 做
- 引擎侧拉取账户 5h/周限额(真实数据,§4.1)。
- 引擎侧从 SDK `getContextUsage()` 取每会话上下文窗口占用 %(真实数据,§4.2)。
- 前端三个渲染件:左上 `LimitBars`、NPC 头顶充能条、`Leaderboard` 面板。
- 新增协议:账户级 `limits` 兄弟消息 + 每会话 `context.updated` 事件。

### 2.2 不做(非目标)
- **不做阈值设置 / 自动 compact 编排**(子项 C)。B 只在头顶条上画一道**默认阈值刻度(20%)**作纯视觉参照,不触发任何动作。
- **不做跨重启持久化**:排行榜 = 进程内存、自启动累计;持久化在 ROADMAP 另排。
- **不做「按模型聚合」排行榜**:B 先做「按会话(NPC)」轴;ROADMAP §4 提的「按模型聚合 usage」作为后续增强(见 §4.9 注)。
- **不改 `RoomEvent` 信封结构**:账户级数据走信封之外的兄弟消息(§4.3)。
- **不把 OAuth token 暴露给前端**:token 只在引擎内使用,前端只拿派生百分比。

## 3. 架构总览

```
[引擎] LIVE 分支(src/engine/server.ts,非 replay)
  usage-poller.ts ──(每5min;每轮重读凭据+自建代理隧道+429退避)──> GET /api/oauth/usage ──> AccountLimits
       │  ├ credentials.ts(keychain / .credentials.json,只读,注入式)
       │  └ proxy 隧道 Agent(用 proxy.ts 的解析 + 自建 CONNECT agent,注入式)
       └──> WsGateway.broadcastLimits() ──(server→client {kind:"limits"})──┐
                                                                           │
  Driver.getContextUsage()  ←─ SDK Query.getContextUsage() (sdk.d.ts:2273) │
       └ SessionManager 在每轮结束(result)调用 → {totalTokens,maxTokens,percentage}
            └──(RoomEvent: context.updated, 带 sessionId)────────────────┤
                                                                           ▼
[前端] ws-client.ts handleIncoming 三臂分流:
   kind==="control" → onControl(既有,保留)
   kind==="limits"  → useRoomStore.setLimits(msg.limits)   (新增分支)
   else             → apply(RoomEvent) → reduce            (既有)
       ├ store.limits: AccountLimits|null        ──> hud/LimitBars.tsx (左上)
       ├ store.sessions[id].context: ContextUsage ──> overworld/SessionNpc.tsx 头顶条
       └ store.sessions(全部)                     ──> hud/Leaderboard.tsx (🏆 面板)
```

两条数据流:
- **账户级(全局,与会话无关)**:`usage-poller`(仅 LIVE 分支启)→ `AccountLimits` → `broadcastLimits()` → `store.limits` → `LimitBars`。
- **会话级(每 NPC)**:`SessionManager` 在每轮结束调 `Driver.getContextUsage()` → `context.updated`(RoomEvent)→ `store.sessions[id].context` → 头顶条。

## 4. 详细设计

### 4.1 引擎:账户限额拉取(`src/engine/usage-poller.ts` + `src/engine/credentials.ts` 新增)

参考实现:`claude-hud` `dist/usage-api.js`(已通读全文,契约稳定)。

**凭据(`credentials.ts`,只读、注入式)**
- 仅解析 **`claudeAiOauth` 命名空间**:`{ accessToken, subscriptionType, expiresAt }`。**`expiresAt` 为 Unix 毫秒**,过期判定 `expiresAt != null && expiresAt <= Date.now()`(now 与 expiresAt 同为 ms)。**绝不**读 SDK file-provider 的 snake_case(`access_token`/`expires_at`/秒)文件,避免单位/命名错配。
- macOS 优先 keychain:`execFileSync('/usr/bin/security', ['find-generic-password', '-s', <service>, '-a', <account>, '-w'])`,失败回退去掉 `-a` 的泛查;再回退文件 `~/.claude/.credentials.json`。
  - `<account>` = `os.userInfo().username`(取不到则回退无 `-a`)。
  - `<service>` = 默认 `Claude Code-credentials`;**当设了 `CLAUDE_CONFIG_DIR` 且非默认 `~/.claude`** 时派生 `Claude Code-credentials-<sha256(normalizedConfigDir)[:8]>`(照搬 reference)。
- **每次轮询都重新读凭据**(只缓存 usage 结果,不缓存 token 本身),使 CLI 旋转 OAuth token 后下一轮自动取新值。

**请求**
- `GET https://api.anthropic.com/api/oauth/usage`,headers:`Authorization: Bearer <accessToken>`、`anthropic-beta: oauth-2025-04-20`、`User-Agent: claude-code/2.1`。
- **代理(关键修正)**:`proxy.ts` 现状只产出 `*_PROXY` 环境变量,用途是注入给 SDK **子进程**;**引擎进程内的 https 请求不会自动应用这些 env**。故 poller 复用 `proxy.ts` 的**解析**(`readMacSystemProxy`/`parseScutilProxy` → 代理 URL),但必须**自建一个 HTTP CONNECT 隧道 `https.Agent`**(移植 reference 的 `createProxyTunnelAgent`)传给请求的 `agent`。否则需代理网络下打包 .app 里 poller 会静默失败(而 SDK 仍工作)。
- **响应契约**(0–100 利用率,直接可用):
  ```jsonc
  { "five_hour": { "utilization": <0-100>, "resets_at": <ISO8601> },
    "seven_day": { "utilization": <0-100>, "resets_at": <ISO8601> } }
  ```
- **plan 名**(来自 `subscriptionType`):含 `max`→Max、`pro`→Pro、`team`→Team、`api`/空→null(不显示限额条)、**其它非空 → 首字母大写原样显示**(照搬 reference,避免把未知新档当「无订阅」)。

**节流与降级**
- 轮询间隔 5 分钟(对齐 API 自身节流窗口);usage 结果缓存于内存(引擎常驻进程)。
- HTTP **429** → 指数退避(60s→120s→240s,封顶 5min),保留上一次成功值并标 `stale`。
- HTTP **401/403**(token 失效)→ 单列为「凭据失效」:下一轮重读凭据自愈(不当成永久 apiError)。
- 其它错误(网络/超时/非 200/解析失败)→ `AccountLimits.apiError` 置位,前端灰显限额条(不崩)。
- **自定义端点**(`ANTHROPIC_BASE_URL` 指向非 `api.anthropic.com`)→ 跳过(OAuth usage 不适用)。
- **日志卫生**:catch 块**只**记 `err instanceof Error ? err.message : 'unknown'`;**禁止** log 整个 error 对象 / `err.stderr` / `String(err)`(`security` 出错时 stderr 可能含 token)。`credentials.ts`/`usage-poller.ts` 各加单测断言日志不含 `accessToken` 子串。

**生命周期与可测性**
- poller 在 `server.ts` 的 **LIVE 分支**启动(replay 分支是独立代码路径,不构造 SessionManager/WsGateway,天然无 poller)。
- `fetchUsage(token)`、`readCredentials()`、**代理解析器**三者全部**依赖注入**(默认实现走真网络 / keychain / scutil),单测注入假实现 →**不发真请求、不读真 keychain、不 spawn scutil**(注意 `readMacSystemProxy` 在 darwin 会无条件 `Bun.spawnSync(["scutil"...])`,故代理解析也必须可注入)。

### 4.2 引擎:每会话上下文占用率(`Driver` + `SessionManager`)

**用 SDK 真实接口,不再做 token 算术 / 窗口猜测。** 已核实 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`:
- `Query.getContextUsage(): Promise<SDKControlGetContextUsageResponse>`(`sdk.d.ts:2273`)。
- 响应含 `{ totalTokens, maxTokens, percentage, model, categories[] }`(`sdk.d.ts:2779-2802`)。`percentage` 是**现成的占用百分比**,且已计入 system prompt + tools + memory files(比「input_tokens 代理」更准)。

设计:
- **`Driver` 新增** `getContextUsage(): Promise<{ totalTokens; maxTokens; percentage } | null>`,内部 `try { return await this.q?.getContextUsage() } catch { return null }`(SDK 不支持 / 未 init / 出错 → null)。`IDriver` 接口同步加此方法。
- **`SessionManager`**(类在 `src/engine/session.ts`)在**每轮结束**(观测到 `result` 消息 / agent 转 idle)调用该会话 `Driver.getContextUsage()`,得到值后广播 `context.updated`,payload `{ usedTokens: totalTokens, windowSize: maxTokens, utilization: round(percentage) }`。
- `/compact` 后 `totalTokens` 自然变小 → `utilization` 自动回落,无需额外守卫。
- 取不到(null)→ 不产 `context.updated`(头顶条隐藏),不猜测。
- 轮询是对本机 CLI 进程的**控制请求**(非 API 调用),**零额度成本**;每轮一次的频率可接受。
- **不再需要** `Driver.model` / 模型→窗口映射:`maxTokens` 来自接口本身、随当前模型即时正确,绕开「SessionManager 不持有 model、setModel 后 model 失真」的问题。

### 4.3 协议新增

**(a) 账户级兄弟消息(信封之外,加法式)** —— `src/shared/events.ts`
```ts
export interface WindowUsage { utilization: number | null; resetsAt: number | null; } // util 0-100,null=未知;resetsAt epoch ms
export interface AccountLimits {
  planName: string | null;            // "Pro" | "Max" | "Team" | <Cap> | null
  fiveHour: WindowUsage;
  sevenDay: WindowUsage;
  apiError?: string;                  // 置位→前端灰显
  stale?: boolean;                    // 退避期沿用旧值
}
export interface LimitsMessage { kind: "limits"; ts: number; limits: AccountLimits; }
```
- **判别必须按 `kind` 的值**,不能用「`"kind" in msg`」——因为**已存在 `kind:"control"` 兄弟消息**(`src/shared/local-sessions.ts:12-13`,前端在 `src/web/ws-client.ts:20` 已按 `kind==="control"` 分流)。新分支加在**同一个 `handleIncoming` 里**:`kind==="limits"` → `setLimits`;`kind==="control"` → 既有 `onControl`(**保留**);其余 → `apply(RoomEvent)`→`reduce`。
- **广播**:`WsGateway.broadcast(e: RoomEvent)` 当前签名只收 `RoomEvent` 且只接 `mgr.subscribe`(RoomEvent sink);新增 **`broadcastLimits(msg: LimitsMessage)`**(或把 `broadcast` 拓为 `RoomEvent | LimitsMessage` 联合)遍历 `this.clients` 推送;`usage-poller` 经注入持有 gateway 引用。**新客户端连接时回放最近一次缓存的 limits**(否则要等下个 5min tick 才有条)。
- **顺序契约**:limits 帧**有意不带 `seq`**,与 `(sessionId, seq)` 单调序号无关、last-write-wins、不参与 seq 去重。
- **`RoomEvent` 信封零改动。**

**(b) 每会话上下文事件(走信封,遵「三处同步」纪律)**
- `shared/events.ts`:`RoomEventType` 增 `"context.updated"`;`ContextUpdatedPayload { usedTokens: number; windowSize: number; utilization: number /*0-100*/ }`。
- `engine/session.ts`:产出 `context.updated`(§4.2)。
- `web/store.ts`:`reduce` 消费 → 写 `session.context`。

### 4.4 上下文窗口大小来源(取代原「模型→窗口映射」)
窗口大小直接取 `getContextUsage().maxTokens`(真实、随模型即时正确)。**删除原计划的硬编码 `contextWindowFor(model)` 表**——不再需要,亦消除「假设值填错使 % 失真」的风险。头顶条的阈值刻度按**百分比**(C 默认 20%)定位,与模型无关(不再有「20%≈200k」这种仅对 1M 模型成立的说法)。

### 4.5 domain 增量(`src/shared/domain.ts`)
```ts
export interface ContextUsage { usedTokens: number; windowSize: number; utilization: number; }
// Session 增可选字段:context?: ContextUsage;
```
`createSession` 不预置 `context`(首条 `context.updated` 到达前为 undefined,头顶条隐藏)。

### 4.6 前端 store(`src/web/store.ts`,hook 名 `useRoomStore`)
- 顶层新增 `limits: AccountLimits | null`(默认 null),action `setLimits(limits)`。
- `reduce` 处理 `context.updated`:幂等写 `sessions[sessionId].context`(会话不存在则忽略,与既有保护一致)。
- 三臂分流改在 `src/web/ws-client.ts` 的 `handleIncoming`(§4.3a),**不依赖 reduce 兜底** limits 帧。

### 4.7 前端:左上限额双条(`src/web/hud/LimitBars.tsx` 新增,DOM)
- 两条堆叠:**5h = 红血条**、**周 = 蓝魔法条**;**条长 = 剩余 = `100 - utilization`**,随消耗见底。
- 旁注小字:plan 名 + 重置倒计时(`resetsAt` → `formatCountdown()`,纯函数)。
- 剩余低于警示阈值(默认 15%)→ 变警示色。
- `limits` 为 null / `apiError` / `stale` → 显示「—」或「同步中」灰态,不崩。
- 布局:限额条占左上角;现有 `⚙` 设置坞挪到**右上角**避免抢位(改 `Hud.tsx` + `styles.css`,纯排版)。
- 订阅:`useRoomStore((s) => s.limits)`(单字段选择器)。

### 4.8 前端:NPC 头顶上下文充能条(`src/web/overworld/SessionNpc.tsx` + `Overworld.tsx`)
- **数据通路**:`SessionNpc` 的 props 是逐字段铺平的(无 `session` 对象),需**新增 prop `utilization?: number`**;在 `Overworld.tsx` 的 `<SessionNpc>` 映射处把 `sessions[a.id].context?.utilization` 传入。(§10 已把 `Overworld.tsx` 补进涉及文件。)
- **渲染**:头顶(昵牌上方)一条 Pixi `Graphics` 细条,**填充 = 已用 `utilization`%**(充能式)。20% 处一道阈值刻度线(= C 默认阈值百分比,模型无关)。
- **配色**:`< 20%` 绿 /`20–80%` 琥珀 /`> 80%` 红(阈值与高占用双重提示;刻度线与「绿→琥珀」拐点有意同在 20%,强化「越过默认阈值」)。
- **命令式 + ref 桥接**(守渲染纪律):`utilization` 经 prop 传入后用 `useRef` 镜像(`utilRef.current = utilization`,照搬本组件既有 `nearRef/selectedRef = useRef(prop)` 模式);`useTick` 回调读 `utilRef.current` 重画,**不**把 `utilization` 放进 tick 回调的 deps。`utilization` 为 undefined 时整条隐藏。
- 与子项 D 的头顶「?」/状态图标共存(各占一槽)。

### 4.9 前端:排行榜面板(`src/web/hud/Leaderboard.tsx` 新增,游戏窗口)
- 纯函数 `leaderboardRows(sessions): Row[]`:全部会话(含归档)按 `usage.tokens` 降序;`Row = { sessionId, title, heroSkin, tokens, cost, model, archived }`。
- 每行:`HeroPortrait`(复用)+ 标题 + token 数(主列、带条形比例)+ cost(副列)+ model 标签;归档行置灰。
- 复用既有游戏窗口皮肤(`.px-window` / `.px-titlebar`);新增 🏆 hotbar 按钮 + `ui-store` 的 `leaderboardOpen` flag。`ui-store` 的 `Panel` 联合类型**新增 `'leaderboardOpen'`**,调用 `toggle("leaderboardOpen")`(注意:`toggle(k: Panel)` 收带 `Open` 后缀的完整 key)。
- **轴说明**:B 做「按会话」轴;ROADMAP §4 的「按模型聚合」留作后续增强(可在面板加切页),不在 B。

## 5. 边界与降级
| 场景 | 行为 |
| --- | --- |
| 无订阅 / API key 用户 | `planName=null` → 不显示限额条;上下文条 + 排行榜照常 |
| OAuth token 过期 / 读不到 | 限额条灰态;下轮重读凭据再试 |
| 429 | 退避 + 沿用旧值标 stale;UI 灰显 |
| 401/403 | 标凭据失效;下轮重读凭据自愈 |
| 网络 / 自定义端点 | apiError 灰显 / 跳过拉取 |
| `getContextUsage()` 不支持 / 出错 | 该会话头顶条隐藏(不猜) |
| replay 模式 | 独立分支不构造 SessionManager/WsGateway,**无 poller、无 getContextUsage**;限额条「—」;头顶条仅当 fixture **预制了 `context.updated` 事件**时点亮(replay 不经引擎计算) |
| 会话刚建、尚无轮次 | `context` undefined,头顶条隐藏 |

## 6. 测试策略(纯函数下沉 + 注入,零额度)
**单测(`bun:test`)**
- `parseUtilization`(clamp 0-100、NaN/Infinity→null)、`parseResetDate`(非法→null)。
- `leaderboardRows(sessions)`:降序、含归档置灰、空集。
- 条长 / 警示阈值映射、`formatCountdown(resetsAt)`。
- `usage-poller`:注入假 `fetchUsage` + 假 `readCredentials` + 假代理解析器 → 正常产出 / 429 退避保留旧值 / 401 凭据失效重读 / token 过期降级 / 自定义端点跳过。**断言不触发真网络、真 keychain、真 scutil。**
- `credentials.ts`:`claudeAiOauth.expiresAt`(ms)边界、service-name 派生、日志不含 `accessToken` 子串。

**引擎组件级**
- `SessionManager` 注入**假 `Driver`**(`driverFactory` 已可注入,见 `session.ts`),其 `getContextUsage()` 返回固定值 → 断言广播出 `context.updated{usedTokens,windowSize,utilization}`;返回 null → 不产事件。

**前端 ws-client / store**
- `handleIncoming` 三臂:`{kind:"limits"}` → `setLimits`(**不进 reduce**);`{kind:"control"}` → `onControl`(保留);普通 RoomEvent → `apply`/reduce。镜像既有 `ws-client.test.ts`。
- `reduce`:`context.updated` → `session.context`(幂等、会话不存在忽略)。

**replay e2e(扩 `src/web/replay.e2e.test.ts`)**
- replay **不经 normalize/引擎计算**:fixture 里**预制 `context.updated` RoomEvent** → 断言 `reduce` 后 `session.context.utilization` 正确(这测的是 reducer 折叠,不是引擎计算)。引擎侧 `getContextUsage→context.updated` 的计算由上面「引擎组件级」用例覆盖。

**关卡**:`bun test` + `bun run check` + `bunx tsc --noEmit` 全绿。

## 7. 风险 / 假设
1. **`/api/oauth/usage` 未文档化**但 `claude-hud` 在产用、契约稳定。风险:CC 升级可能变更 path / beta header。缓解:出错优雅降级隐藏限额条;beta header 集中为常量。
2. **`getContextUsage()` 是 SDK 公开方法**(已核实于安装版 `sdk.d.ts:2273`),风险低;但需在实现时确认 streaming-input 会话 init 后即可调用(未 init 早调可能报错 → 已用 try/catch→null 兜底)。
3. **5 分钟缓存**:限额条最多滞后 5 分钟(与 API 节流一致,可接受)。
4. **代理隧道**:需代理网络下 poller 依赖自建 CONNECT agent(§4.1);若移植不全,表现为限额条灰显(非崩溃)。
5. **打包 .app 自调 `security` 读 keychain 可能触发授权弹窗**:本 spec 仅在 **web/dev** 验证;.app 端 keychain 授权 / entitlement 列为打包阶段(ROADMAP Phase 1B 之后)风险,不在 B 验收。
6. **自定义 `CLAUDE_CONFIG_DIR`**:已按 reference 派生 service name;若仍读不到则限额条灰显(功能降级,非泄露)。

## 8.(已删)模型→窗口映射
原 v1 §4.4 的硬编码窗口表已删除——窗口大小改由 `getContextUsage().maxTokens` 提供(§4.4)。

## 9. 交接子项 C(阈值与自动编排)
B 落地后,C 在此基础上加:
- NPC 卡片 + 全局设置里的**压缩阈值**(默认 20%,**百分比、模型无关**)读写。
- 引擎:`context.utilization` 越阈值 → 终止会话 → 发 `/compact` → 重发续跑 prompt 的编排(需 `Driver` 新方法 + WS 命令)。
- B 已画的 20% 刻度线接成真触发线。

## 10. 涉及文件清单
**引擎**:`src/engine/usage-poller.ts`(新)、`src/engine/credentials.ts`(新)、`src/engine/driver.ts`(改:`getContextUsage()` + `IDriver`)、`src/engine/session.ts`(改:每轮调 `getContextUsage` 并广播 `context.updated`)、`src/engine/ws-gateway.ts`(改:`broadcastLimits()`/联合签名 + 新连接回放缓存 limits)、`src/engine/server.ts`(改:LIVE 分支启 poller、注入 gateway)、`src/engine/proxy.ts`(改:导出可复用的代理 URL 解析 + 可选自建 CONNECT agent helper)。
**共享**:`src/shared/events.ts`(改:`WindowUsage`/`AccountLimits`/`LimitsMessage`/`context.updated`/`ContextUpdatedPayload`)、`src/shared/domain.ts`(改:`ContextUsage` + `Session.context`)。(**不**改 `mapping.ts`——窗口表已删。)
**前端**:`src/web/ws-client.ts`(改:`handleIncoming` 三臂分流)、`src/web/store.ts`(改:`limits` + `setLimits` + reduce `context.updated`)、`src/web/hud/LimitBars.tsx`(新)、`src/web/hud/Leaderboard.tsx`(新)、`src/web/hud/Hud.tsx`(改:挂载 + 🏆 + 设置坞挪位)、`src/web/ui-store.ts`(改:`Panel` 增 `leaderboardOpen`)、`src/web/overworld/SessionNpc.tsx`(改:`utilization` prop + ref 桥接 + 头顶条)、`src/web/overworld/Overworld.tsx`(改:把 `sessions[a.id].context?.utilization` 透传给 `SessionNpc`)、`src/web/hud/NpcCard.tsx`(改:补上下文 % 行)、`src/web/styles.css`(改:限额条 / 面板样式)。

## 11. 自审订正记录(v1 → v2)
经 5 镜头对抗式自审(协议架构 / 数据可行性 / 可测性 / 范围一致性 / 安全)核对真实代码后修正:
- **[critical] WS 分流**:`"kind" in msg` 会误捕既有 `kind:"control"` 帧 → 改按 `kind` 值三臂分流,保留 control。
- **[critical] 上下文取数**:原计划从 `assistant` 轮 + cache token 算占用,但 `normalize.ts` 只在 `result` 读 usage、`SdkMessageLike` 无 cache 字段、`SessionManager` 不持有 model → **改用 SDK `getContextUsage()` 真实接口**,一举消除 token 算术 / 类型扩展 / 窗口猜测 / 模型失真四个问题。
- **[important] 广播类型**:`broadcast` 仅收 `RoomEvent` → 加 `broadcastLimits()` + 新连接回放。
- **[important] replay 路径**:replay 独立分支不构造 SessionManager/WsGateway/normalize → poller 生命周期归 LIVE 分支;replay e2e 改为预制 `context.updated`。
- **[important] 代理**:`proxy.ts` 只产 env(对进程内 fetch 无效)→ poller 自建 CONNECT 隧道 agent。
- **[important] 头顶条数据/渲染**:`SessionNpc` 不收 `session` → 加 prop + `Overworld.tsx` 透传 + ref 桥接(不违命令式纪律)。
- **[important] 标识符**:`session-manager.ts`→`session.ts`、`useStore`→`useRoomStore`、`toggle("leaderboard")`→`toggle("leaderboardOpen")`。
- **[minor] 凭据/安全**:`claudeAiOauth` ms 单位钉死、每轮重读凭据、401/403 自愈、`os.userInfo().username` + `CLAUDE_CONFIG_DIR` service-name、日志只记 `err.message`(防 stderr 泄 token)、plan 未知档首字母大写、limits 帧不带 seq。
