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

# §1 核心驱动与订阅模式

## 1. 定位

用 Claude Agent SDK `query()` streaming-input 模式驱动订阅 OAuth 会话的引擎底座——每个 Claude Code 会话对应一个 `Driver` 实例,`SessionManager` 统一管理其生命周期并向下游分发归一化事件。

## 2. 为什么

**streaming-input 是核心约束**:与一次性 prompt 不同,`query({ prompt: asyncIterable })` 允许在会话存续期间动态推入新消息、运行时切换模型,是「多轮 subagent 对话 + 实时可视化」的技术前提。若改用单次 prompt,多轮交互需重新创建会话,上下文和 hooks 均丢失。

**订阅 OAuth 消除计费顾虑**:所有会话抹掉 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` 后强制走本机 `/login` 订阅态,可视化本身不产生额外 API 费用。若不做此隔离,dev 环境残留的 API key env 会悄无声息消耗配额,且 `system:init` 上报的 `apiKeySource` 会落入 `user/project/org/temporary` 集合,触发告警。

**auth 反向判定保持低噪声**:SDK 在订阅模式下实测把 `apiKeySource` 报成 `'none'`(无 api-key env 时),而非 spec 早期假设的 `'oauth'`。因此判定逻辑**反向**:只有 `apiKeySource ∈ {user, project, org, temporary}` 才说明意外走了 API key,打 warn;`none`/`oauth`/缺省都视为正常订阅态,不产生噪声日志。

## 3. 功能点

- **启动会话**:`Driver.start()` 创建 `query()` 实例,以 `userStream()` 异步生成器作为 streaming-input prompt。
- **多轮发消息**:`Driver.send(text)` 把用户消息入队并唤醒 `userStream`,无需重建会话。
- **运行时切模型**:`Driver.setModel(model)` 代理到 `Query.setModel()`(SDK 原生支持)。
- **中断当前轮次**:`Driver.interrupt()` 代理到 `Query.interrupt()`。
- **上下文占用查询**:`Driver.getContextUsage()` 返回 `{totalTokens, maxTokens}`;每轮 `usage.updated` 后 `SessionManager` 自动触发并发出 `context.updated` 事件。
- **`stripSubscriptionEnv`**:抹掉 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`,回落订阅态(`driver.ts:17`)。
- **`usesApiKey` 反向 auth 校验**:仅 `{user,project,org,temporary}` 告警,`none`/`oauth` 正常(`driver.ts:28-30`)。
- **`cliPathFromEnv`**:从 `ROGUENT_CLI_PATH` 读打包后的 claude CLI 路径;dev 未设则 undefined,SDK 用默认解析(`driver.ts:35-40`)。
- **被动观测 hooks**:`buildHooks` 注册 `PreToolUse/PostToolUse/PostToolUseFailure/SubagentStart/SubagentStop` 全 `async:true`、立即返回 `{}`,不阻塞 agent(`driver.ts:43-55`)。
- **macOS 系统代理注入**:`resolveProxyEnv` + `readMacSystemProxy`:`.app` 由 LaunchServices 启动不继承 shell 代理 env,此处兜底读 `scutil --proxy` 注入 `HTTP(S)_PROXY`(`proxy.ts:51-72`)。
- **凭据读取**:`readOauthCredentials` 优先读 macOS keychain(`security find-generic-password`),回落 `~/.claude/.credentials.json`;每次重新读不缓存,CLI token 轮转后下轮自愈(`credentials.ts:105-127`)。
- **会话生命周期管理**:`SessionManager.createSession/deleteSession/sendMessage/setModel/interrupt/importSession/sessionIds()`(`session.ts`)。
- **订阅用量聚合** (implemented):`rate_limit_event` 经 `LimitsAggregator` 汇聚,不进 seq 事件流,独立推给 `limitsSinks`。

