---
title: 导入本地会话历史 · 设计
date: 2026-06-05
status: M1-done
milestones:
  - M1 导入 + 压缩回放(零额度)— ✅ 已实现(commit 8801c30;浏览器冒烟:719 会话列出、点击导入渲染成房间)
  - M2 从历史 resume 续命(SDK --resume,后续)
related:
  - 2026-06-04-roguent-design.md
  - ROADMAP.md（Phase 2「持久化 + SDK resume」）
---

# 导入本地会话历史 · 设计

## 0. 目标与范围

把 **Claude Code 自己存在本地的会话 transcript**(`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`)引入 Roguent,作为继 **LIVE**(真 SDK)/ **REPLAY**(fixture)之后的**第三个 `RoomEvent` 来源**。

- **M1(本期)· 导入 + 压缩回放**:在应用内浏览本地 CC 会话列表 → 选中 → 转换成 `RoomEvent` → 在地牢里**零额度、压缩计时**重演那次会话「一屋子小人干活」的过程。不连 SDK、不烧额度。
- **M2(后续)· 从历史 resume 续命**:同一个列表,选中后用 SDK `resume: sessionId` 把已死会话拉活成 LIVE 会话继续发消息。重得多(动 `Driver`/SDK options/生命周期),ROADMAP 归在 Phase 2,本 spec 只预留接缝,不实现。

**非目标**:编辑/导出 transcript;跨机同步;持久化 Roguent 自身状态(刷新即重置仍然成立);M2 的具体实现。

## 1. 架构与组件

新增 4 个文件、改 3 个现有文件;前端只加一个 HUD 入口。职责按「纯转换 / 文件 IO / 编排 / 协议」分层,各层可独立单测。

| 文件 | 角色 | 依赖 |
|---|---|---|
| `src/engine/transcript.ts`(新) | **纯函数转换**:`normalizeTranscript(lines: unknown[]) → DraftEvent[]`。CC 原生行 → 现有 `DraftEvent` 形状(复用 `normalize.ts` 的类型);不带 sessionId/seq/ts —— 由 `SessionManager.stamp` 统一打,和 LIVE/REPLAY 一致。无 IO。 | `shared/events`、`shared/domain` |
| `src/engine/local-sessions.ts`(新) | **文件 IO**:`listLocalSessions(root?) → LocalSessionMeta[]` 扫 `~/.claude/projects/*/*.jsonl`;`readTranscriptLines(path) → unknown[]`。隔离 FS,便于 mock。 | Bun fs |
| `src/engine/import.ts`(新) | **编排**:`ImportSource` —— path → 读行 → `normalizeTranscript` → 交 `SessionManager` 注册为内存会话 → `replayTimed`(gap 封顶 + speed)逐条 broadcast;持有可运行时改的 `speed`。 | 上面两个 + `record.ts` |
| `src/shared/local-sessions.ts`(新) | 共享类型 `LocalSessionMeta { project, sessionId, path, mtime, firstMessage, msgCount }` + 控制消息类型。 | —— |
| `src/engine/session.ts`(改) | 加 `importSession(id, path, speed)`:不建 `Driver`,挂一个回放器;seq 复用现有 `Sequencer`(与 LIVE 会话同享单调序号);可 `setReplaySpeed`。 | `import.ts` |
| `src/engine/ws-gateway.ts`(改) | 加 3 个命令;**让 `onCommand` 拿到发起的 `ws`**,使 `listLocalSessions` 能定向回包。 | —— |
| `src/web/hud/ImportPanel.tsx`(新)+ `Hud.tsx`(改) | 「📂 导入」图标按钮 → 面板:本地会话分组列表 + 首条消息预览 + 选中导入 + 速度切换(1x/2x/4x)。 | `store`/`ui-store` |

**关键决策 —— 列表是请求/响应,不是广播**:当前 WS 协议全是「engine 广播 `RoomEvent`、客户端发命令」,没有定向响应。`listLocalSessions` 的结果是会话目录清单,不属于任何 `sessionId`,塞不进 `RoomEvent` 信封。因此:

