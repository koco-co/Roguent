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
  - src/engine/session.ts
  - src/engine/transcript.ts
  - src/shared/local-sessions.ts
  - src/web/hud/ImportPanel.tsx
specs:
  - docs/superpowers/specs/2026-06-05-import-local-sessions-design.md
---

# §11 本地会话导入

## 1. 定位

扫描本机 `~/.claude/projects/` 目录下的 Claude Code 历史会话(JSONL transcript 文件),解析后以「静态存档」方式导入为 Roguent 可视化会话——无需 SDK、零消耗账户额度。导入的会话与 LIVE 会话共享同一套事件流、Sequencer 和 store，在地牢房间里渲染完整的对话回放与 subagent 活动轨迹。

## 2. 为什么

- **存量复用**:用户已有大量 CLI 会话记录,在 Roguent 中直接查看,不必重新运行 agent。
- **零额度回放**:静态存档的导入是纯本地转换,不触发 SDK 调用,不消耗订阅额度。
- **调试与复盘**:可把历史 agent 运行的工具调用链、subagent 派生关系等可视化呈现,辅助复盘。
- **独立于引擎重启**:导入会话在客户端标记为 `imported:true`,豁免 §6 的 roster 对账,引擎 `--watch` 重启后不会误删存档(回看不变黑屏)。

## 3. 功能点

- **扫描本地会话目录**(`local-sessions.ts`:`listLocalSessions`):遍历 `~/.claude/projects/<project>/*.jsonl`,跳过空文件和全部解析失败的文件,按 `mtime` 倒序返回 `LocalSessionMeta[]`(含 `project`、`sessionId`、`path`、`mtime`、`firstMessage`、`msgCount`)。
- **JSONL 逐行解析**(`local-sessions.ts`:`readTranscriptLines`):按行 `JSON.parse`,跳过空行与坏行,返回 `unknown[]`,不抛出。
- **Transcript 事件归一化**(`transcript.ts`:`normalizeTranscript`):两趟扫描——Pass 1 提取 `cwd`/`model`/首条用户文本合成 `session.created`;Pass 2 把 `user`/`assistant` 行展开成 `message.delta`(含用户轮次)、`tool.started`/`tool.ended`/`tool.failed`、`agent.spawned`(Task 或 Agent tool)、`agent.done`,时间戳来自原行 ISO `timestamp` 字段(缺失时继承前一行)。
- **导入流程**(`session.ts`:`SessionManager.importSession`):读取 → 归一化 → 注入 `cwd`/`project`/`imported:true` → 以 `{basename}#imp{n}` 为 sessionId,经 Sequencer 打全局递增序号后逐条 emit,整段历史瞬时注入事件流(非计时回放)。导入 ID 进 `knownSessions`,使其进入花名册但仍被 `imported` 标记豁免清除。
- **ImportPanel UI**(`ImportPanel.tsx`):面板激活时发 `listLocalSessions` 命令,engine 以定向 `control` 消息回传列表;每行点击发 `importSession { path }` 命令;引擎导入失败时回传 `importError` 展示错误原因。(planned) 支持多选批量导入。

## 4. 交互边界★

### 上游

| 系统 | 接口 | 说明 |
|---|---|---|
| §2 事件协议 | `session.created`(含 `imported:true`)→ `message.delta` → `tool.*` → `agent.*` | 导入事件走标准 `RoomEvent` 信封 `{ seq, ts, sessionId, type, agentId?, payload }`,与 LIVE 会话共享 Sequencer |
| §7 HUD Shell | `activePanel === "import"` | ImportPanel 是 Modal 面板宿主;`activePanel` 由 HUD Shell 管理,面板切换由 `useUiStore` 驱动 |

### 下游

| 系统 | 接口 | 说明 |
|---|---|---|
| §5 会话/聊天 | `session.created` + `message.delta` 进 store | 导入历史在聊天抽屉里完整重现用户轮次与助手轮次 |
| §6 生命周期对账 | `s.imported === true` 豁免 `reconcileSessions` | store 的 `reconcileSessions` 保留 `imported` 会话,不被引擎花名册对账清除 |

