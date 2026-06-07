---
title: Roguent full prototype integration design
date: 2026-06-07
status: approved-for-planning
source_prototype: Roguent-handoff.zip / roguent/project/Roguent.html
---

# Roguent Full Prototype Integration Design

## Context

The latest Claude Design handoff (`Roguent-handoff.zip`) is a full product prototype, not a small visual refresh. Its primary entry is `roguent/project/Roguent.html`, which imports a multi-panel React prototype: login/start gate, playable lobby, interior room, chat, pairing, mailbox, announcement board, scheduled tasks, achievements, gacha, settings, account, and runtime-specific surfaces.

Earlier Roguent work landed much of the Claude-only visual shell, but Codex was intentionally left as a visual placeholder. This design changes that: every prototype surface should become a real product capability unless an external platform account, entitlement, or verification step is blocked. Blocked external work must be skipped, logged, and summarized at the end; it must not stop unrelated implementation.

## Goals

- Implement the full `Roguent.html` prototype as production React/TypeScript code in the existing Roguent app.
- Make Claude and Codex first-class runtimes behind one session, chat, event, model, permission, and visualization system.
- Make the chat window the central real interaction surface for desktop and mobile remote development.
- Support single-session QR pairing for WeChat and Feishu/Lark; inbound IM messages enter the paired Roguent session and agent replies are sent back to the same IM chat.
- Support X and GitHub subscriptions as real external feeds, routed to Mailbox, Board, audit log, and the active session.
- Support real scheduled tasks that can automatically start Claude/Codex with the runtime, model, effort, sandbox, and permission mode chosen when the task is created.
- Make achievements, events, shop, gacha, and inventory data-driven from real local events and ledgers instead of static mock data.
- Use strict end-to-end verification. Every result claim must state the executed subset, command/workflow target, exit code, pass/fail/skip counts, and artifact paths.

## Non-Goals

- No fake success data for unconfigured external platforms.
- No long-term mock banners for prototype panels that now have a real domain model.
- No unsafe credential storage in git, fixtures, screenshots, or application logs.
- No claim of "full E2E", "all cases", or "main flow passed" unless every declared case in that scope actually ran and passed.

## Product Decisions

- Scope is full implementation of the prototype, not phased product trimming.
- Codex integration targets deep realtime behavior via Codex app-server or SDK, not a simple `codex exec` batch wrapper.
- `codex exec --json` may exist only as a degraded fallback when app-server is blocked.
- WeChat uses `@wechatbot/wechatbot` first inside Bun. If Bun compatibility fails, the same connector interface can run in a Node 22 child process.
- Feishu/Lark uses the official long-connection bot path where possible; this avoids a public callback URL for normal message receive.
- Webhooks support both local tunnel and production relay. Development and product paths share the same validation, normalization, audit, and replay logic.
- Pairing is per session. A QR shown inside one session binds the external chat identity to that session. If the same external identity scans another session QR, the new binding overwrites the old one.
- IM forwarding can be disabled per binding. When disabled, incoming messages still enter Roguent local audit, but agent replies are not pushed back to IM.
- Scheduled tasks may run fully automatically because the user selects permission mode and runtime settings at task creation time.
- Sensitive credentials go to macOS Keychain by default. SQLite stores only non-sensitive metadata and `secretRef` pointers.

## Architecture

The backend expands from the current `SessionManager + Driver + WsGateway` shape into five bounded modules.

### RuntimeManager

`RuntimeManager` owns all Claude and Codex sessions through a shared `RuntimeDriver` interface:

```ts
interface RuntimeDriver {
  start(): void;
  send(text: string): void;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: string): Promise<void>;
  setReasoningEffort?(effort: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
}
```

Claude keeps the existing Agent SDK driver, adapted behind this interface. Codex gets a new `CodexDriver` that talks to `codex app-server` or the Codex SDK. The driver maps Codex thread, turn, item, agent-message delta, command execution, approval, failure, interrupt, and subagent notifications into the same internal draft-event stream used by Claude.

`SessionManager` should become runtime-aware:

- `newSession` accepts `runtime: "claude" | "codex"`.
- Session metadata includes runtime, model, reasoning effort, permission mode, sandbox mode, cwd, project, and pairing state.
- The shared event envelope remains `{ seq, ts, sessionId, type, agentId?, payload }`.
- Runtime-specific raw events are stored in audit logs but normalized before they hit the frontend reducer.