- `ws.on("message", data => this.onCommand(String(data), ws))` —— `onCommand` 带上发起 socket。
- `listLocalSessions` / `importError` 用**非 RoomEvent 的控制消息** `{ kind: "control", type: "localSessions" | "importError", ... }`,由 gateway `ws.send` **定向回发起方**;前端 `ws-client.ts` 的 `handleIncoming` 先分流:`kind==="control"` 走控制回调,否则按 `RoomEvent` 走 reduce。
- 其余命令(`importSession` / `setReplaySpeed`)产生的是真 `RoomEvent`,仍走广播。

## 2. 数据流

```
[📂 导入面板] 打开
  → ws ↑ {cmd:"listLocalSessions"}
  → engine: local-sessions.listLocalSessions() 扫盘
  → ws ↓(定向){kind:"control", type:"localSessions", items:[LocalSessionMeta]}
  → 面板按 project 分组渲染，每条显示 firstMessage 预览 + mtime + msgCount

[选中某会话 + speed]
  → ws ↑ {cmd:"importSession", path, speed}
  → engine: readTranscriptLines(path) → normalizeTranscript(lines) → DraftEvent[]
  → SessionManager.importSession:
      1. 先 seq.stamp 合成 session.created（title=首条 user 文本截断, model, cwd, project=projectFor(cwd)）
      2. replayTimed(drafts, emit, speed)：gap=min(Δts, 2000ms)/speed，逐条 seq.stamp & broadcast
  → 前端 reduce（不变）→ 会话出现在总览世界（项目=房间）→ 进入内景看小人重演

[运行时调速]
  → ws ↑ {cmd:"setReplaySpeed", sessionId, speed}
  → 回放器读新 speed（影响尚未发出的后续事件间隔）

[出错]
  → ws ↓(定向){kind:"control", type:"importError", path, reason}
  → 面板红条提示
```

导入会话与 LIVE 会话在前端**无差别**(都是 `sessions` 里的一条),复用全部渲染 / HUD / 切换 / 总览世界逻辑。

## 3. 转换映射(CC transcript → RoomEvent)

CC transcript 每行是一条记录,关键字段:`type`(user/assistant/attachment/mode/queue-operation/...)、`message.{role,content[]}`、`uuid`/`parentUuid`、`timestamp`(ISO)、`cwd`、`sessionId`、`gitBranch`、`isSidechain`。`content[]` 块有 `text` / `thinking` / `tool_use{id,name,input,caller}` / `tool_result{tool_use_id,content,is_error?}`。

| CC 来源 | 检测条件 | 产出 `DraftEvent` |
|---|---|---|
| 任一行的 `cwd`+`sessionId`(取首个可用) | —— | `session.created`(title=首条 user 文本截断, model=首个 assistant 行的 model 或空, permissionMode/apiKeySource 留默认, cwd, project=`projectFor(cwd)`) |
| `assistant` 行 `content[].type==="text"` | —— | `message.delta`(agentId=orchestrator, text=拼接文本) |
| `content` 中 `tool_use` 且 `name∈{Task,Agent}` | **subagent 派生** | `agent.spawned`(agentId=`tool_use.id`, role 从 input 推断或默认 `"agent"`, promptSummary=`input.description ?? input.prompt` 截断 80) |
| 上条对应的 `tool_result`(按 `tool_use_id` 配对) | —— | `agent.done`(agentId=对应 `tool_use.id`, stopReason `"normal"`) |
| 其它 `tool_use`(`name∉{Task,Agent}`) | 普通工具 | `tool.started`(agentId=orchestrator, toolName=`name`, inputSummary=`summarizeToolInput(input)`, toolUseId=`id`) |
| 其对应 `tool_result` | `is_error` 真 → 失败 | `tool.ended`(ok=true) 或 `tool.failed`(ok=false) |
| `type==="result"` 或带 `usage`/`total_cost_usd` 的行(若存在) | —— | `usage.updated`(tokens, cost) |
| `thinking` / `attachment` / `mode` / `queue-operation` / 空行 | —— | 忽略 |

**映射纪律(实测依据)**:

