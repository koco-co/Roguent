# Roguent Full Prototype Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Roguent-handoff.zip` 中 `Roguent.html` 原型完整落地为 Roguent 产品功能：Claude 与 Codex 双运行时、真实聊天窗口、WeChat/Feishu 单会话扫码配对、X/GitHub 订阅、定时任务、邮箱/公告板、成就/经济/抽卡/商店、账号设置与美术场景优化，并为每个功能建立可复跑的端到端验证证据。

**Architecture:** 在现有 `SessionManager + Driver + WsGateway + Zustand reducer` 基础上扩展五个边界清晰的模块：`RuntimeManager` 统一 Claude/Codex 驱动；`IntegrationManager` 统一 IM 与订阅连接器；`IngressServer` 统一签名校验和 webhook/relay；`Scheduler` 统一自动任务定义与运行；`Persistence + SecretStore` 统一 SQLite 元数据、Keychain 密钥和审计日志。前端保持现有 React 19 + PixiJS 房间渲染，新增 prototype 对应的面板组件，并让所有面板从真实 store、WS command、SQLite 状态和 replay fixtures 获得数据。

**Tech Stack:** Bun + TypeScript, React 19, Zustand, PixiJS v8, Vite, Tauri 2, Bun `bun:sqlite`, macOS Keychain via `/usr/bin/security`, Claude Agent SDK, Codex CLI/app-server, `@wechatbot/wechatbot`, Feishu/Lark official bot SDK or long-connection client, WebSocket, HTTP webhook ingress, bun:test, Biome, `bunx tsc`, `@testing-library/react` + `@testing-library/user-event` + `happy-dom`(组件单测,**当前未装,Task 0 补**), Playwright(浏览器 E2E,**当前未装,Task 0 补**)。

**Source Spec:** `docs/superpowers/specs/2026-06-07-roguent-full-prototype-integration-design.md`

**Verification Rule:** 每个 task 的验收只能覆盖该 task 声明的范围。完成时必须记录实际命令、exit code、pass/fail/skip 数、截图或 trace artifact 路径。未执行的外部账号流程必须列入 blocker 表，不得描述为已通过。

---

## File Structure

### Shared Contract

- Modify: `src/shared/domain.ts` — 扩展 session/runtime/pairing/mailbox/scheduler/economy 类型。
- Modify: `src/shared/events.ts` — 扩展 `RoomEvent` 类型、payload 类型和 type guards。
- Create: `src/shared/runtime.ts` — `RuntimeKind`、runtime config、permission/sandbox/reasoning 类型。
- Create: `src/shared/integrations.ts` — IM、GitHub、X、relay、webhook 的 normalized event 类型。
- Create: `src/shared/scheduler.ts` — schedule definition、run state、recurrence 类型。
- Create: `src/shared/economy.ts` — achievement、ledger、inventory、gacha pool 类型。
- Create: `src/shared/fixtures.ts` — replay fixture schema、fixture validation helpers。

### Engine Runtime

- Modify: `src/engine/driver.ts` — 迁移为 Claude runtime adapter，保留订阅 OAuth 规则。
- Modify: `src/engine/session.ts` — runtime-aware session lifecycle、external input routing、scheduler starts。
- Modify: `src/engine/ws-gateway.ts` — 新增 runtime、integration、scheduler、economy、settings commands。
- Modify: `src/engine/normalize.ts` — Claude/Codex 事件归一化。
- Create: `src/engine/runtime/types.ts` — `RuntimeEventDraft`、`RuntimeDriver`、driver lifecycle;`RuntimeEventDraft` 只定义在这里,不要放到 `src/shared/runtime.ts`。
- Create: `src/engine/runtime/claude-driver.ts` — 从旧 `driver.ts` 抽出的 Claude adapter。
- Create: `src/engine/runtime/codex-app-server.ts` — Codex app-server JSON-RPC/client adapter。
- Create: `src/engine/runtime/codex-exec-fallback.ts` — `codex exec --json` 降级 adapter。
- Create: `src/engine/runtime/codex-normalize.ts` — Codex thread/turn/item/tool/approval event normalize。
- Create: `src/engine/runtime/manager.ts` — runtime driver factory、capability detection、session ownership。

### Engine Persistence, Secrets, Audit

- Create: `src/engine/persistence/db.ts` — SQLite connection、transaction helper、test temp DB helper。
- Create: `src/engine/persistence/migrations.ts` — versioned schema migrations。
- Create: `src/engine/persistence/repositories.ts` — session、binding、inbox、scheduler、economy repositories。
- Create: `src/engine/secrets/types.ts` — `SecretStore` interface。
- Create: `src/engine/secrets/keychain.ts` — macOS Keychain implementation。
- Create: `src/engine/secrets/memory-store.ts` — tests and replay use。
- Create: `src/engine/audit/log.ts` — sanitized append/read/query audit records。

### Engine Integrations

- Create: `src/engine/integrations/types.ts` — connector interfaces and normalized events。
- Create: `src/engine/integrations/manager.ts` — connector lifecycle, status fanout, outbound reply routing。
- Create: `src/engine/integrations/pairing.ts` — single-session binding overwrite logic。
- Create: `src/engine/integrations/wechat.ts` — Bun-first `@wechatbot/wechatbot` connector。
- Create: `src/engine/integrations/wechat-node-host.ts` — Node 22 child process bridge。
- Create: `src/engine/integrations/wechat-node-host.mjs` — Node-side WeChat SDK host。
- Create: `src/engine/integrations/feishu.ts` — Feishu/Lark long-connection connector。
- Create: `src/engine/integrations/github.ts` — GitHub webhook registration and event normalization。
- Create: `src/engine/integrations/x.ts` — X CRC/webhook normalization and entitlement-aware status。
- Create: `src/engine/integrations/relay.ts` — local relay client and capability token validation。
- Create: `src/engine/ingress/server.ts` — local HTTP webhook endpoints。
- Create: `src/engine/ingress/signatures.ts` — GitHub HMAC, X CRC, Feishu token/encryption helpers。

### Engine Scheduler And Economy

- Create: `src/engine/scheduler/next-run.ts` — deterministic recurrence calculation。
- Create: `src/engine/scheduler/runner.ts` — run due tasks, create/resume sessions, send prompts。
- Create: `src/engine/scheduler/service.ts` — CRUD, enable/disable, run-now, run history。
- Create: `src/engine/economy/ledger.ts` — append-only gem/coin ledger。
- Create: `src/engine/economy/achievements.ts` — event-driven achievement evaluator。
- Create: `src/engine/economy/gacha.ts` — deterministic pull logic with seeded tests。

### Web App

- Modify: `src/web/store.ts` — reducer for runtime, integration, inbox, scheduler, economy, settings。
- Modify: `src/web/App.tsx` — login/lobby/interior shell and modal routing。
- Modify: `src/web/ws-client.ts` — typed commands and reconnect status。
- Modify/extend (聊天组件 commit `e427f0d` 已落地,**扁平**在 `src/web/hud/`,不在 `chat/` 子目录): `ChatDrawer.tsx`、`MessageBubble.tsx`、`ToolCard.tsx`、`ThinkingBlock.tsx`、`PromptCard.tsx`、`TimelineItem.tsx`、`SlashMenu.tsx`、`ModelPicker.tsx` — 真原型聊天行为,扩展而非重建。
- Create (新组件,同样**扁平**放 `src/web/hud/`): `ChatHeader.tsx`、`Timeline.tsx`、`Composer.tsx`、`RuntimeControls.tsx` — runtime/model/permission/sandbox/effort 控件与容器。
- Create: `src/web/hud/pairing/PairingPanel.tsx` — WeChat/Feishu QR and binding management。
- Create: `src/web/hud/mailbox/MailboxPanel.tsx` — inbox, board, resend/open actions。
- Create: `src/web/hud/scheduler/SchedulerPanel.tsx` — create/edit/run scheduled tasks(整合现有 `Tasks.tsx`/`SessionGrid.tsx` 的 Scheduled Tasks mode,非另起)。
- Modify: `src/web/hud/Settings.tsx` — 现有整面板 mock(ROADMAP §3.5),本计划把 Claude/Codex/runtime/integration 设置接真;不要新建 `settings/SettingsPanel.tsx`。
- Create: `src/web/hud/economy/AchievementsPanel.tsx` — achievement list and claim state。
- Create: `src/web/hud/economy/GachaPanel.tsx` — gacha animation, inventory, ledger updates。
- Modify: `src/web/hud/Shop.tsx` — 现有整面板 mock,接真 ledger/inventory;不要新建 `economy/ShopPanel.tsx`。
- Create: `src/web/lobby/*` — prototype lobby structures and interactions。
- Create: `src/web/room/*` updates — art scene, ambience, easter eggs, decorative states。

### Fixtures And E2E

- Create: `fixtures/runtime/claude-chat.jsonl`
- Create: `fixtures/runtime/codex-chat.jsonl`
- Create: `fixtures/integrations/wechat-inbound.json`
- Create: `fixtures/integrations/feishu-inbound.json`
- Create: `fixtures/integrations/github-push.json`
- Create: `fixtures/integrations/github-workflow.json`
- Create: `fixtures/integrations/x-crc.json`
- Create: `fixtures/integrations/x-post.json`
- Create: `fixtures/scheduler/daily-task.json`
- Create: `tests/e2e/roguent.e2e.ts`
- Create: `tests/e2e/helpers.ts`
- Create: `tests/e2e/artifacts/.gitkeep`

---

## Execution Phases

0. **Foundation-0(必须最先):** 测试工具链(testing-library + happy-dom + Playwright,当前未装)、已存在文件盘点、事件命名锁定、`RuntimeEventDraft` 定形。见 Task 0。
1. **Foundation:** shared contracts, persistence, secrets, audit.
2. **Runtime:** Claude adapter extraction, Codex app-server adapter, runtime-aware sessions.
3. **Chat:** timeline, prompts, model/runtime controls, IM inbound/outbound markers.
4. **Integrations:** pairing, WeChat, Feishu, GitHub, X, relay, ingress.
5. **Scheduler:** task definitions, automatic runner, run history.
6. **Game Product:** lobby/interior, mailbox/board, settings, achievements, economy, gacha, easter eggs.
7. **Verification:** fixtures, replay E2E, external smoke scripts, evidence reports.

---

## Tasks

> **执行顺序硬约束:Task 0 必须最先做。** 它建立后续几十个 task 验收命令所依赖的测试工具链,盘点已存在文件以免重复造组件,并锁定事件命名与 `RuntimeEventDraft`。在 Task 0 完成前不要开始 Task 2 起的实现 task。

### Task 0: Foundation-0 — Test Toolchain, Asset Inventory, Naming Lock

**Feature:** 一次性补齐计划隐含的三个前提:① 组件/E2E 测试工具链(当前仓库**没装**);② 已存在文件盘点(把后续 task 误标的 `Create` 纠正成 `Modify`);③ 锁定新事件命名与 `RuntimeEventDraft` 形状。否则后续 `.test.tsx` / `bun run test:e2e` 验收命令在本仓库根本跑不起来,且会创建重复组件。

**Files:**
- Modify: `package.json` — devDeps + scripts。
- Create: `bunfig.toml` — bun:test DOM preload。
- Create: `playwright.config.ts`
- Create: `src/web/hud/_smoke.test.tsx` — 验证 testing-library + DOM 环境可跑的最小样例。
- Create: `src/engine/runtime/types.ts` — 先固定 `RuntimeEventDraft` 单一位置和形状;Task 7 在同一文件补 `RuntimeDriver`。
- Read(盘点,不改): `src/web/hud/`、`src/web/lobby/`、`src/web/room/` 现有组件。

**Output Standard:**
- 测试栈装好:`@testing-library/react` + `@testing-library/user-event` + `happy-dom`(bun:test DOM env)+ `@playwright/test`;`bunfig.toml` 配 `preload`/DOM;`package.json` 加 `"test:e2e": "playwright test"`;`playwright.config.ts` 起 engine replay + Vite。
- 浏览器已安装(`bunx playwright install chromium`)。
- **已存在文件盘点表**(写进本 task 日志,后续 task 以此为准):

  | 计划误标 | 实际路径(已存在) | 正确动作 |
  | --- | --- | --- |
  | `hud/chat/MessageBubble.tsx` | `src/web/hud/MessageBubble.tsx` | Modify |
  | `hud/chat/ToolCard.tsx` | `src/web/hud/ToolCard.tsx` | Modify |
  | `hud/chat/ThinkingCard.tsx` | `src/web/hud/ThinkingBlock.tsx` | Modify |
  | `hud/chat/PromptCard.tsx` | `src/web/hud/PromptCard.tsx` | Modify |
  | `hud/chat/*`(Timeline rows) | `src/web/hud/TimelineItem.tsx`、`SlashMenu.tsx` | Modify |
  | `settings/SettingsPanel.tsx` | `src/web/hud/Settings.tsx` | Modify |
  | `economy/ShopPanel.tsx` | `src/web/hud/Shop.tsx` | Modify |
  | `scheduler/SchedulerPanel.tsx` | 整合 `src/web/hud/Tasks.tsx`/`SessionGrid.tsx` | Modify+Create |
  | `room/Minimap.tsx` | `src/web/hud/Minimap.tsx` | Modify(勿在 room/ 重建) |
  | `room/room-layout.test.ts` | `src/web/room/layout.test.ts` | Modify(勿撞名) |
  | `room/AmbienceLayer`(glow/particles) | `src/web/room/Lights.tsx`、`Particles.tsx` | Modify/复用 |
  | lobby login/hero/structures | 已有 `src/web/lobby/HubPlaza.tsx`、`hud/CharacterSelect.tsx` | 扩展为主 |