> (planned) `setPermissionMode` 动态切换:当前 `permissionMode` 在 `Options` 初始化时固定为 `"default"`,SDK `Query` 未暴露运行时修改接口。

## 4. 与其它子系统的交互边界

**上游依赖**:无硬依赖(§1 是引擎底座)。

**下游产出 → §2 归一化层**

- `Driver.cb.onDraft(drafts: DraftEvent[], ts)`:每条 SDK 消息 / hook 经 `normalizeHook` / `normalizeSdkMessage` 转成 `DraftEvent[]` 后回调给 `SessionManager.onDraft`,再经 `§2 Sequencer` 打 `(sessionId, seq)` 信封广播。
- `Driver.cb.onRateLimit(info)`:SDK `rate_limit_event` 携带的 `rate_limit_info` 直接交给 `LimitsAggregator`,不进归一化管线。

**接收来自 §8 (WsGateway / 命令层)**

| 命令 | 经路 | 实现 |
|---|---|---|
| `sendMessage` | `SessionManager.sendMessage` → `Driver.send` | `session.ts:129` |
| `setModel` | `SessionManager.setModel` → `Driver.setModel` | `session.ts:170` |
| `interrupt` | `SessionManager.interrupt` → `Driver.interrupt` | `session.ts:174` |
| `newSession` | `SessionManager.createSession` | `session.ts:65` |
| `deleteSession` | `SessionManager.deleteSession` | `session.ts:164` |
| `importSession` | `SessionManager.importSession` | `session.ts:136` |

**依赖 §13 (Tauri 打包层)**

- `ROGUENT_CLI_PATH` env:Tauri host 经 `resource_dir()` 找到 bundle 内 claude CLI 后以此 env 传给 sidecar,`cliPathFromEnv` 读取(`driver.ts:35-40`)。
- 代理注入是 §13 场景的关键保障:.app 不继承 shell env,`readMacSystemProxy` 兜底注入系统代理避免 403。

frontmatter `depends_on: []`、`related: ["§2","§8","§13"]` 与上述一致。

## 5. 数据流与关键约定

```
UI 命令
  → §8 WsGateway.onCommand
  → SessionManager.sendMessage / setModel / interrupt
  → Driver.send / setModel / interrupt
  → SDK query() streaming-input
  → SDK 产出消息 / hooks 回调
  → normalizeHook / normalizeSdkMessage → DraftEvent[]
  → SessionManager.onDraft → Sequencer.stamp → RoomEvent
  → §2 broadcast → 前端 reduce → 渲染
```

**关键约定与不变量**

1. **会话存在性前置合成**:`createSession` 立刻 emit 一条 `session.created`,不等 SDK `system:init`。SDK 在 streaming-input 下须收到第一条 user 消息才发 init;若不前置合成,新建会话→发消息→等 init→等会话 构成死锁(`session.ts:73-92`)。
2. **session.created 注入 title/cwd/project**:SDK init 派生的 `session.created` 不含用户标题/cwd/project;`SessionManager` 在 `onDraft` 里把建会话时的值注入(`session.ts:99-109`)。
3. **hooks 全被动、永不阻塞**:`buildHooks` 所有回调立即返回 `Promise.resolve({})`,不做任何同步计算,确保不拖慢真实 agent(`driver.ts:44-46`)。
4. **env 组装顺序**:`stripSubscriptionEnv` → `resolveProxyEnv`;环境已有任一 `*_PROXY` 则代理注入跳过,尊重 dev shell 配置(`driver.ts:104-105`)。
5. **`rate_limit_event` 不进 seq 事件流**:账户级用量是非 per-session 数据,独立走 `limitsSinks`,不经 `Sequencer` 打信封(`driver.ts:126-128`, `session.ts:95`)。
6. **`--bare` 禁用**:SDK `Options` 未传 `bare:true`,`settingSources: ["user","project"]` 保持 CLAUDE.md / skills / plugins / MCP 全部加载(`driver.ts:109`)。