- **subagent 检测靠 `tool_use.name`,不靠 `isSidechain`**:本机当前 transcript(`...mystifying-antonelli-0699bc/<id>.jsonl`,2026-06-05)实测 `isSidechain` 全为 0,但 `Agent` 工具调用有 11 个。`isSidechain` 在该版本不可靠,故以 `name∈{Task,Agent}` 为准(与 `CLAUDE.md`「subagent 工具名同时认 `Task` 和 `Agent`」一致)。
- **工具归属 M1 全挂 orchestrator**:与现有 `normalize.ts` MVP 一致(它也把 subagent 文本路由到 orchestrator)。`tool_use.caller` 字段留作后续把工具归到具体 subagent 的接缝,M1 不用。
- **时间**:`timestamp` ISO → epoch ms 求 Δ;`replayTimed` 已有 `speed`,新增 gap 封顶 `Math.min(Δ, 2000)`,避免真实会话里数分钟空档把回放卡死。
- 转换器是纯函数:输入已 parse 的 `unknown[]`,输出 `DraftEvent[]`;不读盘、不打时间戳(seq/ts 由 `SessionManager` 统一打,和 LIVE/REPLAY 一致)。

## 4. 错误处理与边界

- **文件不存在 / 整体解析失败** → 定向回 `{kind:"control", type:"importError", path, reason}`,面板红条(复用 P1-1 错误覆盖层视觉风格)。
- **`~/.claude/projects` 不存在 / 空** → `listLocalSessions` 回空数组,面板显示「没有本地会话」。
- **单行 JSON 坏** → 转换器对每行 try/catch 跳过,不中断整体(沿用 `record.ts parseEvents` 容错思路)。
- **巨大 transcript**(本会话 ~1MB / 数百行)→ 转换 O(n) 纯内存,可接受;**列表预览**只读每文件首条 user 行 + 行数统计,不全量 parse。
- **重复导入同一会话** → 生成的 Roguent sessionId 加导入实例后缀(如 `<sessionId>#imp1`),避免与既有会话撞键(reducer 按 sessionId 幂等合并)。
- **回放中删除该会话** → 走现有 `deleteSession`;回放器检测会话已删则停止 emit。

## 5. 测试(零额度)

| 测试 | 覆盖 |
|---|---|
| `transcript.test.ts`(新) | 喂构造的 CC jsonl 行 → 断言 `DraftEvent` 序列:`Agent` tool_use→`agent.spawned`、配对 result→`agent.done`、普通 tool_use/result→`tool.started/ended`、`is_error`→`tool.failed`、assistant text→`message.delta`、坏行被跳过。**纯函数核心覆盖。** |
| `local-sessions.test.ts`(新) | mock 临时目录结构 → 断言列出正确 `LocalSessionMeta`、坏文件跳过、空目录回空。 |
| `import.e2e.test.ts`(新) | 造 mini CC transcript fixture(`fixtures/sample-transcript.jsonl`)→ 走 `ImportSource` 产出的事件喂前端 `reduce` → 断言 `sessions` 状态(小人出现 / agent.done 离场 / cleared),与现有 `replay.e2e.test.ts` 同模式。 |
| `ws-gateway.test.ts`(扩) | `parseCommand` 认 `listLocalSessions`/`importSession`/`setReplaySpeed`、拒非法。 |
| 浏览器冒烟 | `dev:engine` + `dev:web` → 开导入面板 → 选一个真实本地会话 → 肉眼/截图看地牢压缩重演;切 1x/2x/4x 生效。 |

全部自动化测试零额度;`bun test` + `bun run check` 必须全绿。

## 6. M2 接缝(本期不实现,仅预留)

续命复用同一个 `listLocalSessions` 列表;选中后**不**走 `ImportSource`,而是:

- `driver.ts` 加 `resume?: string` 选项,传给 SDK `query()` 的 resume 参数,把该 `sessionId` 拉活成 LIVE 会话继续发消息。
- 体验点「**先压缩回放历史,再无缝转 LIVE**」(回放追平到末尾后切真实 Driver)留作 M2 设计阶段细化。
- 续命会烧额度且需真连 SDK 验证,与 Phase 1A「零额度」纪律冲突,故必须单独一轮、用户确认后再做。

## 7. 实现顺序(供 writing-plans 参考)

1. `shared/local-sessions.ts` 类型 + `transcript.ts` 纯转换(`normalizeTranscript(lines)`)+ 单测(无 IO,先钉死映射)。
2. `local-sessions.ts` 文件 IO + 单测(mock 目录)。
3. `import.ts` 编排 + `session.ts importSession` + `import.e2e.test.ts`。
4. `ws-gateway.ts` 3 命令 + 定向回包重构 + 命令单测。
5. `ws-client.ts` 控制消息分流 + `ImportPanel.tsx` + HUD 入口 + 浏览器冒烟。