- **后端已实现、勿重做**:`canUseTool`/`respondPermission`/`respondQuestion`/`setPermissionMode`(commits `fd2b8f2`/`9493259`/`55653d2`),协议 `prompt.requested`/`prompt.resolved`([events.ts:28-29](../../../src/shared/events.ts))已存在 → Task 17 是扩展。
- **事件命名锁定表**(Task 3 以此为准,不再各写各的):见 Task 3 更新后的对照表。
- **`RuntimeEventDraft` 单一位置与形状锁定**:`RuntimeEventDraft` 定义在 `src/engine/runtime/types.ts`;当前 `src/engine/normalize.ts` 的局部 `DraftEvent` 在 Task 7 迁移为这个类型的 alias/import。不要在 `src/shared/runtime.ts` 或 Codex/Claude adapter 中重复定义同名类型。

  ```ts
  import type { RoomEventType } from "../../shared/events";

  export type RuntimeEventSource =
    | "claude-sdk"
    | "claude-hook"
    | "codex-app-server"
    | "codex-exec"
    | "replay";

  export interface SanitizedRuntimeRawRef {
    source: RuntimeEventSource;
    eventType: string;
    eventId?: string;
    payloadHash?: string;
    auditRef?: string;
  }

  export interface RuntimeEventDraft<TPayload = unknown> {
    type: RoomEventType;
    payload: TPayload;
    agentId?: string;
    ts?: number;
    raw?: SanitizedRuntimeRawRef;
  }

  export type DraftEvent = RuntimeEventDraft;
  ```

**Acceptance Standard:**
- `bun test src/web/hud/_smoke.test.tsx` exit code 0(证明 DOM + testing-library 可跑)。
- `bunx playwright --version` exit code 0;`bunx playwright install chromium` 完成。
- `bunx tsc --noEmit` exit code 0。
- 盘点表与 `find src -name "*.tsx"` 实际一致。

- [ ] 装测试栈:
  ```bash
  bun add -d @testing-library/react @testing-library/user-event happy-dom @playwright/test
  bunx playwright install chromium
  ```
- [ ] 写 `bunfig.toml`(DOM preload)+ `_smoke.test.tsx` 最小样例,确认 `bun test` 能渲染组件。
- [ ] 产出已存在文件盘点表,回写本 task 日志。
- [ ] Run:
  ```bash
  bun test src/web/hud/_smoke.test.tsx
  bunx tsc --noEmit
  ```

---

### Task 1: Create Worktree And Baseline Evidence

**Feature:** 建立隔离执行环境，并记录当前未提交文件，防止误改用户已有变更。

**Files:**
- Read: `.claude/rules/workflow.md`
- Read: `AGENTS.md`(注:AGENTS.md 是 CLAUDE.md 的 Codex 侧副本,事实以 `.claude/rules/workflow.md` + CLAUDE.md 为准)
- Create if execution chooses worktree: `.worktrees/roguent-full-prototype/`

**Output Standard:**
- 有一个干净 worktree 或明确记录当前 workspace 继续执行的理由。
- 计划执行日志记录 `git status --short` 的原始输出。

**Acceptance Standard:**
- 命令 `git status --short` exit code 0。
- 若创建 worktree，命令 `git worktree list` exit code 0 且包含新 worktree 路径。

- [ ] Run:
  ```bash
  cd /Users/poco/Projects/Roguent && git status --short
  ```
- [ ] Record existing dirty files in the task log. At the time this plan was written, known dirty entries were:
  ```text
   M src/engine/session.test.ts
  ?? Roguent-handoff.zip
  ```
  注:这是写计划时的快照,执行时必须以本 task 现场 `git status --short` 为准;不要照抄旧快照。
- [ ] If implementing in a detached worktree, run:
  ```bash
  git worktree add --detach .worktrees/roguent-full-prototype main
  ```
- [ ] Verify:
  ```bash
  git worktree list
  ```

---

### Task 2: Add Shared Runtime Contract

**Feature:** 为 Claude 和 Codex 定义统一 runtime/session 配置，使前后端不再把 Claude 当唯一运行时。

**Files:**
- Create: `src/shared/runtime.ts`
- Modify: `src/shared/domain.ts`
- Test: `src/shared/runtime.test.ts`

**Output Standard:**
- `RuntimeKind` 包含 `"claude"` 和 `"codex"`。
- `Session` metadata 包含 runtime、model、cwd、permissionMode、sandboxMode、reasoningEffort、networkAccess。
- 默认 session 仍兼容现有 Claude 行为。

**Acceptance Standard:**
- `bun test src/shared/runtime.test.ts src/shared/domain.test.ts` exit code 0。
- `bunx tsc --noEmit` 不出现 shared contract 类型错误。

- [ ] Create failing test:
  ```ts
  import { expect, test } from "bun:test";
  import { createSession } from "./domain";
  import { defaultRuntimeConfig } from "./runtime";

  test("session stores runtime metadata", () => {
    const session = createSession({
      id: "s-codex",
      title: "Codex task",
      model: "gpt-5",
      runtime: "codex",
      cwd: "/tmp/project",
    });

    expect(session.runtime).toBe("codex");
    expect(session.cwd).toBe("/tmp/project");
    expect(session.permissionMode).toBe(defaultRuntimeConfig("codex").permissionMode);
  });
  ```
- [ ] Implement `src/shared/runtime.ts`:
  ```ts
  export type RuntimeKind = "claude" | "codex";
  // Claude Agent SDK 的合法 permission mode 只有这四个;不要加 "ask"(SDK 不认,传过去会报错)。
  export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";
  // Codex 的"审批"是独立于 permission mode 的 approval policy(spec §Settings:Codex approval policy),
  // 不要塞进 PermissionMode。值对齐 Codex config。
  export type CodexApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";
  export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
  export type ReasoningEffort = "low" | "medium" | "high";

  export interface RuntimeConfig {
    runtime: RuntimeKind;
    model: string;
    permissionMode: PermissionMode; // Claude 用
    approvalPolicy?: CodexApprovalPolicy; // Codex 用;Claude 留空
    sandboxMode: SandboxMode;
    reasoningEffort?: ReasoningEffort;
    networkAccess: boolean;
  }
  ```
- [ ] Update `createSession` to fill Claude-compatible defaults when `runtime` is omitted.
- [ ] Run:
  ```bash
  bun test src/shared/runtime.test.ts src/shared/domain.test.ts
  bunx tsc --noEmit
  ```

---

### Task 3: Extend RoomEvent Protocol For Prototype Domains

**Feature:** 让后端能通过单一 WS 事件信封推送 runtime、integration、scheduler、mailbox、economy、settings 状态。

**Files:**
- Modify: `src/shared/events.ts`
- Create: `src/shared/integrations.ts`
- Create: `src/shared/scheduler.ts`
- Create: `src/shared/economy.ts`
- Test: `src/shared/events.test.ts`

**Output Standard:**
- 新事件类型有明确 payload 类型。
- 事件 union 支持 exhaustive reducer 检查。
- 新 payload 类型不引入 engine-only 或 web-only dependency。

**Acceptance Standard:**
- `bun test src/shared/events.test.ts` exit code 0。
- `bunx tsc --noEmit` exit code 0 for shared files。

> **命名锁定(Foundation-0 引用此表)。** 下列字面量是本计划的**最终**事件名,与 source spec §Event Protocol 的命名**有意不同**(spec 写的是 `runtime.status.updated`/`pairing.updated`/`mailbox.updated`/`economy.ledger.updated`/`scheduler.run.completed`+`.failed` 等"likely additions",未定稿)。本计划细化为:状态类用无 `.updated` 后缀的 `runtime.status`/`integration.status`;pairing 拆 `qr`/`binding`;mailbox 拆 `created`/`updated`;scheduler.run 合并为单个 `.finished`(payload 内带 success/fail);ledger 用 append 语义 `economy.ledger.appended`;新增 spec 未列的 `settings.updated`。**不在此表的名字一律不要新造**;spec 的 `announcement.updated` 本计划用 `mailbox.item.*` 承载,不单列。

- [ ] Append these event type literals to the existing `RoomEventType` union in `src/shared/events.ts`:
  ```ts
    | "runtime.status"
    | "runtime.config.updated"
    | "integration.status"
    | "integration.event.received"
    | "pairing.qr.updated"
    | "pairing.binding.updated"
    | "mailbox.item.created"
    | "mailbox.item.updated"
    | "scheduler.task.created"
    | "scheduler.task.updated"
    | "scheduler.run.started"
    | "scheduler.run.finished"
    | "economy.ledger.appended"
    | "achievement.updated"
    | "inventory.updated"
    | "settings.updated";
  ```
- [ ] Add type guard tests:
  ```ts
  test("integration events keep room envelope", () => {
    const event: RoomEvent = {
      seq: 1,
      ts: 1,
      sessionId: "s1",
      type: "integration.event.received",
      payload: { id: "ie1", channel: "wechat", direction: "inbound", summary: "hi" },
    };
    expect(event.type).toBe("integration.event.received");
  });
  ```
- [ ] Run:
  ```bash
  bun test src/shared/events.test.ts
  bunx tsc --noEmit
  ```

---

### Task 4: Add SQLite Migrations And Repository Boundary

**Feature:** 用 Bun SQLite 持久化 session metadata、pairing、inbox、scheduler、ledger、audit metadata。

**Files:**
- Create: `src/engine/persistence/db.ts`
- Create: `src/engine/persistence/migrations.ts`
- Create: `src/engine/persistence/repositories.ts`
- Test: `src/engine/persistence/db.test.ts`

**Output Standard:**
- migrations 可重复运行。
- test DB 使用临时文件，测试结束删除。
- SQLite 不存密钥明文，仅允许 `secretRef` 字段。

**Acceptance Standard:**
- `bun test src/engine/persistence/db.test.ts` exit code 0。
- 迁移后 `schema_version` 为当前版本。

- [ ] Write migration test:
  ```ts
  test("migrations are idempotent", () => {
    const db = createTestDatabase();
    migrate(db);
    migrate(db);
    expect(readSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });
  ```
- [ ] Implement tables:
  ```sql
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    runtime TEXT NOT NULL,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    cwd TEXT,
    permission_mode TEXT NOT NULL,
    sandbox_mode TEXT NOT NULL,
    reasoning_effort TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  ```
- [ ] Add tables for `pairing_bindings`, `connector_statuses`, `inbox_items`, `scheduler_tasks`, `scheduler_runs`, `ledger_entries`, `inventory_items`, `achievement_progress`, `audit_records`.
- [ ] Run:
  ```bash
  bun test src/engine/persistence/db.test.ts
  ```

---

### Task 5: Add SecretStore With Keychain And Memory Implementations

**Feature:** 统一保存外部平台 secret，默认使用 macOS Keychain，测试使用 memory store。

**Files:**
- Create: `src/engine/secrets/types.ts`
- Create: `src/engine/secrets/keychain.ts`
- Create: `src/engine/secrets/memory-store.ts`
- Test: `src/engine/secrets/memory-store.test.ts`
- Test: `src/engine/secrets/keychain-command.test.ts`

**Output Standard:**
- `SecretStore` 支持 `put/get/delete/listRefs`。
- Keychain 命令只通过 stdin 传 secret，不把 secret 写入日志。
- memory store 测试不访问系统 Keychain。

**Acceptance Standard:**
- `bun test src/engine/secrets` exit code 0。
- keychain command builder snapshot 不包含 secret value。

- [ ] Define interface:
  ```ts
  export interface SecretStore {
    put(ref: string, value: string): Promise<void>;
    get(ref: string): Promise<string | undefined>;
    delete(ref: string): Promise<void>;
    listRefs(prefix: string): Promise<string[]>;
  }
  ```
- [ ] Test no secret leakage:
  ```ts
  test("keychain command args never include secret value", () => {
    const command = buildAddSecretCommand("roguent/test", "secret-value");
    expect(command.args.join(" ")).not.toContain("secret-value");
  });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/secrets
  ```

---

### Task 6: Add Sanitized Audit Log

**Feature:** 所有外部输入、runtime 状态变化、pairing 覆盖、scheduler 自动执行都写入可查询审计记录。

**Files:**
- Create: `src/engine/audit/log.ts`
- Modify: `src/engine/persistence/repositories.ts`
- Test: `src/engine/audit/log.test.ts`

**Output Standard:**
- audit record 包含 `id/source/action/sessionId/deliveryId/payloadHash/summary/createdAt`。
- sanitizer 删除 token、authorization、cookie、password、secret、accessToken、refreshToken 字段。
- 审计日志不阻塞 runtime 主流程；写失败产生 `session.error` 或 `integration.status` warning。