## 6. 现状与边界(真 / mock / 取舍)

**全真(implemented)**

- `Driver`、`SessionManager`、`buildHooks`、`stripSubscriptionEnv`、`usesApiKey`、`cliPathFromEnv` 均已落地并有单测覆盖。
- macOS keychain 凭据读取 + `.credentials.json` 回落:已实现,仅 darwin 平台走 `security`。
- 代理注入:已实现,含 `createProxyTunnelAgent` 供引擎自身 fetch 使用(`proxy.ts:90`)。

**已知取舍**

- `setPermissionMode` 运行时动态切换:SDK `Query` 未暴露此接口,当前 `permissionMode` 固定为 `"default"`,运行时不可更改。如需切换须销毁并重建 Driver。
- 凭据读取结果**不缓存**:每次 `readOauthCredentials` 调用都重新读 keychain/文件,保证 CLI token 轮转后自动自愈,代价是轻微 keychain IO。
- `importSession` 不建 Driver:导入的 transcript 是静态存档,零额度瞬时回放,无 streaming-input 实例,`imported:true` 标记使客户端豁免其出 roster 对账。
- 非 macOS 平台代理:`readMacSystemProxy` 在非 darwin 直接返回 `{}`,其它平台无系统代理自动注入。

**明确不做**

- 不读 SDK file-provider 的 snake_case credentials 文件(`credentials.ts:21`)。
- 不在 log 中输出完整 error 对象(可能含 token)(`credentials.ts:76`)。

## 7. 代码锚点

| 符号 / 逻辑 | 文件:行 |
|---|---|
| `stripSubscriptionEnv` | `src/engine/driver.ts:17` |
| `usesApiKey` + `API_KEY_SOURCES` | `src/engine/driver.ts:28-30` |
| `cliPathFromEnv` | `src/engine/driver.ts:35-40` |
| `buildHooks`(被动观测,async:true) | `src/engine/driver.ts:43-55` |
| `Driver.start`(env 组装 + `query()`) | `src/engine/driver.ts:98-118` |
| `Driver.pump`(消息循环 + rate_limit_event 路由) | `src/engine/driver.ts:120-147` |
| `Driver.send` | `src/engine/driver.ts:149-157` |
| `Driver.setModel` | `src/engine/driver.ts:159-161` |
| `SessionManager.createSession`(前置 session.created) | `src/engine/session.ts:65-122` |
| `SessionManager.importSession` | `src/engine/session.ts:136-160` |
| `readOauthCredentials`(keychain→file 回落) | `src/engine/credentials.ts:105-127` |
| `resolveProxyEnv` | `src/engine/proxy.ts:51-72` |
| `readMacSystemProxy`(scutil --proxy) | `src/engine/proxy.ts:75-84` |
| `createProxyTunnelAgent`(引擎自身 fetch 隧道) | `src/engine/proxy.ts:90-153` |

## 8. 验收

| 测试文件 | 覆盖要点 |
|---|---|
| `src/engine/driver.test.ts` | `stripSubscriptionEnv` 抹 key/token;`usesApiKey` 反向判定各 source;`buildHooks` 异步不阻塞;`Driver.send/setModel/interrupt` 行为;`cliPathFromEnv` 空/非空 |
| `src/engine/credentials.test.ts` | keychain 成功/失败回落 file;token 过期处理;`CLAUDE_CONFIG_DIR` 非默认路径的 keychain service hash;非 darwin 返回 null |
| `src/engine/proxy.test.ts` | `parseScutilProxy` 各字段解析;`resolveProxyEnv` 已有 env 则跳过、无 env 则注入;非 darwin `readMacSystemProxy` 返回 `{}` |

回放验证:用 `bun run dev:engine -- --replay <fixture>` 零额度重放,观察客户端依次收到 `session.created`(前置合成)→ SDK 消息事件序列,确认 seq 单调递增、`imported` 标记在 importSession 场景正确出现。