### 命令契约(WS 上行)

| 命令 | 参数 | 响应 |
|---|---|---|
| `{ cmd: "listLocalSessions" }` | 无 | 定向 `control` 消息 `{ kind:"control", type:"localSessions", items: LocalSessionMeta[] }` |
| `{ cmd: "importSession", path: string }` | `path`:JSONL 绝对路径 | 成功:broadcast 一批 `RoomEvent`;失败:定向 `{ kind:"control", type:"importError", path, reason }` |

### 定向控制消息(WS 下行,非 RoomEvent)

类型定义在 `src/shared/local-sessions.ts` 的 `ControlMessage` 联合类型,`ws-client.ts` 的 `handleIncoming` 按 `kind:"control"` 分路到 `onControl` 回调,再由 `ui-store` 写入 `localSessions`/`importError`。

## 5. 数据流与关键约定

```
ImportPanel 激活
  → sendCommand({ cmd:"listLocalSessions" })
  → WsGateway.onCommand → listLocalSessions()
  → control { type:"localSessions", items } → ui-store.localSessions
  → ImportPanel 列表渲染

点击行
  → sendCommand({ cmd:"importSession", path })
  → WsGateway: id = basename(path,".jsonl") + "#imp{n}"
  → SessionManager.importSession(id, path)
      readTranscriptLines(path)        // JSONL → unknown[]
      normalizeTranscript(lines)       // → TimedDraft[]  (first = session.created)
      注入 cwd / project / imported:true
      seq.stamp → emit(RoomEvent) × N  // 瞬时批量,非计时
  → broadcast → ws-client handleIncoming → apply(RoomEvent)
  → store.reduce × N → sessions[id] 建立,currentSessionId 切换
  → 地牢房间渲染导入会话

失败路径
  → importSession throws → gateway catch
  → control { type:"importError", path, reason }
  → ui-store.importError → ImportPanel 错误行
```

**关键约定**:

- `normalizeTranscript` 首行恒为 `session.created`,保证 store reducer 的幂等合并逻辑正常入口。
- 导入会话**不建 Driver**,不走 SDK,`drivers` Map 中无对应条目——`sendMessage`/`interrupt` 对其静默无效。
- `imported:true` 在 `session.created` payload 里随第一条事件广播,reducer 建会话时写入 `Session.imported`;幂等再导入时 `existing.imported || p.imported` 保持标记不丢。
- sessionId 格式 `{basename(path,".jsonl")}#imp{n}`:`importSeq` 单调递增,同路径多次导入产生不同 id,不互相覆盖。
- subagent 工具名同时识别 `Task`（旧 SDK 名）和 `Agent`（新 SDK 名）,两者均映射为 `agent.spawned`。缺少 `subagent_type` 字段时角色回落 `"agent"`(仅影响地牢皮肤,不影响正确性)。
- 导入事件瞬时注入,不模拟真实时间间隔——地牢里 NPC 瞬时完成整段动作轨迹,不做动画延迟。

## 6. 现状与边界

| 项目 | 状态 |
|---|---|
| 扫描/列表(`listLocalSessions`) | 真实磁盘扫描,无 mock |
| JSONL 解析(`readTranscriptLines`) | 真实读文件,坏行跳过 |
| Transcript 归一化(`normalizeTranscript`) | 全真,含用户轮次、tool 链、subagent 派生 |
| 导入流程(`importSession`) | 全真,`imported:true` 标记,零额度瞬时注入 |
| ImportPanel UI | 真数据面板,无任何 mock banner |
| `imported` 豁免 roster 对账(§6) | 已实现:store `reconcileSessions` 保留 `s.imported` 会话 |
| 多选批量导入 | (planned) 未实现 |
| 导入进度/取消 | 未实现(瞬时注入无需进度条,极大文件可能阻塞 WS 线程) |
| Tauri sidecar 路径适配 | 未专项测试;`defaultProjectsRoot` 依赖 `homedir()`,预期在 Tauri 宿主下可用 |