**Acceptance Standard:**
- `bun test src/engine/audit/log.test.ts` exit code 0。
- 测试断言敏感字段不落库。

- [ ] Write sanitizer test:
  ```ts
  test("audit sanitizer strips secrets deeply", () => {
    const clean = sanitizeAuditPayload({
      headers: { authorization: "Bearer abc", cookie: "sid=1" },
      body: { nested: { refreshToken: "r1", visible: "ok" } },
    });
    expect(JSON.stringify(clean)).not.toContain("Bearer abc");
    expect(JSON.stringify(clean)).toContain("visible");
  });
  ```
- [ ] Implement `appendAuditRecord()` with SQLite transaction.
- [ ] Run:
  ```bash
  bun test src/engine/audit/log.test.ts
  ```

---

### Task 7: Extract Existing Claude Driver Into Runtime Adapter

**Feature:** 保留现有 Claude 功能，将其接到新的 `RuntimeDriver` interface 下。

**Files:**
- Modify: `src/engine/runtime/types.ts`
- Create: `src/engine/runtime/claude-driver.ts`
- Modify: `src/engine/driver.ts`
- Modify: `src/engine/session.ts`
- Test: `src/engine/runtime/claude-driver.test.ts`
- Test: `src/engine/session.test.ts`

**Output Standard:**
- `src/engine/driver.ts` 仍可作为兼容导出，避免一次性破坏 imports。
- Claude adapter 保留 `stripSubscriptionEnv`、OAuth 订阅优先、hooks async、permission prompt、ask question。
- runtime config 变化能调用 adapter 对应方法。

**Acceptance Standard:**
- `bun test src/engine/runtime/claude-driver.test.ts src/engine/session.test.ts` exit code 0。
- 现有 Claude replay fixture 行为不回退。

- [ ] Keep the Task 0 `RuntimeEventDraft` shape unchanged and add the runtime interface in the same file:
  ```ts
  export interface RuntimeDriver {
    start(): void;
    send(text: string, meta?: RuntimeSendMeta): void;
    setModel(model: string): Promise<void>;
    setPermissionMode(mode: string): Promise<void>;
    setSandboxMode?(mode: string): Promise<void>;
    setReasoningEffort?(effort: string): Promise<void>;
    interrupt(): Promise<void>;
    end(): void;
  }
  ```
- [ ] Migrate the local `DraftEvent` interface from `src/engine/normalize.ts` to import/export the alias from `src/engine/runtime/types.ts`:
  ```ts
  export type { DraftEvent } from "./runtime/types";
  ```
- [ ] Move old Claude implementation to `claude-driver.ts`.
- [ ] Keep `driver.ts` exporting:
  ```ts
  export { ClaudeDriver as Driver } from "./runtime/claude-driver";
  ```
- [ ] Run:
  ```bash
  bun test src/engine/runtime/claude-driver.test.ts src/engine/session.test.ts
  ```

---

### Task 8: Add RuntimeManager And Runtime-Aware Session Creation

**Feature:** `newSession` 可选择 `runtime: "claude" | "codex"`，SessionManager 通过 RuntimeManager 创建 driver。

**Files:**
- Create: `src/engine/runtime/manager.ts`
- Modify: `src/engine/session.ts`
- Modify: `src/engine/ws-gateway.ts`
- Test: `src/engine/runtime/manager.test.ts`
- Test: `src/engine/ws-gateway.test.ts`

**Output Standard:**
- WS command `newSession` 继续使用仓库现有上行字段 `cmd`,不要改成 `type`;它接受 runtime/model/cwd/permissionMode/approvalPolicy/sandboxMode/reasoningEffort/networkAccess。
- `sessionId`、`title`、`model` 保持现有 WS 协议必填,避免破坏 `ChatDrawer`/`EmptyState` 等已落地客户端;本 task 只扩展配置字段,不改变会话 id 生成职责。
- 未提供 runtime 时默认 Claude，保持现有使用路径。
- `session.created` payload 带 runtime config。

**Acceptance Standard:**
- `bun test src/engine/runtime/manager.test.ts src/engine/ws-gateway.test.ts` exit code 0。
- 手工 replay 连接能创建 Claude session 和 Codex session stub。

- [ ] Add command shape:
  ```ts
  type NewSessionCommand = {
    cmd: "newSession";
    sessionId: string;
    title: string;
    runtime?: RuntimeKind;
    model: string;
    cwd?: string;
    permissionMode?: PermissionMode; // Claude
    approvalPolicy?: CodexApprovalPolicy; // Codex
    sandboxMode?: SandboxMode;
    reasoningEffort?: ReasoningEffort;
    networkAccess?: boolean;
  };
  ```
- [ ] Add test asserting default:
  ```ts
  expect(
    parseCommand(
      JSON.stringify({
        cmd: "newSession",
        sessionId: "s1",
        title: "Claude task",
        model: "claude-sonnet-4",
      }),
    )?.runtime,
  ).toBe("claude");
  ```
- [ ] Add test that invalid `type: "newSession"` without `cmd` is rejected, so future work does not accidentally fork the command protocol:
  ```ts
  expect(
    parseCommand(
      JSON.stringify({
        type: "newSession",
        sessionId: "s1",
        title: "Wrong protocol",
        model: "claude-sonnet-4",
      }),
    ),
  ).toBeNull();
  ```
- [ ] Run:
  ```bash
  bun test src/engine/runtime/manager.test.ts src/engine/ws-gateway.test.ts
  ```

---

### Task 9: Implement Codex Capability Detection

**Feature:** 探测本机 Codex CLI/app-server 能力，决定使用 deep realtime adapter 或 exec fallback。

**Files:**
- Create: `src/engine/runtime/codex-capabilities.ts`
- Modify: `src/engine/runtime/manager.ts`
- Test: `src/engine/runtime/codex-capabilities.test.ts`

**Output Standard:**
- 支持 `ROGUENT_CODEX_PATH` override。
- 能检测 `codex --version`。
- 能检测 `codex app-server` 是否可启动并输出可解析握手。
- 检测失败产生 degraded capability status，不让整个 engine 崩溃。

**Acceptance Standard:**
- `bun test src/engine/runtime/codex-capabilities.test.ts` exit code 0。
- 本机 smoke command `codex --version` 或 configured path 结果写入 evidence；若不存在，状态为 blocked/degraded。

- [ ] Implement probe result:
  ```ts
  export interface CodexCapabilities {
    cliPath?: string;
    version?: string;
    appServer: "available" | "unavailable";
    execJson: "available" | "unavailable";
    reason?: string;
  }
  ```
- [ ] Add fake spawn tests for available/unavailable cases.
- [ ] Run:
  ```bash
  bun test src/engine/runtime/codex-capabilities.test.ts
  ```
- [ ] Record local smoke:
  ```bash
  codex --version
  ```

---

### Task 10: Implement Codex App-Server Client

**Feature:** 通过 Codex app-server/SDK 获得 thread、turn、stream、approval、tool execution 的实时事件。

**Files:**
- Create: `src/engine/runtime/codex-app-server.ts`
- Create: `src/engine/runtime/codex-protocol.ts`
- Test: `src/engine/runtime/codex-app-server.test.ts`

**Output Standard:**
- app-server 进程由 adapter 启停。
- JSON-RPC request/response 有 request id、timeout、close handling。
- stdout/stderr 日志经过 sanitizer。
- app-server 不可用时返回明确 capability error。

**Acceptance Standard:**
- `bun test src/engine/runtime/codex-app-server.test.ts` exit code 0。
- fake app-server fixture 能完成 create thread、send user message、receive assistant delta、interrupt。

- [ ] Define protocol boundary:
  ```ts
  interface CodexTransport {
    request<T>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
    onNotification(handler: (message: CodexNotification) => void): () => void;
    close(): Promise<void>;
  }
  ```
- [ ] Implement line-delimited JSON transport with tests.
- [ ] Add fake server test:
  ```ts
  test("client maps assistant delta notifications", async () => {
    const fake = new FakeCodexServer();
    const client = await CodexAppServerClient.start({ spawn: fake.spawn });
    const events = collect(client);
    await client.send("hello");
    expect(events.some((e) => e.kind === "assistant.delta")).toBe(true);
  });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/runtime/codex-app-server.test.ts
  ```

---

### Task 11: Implement Codex Event Normalization

**Feature:** 将 Codex thread/turn/item/tool/approval/subagent 事件归一化为 Roguent `RoomEvent`。

**Files:**
- Create: `src/engine/runtime/codex-normalize.ts`
- Modify: `src/engine/normalize.ts`
- Test: `src/engine/runtime/codex-normalize.test.ts`
- Fixture: `fixtures/runtime/codex-chat.jsonl`

**Output Standard:**
- 支持 assistant text delta/final、thinking、command/tool start/end、approval prompt、error、usage/context。
- Codex event raw payload 只进入 audit，不直接进入前端。
- 归一化后聊天窗口和房间小人使用同一 event stream。

**Acceptance Standard:**
- `bun test src/engine/runtime/codex-normalize.test.ts` exit code 0。
- fixture replay 产生 deterministic seq/type snapshot。

- [ ] Add fixture with at least these records:
  ```json
  {"kind":"thread.created","threadId":"t1"}
  {"kind":"turn.started","turnId":"turn1"}
  {"kind":"assistant.delta","text":"I can help"}
  {"kind":"tool.started","toolName":"shell","callId":"tool1"}
  {"kind":"tool.finished","callId":"tool1","exitCode":0}
  {"kind":"turn.finished","usage":{"inputTokens":10,"outputTokens":20}}
  ```
- [ ] Add snapshot test that resulting event types are (注:协议是 `tool.ended`,**不是** `tool.finished`;后者只是 Codex 原始 kind,见上方 fixture):
  ```text
  session.created
  message.delta
  tool.started
  tool.ended
  usage.updated
  ```
- [ ] Run:
  ```bash
  bun test src/engine/runtime/codex-normalize.test.ts
  ```

---

### Task 12: Add Codex Exec JSON Fallback

**Feature:** 当 app-server 不可用时，以明确 degraded 模式使用 `codex exec --json` 完成单 turn 交互。

**Files:**
- Create: `src/engine/runtime/codex-exec-fallback.ts`
- Modify: `src/engine/runtime/manager.ts`
- Test: `src/engine/runtime/codex-exec-fallback.test.ts`

**Output Standard:**
- fallback 明确标记 `runtime.status` 为 degraded。
- 支持 send、interrupt、end 的最小行为。
- 不把 fallback 说成 realtime；聊天 UI 显示 batch mode tag。

**Acceptance Standard:**
- `bun test src/engine/runtime/codex-exec-fallback.test.ts` exit code 0。
- fake `codex exec --json` 输出能转成 assistant message 和 usage。

- [ ] Implement adapter signature:
  ```ts
  export class CodexExecFallbackDriver implements RuntimeDriver {
    readonly mode = "exec-json";
  }
  ```
- [ ] Add fake spawn JSON output:
  ```json
  {"type":"assistant_message","text":"done"}
  ```
- [ ] Run:
  ```bash
  bun test src/engine/runtime/codex-exec-fallback.test.ts
  ```

---

### Task 13: Extend Store State For Runtime And Prototype Domains

**Feature:** 前端 store 能折叠 runtime、pairing、mailbox、scheduler、economy、settings 事件。

**Files:**
- Modify: `src/web/store.ts`
- Test: `src/web/store.test.ts`

**Output Standard:**
- Store 增加 `runtimeStatusBySession`、`connectorStatus`、`pairings`、`mailbox`、`scheduler`、`ledger`、`achievements`、`inventory`、`settings`。
- reducer 对未知 session event 不抛异常，按既有模式创建或忽略。
- session 首次出现才抢焦点，延迟 init 不抢焦点的现有约定不破坏。

**Acceptance Standard:**
- `bun test src/web/store.test.ts` exit code 0。
- `bunx tsc --noEmit` exit code 0。

- [ ] Add reducer test:
  ```ts
  test("pairing binding update overwrites by channel and external chat id", () => {
    const state = reduce(initialState(), bindingEvent("wechat", "chat-a", "s1"));
    const next = reduce(state, bindingEvent("wechat", "chat-a", "s2"));
    expect(next.pairings.byExternalKey["wechat:chat-a"]?.sessionId).toBe("s2");
  });
  ```
- [ ] Implement state slices without UI assumptions.
- [ ] Run:
  ```bash
  bun test src/web/store.test.ts
  bunx tsc --noEmit
  ```

---

### Task 14: Implement Typed WebSocket Commands

**Feature:** 前端发送 runtime、settings、pairing、scheduler、mailbox、economy commands 时有共享类型保护。

**Files:**
- Modify: `src/web/ws-client.ts`
- Modify: `src/engine/ws-gateway.ts`
- Create: `src/shared/commands.ts`
- Test: `src/shared/commands.test.ts`
- Test: `src/engine/ws-gateway.test.ts`

**Output Standard:**
- 所有命令集中在 `src/shared/commands.ts`。
- ws-gateway 解析失败返回 `session.error` 或 command error event。
- 前端不能发送未定义 command type。

**Acceptance Standard:**
- `bun test src/shared/commands.test.ts src/engine/ws-gateway.test.ts` exit code 0。

