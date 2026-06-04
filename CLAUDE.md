# CLAUDE.md

Roguent —— Claude Code agent 活动的游戏化实时可视化平台。把**订阅模式**驱动的真实 subagent 活动,渲染成《元气骑士》画风 top-down 像素地牢里「一屋子小人在干活」。完整设计见 [docs/superpowers/specs/2026-06-04-roguent-design.md](docs/superpowers/specs/2026-06-04-roguent-design.md);**当前现状 + 待办 backlog(改 / 修 / 加功能前先读)见 [docs/ROADMAP.md](docs/ROADMAP.md)**。

## 命令

| 命令 | 作用 |
| --- | --- |
| `bun run dev:engine` | 起 Engine WS 服务(`src/engine/server.ts` --watch),固定 `ROGUENT_PORT=8787`(纯浏览器路径用;Tauri sidecar 不设此变量则绑临时端口) |
| `bun run dev:web` | 起 Vite 前端,`http://localhost:5173`(WS 连 `ws://localhost:8787`) |
| `bun run dev:engine -- --replay <fixture>` | 回放 fixture(零额度、不连真 SDK),给每个连入的客户端按时序重放 |
| `bun test` | 跑全部单测(`bun:test`) |
| `bun run check` | Biome lint + format 校验 |
| `bun run build` | Vite 构建 |
| `bun run dev:app` | 起 Tauri 桌面壳(dev):编译 sidecar → 拷 CLI → `tauri dev`(其 beforeDevCommand 起 Vite) |
| `bun run build:app` | 打包 macOS `.app`(+ `.dmg`):前端构建 → 编译 sidecar → 拷 CLI → `tauri build`。**仅 Apple Silicon** |

## 架构

三层,前后端走 WebSocket(事件下行 / 命令上行):

- **`src/engine/`** — Bun 后端。`SessionManager` 按 `sessionId` 管多个 `Driver`(每个会话 = 一个 Claude Agent SDK `query()` streaming-input 实例);hooks + SDK 消息经 `normalize.ts` 归一化成 `RoomEvent`,`Sequencer` 打 `(sessionId, seq)` 单调序号,`WsGateway` broadcast 给所有客户端。
- **`src/web/`** — React 19 + PixiJS v8(`@pixi/react`)+ Zustand。`store.ts` 的 `reduce` 把 `RoomEvent` 流折叠成 `sessions` 状态;`room/` 渲染房间小人/粒子/辉光,`hud/` 是图标 HUD + 聊天抽屉。**当前选中会话 = 渲染源**。
- **`src/shared/`** — 前后端共用:`domain.ts`(实体 + `createSession`/`createAgent`)、`events.ts`(事件协议)、`mapping.ts`(agentType → 皮肤)。
- **`src-tauri/`** — Tauri 2 Rust 宿主(WKWebView 装前端),把上面三层包成原生 macOS `.app`。`tauri-plugin-shell` 把 engine 当 **sidecar** spawn;engine 绑临时端口、stdout 打 `PORT=<n>`,host 解析后经 `engine_url` 命令交给 webview(前端 `resolveEngineUrl()` 退避重试;纯浏览器无 `__TAURI__` 时回落 `ws://localhost:8787`)。218MB `claude` CLI 不内嵌进 sidecar,而是作 `bundle.resources` 打包,运行时 host 经 `resource_dir()` 找到、用 `ROGUENT_CLI_PATH` 传给 sidecar(SDK 的 `pathToClaudeCodeExecutable`)。打包脚本 `scripts/build-sidecar.ts`、`scripts/stage-cli.ts`;完整迁移设计见 [docs/superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md](docs/superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md)。**第一阶段仅 Apple Silicon(darwin-arm64)**。

数据流:UI 命令 → `WsGateway.onCommand` → `SessionManager` → `Driver.send` → SDK → hooks/消息 → `normalize` → `Sequencer` → broadcast → 前端 `reduce` → 渲染。

## 关键约定

- **订阅 OAuth,不走 API key**:`Driver` 用 `stripSubscriptionEnv` 抹掉 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`,回落本机 `/login` 订阅态。auth 校验是**反向**判定:只有 `apiKeySource ∈ {user,project,org,temporary}` 才告警「没走订阅」,`none`/`oauth`/缺省都算正常(见 `driver.ts` 的 `usesApiKey`)。
- **会话存在性不依赖 SDK `system:init`**:SDK 在 streaming-input 下要收到第一条 user 消息才发 `init`,故 `SessionManager.createSession` 会**前置合成**一条 `session.created`(否则「没会话→发不了消息→不发 init→没会话」死锁);前端 reducer 对 `session.created` **幂等合并**(已存在则补 model/slashCommands,绝不重建、不清 transcript),并在会话**首次**出现时把焦点切过去(延迟到达的 init 不抢焦点)。
- **事件协议**单一信封 `{ seq, ts, sessionId, type, agentId?, payload }`。新增事件类型要同步改三处:`shared/events.ts`(类型)、`engine/normalize.ts`(产出)、`web/store.ts`(消费)。
- **subagent 工具名同时认 `Task` 和 `Agent`**(SDK 版本改名,见设计 §8.4)。
- **观测 hooks 全 `async:true`、永不阻塞**:`buildHooks` 注册的回调立即返回 `{}`,不挡真实 agent。
- **包管理用 bun,锁文件只有 `bun.lock`**(已从 npm 迁移,无 `package-lock.json`);装依赖用 `bun add`,别用 npm。

## 测试纪律

改后即测:动了代码 / 配置 / runtime 就跑 `bun test` + `bun run check`,失败先修;**不把局部通过说成全量通过**。端到端验证用回放 fixture,不烧额度。

## 工作流

见 [.claude/rules/workflow.md](.claude/rules/workflow.md):detached worktree 优先 + Conventional Commits。