## 7. 代码锚点

| 文件 | 关键位置 | 说明 |
|---|---|---|
| `src/engine/local-sessions.ts:6` | `defaultProjectsRoot()` | 返回 `~/.claude/projects` |
| `src/engine/local-sessions.ts:10` | `readTranscriptLines(path)` | JSONL 逐行解析,坏行跳过,不抛出 |
| `src/engine/local-sessions.ts:39` | `listLocalSessions(root?)` | 扫描目录,返回 `LocalSessionMeta[]`,按 mtime 倒排 |
| `src/engine/transcript.ts:43` | `normalizeTranscript(input)` | JSONL 行数组 → `TimedDraft[]`,两趟扫描 |
| `src/engine/transcript.ts:9` | `SUBAGENT_TOOLS` | `{"Task","Agent"}`,两个工具名均识别为 subagent |
| `src/engine/session.ts:136` | `SessionManager.importSession(id, path)` | 导入入口:不建 Driver,瞬时 emit |
| `src/engine/session.ts:142` | `this.knownSessions.add(id)` | 导入会话进花名册,但 `imported` 标记豁免 reconcile |
| `src/engine/ws-gateway.ts:20` | `{ cmd: "listLocalSessions" }` | 命令类型定义 |
| `src/engine/ws-gateway.ts:21` | `{ cmd: "importSession"; path: string }` | 命令类型定义 |
| `src/engine/ws-gateway.ts:118` | `case "listLocalSessions"` | 处理:调 `listLocalSessions()` 定向回 control 消息 |
| `src/engine/ws-gateway.ts:124` | `case "importSession"` | 处理:生成 id,调 `mgr.importSession`,catch → importError |
| `src/shared/local-sessions.ts:1` | `LocalSessionMeta` | 扫描结果元数据类型 |
| `src/shared/local-sessions.ts:10` | `ControlMessage` | 定向控制消息联合类型(含 `localSessions`/`importError`/`roster`) |
| `src/web/hud/ImportPanel.tsx:32` | `sendCommand({ cmd: "listLocalSessions" })` | 面板激活时拉列表 |
| `src/web/hud/ImportPanel.tsx:76` | `sendCommand({ cmd: "importSession", path: m.path })` | 行点击触发导入 |
| `src/web/store.ts:120` | `imported: p.imported` | 新建会话时写入 imported 标记 |
| `src/web/store.ts:412` | `if (keep.has(id) || s.imported)` | roster reconcile 豁免导入会话 |

## 8. 验收

单测文件:

- `src/engine/local-sessions.test.ts`:扫描目录返回正确元数据、mtime 倒排、空/坏行跳过、不可读路径返回 `[]`。
- `src/engine/transcript.test.ts`:session.created 首行断言、assistant/user message.delta、tool.started/ended/failed、agent.spawned(Task+Agent 两名)、agent.done、坏行跳过不抛出。
- `src/engine/import.test.ts`:SessionManager.importSession 完整路径——seq 连续、`imported:true`、`project` 注入、用户与助手轮次均进 message.delta;空/不可读 transcript 抛异常且不 emit 任何事件。
- `src/web/import.e2e.test.ts`:transcript → normalizeTranscript → reduce 端到端——spawn/tool 生命周期完整、用户消息到聊天历史、subagent 出现在 mid-stream。

验收要点:

1. `listLocalSessions` 响应包含正确的 `project`/`sessionId`/`firstMessage`/`msgCount`。
2. `importSession` 成功后 store 中新增 `imported:true` 会话,`currentSessionId` 切至该会话。
3. `importSession` 失败(路径不存在/空文件)时不产生幽灵 `session.created`,UI 显示错误。
4. 引擎 `--watch` 重启后重连,roster reconcile 不删除 `imported` 会话。
5. 同路径多次导入产生不同 sessionId,历史记录不互相覆盖。
6. `bun test` 全量通过,`bun run check` 无 lint/format 报错。