- [ ] Define command union:
  ```ts
  export type ClientCommand =
    | NewSessionCommand
    | SendMessageCommand
    | SetRuntimeConfigCommand
    | CreatePairingCommand
    | UpdatePairingCommand
    | SchedulerCommand
    | MailboxCommand
    | EconomyCommand;
  ```
- [ ] Add parser test:
  ```ts
  expect(parseClientCommand({ cmd: "unknown" }).ok).toBe(false);
  ```
- [ ] Run:
  ```bash
  bun test src/shared/commands.test.ts src/engine/ws-gateway.test.ts
  ```

---

### Task 15: Rebuild Chat Timeline Domain

**Feature:** 聊天窗口成为统一 timeline，可显示 Claude/Codex、IM inbound、tool、thinking、approval、question、scheduler trigger。

**Files:**
- Modify: `src/shared/domain.ts` — **timeline 类型已存在**(`TimelineItem` 联合 + message/thinking/tool/prompt item,见 [domain.ts:76-116](../../../src/shared/domain.ts));本 task **扩展**它(加 `TimelineSource`、`runtime`、delivery status),不要在新文件重建。
- Modify: `src/web/store.ts`
- Test: `src/web/store.chat.test.ts`

**Output Standard:**
- timeline item 有 stable id、kind、source、runtime、ts、status。
- IM inbound item 标记 channel/externalIdentity。
- agent outbound reply item 可关联 outbound delivery status。

**Acceptance Standard:**
- `bun test src/web/store.chat.test.ts` exit code 0。
- `bunx tsc --noEmit` exit code 0。

- [ ] Add timeline types:
  ```ts
  export type TimelineSource =
    | { kind: "desktop" }
    | { kind: "im"; channel: "wechat" | "feishu"; externalChatId: string; displayName?: string }
    | { kind: "scheduler"; taskId: string; runId: string }
    | { kind: "subscription"; channel: "github" | "x"; deliveryId: string };
  ```
- [ ] Add reducer tests for message delta merge and finalization.
- [ ] Run:
  ```bash
  bun test src/web/store.chat.test.ts
  bunx tsc --noEmit
  ```

---

### Task 16: Implement Chat Drawer Prototype Layout

**Feature:** 将 prototype 聊天窗口视觉与交互落地到 React 组件，但数据来自真实 store。

**Files:**(组件**扁平**在 `src/web/hud/`,无 `chat/` 子目录;已存在的一律 Modify。)
- Modify: `src/web/hud/ChatDrawer.tsx`
- Create: `src/web/hud/ChatHeader.tsx`
- Create: `src/web/hud/Timeline.tsx`(容器;行渲染复用现有 `TimelineItem.tsx`)
- Create: `src/web/hud/Composer.tsx`
- Create: `src/web/hud/RuntimeControls.tsx`
- Modify: `src/web/hud/MessageBubble.tsx`(已存在,commit `e427f0d`)
- Modify: `src/web/hud/ToolCard.tsx`(已存在)
- Modify: `src/web/hud/ThinkingBlock.tsx`(已存在;原型称 ThinkingCard,沿用现名)
- Modify: `src/web/hud/PromptCard.tsx`(已存在)
- Test: `src/web/hud/ChatDrawer.test.tsx`

**Output Standard:**
- 支持 runtime tag、model、permission、sandbox、reasoning effort 控件。
- 支持 markdown、code copy、thinking fold、tool fold、stop button、slash menu。
- 不使用 prototype 的静态 mock messages。

**Acceptance Standard:**
- `bun test src/web/hud/ChatDrawer.test.tsx` exit code 0。
- Playwright desktop screenshot 无文本重叠，artifact path 写入 evidence。

- [ ] Component split:
  ```tsx
  export function ChatDrawer({ sessionId }: { sessionId: string }) {
    return (
      <aside className="chat-drawer">
        <ChatHeader sessionId={sessionId} />
        <RuntimeControls sessionId={sessionId} />
        <Timeline sessionId={sessionId} />
        <Composer sessionId={sessionId} />
      </aside>
    );
  }
  ```
- [ ] Add test that a Codex session renders `Codex` runtime badge and reasoning effort control.
- [ ] Run:
  ```bash
  bun test src/web/hud/ChatDrawer.test.tsx
  ```

---

### Task 17: Implement Permission And AskUser Prompt Cards

**Feature:** 聊天窗口内权限审批与 AskUserQuestion 能双向完成，不止展示。**注:Claude 侧已实现**(commits `fd2b8f2` canUseTool/respondPermission、`9493259` 网关 respondPermission/respondQuestion/setPermissionMode、`55653d2` AskUserQuestion→prompt.requested、`f049c43` PromptCard;协议 `prompt.requested`/`prompt.resolved` 已存在)。本 task 是**扩展**:把同一管线接到 Codex approval,并复用现有 `PromptCard.tsx`。

**Files:**
- Modify: `src/engine/runtime/claude-driver.ts`(已有 canUseTool,迁移到 adapter 后保留)
- Modify: `src/engine/runtime/codex-app-server.ts`
- Modify: `src/engine/session.ts`
- Modify: `src/web/hud/PromptCard.tsx`(已存在,扁平路径)
- Test: `src/engine/session.prompt.test.ts`
- Test: `src/web/store.prompt.test.ts`

**Output Standard:**
- Claude `canUseTool` 与 Codex approval 都生成 `prompt.requested`。
- 用户点击批准/拒绝/选择答案后发 `respondPermission` 或 `respondQuestion`。
- prompt resolved 后 UI 变为 answered/dismissed(对齐 `PromptResolvedPayload.result: "answered" | "dismissed"`),重复点击不重复发送。

**Acceptance Standard:**
- `bun test src/engine/session.prompt.test.ts src/web/store.prompt.test.ts` exit code 0。
- Replay E2E 中权限卡可点击，agent 收到响应。

- [ ] Add backend test:
  ```ts
  test("respondPermission resolves pending runtime prompt once", async () => {
    const manager = createManagerWithFakeDriver();
    const promptId = await manager.fakeDriver.requestPermission("shell");
    await manager.respondPermission("s1", promptId, "allow");
    expect(manager.fakeDriver.resolutions).toEqual([{ promptId, decision: "allow" }]);
  });
  ```
- [ ] Add frontend test for disabled answered card.
- [ ] Run:
  ```bash
  bun test src/engine/session.prompt.test.ts src/web/store.prompt.test.ts
  ```

---

### Task 18: Implement Runtime Controls In Chat

**Feature:** 聊天窗口修改 model、permission mode、sandbox、reasoning effort、network access 时实际调用后端。

**Files:**
- Modify: `src/web/hud/RuntimeControls.tsx`
- Modify: `src/engine/session.ts`
- Modify: `src/engine/ws-gateway.ts`
- Test: `src/engine/session.runtime-config.test.ts`
- Test: `src/web/hud/RuntimeControls.test.tsx`

**Output Standard:**
- UI 控件与 runtime 类型匹配：Claude 不显示 Codex-only provider 控件；Codex 显示 reasoning effort。
- 修改成功产生 `runtime.config.updated`。
- 修改失败显示 session/runtime error。

**Acceptance Standard:**
- `bun test src/engine/session.runtime-config.test.ts src/web/hud/RuntimeControls.test.tsx` exit code 0。

- [ ] Add command:
  ```ts
  {
    "cmd": "setRuntimeConfig",
    "sessionId": "s1",
    "config": {
      "runtime": "codex",
      "model": "gpt-5",
      "permissionMode": "default",
      "approvalPolicy": "on-request",
      "sandboxMode": "workspace-write",
      "reasoningEffort": "high",
      "networkAccess": false
    }
  }
  ```
- [ ] Test fake driver receives `setReasoningEffort("high")`.
- [ ] Run:
  ```bash
  bun test src/engine/session.runtime-config.test.ts src/web/hud/RuntimeControls.test.tsx
  ```

---

### Task 19: Implement Chat Rollback And Interrupt Semantics

**Feature:** 停止、回滚、重发都有明确后端行为和 UI 状态。

**Files:**
- Modify: `src/shared/commands.ts`
- Modify: `src/engine/session.ts`
- Modify: `src/web/hud/Composer.tsx`
- Modify: `src/web/store.ts`
- Test: `src/engine/session.rollback.test.ts`
- Test: `src/web/store.rollback.test.ts`

**Output Standard:**
- `interrupt` 调用 runtime driver。
- `rollback` 只允许回滚到本地已知 checkpoint；不支持的 runtime 显示明确 error。
- `retryFrom` 复用同 session，追加 audit record。

**Acceptance Standard:**
- `bun test src/engine/session.rollback.test.ts src/web/store.rollback.test.ts` exit code 0。
- E2E replay 中 stop button 后 composer 重新可输入。

- [ ] Define commands:
  ```ts
  type InterruptCommand = { cmd: "interrupt"; sessionId: string };
  type RollbackCommand = { cmd: "rollback"; sessionId: string; checkpointId: string };
  type RetryFromCommand = { cmd: "retryFrom"; sessionId: string; timelineItemId: string };
  ```
- [ ] Run:
  ```bash
  bun test src/engine/session.rollback.test.ts src/web/store.rollback.test.ts
  ```

---

### Task 20: Implement Integration Event Router

**Feature:** 所有外部事件先进入 inbox/audit，再按规则路由到 session 和聊天窗口。

**Files:**
- Create: `src/engine/integrations/types.ts`
- Create: `src/engine/integrations/router.ts`
- Modify: `src/engine/session.ts`
- Test: `src/engine/integrations/router.test.ts`

**Output Standard:**
- IM 使用 pairing binding 精确路由。
- X/GitHub 写 Mailbox 和 Board，再发当前 selected session。
- 无当前 session 时自动创建 session，并把 sessionId 写回 inbox item。

**Acceptance Standard:**
- `bun test src/engine/integrations/router.test.ts` exit code 0。

- [ ] Define normalized event:
  ```ts
  export interface IntegrationEvent {
    id: string;
    channel: "wechat" | "feishu" | "github" | "x" | "relay";
    direction: "inbound" | "outbound";
    externalChatId?: string;
    deliveryId?: string;
    summary: string;
    bodyText?: string;
    receivedAt: number;
  }
  ```
- [ ] Add route tests for paired IM, current session subscription, auto-created subscription session.
- [ ] Run:
  ```bash
  bun test src/engine/integrations/router.test.ts
  ```

---

### Task 21: Implement Pairing Binding Overwrite Logic

**Feature:** WeChat/Feishu 单会话扫码配对；新绑定覆盖同平台同 external chat 的旧绑定。

**Files:**
- Create: `src/engine/integrations/pairing.ts`
- Modify: `src/engine/persistence/repositories.ts`
- Test: `src/engine/integrations/pairing.test.ts`

**Output Standard:**
- Binding key 为 `(channel, externalChatId)`。
- 覆盖旧绑定时写 audit record。
- forwardingEnabled 默认 true，可单独关闭。

**Acceptance Standard:**
- `bun test src/engine/integrations/pairing.test.ts` exit code 0。
- SQLite unique index 阻止重复 active binding。