### IntegrationManager

`IntegrationManager` owns external platform connectors and emits normalized `IntegrationEvent` records.

Connectors:

- `WeChatConnector`: QR login, session restore, long polling, inbound message, outbound reply/send, media download/upload, session expiration.
- `FeishuConnector`: app credential setup, long-connection event receive, inbound message, outbound text/card reply, group/private chat identity.
- `GitHubConnector`: webhook registration, ping, delivery receive, delivery redelivery lookup when available, push/pull_request/check/workflow events.
- `XConnector`: CRC validation, filtered stream webhook events, account activity events when entitlement permits.
- `RelayConnector`: persistent relay registration, token validation, delivery forwarding, reconnect and status reporting.

Connectors never mutate UI state directly. They write audit entries, update their own connection status, and pass normalized events to session routing.

### IngressServer And RelayClient

`IngressServer` exposes local HTTP endpoints for external webhooks and local relay forwarding. Every request follows this path:

1. Capture raw body and headers.
2. Validate platform signature or challenge.
3. Reject invalid signatures before parsing business payload.
4. Normalize into `IntegrationEvent`.
5. Persist audit record with source, delivery ID, validation result, payload hash, and sanitized payload summary.
6. Route to Mailbox, Board, and session input if configured.

Validation rules:

- GitHub validates `X-Hub-Signature-256` with HMAC SHA-256 and constant-time comparison.
- X handles GET CRC validation and POST event payloads.
- Feishu webhook mode validates platform token/encryption if webhook mode is used. Long-connection mode bypasses public ingress.
- Relay validates a local relay capability token before trusting forwarded payloads.

Development can expose the local ingress through `ngrok` or `cloudflared`. Product mode can use a long-lived relay, but it must reuse the same validation and audit pipeline.

### Scheduler

`Scheduler` owns scheduled task definitions and executions.

Definitions include:

- task name and prompt
- project/cwd
- runtime
- model
- reasoning effort
- permission mode
- sandbox mode
- recurrence: once, daily, weekly, monthly
- target: new session or existing session
- enabled flag

Executions create a `runId` and record start, completion, failure, skipped state, runtime, settings, transcript summary, artifacts, and outbound notifications. At execution time, Scheduler starts or resumes the configured runtime session and sends the configured prompt without additional confirmation.

### Persistence

Use SQLite for local product state and auditability:

- sessions and runtime metadata
- pairing bindings
- connector statuses
- inbox items
- announcement records
- webhook deliveries
- scheduler definitions and runs
- achievement progress
- gem ledger
- gacha inventory
- local fixture exports

Sensitive material is never stored in SQLite:

- platform app secrets
- webhook secrets
- relay tokens
- OAuth access/refresh tokens
- WeChat credential secrets when separable from SDK storage

Those values go to Keychain with stable `secretRef` identifiers. If a third-party SDK requires file storage, store that file under user data (`~/Library/Application Support/Roguent` or `~/.roguent`) with restrictive permissions and store any separately addressable secret in Keychain.

## Frontend Design

The React app keeps the existing fixed 1920x1080 stage and responsive stage scaling. Prototype UI is implemented as TypeScript components using existing store patterns, not copied as Babel globals.

### Shell, Lobby, And Interior

Implement the prototype shell:

- login/start gate with hero selection
- playable lobby structures: task console, settings altar, achievements, mailbox, leaderboard, announcement board, shop, gacha, Claude/Codex doors
- interior room with HUD, task window, roster, session banner, minimap, hotbar, ambience controls
- activity/update popups driven by real events and local state

All visual surfaces must have real empty/error/configuration states. If an integration is not configured, show that status plainly instead of sample content.

### Chat

Chat becomes the highest-priority product surface. It must support:

- real session timeline for Claude and Codex
- runtime tag and model display
- model, permission mode, sandbox, and reasoning effort controls
- team strip and agent status
- assistant markdown
- code block copy
- thinking blocks
- command/tool blocks
- permission prompts
- askuser multi-step selection prompts
- stop/interrupt
- rollback UI backed by a clearly defined session action
- quick replies only when they send real messages
- inbound IM messages marked with source and external identity
- outbound agent replies routed back to paired IM channel when forwarding is enabled

Current timeline items should be extended rather than replaced wholesale. Reducer logic remains the source of truth for event folding.

### Pairing

Pairing is opened from a session. It shows:

- WeChat and Feishu tabs
- QR or setup state
- scan/confirmed/expired/error status
- current binding for this session
- forwarding toggle
- last inbound and last outbound timestamps
- unpair action

Binding key:

```ts
{
  channel: "wechat" | "feishu",
  externalChatId: string,
  sessionId: string,
  forwardingEnabled: boolean
}
```

If `(channel, externalChatId)` already exists for another session, scanning a new QR overwrites it and records an audit entry.

### Mailbox And Board

Mailbox is the durable event inbox. Board is a summarized lobby view for today's relevant events.

Sources:

- X posts/activity
- GitHub repo and workflow events
- IM inbound/outbound messages
- askuser and permission prompts
- scheduler runs
- usage and runtime alerts

Routing defaults:

- IM events use their explicit pairing binding and always route to the paired session.
- X/GitHub events are written to Mailbox and Board, then sent to the current desktop-selected session at arrival time.
- If no current session exists, Roguent creates a new session titled from the source event using the default runtime/model settings, sends the event summary into that session, and records the auto-created session ID on the inbox item.
- Clicking an item can open the source, open the routed session, resend the item to a session, or trigger a configured agent action.

### Settings

Settings has runtime tabs:

- Claude: model defaults, permission mode, compaction thresholds, MCP/hooks/skills where available.
- Codex: model, provider, reasoning effort, sandbox mode, approval policy, network access, MCP servers, config profile.

Settings changes call backend commands. They are not UI-only state.

### Scheduler

SessionGrid includes a real Scheduled Tasks mode:

- create/edit/delete task
- enable/disable
- choose runtime, model, effort, permission, sandbox, project/cwd, session target, recurrence
- show next run, last run, status, and audit link
- manually run now

### Economy, Achievements, Activities, And Gacha

These are real local systems:

- Achievements evaluate against event logs and scheduler/runtime milestones.
- Gems are a ledger, not a number in component state.
- Gacha spends gems and writes inventory entries.
- Shop items unlock cosmetic state only.
- Activities are generated from announcements, updates, login streak, scheduler events, and current account state.

Cosmetic systems must not change agent behavior or development output.

## External Integrations

### WeChat

Use `@wechatbot/wechatbot` first in Bun:

- show QR via `loginCallbacks.onQrUrl`
- track scanned, confirmed, expired, restored, and session expired events
- persist credentials using the SDK storage path under Roguent user data
- use `onMessage` for inbound
- use `reply()` for replies to preserve `context_token`
- use `send()` only when a platform user ID is already known and valid

If Bun fails due to Node runtime requirements, run the same connector through a Node 22 child process with an IPC protocol. This fallback is a host change, not a product behavior change.

### Feishu / Lark

Use the official server SDK long-connection mode where possible:

- create or configure a self-built bot app
- subscribe to `im.message.receive_v1`
- receive private and group messages according to granted permissions
- send text/card replies back to the originating chat
- handle token refresh through SDK support

If app creation, permission grant, tenant approval, or QR flow is blocked, skip the real smoke for Feishu and record the blocking step.

### GitHub

Use GitHub App or PAT depending on available credentials:

- create/update repository webhooks for selected repos
- register ping, push, pull_request, check_suite/check_run, workflow_run
- validate signatures
- expose delivery audit and redelivery status where API permits

Events enter Mailbox/Board and the active session.

### X

Support X filtered stream webhooks and Account Activity where the account plan permits:

- public HTTPS URL via tunnel or relay
- CRC GET response
- POST event receive
- filter rule/link setup
- entitlement-aware status

If the account lacks required X API access, local CRC/signature tests still run, and real platform smoke is marked blocked with the plan/permission reason.

## Event Protocol

Add new event types carefully across `shared/events.ts`, `engine/normalize.ts` or connector normalizers, and `web/store.ts`.

Likely additions:

- `runtime.status.updated`
- `runtime.config.updated`
- `integration.status.updated`
- `integration.event.received`
- `pairing.updated`
- `mailbox.updated`
- `announcement.updated`
- `scheduler.task.updated`
- `scheduler.run.started`
- `scheduler.run.completed`
- `scheduler.run.failed`
- `economy.ledger.updated`
- `achievement.updated`
- `inventory.updated`

Not all UI state needs to be broadcast as room events. Account-wide and integration-wide state may use sibling messages, similar to current limits messages, if ordering against session events is not required.