- [ ] Add DB unique index:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pairing_external
  ON pairing_bindings(channel, external_chat_id);
  ```
- [ ] Add overwrite test:
  ```ts
  await service.bind({ channel: "wechat", externalChatId: "chat1", sessionId: "s1" });
  await service.bind({ channel: "wechat", externalChatId: "chat1", sessionId: "s2" });
  expect(await service.resolve("wechat", "chat1")).toMatchObject({ sessionId: "s2" });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/pairing.test.ts
  ```

---

### Task 22: Implement Pairing Panel UI

**Feature:** 会话内打开 Pairing 面板，显示 WeChat/Feishu tab、QR、状态、当前绑定、转发开关、解绑。

**Files:**
- Create: `src/web/hud/pairing/PairingPanel.tsx`
- Create: `src/web/hud/pairing/PairingQr.tsx`
- Create: `src/web/hud/pairing/BindingList.tsx`
- Modify: `src/web/App.tsx`
- Test: `src/web/hud/pairing/PairingPanel.test.tsx`

**Output Standard:**
- 当前 session 的 QR 状态和 binding 状态来自 store。
- 扫码成功后显示 external display name、last inbound/outbound。
- unpair 和 forwarding toggle 发真实 WS command。

**Acceptance Standard:**
- `bun test src/web/hud/pairing/PairingPanel.test.tsx` exit code 0。
- Playwright screenshot artifact 显示两个 tab 且没有文本溢出。

- [ ] Component API:
  ```tsx
  export function PairingPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
    return <section role="dialog" aria-label="Pairing" />;
  }
  ```
- [ ] Add UI test that toggling forwarding sends `updatePairing` command.
- [ ] Run:
  ```bash
  bun test src/web/hud/pairing/PairingPanel.test.tsx
  ```

---

### Task 23: Implement WeChat Connector Interface And Fake Connector

**Feature:** 在接入真实 `@wechatbot/wechatbot` 前，建立可测试的 WeChat connector contract。

**Files:**
- Create: `src/engine/integrations/wechat-types.ts`
- Create: `src/engine/integrations/wechat-fake.ts`
- Modify: `src/engine/integrations/manager.ts`
- Test: `src/engine/integrations/wechat-fake.test.ts`

**Output Standard:**
- Fake connector 支持 emit QR、scan confirmed、inbound message、outbound reply ack、expired。
- IntegrationManager 能把 fake inbound 路由到 paired session。
- Fake 产生的事件与真实 connector 使用同一 interface。

**Acceptance Standard:**
- `bun test src/engine/integrations/wechat-fake.test.ts` exit code 0。

- [ ] Define interface:
  ```ts
  export interface ImConnector {
    startPairing(sessionId: string): Promise<PairingQrState>;
    stopPairing(sessionId: string): Promise<void>;
    sendMessage(target: OutboundImTarget, text: string): Promise<OutboundDeliveryResult>;
    onEvent(handler: (event: IntegrationEvent) => void): () => void;
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/wechat-fake.test.ts
  ```

---

### Task 24: Implement WeChat Bun Connector

**Feature:** 使用 `@wechatbot/wechatbot` 在 Bun 中直接启动 QR 配对、收消息、回复消息。

**Files:**
- Create: `src/engine/integrations/wechat.ts`
- Modify: `package.json`
- Test: `src/engine/integrations/wechat.test.ts`
- Fixture: `fixtures/integrations/wechat-inbound.json`

**Output Standard:**
- Bun-first connector 使用 docs 的 QR pairing 和 long polling。
- inbound message 映射 `externalChatId/bodyText/displayName/contextToken`。
- outbound reply 使用 SDK `reply()` 以保留上下文。
- Bun 不兼容时返回 typed error，交给 Node 22 host。

**Acceptance Standard:**
- `bun test src/engine/integrations/wechat.test.ts` exit code 0 with mocked SDK。
- Real smoke script 能显示 QR 或记录 blocker；blocker 不阻塞其他 tasks。

- [ ] Add dependency:
  ```bash
  bun add @wechatbot/wechatbot
  ```
- [ ] Adapter shape:
  ```ts
  export class WeChatConnector implements ImConnector {
    constructor(private readonly deps: WeChatDeps) {}
  }
  ```
- [ ] Add mocked SDK test for reply context token.
- [ ] Run:
  ```bash
  bun test src/engine/integrations/wechat.test.ts
  ```
- [ ] Real smoke command:
  ```bash
  bun run scripts/smoke-wechat-pairing.ts
  ```

---

### Task 25: Implement WeChat Node 22 Fallback Host

**Feature:** 若 Bun 直接跑 SDK 不可用，通过 Node 22 child process 保持同一 connector contract。

**Files:**
- Create: `src/engine/integrations/wechat-node-host.ts`
- Create: `src/engine/integrations/wechat-node-host.mjs`
- Create: `scripts/smoke-wechat-node-host.ts`
- Test: `src/engine/integrations/wechat-node-host.test.ts`

**Output Standard:**
- Host 通过 newline JSON 与 Bun engine 通信。
- 启动前检测 Node major >= 22。
- Host crash 会发 `integration.status` error，并允许重启。

**Acceptance Standard:**
- `bun test src/engine/integrations/wechat-node-host.test.ts` exit code 0。
- `node --version` evidence 记录 major version；若小于 22，记录 blocker。

- [ ] Define host messages:
  ```ts
  type WeChatHostRequest =
    | { id: string; type: "startPairing"; sessionId: string }
    | { id: string; type: "sendMessage"; externalChatId: string; text: string };
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/wechat-node-host.test.ts
  node --version
  ```

---

### Task 26: Implement Feishu/Lark Connector Interface And Fake Connector

**Feature:** 为飞书长连接 bot 建立和 WeChat 一致的 IM connector behavior。

**Files:**
- Create: `src/engine/integrations/feishu-types.ts`
- Create: `src/engine/integrations/feishu-fake.ts`
- Test: `src/engine/integrations/feishu-fake.test.ts`

**Output Standard:**
- Fake connector 支持 private chat 和 group chat。
- Feishu message_id、chat_id、sender_id 都进入 sanitized metadata。
- Outbound reply 与 inbound event 可关联。

**Acceptance Standard:**
- `bun test src/engine/integrations/feishu-fake.test.ts` exit code 0。

- [ ] Define normalized metadata:
  ```ts
  export interface FeishuMessageMeta {
    messageId: string;
    chatId: string;
    senderId: string;
    chatType: "p2p" | "group";
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/feishu-fake.test.ts
  ```

---

### Task 27: Implement Feishu/Lark Long-Connection Connector

**Feature:** 使用官方长连接接收 Feishu/Lark 消息并回复，避免常规本地开发依赖公网 callback。

**Files:**
- Create: `src/engine/integrations/feishu.ts`
- Modify: `src/engine/secrets/keychain.ts`
- Test: `src/engine/integrations/feishu.test.ts`
- Fixture: `fixtures/integrations/feishu-inbound.json`

**Output Standard:**
- App ID、App Secret 存 SecretStore。
- Long-connection receive 产生 normalized inbound event。
- Reply API 发送 agent 回复。
- 未配置凭证时 UI/engine 显示 configuration-required，不显示假成功。

**Acceptance Standard:**
- `bun test src/engine/integrations/feishu.test.ts` exit code 0 with mocked Feishu SDK。
- Real smoke 若缺少 app entitlement，记录 blocker 和截图/日志 artifact。

- [ ] Add connector config:
  ```ts
  export interface FeishuConnectorConfig {
    appIdSecretRef: string;
    appSecretRef: string;
    botName?: string;
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/feishu.test.ts
  ```
- [ ] Real smoke command:
  ```bash
  bun run scripts/smoke-feishu-long-connection.ts
  ```

---

### Task 28: Implement Outbound IM Reply Routing From Agent Messages

**Feature:** Agent 回复不仅显示在 Roguent，也要按 binding 的 forwardingEnabled 发回 WeChat/Feishu。

**Files:**
- Modify: `src/engine/integrations/manager.ts`
- Modify: `src/engine/session.ts`
- Modify: `src/web/store.ts`
- Test: `src/engine/integrations/outbound-routing.test.ts`

**Output Standard:**
- 来自 IM 的 inbound user message 创建 timeline source。
- 同一 turn 的 assistant final message 触发 outbound reply。
- forwarding disabled 时只写 audit，不调用 connector。
- outbound 成功/失败都更新 timeline delivery status。

**Acceptance Standard:**
- `bun test src/engine/integrations/outbound-routing.test.ts` exit code 0。
- E2E fake IM flow 验证 inbound -> agent -> outbound reply。

- [ ] Add routing test:
  ```ts
  test("assistant reply is sent back to paired IM chat", async () => {
    const harness = createIntegrationHarness();
    await harness.bind("wechat", "chat1", "s1", { forwardingEnabled: true });
    await harness.receiveIm("wechat", "chat1", "fix tests");
    await harness.emitAssistantFinal("s1", "tests fixed");
    expect(harness.wechat.sent).toEqual([{ chatId: "chat1", text: "tests fixed" }]);
  });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/outbound-routing.test.ts
  ```

---

### Task 29: Implement Webhook Ingress Server

**Feature:** 本地 HTTP ingress 接收 GitHub/X/relay/Feishu webhook，执行 raw-body、signature、audit、normalize、route。

**Files:**
- Create: `src/engine/ingress/server.ts`
- Create: `src/engine/ingress/signatures.ts`
- Modify: `src/engine/server.ts`
- Test: `src/engine/ingress/server.test.ts`
- Test: `src/engine/ingress/signatures.test.ts`

**Output Standard:**
- Endpoints:
  - `GET /health`
  - `POST /webhooks/github`
  - `GET /webhooks/x`
  - `POST /webhooks/x`
  - `POST /webhooks/relay/:channel`
  - `POST /webhooks/feishu`
- Invalid signature rejects before JSON parsing business fields。
- Audit 记录 validation result 和 payload hash。

**Acceptance Standard:**
- `bun test src/engine/ingress/server.test.ts src/engine/ingress/signatures.test.ts` exit code 0。

- [ ] Implement GitHub HMAC helper:
  ```ts
  export function verifyGitHubSignature(rawBody: Uint8Array, secret: string, header: string): boolean {
    const expected = `sha256=${hmacSha256Hex(secret, rawBody)}`;
    return timingSafeEqualText(expected, header);
  }
  ```
- [ ] Add invalid signature test expecting HTTP 401.
- [ ] Run:
  ```bash
  bun test src/engine/ingress/server.test.ts src/engine/ingress/signatures.test.ts
  ```

---

### Task 30: Implement GitHub Subscription Connector

**Feature:** GitHub webhook 注册、签名验证、push/pull_request/check/workflow 事件归一化到 Mailbox/Board/session。

**Files:**
- Create: `src/engine/integrations/github.ts`
- Modify: `src/engine/ingress/server.ts`
- Test: `src/engine/integrations/github.test.ts`
- Fixture: `fixtures/integrations/github-push.json`
- Fixture: `fixtures/integrations/github-workflow.json`

**Output Standard:**
- Webhook secret 存 SecretStore。
- GitHub delivery id 写 audit。
- Push、pull_request、workflow_run、check_suite 至少有 summary 和 source URL。
- 无 GitHub token 时保留手动 webhook mode。

**Acceptance Standard:**
- `bun test src/engine/integrations/github.test.ts` exit code 0。
- Local fixture replay creates inbox item and routes to session。

- [ ] Normalize push:
  ```ts
  expect(normalizeGitHubEvent("push", fixture)).toMatchObject({
    channel: "github",
    summary: expect.stringContaining("push"),
  });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/github.test.ts
  ```

---

### Task 31: Implement X Subscription Connector

**Feature:** X CRC challenge、webhook POST、entitlement/config status、normalized X event routing。

**Files:**
- Create: `src/engine/integrations/x.ts`
- Modify: `src/engine/ingress/signatures.ts`
- Test: `src/engine/integrations/x.test.ts`
- Fixture: `fixtures/integrations/x-crc.json`
- Fixture: `fixtures/integrations/x-post.json`

**Output Standard:**
- GET CRC 返回 HMAC-SHA256 response token。
- POST event 经过 signature/token 校验后 normalize。
- 权限或账号不可用时 connector status 为 blocked，记录原因。

**Acceptance Standard:**
- `bun test src/engine/integrations/x.test.ts` exit code 0。
- Real browser/API setup 若遇手机号验证、cookie 过期、付费 entitlement 缺失，记录 blocker。

- [ ] Add CRC test:
  ```ts
  const response = buildXChallengeResponse("crc-token", "consumer-secret");
  expect(response.response_token).toStartWith("sha256=");
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/x.test.ts
  ```

---

### Task 32: Implement Relay Connector And Local Tunnel Status

**Feature:** 支持开发本地 tunnel 和生产 relay 的统一 forwarding pipeline。

**Files:**
- Create: `src/engine/integrations/relay.ts`
- Modify: `src/engine/ingress/server.ts`
- Create: `src/web/hud/settings/RelaySettings.tsx`
- Test: `src/engine/integrations/relay.test.ts`

**Output Standard:**
- Relay token 存 SecretStore。
- Relay forwarded request 仍走 signature validation。
- UI 显示 relay connected/disconnected/blocked。

**Acceptance Standard:**
- `bun test src/engine/integrations/relay.test.ts` exit code 0。
- Local fake relay E2E 能转发 GitHub fixture。

- [ ] Add relay payload:
  ```ts
  interface RelayEnvelope {
    channel: "github" | "x" | "feishu";
    headers: Record<string, string>;
    rawBodyBase64: string;
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/integrations/relay.test.ts
  ```

---

### Task 33: Implement Mailbox And Board Persistence

**Feature:** X/GitHub/IM/ask/scheduler/runtime alerts 都进入 Mailbox，并汇总到 lobby Board。

**Files:**
- Modify: `src/engine/persistence/repositories.ts`
- Create: `src/engine/mailbox/service.ts`
- Modify: `src/web/store.ts`
- Test: `src/engine/mailbox/service.test.ts`
- Test: `src/web/store.mailbox.test.ts`

**Output Standard:**
- Inbox item 有 source、summary、severity、status、sourceUrl、routedSessionId、createdAt。
- Board 只展示今日关键事件和未读 alert。
- 点击 resend 会创建 session input 并记录 audit。

**Acceptance Standard:**
- `bun test src/engine/mailbox/service.test.ts src/web/store.mailbox.test.ts` exit code 0。

- [ ] Define inbox item:
  ```ts
  export interface InboxItem {
    id: string;
    source: "wechat" | "feishu" | "github" | "x" | "scheduler" | "runtime";
    summary: string;
    status: "unread" | "read" | "archived";
    routedSessionId?: string;
    sourceUrl?: string;
    createdAt: number;
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/mailbox/service.test.ts src/web/store.mailbox.test.ts
  ```

---

### Task 34: Implement Mailbox And Board UI

**Feature:** 原型邮箱、公告板、活动弹窗使用真实 inbox/board 数据。

**Files:**
- Create: `src/web/hud/mailbox/MailboxPanel.tsx`
- Create: `src/web/hud/mailbox/BoardPanel.tsx`
- Create: `src/web/hud/mailbox/InboxItemRow.tsx`
- Modify: `src/web/lobby/LobbyView.tsx`
- Test: `src/web/hud/mailbox/MailboxPanel.test.tsx`

**Output Standard:**
- 支持 filter：all、IM、GitHub、X、scheduler、runtime。
- 支持 open source、open session、resend、mark read、archive。
- 未配置的外部平台显示 configuration state，不显示样例消息。

**Acceptance Standard:**
- `bun test src/web/hud/mailbox/MailboxPanel.test.tsx` exit code 0。
- Playwright screenshot artifact 覆盖空状态和有数据状态。

- [ ] Add UI test for archive command:
  ```tsx
  await user.click(screen.getByRole("button", { name: "Archive" }));
  expect(sendCommand).toHaveBeenCalledWith({ cmd: "mailbox", action: "archive", itemId: "i1" });
  ```
- [ ] Run:
  ```bash
  bun test src/web/hud/mailbox/MailboxPanel.test.tsx
  ```

---

### Task 35: Implement Scheduler Domain And Recurrence

**Feature:** 定时任务定义支持 once/daily/weekly/monthly，能确定下次运行时间。

**Files:**
- Create: `src/shared/scheduler.ts`
- Create: `src/engine/scheduler/next-run.ts`
- Test: `src/engine/scheduler/next-run.test.ts`

**Output Standard:**
- Recurrence calculation deterministic，输入 now/timezone/definition 输出 nextRunAt。
- Disabled task 不产生 nextRunAt。
- Past one-time task 不再运行。

**Acceptance Standard:**
- `bun test src/engine/scheduler/next-run.test.ts` exit code 0。

- [ ] Define recurrence:
  ```ts
  export type Recurrence =
    | { kind: "once"; runAt: number }
    | { kind: "daily"; hour: number; minute: number; timezone: string }
    | { kind: "weekly"; daysOfWeek: number[]; hour: number; minute: number; timezone: string }
    | { kind: "monthly"; dayOfMonth: number; hour: number; minute: number; timezone: string };
  ```
- [ ] Add tests across DST-independent fixed timestamps.
- [ ] Run:
  ```bash
  bun test src/engine/scheduler/next-run.test.ts
  ```

---

### Task 36: Implement Scheduler Service CRUD

**Feature:** 创建、编辑、删除、启停、run-now 定时任务，任务创建时选择 runtime 权限模式。

**Files:**
- Create: `src/engine/scheduler/service.ts`
- Modify: `src/engine/ws-gateway.ts`
- Modify: `src/engine/persistence/repositories.ts`
- Test: `src/engine/scheduler/service.test.ts`

**Output Standard:**
- Task definition 包含 prompt、cwd、runtime、model、reasoningEffort、permissionMode、sandboxMode、networkAccess、targetSession。
- permission mode 在创建时保存，runner 不再二次询问。
- 所有 CRUD 写 audit。

**Acceptance Standard:**
- `bun test src/engine/scheduler/service.test.ts` exit code 0。

- [ ] Define command:
  ```ts
  type SchedulerCreateCommand = {
    cmd: "scheduler";
    action: "createTask";
    task: SchedulerTaskDraft;
  };
  ```
- [ ] Add test asserting `permissionMode: "bypassPermissions"` is persisted.
- [ ] Run:
  ```bash
  bun test src/engine/scheduler/service.test.ts
  ```

---

### Task 37: Implement Scheduler Runner

**Feature:** 到点自动创建或恢复 Claude/Codex session，按配置发送 prompt，并记录 run result。

**Files:**
- Create: `src/engine/scheduler/runner.ts`
- Modify: `src/engine/session.ts`
- Modify: `src/engine/server.ts`
- Test: `src/engine/scheduler/runner.test.ts`

**Output Standard:**
- Runner 支持 due scan、lock、防重复运行、run history。
- Run start/finish/error 都广播 `scheduler.run.*`。
- 自动运行使用 task 保存的 permission mode 和 sandbox mode。

**Acceptance Standard:**
- `bun test src/engine/scheduler/runner.test.ts` exit code 0。
- Fake runtime runner E2E 证明 prompt 已进入目标 session。

- [ ] Add test:
  ```ts
  test("due task starts codex session with stored permissions", async () => {
    const harness = createSchedulerHarness();
    await harness.createTask({ runtime: "codex", permissionMode: "bypassPermissions", prompt: "ship it" });
    await harness.runner.tick(harness.now.plusMinutes(1));
    expect(harness.fakeRuntime.created[0]?.permissionMode).toBe("bypassPermissions");
  });
  ```
- [ ] Run:
  ```bash
  bun test src/engine/scheduler/runner.test.ts
  ```

---

### Task 38: Implement Scheduler UI

**Feature:** SessionGrid 的 Scheduled Tasks mode 成为真实 CRUD 和 run history 面板。

**Files:**
- Create: `src/web/hud/scheduler/SchedulerPanel.tsx`
- Create: `src/web/hud/scheduler/ScheduleForm.tsx`
- Create: `src/web/hud/scheduler/ScheduleList.tsx`
- Create: `src/web/hud/scheduler/RunHistory.tsx`
- Modify: `src/web/store.ts`
- Test: `src/web/hud/scheduler/SchedulerPanel.test.tsx`

**Output Standard:**
- 表单包含 runtime、model、effort、permission、sandbox、network、cwd、prompt、recurrence、target。
- 创建后列表显示 next run、last run、enabled/status。
- run now 发真实 command。

**Acceptance Standard:**
- `bun test src/web/hud/scheduler/SchedulerPanel.test.tsx` exit code 0。
- Playwright screenshot artifact 覆盖新建表单和列表。

- [ ] Add form submit test:
  ```tsx
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(sendCommand).toHaveBeenCalledWith(expect.objectContaining({ cmd: "scheduler", action: "createTask" }));
  ```
- [ ] Run:
  ```bash
  bun test src/web/hud/scheduler/SchedulerPanel.test.tsx
  ```

---

### Task 39: Implement Settings Persistence And Runtime Tabs

**Feature:** 设置面板中的 Claude、Codex、IM、GitHub、X、relay 配置落地到 engine，并使用 SecretStore 保存敏感字段。

**Files:**(现有 `hud/Settings.tsx` 是整面板 mock,本 task 接真——扩展它做入口,新增运行时页签子组件**扁平**放 `hud/`。)
- Create: `src/engine/settings/service.ts`
- Modify: `src/web/hud/Settings.tsx`(已存在;作设置面板入口,不要新建 `settings/SettingsPanel.tsx`)
- Create: `src/web/hud/ClaudeSettings.tsx`
- Create: `src/web/hud/CodexSettings.tsx`
- Create: `src/web/hud/IntegrationSettings.tsx`
- Test: `src/engine/settings/service.test.ts`
- Test: `src/web/hud/Settings.test.tsx`

**Output Standard:**
- 明文设置入 SQLite，敏感值入 SecretStore，SQLite 只存 `secretRef`。
- 保存设置广播 `settings.updated`。
- Codex 设置包含 model/provider/reasoning/sandbox/approval/network/MCP config profile。

**Acceptance Standard:**
- `bun test src/engine/settings/service.test.ts src/web/hud/Settings.test.tsx` exit code 0。
- Test DB 查询不到 secret 明文。

- [ ] Add no-plaintext test:
  ```ts
  expect(readRawDbText(testDb)).not.toContain("github-secret-value");
  ```
- [ ] Run:
  ```bash
  bun test src/engine/settings/service.test.ts src/web/hud/Settings.test.tsx
  ```

---

### Task 40: Implement Login Gate And Hero Selection

**Feature:** 原型 login/start gate 和 hero selection 进入真实 app state，不替代系统登录。

**Files:**
- Modify: `src/web/App.tsx`
- Create: `src/web/lobby/LoginGate.tsx`
- Create: `src/web/lobby/HeroSelect.tsx`
- Modify: `src/web/store.ts`
- Test: `src/web/lobby/LoginGate.test.tsx`

**Output Standard:**
- 首次打开显示 start gate，选择 hero 后进入 lobby。
- hero selection 保存到 local app settings。
- 不阻止后端连接和 replay setup。

**Acceptance Standard:**
- `bun test src/web/lobby/LoginGate.test.tsx` exit code 0。
- Playwright mobile/desktop screenshot artifact 覆盖 first viewport。

- [ ] Add test:
  ```tsx
  await user.click(screen.getByRole("button", { name: /Start/i }));
  await user.click(screen.getByRole("button", { name: /Orc/i }));
  expect(screen.getByTestId("lobby-view")).toBeVisible();
  ```
- [ ] Run:
  ```bash
  bun test src/web/lobby/LoginGate.test.tsx
  ```

---

### Task 41: Implement Lobby Structures From Prototype

**Feature:** Lobby 中的 task console、settings altar、achievements、mailbox、leaderboard、announcement board、shop、gacha、Claude/Codex doors 都可交互。

**Files:**
- Create: `src/web/lobby/LobbyView.tsx`
- Create: `src/web/lobby/HubStructure.tsx`
- Create: `src/web/lobby/RuntimeDoor.tsx`
- Create: `src/web/lobby/AnnouncementBoard.tsx`
- Modify: `src/web/App.tsx`
- Test: `src/web/lobby/LobbyView.test.tsx`

**Output Standard:**
- 每个 structure 有 icon、hover/focus state、keyboard activation、对应 modal。
- Claude/Codex door 创建对应 runtime session。
- 未配置功能显示真实 config state。

**Acceptance Standard:**
- `bun test src/web/lobby/LobbyView.test.tsx` exit code 0。
- Playwright screenshot artifact 显示 lobby without overlap at desktop and mobile widths。

- [ ] Add test that clicking Codex door sends `newSession` with `runtime: "codex"`。
- [ ] Run:
  ```bash
  bun test src/web/lobby/LobbyView.test.tsx
  ```

---

### Task 42: Implement Interior Room Art Scene Optimization

**Feature:** 将原型中的地牢房间、美术氛围、ambient controls、任务窗、roster、minimap、hotbar 优化到现有 Pixi/React 场景。

**Files:**(已有 `room/Lights.tsx`、`room/Particles.tsx`、`hud/Minimap.tsx`、`room/layout.ts`/`layout.test.ts`——复用/扩展,不要重建或撞名。)
- Modify: `src/web/room/Room.tsx`
- Modify: `src/web/room/Character.tsx`
- Modify: `src/web/hud/Hud.tsx`
- Modify: `src/web/room/Lights.tsx`、`src/web/room/Particles.tsx`(glow/particles 已存在,扩为 ambience toggles 数据源)
- Create: `src/web/room/AmbienceLayer.tsx`(若现有 Lights/Particles 不够再加;否则合并进它们)
- Create: `src/web/room/DecorLayer.tsx`
- Modify: `src/web/hud/Minimap.tsx`(已存在;勿在 `room/` 重建)
- Modify: `src/web/room/layout.ts` + Test: `src/web/room/layout.test.ts`(已存在;扩展,勿新建 `room-layout.test.ts` 撞名)

**Output Standard:**
- 场景在 1920x1080 fixed stage 和 responsive scaled container 中不重叠。
- Ambient toggles 控制 glow/rain/particles/sound state。
- 房间小人仍由真实 agent state 驱动。

**Acceptance Standard:**
- `bun test src/web/room/layout.test.ts` exit code 0。
- Playwright canvas pixel check 确认主要 canvas 非空。

- [ ] Add layout constants test(追加进现有 `layout.test.ts`):
  ```ts
  expect(ROOM_STAGE.width).toBe(1920);
  expect(ROOM_STAGE.height).toBe(1080);
  expect(HOTBAR_RECT.y + HOTBAR_RECT.height).toBeLessThanOrEqual(ROOM_STAGE.height);
  ```
- [ ] Run:
  ```bash
  bun test src/web/room/layout.test.ts
  ```

---

### Task 43: Implement Economy Ledger

**Feature:** gems/coins/skins/items 通过 append-only ledger 更新，不由 UI 直接改余额。

**Files:**
- Create: `src/shared/economy.ts`
- Create: `src/engine/economy/ledger.ts`
- Modify: `src/web/store.ts`
- Test: `src/engine/economy/ledger.test.ts`
- Test: `src/web/store.economy.test.ts`

**Output Standard:**
- Ledger entry 包含 reason、amount、currency、source event id。
- Balance 通过 ledger reduce 得到。
- 负余额被拒绝，拒绝写 audit。

**Acceptance Standard:**
- `bun test src/engine/economy/ledger.test.ts src/web/store.economy.test.ts` exit code 0。

- [ ] Define ledger entry:
  ```ts
  export interface LedgerEntry {
    id: string;
    currency: "gem" | "coin";
    amount: number;
    reason: "achievement" | "scheduler" | "gacha" | "event";
    sourceId: string;
    createdAt: number;
  }
  ```
- [ ] Run:
  ```bash
  bun test src/engine/economy/ledger.test.ts src/web/store.economy.test.ts
  ```

---

### Task 44: Implement Achievements Engine

**Feature:** 成就由真实 event/audit/ledger/scheduler/runtime milestones 驱动。

**Files:**
- Create: `src/engine/economy/achievements.ts`
- Modify: `src/engine/economy/ledger.ts`
- Create: `src/web/hud/economy/AchievementsPanel.tsx`
- Test: `src/engine/economy/achievements.test.ts`
- Test: `src/web/hud/economy/AchievementsPanel.test.tsx`

**Output Standard:**
- Achievement definitions 在代码中 data-driven。
- Progress updates 通过 `achievement.updated` 广播。
- Claim reward 追加 ledger entry。

**Acceptance Standard:**
- `bun test src/engine/economy/achievements.test.ts src/web/hud/economy/AchievementsPanel.test.tsx` exit code 0。

- [ ] Add definition:
  ```ts
  export const ACHIEVEMENTS = [
    { id: "first-codex-session", metric: "runtime.session.created.codex", target: 1, reward: { currency: "gem", amount: 20 } },
  ] as const;
  ```
- [ ] Add test: creating first Codex session unlocks `first-codex-session`。
- [ ] Run:
  ```bash
  bun test src/engine/economy/achievements.test.ts src/web/hud/economy/AchievementsPanel.test.tsx
  ```

---

### Task 45: Implement Gacha, Shop, Inventory

**Feature:** 原型抽卡、商店和背包从真实 ledger/inventory 更新，结果可复现测试。

**Files:**(现有 `hud/Shop.tsx`、`hud/LootPanel.tsx`(背包)是 mock/真混合,接真而非另起。)
- Create: `src/engine/economy/gacha.ts`
- Create: `src/web/hud/economy/GachaPanel.tsx`
- Modify: `src/web/hud/Shop.tsx`(已存在整面板 mock;接真 ledger,不要新建 `economy/ShopPanel.tsx`)
- Modify: `src/web/hud/LootPanel.tsx`(已存在背包;接真 inventory,而非新建 `economy/InventoryPanel.tsx`)
- Test: `src/engine/economy/gacha.test.ts`
- Test: `src/web/hud/economy/GachaPanel.test.tsx`

**Output Standard:**
- Pull 扣除 currency，再追加 inventory。
- Seeded RNG test 固定结果。
- UI 显示缺少余额、抽取成功、重复物品转换。

**Acceptance Standard:**
- `bun test src/engine/economy/gacha.test.ts src/web/hud/economy/GachaPanel.test.tsx` exit code 0。

- [ ] Add seeded test:
  ```ts
  const result = pullGacha({ seed: "fixed-seed", pool: HERO_POOL, balance: 100 });
  expect(result.itemId).toBe("known-item-id");
  ```
- [ ] Run:
  ```bash
  bun test src/engine/economy/gacha.test.ts src/web/hud/economy/GachaPanel.test.tsx
  ```

---

### Task 46: Implement Easter Eggs And Event Announcements

**Feature:** 原型新增彩蛋、Konami/easter 状态、活动公告用真实 local state 和 event bus。

**Files:**
- Create: `src/web/easter/easter-store.ts`
- Create: `src/web/easter/KonamiListener.tsx`
- Create: `src/web/hud/mailbox/AnnouncementPopup.tsx`
- Modify: `src/web/App.tsx`
- Test: `src/web/easter/easter-store.test.ts`
- Test: `src/web/easter/KonamiListener.test.tsx`

**Output Standard:**
- Keyboard sequence 触发一次性彩蛋 event。
- 彩蛋可给 cosmetic 或 achievement progress，不影响 agent 执行结果。
- Announcements 从 settings/inbox/economy event 生成。

**Acceptance Standard:**
- `bun test src/web/easter/easter-store.test.ts src/web/easter/KonamiListener.test.tsx` exit code 0。

- [ ] Define non-agent side effect:
  ```ts
  export type EasterEffect = { kind: "cosmetic"; cosmeticId: string } | { kind: "achievementProgress"; achievementId: string };
  ```
- [ ] Run:
  ```bash
  bun test src/web/easter/easter-store.test.ts src/web/easter/KonamiListener.test.tsx
  ```

---

### Task 47: Add Replay Fixture Harness For Runtime And Integrations

**Feature:** 用 fixture 回放验证 Claude/Codex/IM/GitHub/X/scheduler，不烧额度。

**Files:**
- Create: `src/engine/replay/prototype-fixtures.ts`
- Modify: `src/engine/server.ts`
- Create: `fixtures/runtime/claude-chat.jsonl`
- Create: `fixtures/runtime/codex-chat.jsonl`
- Create: `fixtures/integrations/wechat-inbound.json`
- Create: `fixtures/integrations/feishu-inbound.json`
- Create: `fixtures/integrations/github-push.json`
- Create: `fixtures/integrations/x-post.json`
- Test: `src/engine/replay/prototype-fixtures.test.ts`

**Output Standard:**
- `bun run dev:engine -- --replay <fixture>` 能回放 runtime 和 integration fixtures。
- 每个 fixture 有 schema validation。
- Replay 模式禁用真实外部 connector 和真实 runtime spawn。

**Acceptance Standard:**
- `bun test src/engine/replay/prototype-fixtures.test.ts` exit code 0。
- `bun run dev:engine -- --replay fixtures/runtime/codex-chat.jsonl` 能启动并向 client 推送事件。

- [ ] Define fixture envelope:
  ```ts
  export type ReplayRecord =
    | { atMs: number; kind: "roomEvent"; event: RoomEvent }
    | { atMs: number; kind: "integrationEvent"; event: IntegrationEvent }
    | { atMs: number; kind: "runtimeDraft"; runtime: RuntimeKind; draft: RuntimeEventDraft };
  ```
- [ ] Run:
  ```bash
  bun test src/engine/replay/prototype-fixtures.test.ts
  ```

---

### Task 48: Add Playwright E2E Cases On The Task 0 Harness

**Feature:** 在 Task 0 已安装并配置好的 Playwright 基建上补浏览器端到端 case,验证聊天、配对、邮箱、定时任务、经济、场景视觉。不要在本 task 重复修改 `package.json` 的 `test:e2e` 脚本或重建 `playwright.config.ts`。

**Files:**
- Read: `playwright.config.ts` — Task 0 已创建;本 task 只按需扩展 project/use/webServer。
- Create: `tests/e2e/helpers.ts`
- Create: `tests/e2e/roguent.e2e.ts`
- Create: `tests/e2e/artifacts/.gitkeep`

**Output Standard:**
- 复用 Task 0 的 `test:e2e` script、Chromium 安装和 `playwright.config.ts`。
- E2E 启动 engine replay 和 Vite web。
- 每个 case 输出 screenshot 或 trace。
- Artifact 路径固定在 `tests/e2e/artifacts/<timestamp>/`。

**Acceptance Standard:**
- Precondition: Task 0 已通过,`bunx playwright --version` exit code 0。
- `bun run test:e2e -- --project=chromium` exit code 0 for replay subset。
- 报告中列出 passed/failed/skipped counts 和 artifact dir。

- [ ] Confirm Task 0 harness is available:
  ```bash
  bunx playwright --version
  test -f playwright.config.ts
  ```
- [ ] Add cases:
  ```ts
  test("codex replay chat shows assistant, tool, and runtime controls", async ({ page }) => {
    await openReplay(page, "fixtures/runtime/codex-chat.jsonl");
    await expect(page.getByText("Codex")).toBeVisible();
    await expect(page.getByText("shell")).toBeVisible();
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --project=chromium
  ```

---

### Task 49: E2E Case - Claude Chat Replay

**Feature:** 验证 Claude 聊天基本链路：创建 session、发送消息、assistant stream、tool card、permission prompt、interrupt。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/runtime/claude-chat.jsonl`

**Output Standard:**
- Case 只使用 replay fixture。
- 截图包含 ChatDrawer、Claude runtime badge、assistant message、tool card、prompt card。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "Claude chat replay"` exit code 0。
- Artifact dir 包含 screenshot 和 trace。

- [ ] Add test:
  ```ts
  test("Claude chat replay", async ({ page }) => {
    await openReplay(page, "fixtures/runtime/claude-chat.jsonl");
    await expect(page.getByTestId("runtime-badge")).toHaveText(/Claude/);
    await expect(page.getByTestId("timeline")).toContainText("assistant");
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "Claude chat replay"
  ```

---

### Task 50: E2E Case - Codex Chat Replay

**Feature:** 验证 Codex 聊天基本链路：Codex session、assistant delta、command/tool card、approval prompt、reasoning effort 控件。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/runtime/codex-chat.jsonl`

**Output Standard:**
- Case 只使用 replay fixture。
- UI 显示 Codex runtime badge 和 reasoning effort。
- 不声称真实 app-server 已验证。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "Codex chat replay"` exit code 0。
- Artifact dir 包含 screenshot 和 trace。

- [ ] Add test:
  ```ts
  test("Codex chat replay", async ({ page }) => {
    await openReplay(page, "fixtures/runtime/codex-chat.jsonl");
    await expect(page.getByTestId("runtime-badge")).toHaveText(/Codex/);
    await expect(page.getByLabel("Reasoning effort")).toBeVisible();
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "Codex chat replay"
  ```

---

### Task 51: E2E Case - WeChat Fake Pairing And Reply

**Feature:** 验证 WeChat 单会话扫码配对、inbound 路由、agent outbound reply 回 IM。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/integrations/wechat-inbound.json`

**Output Standard:**
- 使用 fake connector，不登录真实 WeChat。
- 绑定覆盖旧 session 的行为在 UI 和 audit 中可见。
- Forwarding disabled case 不发 outbound。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "WeChat fake pairing"` exit code 0。

- [ ] Add test:
  ```ts
  test("WeChat fake pairing", async ({ page }) => {
    await openReplay(page, "fixtures/integrations/wechat-inbound.json");
    await page.getByRole("button", { name: "Pairing" }).click();
    await expect(page.getByText("WeChat")).toBeVisible();
    await expect(page.getByText("bound")).toBeVisible();
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "WeChat fake pairing"
  ```

---

### Task 52: E2E Case - Feishu Fake Pairing And Reply

**Feature:** 验证 Feishu/Lark 配对、group/private inbound、agent outbound reply。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/integrations/feishu-inbound.json`

**Output Standard:**
- 使用 fake connector，不要求真实 Feishu app。
- UI 显示 chat type、sender display、forwarding status。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "Feishu fake pairing"` exit code 0。

- [ ] Add test:
  ```ts
  test("Feishu fake pairing", async ({ page }) => {
    await openReplay(page, "fixtures/integrations/feishu-inbound.json");
    await expect(page.getByText("Feishu")).toBeVisible();
    await expect(page.getByTestId("timeline")).toContainText("feishu");
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "Feishu fake pairing"
  ```

---

### Task 53: E2E Case - GitHub And X Subscription Routing

**Feature:** 验证 GitHub/X fixture 进入 Mailbox、Board、active session，无当前 session 时自动创建 session。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/integrations/github-push.json`
- Fixture: `fixtures/integrations/x-post.json`

**Output Standard:**
- Mailbox item 显示 source、summary、routed session。
- Board 显示今日相关事件。
- Auto-created session title 来自 source event。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "subscription routing"` exit code 0。

- [ ] Add tests for active session and no-session cases.
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "subscription routing"
  ```

---

### Task 54: E2E Case - Scheduler Automatic Runtime Run

**Feature:** 验证定时任务按创建时配置自动执行，不额外询问权限模式。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`
- Fixture: `fixtures/scheduler/daily-task.json`

**Output Standard:**
- Create task form 保存 runtime/model/permission/sandbox/prompt。
- Run now 创建 scheduler run，并发送 prompt 到 fake runtime。
- Run history 显示 start/finish。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "scheduler automatic run"` exit code 0。

- [ ] Add test:
  ```ts
  test("scheduler automatic run", async ({ page }) => {
    await openReplay(page, "fixtures/scheduler/daily-task.json");
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText("Finished")).toBeVisible();
  });
  ```
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "scheduler automatic run"
  ```

---

### Task 55: E2E Case - Lobby, Achievements, Gacha, Settings

**Feature:** 验证 prototype 游戏化面板不是静态图：入口可点、状态可变、store 和 backend 同步。

**Files:**
- Modify: `tests/e2e/roguent.e2e.ts`

**Output Standard:**
- Lobby first viewport 显示核心 structure。
- Achievement claim 改变 ledger。
- Gacha pull 改变 inventory。
- Settings save 更新 backend store。

**Acceptance Standard:**
- `bun run test:e2e -- --grep "prototype game panels"` exit code 0。
- Desktop and mobile screenshots 无重叠。

- [ ] Add test that opens each panel and asserts a real action button.
- [ ] Run:
  ```bash
  bun run test:e2e -- --grep "prototype game panels"
  ```

---

### Task 56: Real Smoke - Codex App-Server

**Feature:** 在本机真实 Codex 环境验证 app-server deep realtime 或记录明确 blocker。

**Files:**
- Create: `scripts/smoke-codex-app-server.ts`
- Create: `tests/e2e/artifacts/codex-smoke/.gitkeep`

**Output Standard:**
- Smoke 运行一个无破坏 prompt，例如读取当前目录文件列表。
- 记录 app-server available、version、events observed。
- 若 app-server blocked，尝试 `codex exec --json` fallback，并标记 degraded。

**Acceptance Standard:**
- `bun run scripts/smoke-codex-app-server.ts` exit code 0 表示 smoke completed；结果可能是 pass 或 blocked，但 blocked 必须有 reason。
- Artifact JSON 包含 `observedEvents`、`mode`、`blockers`。

- [ ] Implement smoke output:
  ```json
  {
    "target": "codex-app-server",
    "mode": "app-server",
    "status": "passed",
    "observedEvents": ["thread.created", "assistant.delta"],
    "blockers": []
  }
  ```
- [ ] Run:
  ```bash
  bun run scripts/smoke-codex-app-server.ts
  ```

---

### Task 57: Real Smoke - WeChat QR Pairing

**Feature:** 用用户允许的浏览器/扫码环境尝试真实 WeChat QR 配对；遇到账号或验证阻塞则记录并跳过。

**Files:**
- Create: `scripts/smoke-wechat-pairing.ts`
- Create: `tests/e2e/artifacts/wechat-smoke/.gitkeep`

**Output Standard:**
- Smoke 启动 QR，等待 scan/confirm/timeout。
- 成功时发送一条 inbound test message，并验证 outbound reply。
- 阻塞时记录 exact stage、error、screenshot/log artifact。

**Acceptance Standard:**
- `bun run scripts/smoke-wechat-pairing.ts` exit code 0 表示 smoke completed；pass/blocked 由 artifact 标明。

- [ ] Implement timeout as config:
  ```ts
  const PAIRING_TIMEOUT_MS = 120_000;
  ```
- [ ] Run:
  ```bash
  bun run scripts/smoke-wechat-pairing.ts
  ```

---

### Task 58: Real Smoke - Feishu/Lark Pairing

**Feature:** 尝试真实 Feishu/Lark app/bot 长连接或记录配置/权限 blocker。

**Files:**
- Create: `scripts/smoke-feishu-long-connection.ts`
- Create: `tests/e2e/artifacts/feishu-smoke/.gitkeep`

**Output Standard:**
- Smoke 检查 appId/appSecret secretRefs。
- 能启动 long connection 时验证 inbound event normalization。
- 缺少 app、权限或管理员审批时记录 blocker。

**Acceptance Standard:**
- `bun run scripts/smoke-feishu-long-connection.ts` exit code 0 表示 smoke completed；pass/blocked 由 artifact 标明。

- [ ] Run:
  ```bash
  bun run scripts/smoke-feishu-long-connection.ts
  ```

---

### Task 59: Real Smoke - GitHub Webhook

**Feature:** 尝试创建或手动验证 GitHub webhook delivery，确认签名和 routing。

**Files:**
- Create: `scripts/smoke-github-webhook.ts`
- Create: `tests/e2e/artifacts/github-smoke/.gitkeep`

**Output Standard:**
- 有 token 时尝试 create/update webhook。
- 无 token 时运行 local signed fixture POST。
- Artifact 记录 delivery id、HTTP status、inbox item id。

**Acceptance Standard:**
- `bun run scripts/smoke-github-webhook.ts` exit code 0 表示 smoke completed；pass/blocked 由 artifact 标明。

- [ ] Run:
  ```bash
  bun run scripts/smoke-github-webhook.ts
  ```

---

### Task 60: Real Smoke - X Webhook And CRC

**Feature:** 尝试 X webhook CRC 和 event receive；若账号 entitlement 不满足则记录 blocker。

**Files:**
- Create: `scripts/smoke-x-webhook.ts`
- Create: `tests/e2e/artifacts/x-smoke/.gitkeep`

**Output Standard:**
- CRC local test 必须通过。
- 真实 X API 配置失败时记录 entitlement、auth、phone verification 或 cookie blocker。
- 不使用 mock result 冒充真实 X subscription。

**Acceptance Standard:**
- `bun run scripts/smoke-x-webhook.ts` exit code 0 表示 smoke completed；pass/blocked 由 artifact 标明。

- [ ] Run:
  ```bash
  bun run scripts/smoke-x-webhook.ts
  ```

---

### Task 61: Add Product Verification Report Generator

**Feature:** 自动汇总所有单测、类型检查、lint、build、E2E、real smoke 的证据，避免口头过度声明。

**Files:**
- Create: `scripts/generate-verification-report.ts`
- Create: `docs/verification/.gitkeep`
- Modify: `package.json`
- Test: `scripts/generate-verification-report.test.ts`

**Output Standard:**
- 输入 artifact JSON 和 command logs，输出 markdown report。
- Report 按 scope 列出 executed/passed/failed/skipped/blocked/unverified。
- Report 明确区分 replay E2E 和 real external smoke。

**Acceptance Standard:**
- `bun test scripts/generate-verification-report.test.ts` exit code 0。
- `bun run verify:report` 生成 `docs/verification/<timestamp>-roguent-full-prototype.md`。

- [ ] Add script:
  ```json
  {
    "scripts": {
      "verify:report": "bun run scripts/generate-verification-report.ts"
    }
  }
  ```
- [ ] Run:
  ```bash
  bun test scripts/generate-verification-report.test.ts
  bun run verify:report
  ```

---

### Task 62: Full Static Verification Gate

**Feature:** 在代码层面对全量实现做最终静态验证。

**Files:**
- All modified source files.

**Output Standard:**
- 单测、lint/format、typecheck、build 全部执行。
- 每条命令记录 exit code 和 pass/fail count。
- 若某条失败，修复后重新运行整条命令。

**Acceptance Standard:**
- `bun test` exit code 0。
- `bun run check` exit code 0。
- `bunx tsc --noEmit` exit code 0。
- `bun run build` exit code 0。

- [ ] Run:
  ```bash
  bun test
  ```
- [ ] Run:
  ```bash
  bun run check
  ```
- [ ] Run:
  ```bash
  bunx tsc --noEmit
  ```
- [ ] Run:
  ```bash
  bun run build
  ```

---

### Task 63: Full Replay E2E Verification Gate

**Feature:** 对所有可离线验证的 prototype 功能跑 replay E2E，不烧额度。

**Files:**
- `tests/e2e/roguent.e2e.ts`
- `tests/e2e/artifacts/`
- `fixtures/`

**Output Standard:**
- 覆盖 Claude chat、Codex chat、WeChat fake、Feishu fake、GitHub/X subscriptions、scheduler、lobby/economy/settings。
- 每个 case 有 screenshot 或 trace。
- Report 不包含真实账号流程的通过声明。

**Acceptance Standard:**
- `bun run test:e2e -- --project=chromium` exit code 0。
- `docs/verification/<timestamp>-roguent-full-prototype.md` 更新 replay E2E pass count。

- [ ] Run:
  ```bash
  bun run test:e2e -- --project=chromium
  ```
- [ ] Generate report:
  ```bash
  bun run verify:report
  ```

---

### Task 64: External Smoke Verification Gate

**Feature:** 对真实外部平台执行允许范围内的 smoke，遇阻塞继续并汇总。

**Files:**
- `scripts/smoke-codex-app-server.ts`
- `scripts/smoke-wechat-pairing.ts`
- `scripts/smoke-feishu-long-connection.ts`
- `scripts/smoke-github-webhook.ts`
- `scripts/smoke-x-webhook.ts`
- `tests/e2e/artifacts/*-smoke/`
- `docs/verification/`

**Output Standard:**
- 每个 smoke 输出 structured artifact。
- Pass、blocked、skipped 明确区分。
- Cookie 过期、手机号验证、未注册、entitlement 缺失全部写入 blockers，不停止其他 smoke。

**Acceptance Standard:**
- 每个 smoke command exit code 0 表示脚本完成证据采集。
- Verification report 包含真实外部 smoke 的逐项状态。

- [ ] Run:
  ```bash
  bun run scripts/smoke-codex-app-server.ts
  bun run scripts/smoke-wechat-pairing.ts
  bun run scripts/smoke-feishu-long-connection.ts
  bun run scripts/smoke-github-webhook.ts
  bun run scripts/smoke-x-webhook.ts
  bun run verify:report
  ```

---

### Task 65: Tauri Desktop Verification

**Feature:** 确认 Tauri app sidecar、engine URL discovery、Codex/Claude runtime settings、local SQLite/Keychain 路径在桌面壳中可用。

**Files:**
- Modify if needed: `src-tauri/src/main.rs`
- Modify if needed: `src-tauri/tauri.conf.json`
- Modify if needed: `scripts/build-sidecar.ts`
- Modify if needed: `scripts/stage-cli.ts`
- Test: existing Tauri build scripts.

**Output Standard:**
- `bun run dev:app` 能启动桌面壳并连接 engine sidecar。
- `bun run build:app` 在 Apple Silicon 生成 `.app` 和 `.dmg`。
- SecretStore 在 app data path 下不泄露明文。

**Acceptance Standard:**
- `bun run dev:app` manual smoke documented with screenshot artifact。
- `bun run build:app` exit code 0 on Apple Silicon, or blocked with exact platform/toolchain reason。

- [ ] Run:
  ```bash
  bun run dev:app
  ```
- [ ] Run on Apple Silicon build host:
  ```bash
  bun run build:app
  ```

---

### Task 66: Update Documentation And ROADMAP

**Feature:** 将新架构、命令、配置、外部平台设置、验证边界写回项目文档。

**Files:**
- Modify: `docs/ROADMAP.md`
- Create: `docs/integrations/wechat.md`
- Create: `docs/integrations/feishu.md`
- Create: `docs/integrations/github.md`
- Create: `docs/integrations/x.md`
- Create: `docs/verification/README.md`
- Modify: `AGENTS.md` if reusable verification failure mode is discovered during implementation.

**Output Standard:**
- ROADMAP 反映已完成、blocked、remaining。
- Integration docs 明确 secret storage、local tunnel、real smoke command、blocker handling。
- Verification docs 明确 replay E2E 与真实外部 smoke 的区别。

**Acceptance Standard:**
- `bun run check` exit code 0。
- `rg "full E2E|all cases|main flow passed" docs AGENTS.md` 不出现未带证据的范围声明。

- [ ] Run:
  ```bash
  bun run check
  rg "full E2E|all cases|main flow passed" docs AGENTS.md
  ```

---

### Task 67: Final Evidence Package And Handoff

**Feature:** 完成实现后的最终交付必须给出证据包，而不是笼统成功描述。

**Files:**
- Read: `docs/verification/<timestamp>-roguent-full-prototype.md`
- Read: `git status --short`

**Output Standard:**
- Final response 包含每个 verification scope 的 exact command、exit code、passed/failed/skipped/blocked counts、artifact paths。
- 明确列出未验证范围和外部 blocker。
- 若有 unrelated dirty files，说明未触碰。

**Acceptance Standard:**
- `git status --short` exit code 0 或只显示用户已知未提交文件。
- Verification report 文件存在。

- [ ] Run:
  ```bash
  git status --short
  ls docs/verification
  ```
- [ ] Prepare final response with these sections:
  ```text
  Implemented:
  Verification Evidence:
  External Smoke Blockers:
  Unverified Remainder:
  Files:
  ```

---

## Cross-Task Acceptance Matrix

| Area | Required Evidence | Replay E2E | Real Smoke |
| --- | --- | --- | --- |
| Claude chat | Unit tests, `fixtures/runtime/claude-chat.jsonl`, screenshot/trace | Required | Optional no-quota smoke only |
| Codex chat | Unit tests, `fixtures/runtime/codex-chat.jsonl`, screenshot/trace | Required | Required app-server or blocked/degraded artifact |
| Permission/AskUser | Backend prompt tests, store tests, click E2E | Required | Covered by runtime smoke when available |
| WeChat pairing | Fake connector unit/E2E, binding overwrite test | Required | Required QR attempt or blocker artifact |
| Feishu pairing | Fake connector unit/E2E, group/private tests | Required | Required long-connection attempt or blocker artifact |
| GitHub subscription | Signature tests, fixture routing, mailbox E2E | Required | Required webhook smoke or local signed fixture |
| X subscription | CRC tests, fixture routing, mailbox E2E | Required | Required CRC/API attempt or entitlement blocker |
| Scheduler | Recurrence/service/runner tests, run-now E2E | Required | Not required |
| Economy/gacha | Ledger/achievement/gacha tests, UI E2E | Required | Not required |
| Scene/UI | Component tests, screenshots, canvas pixel check | Required | Not required |

## Implementation Notes

- Use `bun add` for dependencies and keep `bun.lock` as the only lockfile.
- Do not store secrets in fixtures, screenshots, logs, SQLite rows, or git.
- Do not claim product-wide completion until Tasks 62, 63, and 67 are done, and Task 64 has pass or blocker artifacts for each external platform.
- If a generated runner passes, describe it as that runner only. It is not evidence for real Claude/Codex/IM/account flows unless the corresponding real smoke ran.
- If Codex app-server API shape differs from assumptions, update `src/engine/runtime/codex-protocol.ts`, its tests, and this plan section before implementing dependent tasks.
- If WeChat Bun SDK fails due runtime incompatibility, implement Task 25 and keep Task 24 evidence as the reason for fallback.
- If any verification claim is challenged, respond first with exact command/workflow, exit code, counts, and artifact paths before additional explanation.