## Verification Plan

Verification is a first-class feature of this work.

### Zero-Cost Automated Tests

- Unit tests for event normalization, reducers, scheduler next-run calculation, signature verification, pairing overwrite, Keychain secret reference behavior, ledger math, achievement rules, and gacha inventory.
- Fake connector tests for WeChat, Feishu, GitHub, X, and relay.
- Replay fixtures for Claude and Codex runtime event streams.
- Playwright UI tests for every prototype panel and main interaction path.

### Runtime Smoke Tests

- Claude: replay fixture plus one small real session message.
- Codex: fake app-server event fixture plus one real `codex app-server` or SDK smoke with a small prompt.
- Interrupt and permission flows must be verified either against real runtime or a fixture that is explicitly labeled as fixture-only evidence.

### External Platform Smoke Tests

- WeChat: scan QR, send phone message to paired session, receive agent reply in WeChat, disable forwarding and confirm no IM reply.
- Feishu: configure bot, send message, receive agent reply.
- GitHub: create webhook, ping, validate delivery, reject bad signature.
- X: CRC validation, event receive through tunnel/relay, or blocked entitlement report.
- Relay: forward signed payload, reject bad token, reconnect after outage.

### Scheduler Smoke Tests

- Fake clock coverage for once/daily/weekly/monthly next-run behavior.
- Real scheduled execution for one minimal Claude task and one minimal Codex task.
- Audit log assertion for runtime, permission, sandbox, prompt, result, and artifacts.

### Evidence Output

Every final verification report must include:

- exact command or workflow target
- exit code
- pass/fail/skip counts
- artifact paths
- external platform status
- blocked steps and reason
- explicit unverified remainder

Generated runners only prove their own runner. Broader product claims require all declared cases in that broader scope to have passed.

## Implementation Order

This is a full implementation, but work should proceed in dependency order:

1. Persistence, Keychain, audit log, fixture export/import.
2. Runtime driver abstraction, Claude adapter, Codex app-server/SDK driver.
3. Shared event protocol and store extensions.
4. Chat full implementation against real timeline.
5. Prototype UI full pass with real empty/config/error states.
6. Pairing backend and UI.
7. WeChat connector.
8. Feishu connector.
9. Ingress server, tunnel/relay support, GitHub connector.
10. X connector.
11. Scheduler.
12. Economy, achievements, activities, gacha, inventory.
13. Full E2E hardening and evidence report.

## Risks And Mitigations

- Codex app-server is experimental. Keep `CodexDriver` isolated and fixture-backed; use `codex exec --json` only as a temporary degraded path.
- `@wechatbot/wechatbot` targets Node.js >= 22. Try Bun first; if it fails, run the connector in a Node 22 child process with the same IPC interface.
- WeChat iLink is not the same as the official WeChat Open Platform. Treat it as a connector risk and surface session expiration or login failures clearly.
- Feishu app setup may require tenant permissions. Skip and record if the account cannot approve permissions.
- X webhook access may require paid or enterprise API entitlement. Run local CRC/signature coverage and mark real platform smoke blocked if entitlement is missing.
- Full-auto scheduler can modify files or send external messages. Every task must show runtime, cwd, sandbox, permission, prompt, and audit trail before and after execution.
- Credentials can leak through logs or fixtures. Sanitize raw payloads, never serialize secrets, and store only `secretRef` in persistent metadata.
- Large UI migration can destabilize existing working Claude flow. Preserve reducer contracts, add tests before replacing behavior, and keep replay fixtures current.

## Source Notes

- Codex app-server and SDK behavior: OpenAI Codex manual, sections "Codex App Server", "Codex SDK", and "Non-interactive mode" from `https://developers.openai.com/codex/codex-manual.md`.
- WeChat QR login, long polling, and `context_token`: `https://www.wechatbot.dev/zh/nodejs` and `https://www.wechatbot.dev/zh/protocol`.
- Feishu long connection and message receive: `https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case?lang=zh-CN` and `https://open.feishu.cn/document/server-docs/im-v1/message/events/receive?lang=zh-CN`.
- GitHub webhook creation and signature validation: `https://docs.github.com/en/rest/repos/webhooks` and `https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries`.
- X filtered stream webhooks and CRC/webhook requirements: `https://docs.x.com/x-api/webhooks/stream/quickstart` and `https://docs.x.com/x-api/webhooks/quickstart`.
