# Roguent MVP Implementation Plan

> 🗂 **历史记录(2026-06-05)**:本计划**已实现并合入 `main`**。下方 checkbox 当年未回勾,**不代表未完成**——勿当 backlog。当前现状与新待办见 [docs/ROADMAP.md](../../ROADMAP.md);本文保留作"当时怎么一步步做"的实现参考。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Roguent MVP — drive ONE Claude Code subscription session through the Agent SDK and visualize its subagents as little people working in a Soul-Knight-style PixiJS room, end-to-end.

**Architecture:** Three layers. A **Bun engine** drives Claude Code via the Agent SDK (streaming-input mode) and captures activity from both the message stream and in-process hooks. A **normalization layer** turns SDK messages + hook events into ordered `RoomEvent`s (keyed by `(sessionId, seq)`). A **React + PixiJS v8 web frontend** renders the room and a game-style icon HUD, consuming `RoomEvent`s over a WebSocket. A **record/replay** layer lets the whole UI be tested from recorded JSONL fixtures without spending Agent-SDK credit.

**Tech Stack:** Bun · TypeScript · Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) · `ws` · React 19 · PixiJS v8 · `@pixi/react` v8 · Zustand · Vite · Bun test.

**Source spec:** `docs/superpowers/specs/2026-06-04-roguent-design.md` (approved).

**Workflow:** Implement in a detached worktree (`git worktree add --detach .worktrees/<slug> main`), no branches; verify, then `git merge --no-ff <sha>` back to `main` and `git push origin main`. Conventional Commits (English title `type: emoji description`). Run relevant tests after every change.

---

## File Structure

Single Bun package. Shared TS types imported by both the engine (Bun runtime) and the web (Vite bundle). Co-located `*.test.ts` run by `bun test`.

```
Roguent/
├── package.json              # scripts: dev:engine, dev:web, test, build, check
├── tsconfig.json
├── biome.json                # lint/format
├── vite.config.ts            # web build/dev server, proxies WS to engine
├── index.html                # web entry
├── fixtures/
│   └── sample-run.jsonl       # recorded RoomEvents for replay tests/demo
└── src/
    ├── shared/                # imported by BOTH engine and web — no runtime deps
    │   ├── events.ts          # RoomEvent envelope + event payload types + type guards
    │   ├── domain.ts          # Session, Agent, ToolActivity, Loot, AgentStatus
    │   └── mapping.ts         # toolName→icon map, agentType→skin, pure helpers
    ├── engine/                # Bun backend
    │   ├── sequencer.ts       # monotonic (sessionId, seq) stamping — pure
    │   ├── normalize.ts       # SDK message + hook event → RoomEvent[] — pure
    │   ├── driver.ts          # Agent SDK streaming-input wrapper (1 session)
    │   ├── session.ts         # SessionManager: owns drivers, fans events to bus
    │   ├── record.ts          # append/replay JSONL of RoomEvents
    │   ├── ws-gateway.ts      # ws server: push events, receive commands
    │   └── server.ts          # entry: wire SessionManager + ws-gateway (bun run)
    └── web/                   # React + PixiJS frontend
        ├── main.tsx           # React root
        ├── App.tsx            # layout: <Room/> + <Hud/>
        ├── store.ts           # Zustand: sessions, agents, currentSessionId, reducers
        ├── ws-client.ts       # connect, apply RoomEvents to store, send commands
        ├── room/
        │   ├── Room.tsx       # <Application> + floor + portal + characters
        │   ├── Character.tsx  # one AnimatedSprite driven by Agent state
        │   └── Portal.tsx     # spawn portal visual
        └── hud/
            ├── Hud.tsx        # icon buttons overlay
            ├── ChatDrawer.tsx # 💬 multi-session drawer + per-session window + input
            ├── ModelPicker.tsx# 💎 model switch → setModel command
            └── SkillGrid.tsx  # 📜 skills from init.slash_commands → trigger command
```

**Responsibility boundaries:**
- `shared/` is the **contract**: pure types + pure maps, zero I/O, no SDK/Pixi imports. Both layers build against it. Locked first (Task 1) so engine and web never drift.
- `engine/normalize.ts` and `engine/sequencer.ts` are **pure functions** → fully unit-testable from fixtures, no SDK/network.
- `engine/driver.ts` is the only file that imports the Agent SDK; everything else is SDK-agnostic and testable by feeding it recorded SDK/hook payloads.
- `web/store.ts` is a **pure reducer** over `RoomEvent`s → unit-testable; PixiJS components only read store state.

---

## Tasks

> **Verified API versions (2026-06-04):** `@anthropic-ai/claude-agent-sdk@0.3.161` · `@pixi/react@^8.0.5` · `pixi.js@^8.2.6` · `pixi-filters@^6` · `@barvynkoa/particle-emitter@^5` (v8-compatible fork; the official `@pixi/particle-emitter` is pinned to Pixi v6/v7 and will NOT resolve on v8) · `react@^19`. Exact signatures used below are in **Appendix A**. Because the SDK is version-sensitive (spec §8.4), Task 6 includes a logging-hook step to dump the real hook JSON before trusting field names.

### Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `vite.config.ts`, `index.html`, `src/web/main.tsx`, `.gitignore`
- Test: `src/shared/_smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "roguent",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:engine": "bun run --watch src/engine/server.ts",
    "dev:web": "vite",
    "build": "vite build",
    "test": "bun test",
    "check": "biome check ."
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.3.161",
    "@barvynkoa/particle-emitter": "^5",
    "@pixi/react": "^8.0.5",
    "pixi.js": "^8.2.6",
    "pixi-filters": "^6",
    "react": "^19",
    "react-dom": "^19",
    "ws": "^8",
    "zustand": "^5"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/ws": "^8",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5.6",
    "vite": "^6"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun-types", "react", "react-dom"],
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `biome.json`, `vite.config.ts`, `index.html`, `.gitignore`**

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["dist", "node_modules"] },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 }
}
```

`vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

`index.html`:
```html
<!doctype html>
<html lang="zh">
  <head><meta charset="UTF-8" /><title>Roguent</title></head>
  <body style="margin:0;background:#0c1422">
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules/
dist/
*.log
.DS_Store
fixtures/*.local.jsonl
```

- [ ] **Step 4: Create `src/web/main.tsx` (placeholder so the build resolves)**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ color: "#cffcf7", fontFamily: "monospace", padding: 16 }}>Roguent — booting…</div>
  </StrictMode>,
);
```

- [ ] **Step 5: Create a smoke test `src/shared/_smoke.test.ts`**

```ts
import { expect, test } from "bun:test";

test("toolchain is alive", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: Install, lint, test**

Run: `bun install`
Expected: dependencies resolve (note: a peer-dep warning from `@barvynkoa/particle-emitter` is acceptable; it supports `pixi.js >=6 <9`).
Run: `bun run check`
Expected: biome reports no errors.
Run: `bun test`
Expected: `1 pass, 0 fail`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: 🧹 scaffold Roguent bun + vite + react project"
```

---

### Task 1: Shared domain types (`src/shared/domain.ts`)

**Files:**
- Create: `src/shared/domain.ts`
- Test: `src/shared/domain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID, createAgent, createSession } from "./domain";

test("createSession seeds an orchestrator agent and sane defaults", () => {
  const s = createSession({ id: "s1", title: "code-review", model: "claude-opus-4-8" });
  expect(s.status).toBe("idle");
  expect(s.agents[ORCHESTRATOR_ID]?.kind).toBe("orchestrator");
  expect(s.agents[ORCHESTRATOR_ID]?.status).toBe("idle");
  expect(s.loot).toEqual([]);
});

test("createAgent defaults to a spawning subagent", () => {
  const a = createAgent({ id: "ag-1", role: "researcher", skin: "mag" });
  expect(a.kind).toBe("subagent");
  expect(a.status).toBe("spawning");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/shared/domain.test.ts`
Expected: FAIL — `Cannot find module "./domain"`.

- [ ] **Step 3: Implement `src/shared/domain.ts`**

```ts
export type AgentKind = "orchestrator" | "subagent";
export type AgentStatus = "spawning" | "thinking" | "working" | "idle" | "done";
export type SessionStatus = "idle" | "busy" | "done" | "error";

export interface Agent {
  id: string; // agent_id; orchestrator uses ORCHESTRATOR_ID
  kind: AgentKind;
  role: string; // agentType or skill-derived
  status: AgentStatus;
  currentTool?: string; // toolName currently driving the head icon
  skin: string;
  parentId?: string;
}

export interface Loot {
  id: string;
  sessionId: string;
  kind: "file" | "diff" | "report" | "answer";
  label: string;
  sourceRef: string;
  t: number;
}

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  model: string;
  permissionMode: string;
  slashCommands: string[];
  agents: Record<string, Agent>;
  loot: Loot[];
  usage: { tokens: number; cost: number };
  createdAt: number;
}

export const ORCHESTRATOR_ID = "orchestrator";

export function createAgent(
  partial: Partial<Agent> & Pick<Agent, "id" | "role" | "skin">,
): Agent {
  return { kind: "subagent", status: "spawning", ...partial };
}

export function createSession(
  partial: Partial<Session> & Pick<Session, "id" | "title" | "model">,
): Session {
  return {
    status: "idle",
    permissionMode: "default",
    agents: {
      [ORCHESTRATOR_ID]: {
        id: ORCHESTRATOR_ID,
        kind: "orchestrator",
        role: "orchestrator",
        status: "idle",
        skin: "lead",
      },
    },
    loot: [],
    slashCommands: [],
    usage: { tokens: 0, cost: 0 },
    createdAt: 0,
    ...partial,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/shared/domain.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain.ts src/shared/domain.test.ts
git commit -m "feat: 🧩 add shared domain types + factories"
```

---

### Task 2: Shared event protocol (`src/shared/events.ts`)

**Files:**
- Create: `src/shared/events.ts`
- Test: `src/shared/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { type RoomEvent, isToolEvent } from "./events";

test("isToolEvent only matches tool.* events", () => {
  const base = { seq: 1, ts: 0, sessionId: "s1", payload: {} };
  expect(isToolEvent({ ...base, type: "tool.started" } as RoomEvent)).toBe(true);
  expect(isToolEvent({ ...base, type: "tool.failed" } as RoomEvent)).toBe(true);
  expect(isToolEvent({ ...base, type: "agent.spawned" } as RoomEvent)).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/shared/events.test.ts`
Expected: FAIL — `Cannot find module "./events"`.

- [ ] **Step 3: Implement `src/shared/events.ts`**

```ts
import type { Loot } from "./domain";

export type RoomEventType =
  | "session.created" | "session.updated" | "session.cleared" | "session.error"
  | "agent.spawned" | "agent.thinking" | "agent.idle" | "agent.done"
  | "tool.started" | "tool.ended" | "tool.failed"
  | "loot.dropped" | "message.delta" | "message.final" | "usage.updated";

export interface RoomEvent<T = unknown> {
  seq: number; // server-side monotonic order key
  ts: number;
  sessionId: string;
  type: RoomEventType;
  agentId?: string;
  payload: T;
}

// ── payload shapes ──
export interface SessionCreatedPayload { title: string; model: string; permissionMode: string; apiKeySource: string; slashCommands: string[]; }
export interface AgentSpawnedPayload { role: string; promptSummary: string; parentId: string; }
export interface ToolStartedPayload { toolName: string; inputSummary: string; toolUseId: string; }
export interface ToolEndedPayload { toolUseId: string; ok: boolean; }
export interface AgentDonePayload { stopReason: string; }
export interface LootPayload { kind: Loot["kind"]; label: string; sourceRef: string; }
export interface MessagePayload { text: string; }
export interface UsagePayload { tokens: number; cost: number; }

export function isToolEvent(e: RoomEvent): boolean {
  return e.type === "tool.started" || e.type === "tool.ended" || e.type === "tool.failed";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/shared/events.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/shared/events.ts src/shared/events.test.ts
git commit -m "feat: 🧩 add shared RoomEvent protocol types"
```

---

### Task 3: Shared mapping (`src/shared/mapping.ts`)

**Files:**
- Create: `src/shared/mapping.ts`
- Test: `src/shared/mapping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { agentTypeToSkin, toolNameToIcon } from "./mapping";

test("toolNameToIcon maps known tools, mcp, and unknown", () => {
  expect(toolNameToIcon("Read")).toBe("📖");
  expect(toolNameToIcon("Edit")).toBe("⌨️");
  expect(toolNameToIcon("Bash")).toBe("🧪");
  expect(toolNameToIcon("WebSearch")).toBe("🔍");
  expect(toolNameToIcon("Task")).toBe("🪄");
  expect(toolNameToIcon("mcp__github__create_pr")).toBe("🔌");
  expect(toolNameToIcon("SomethingNew")).toBe("⚡");
});

test("agentTypeToSkin is deterministic and within palette", () => {
  const a = agentTypeToSkin("researcher");
  expect(a).toBe(agentTypeToSkin("researcher"));
  expect(["cyan", "mag", "grn", "gold", "purple"]).toContain(a);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/shared/mapping.test.ts`
Expected: FAIL — `Cannot find module "./mapping"`.

- [ ] **Step 3: Implement `src/shared/mapping.ts`**

```ts
// tool_name → 头顶图标 (spec §6.2). Map is intentionally overridable.
export const TOOL_ICONS: Record<string, string> = {
  Read: "📖", Glob: "📖", Grep: "📖",
  Edit: "⌨️", Write: "⌨️", NotebookEdit: "⌨️",
  Bash: "🧪",
  WebSearch: "🔍", WebFetch: "🔍",
  Task: "🪄", Agent: "🪄",
  TodoWrite: "📋", TaskCreate: "📋",
};

export function toolNameToIcon(name: string): string {
  if (name.startsWith("mcp__")) return "🔌";
  return TOOL_ICONS[name] ?? "⚡";
}

export const SKINS = ["cyan", "mag", "grn", "gold", "purple"] as const;

export function agentTypeToSkin(agentType: string): string {
  let h = 0;
  for (const ch of agentType) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SKINS[h % SKINS.length] as string;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/shared/mapping.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/mapping.ts src/shared/mapping.test.ts
git commit -m "feat: 🧩 add tool→icon and agentType→skin mapping"
```

---

### Task 4: Sequencer (`src/engine/sequencer.ts`)

Stamps draft events with a per-session monotonic `seq` so the UI orders by `(sessionId, seq)` regardless of hook arrival order (spec §10).

**Files:**
- Create: `src/engine/sequencer.ts`
- Test: `src/engine/sequencer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { Sequencer } from "./sequencer";

test("seq is monotonic per session and independent across sessions", () => {
  const seq = new Sequencer();
  const a1 = seq.stamp("s1", "agent.spawned", {}, 100);
  const a2 = seq.stamp("s1", "tool.started", {}, 101);
  const b1 = seq.stamp("s2", "agent.spawned", {}, 102);
  expect(a1.seq).toBe(1);
  expect(a2.seq).toBe(2);
  expect(b1.seq).toBe(1);
  expect(a2.sessionId).toBe("s1");
  expect(a1.ts).toBe(100);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/sequencer.test.ts`
Expected: FAIL — `Cannot find module "./sequencer"`.

- [ ] **Step 3: Implement `src/engine/sequencer.ts`**

```ts
import type { RoomEvent, RoomEventType } from "../shared/events";

export class Sequencer {
  private counters = new Map<string, number>();

  stamp(
    sessionId: string,
    type: RoomEventType,
    payload: unknown,
    ts: number,
    agentId?: string,
  ): RoomEvent {
    const seq = (this.counters.get(sessionId) ?? 0) + 1;
    this.counters.set(sessionId, seq);
    return { seq, ts, sessionId, type, agentId, payload };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/engine/sequencer.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/engine/sequencer.ts src/engine/sequencer.test.ts
git commit -m "feat: 🧩 add per-session monotonic event sequencer"
```

---

### Task 5: Event normalizer (`src/engine/normalize.ts`)

The heart of the engine. Pure functions turning **hook inputs** (agent/tool timing) and **SDK messages** (session/text/usage) into draft `RoomEvent`s. Tool events come ONLY from hooks; the SDK stream feeds session/message/usage (no double-counting — spec §5). Structurally typed (decoupled from the SDK; validate the real JSON before trusting field names — spec §8.4).

**Files:**
- Create: `src/engine/normalize.ts`
- Test: `src/engine/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { normalizeHook, normalizeSdkMessage, summarizeToolInput } from "./normalize";

test("SubagentStart → agent.spawned tagged with agent_id", () => {
  const [e] = normalizeHook({ hook_event_name: "SubagentStart", agent_id: "ag-7", agent_type: "Explore", prompt: "find refs" });
  expect(e?.type).toBe("agent.spawned");
  expect(e?.agentId).toBe("ag-7");
  expect((e?.payload as { role: string }).role).toBe("Explore");
});

test("PreToolUse without agent_id attributes to orchestrator; PostToolUse → ended", () => {
  const [start] = normalizeHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "bun test" }, tool_use_id: "t1" });
  expect(start?.type).toBe("tool.started");
  expect(start?.agentId).toBe("orchestrator");
  expect((start?.payload as { toolName: string }).toolName).toBe("Bash");
  const [end] = normalizeHook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "t1" });
  expect(end?.type).toBe("tool.ended");
});

test("PostToolUseFailure → tool.failed", () => {
  const [e] = normalizeHook({ hook_event_name: "PostToolUseFailure", tool_use_id: "t1", agent_id: "ag-7" });
  expect(e?.type).toBe("tool.failed");
  expect(e?.agentId).toBe("ag-7");
});

test("unknown hook yields nothing", () => {
  expect(normalizeHook({ hook_event_name: "Notification" })).toEqual([]);
});

test("system init → session.created with apiKeySource; result → usage", () => {
  const [created] = normalizeSdkMessage({ type: "system", subtype: "init", apiKeySource: "oauth", slash_commands: ["/code-review"], model: "claude-opus-4-8" });
  expect(created?.type).toBe("session.created");
  expect((created?.payload as { apiKeySource: string }).apiKeySource).toBe("oauth");
  const [usage] = normalizeSdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.012, usage: { input_tokens: 100, output_tokens: 50 } });
  expect(usage?.type).toBe("usage.updated");
  expect((usage?.payload as { tokens: number }).tokens).toBe(150);
});

test("summarizeToolInput truncates and redacts to a single field", () => {
  expect(summarizeToolInput({ command: "echo hi" })).toBe("echo hi");
  expect(summarizeToolInput({ file_path: "a".repeat(100) }).endsWith("…")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/normalize.test.ts`
Expected: FAIL — `Cannot find module "./normalize"`.

- [ ] **Step 3: Implement `src/engine/normalize.ts`**

```ts
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEventType } from "../shared/events";

export interface DraftEvent {
  type: RoomEventType;
  payload: unknown;
  agentId?: string;
}

// Structural shapes — decoupled from the SDK. Validate real JSON before trusting (spec §8.4).
export interface HookLike {
  hook_event_name: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  prompt?: string;
  stop_reason?: string;
}

export interface SdkMessageLike {
  type: string; // 'system' | 'assistant' | 'result' | ...
  subtype?: string;
  session_id?: string;
  apiKeySource?: string;
  slash_commands?: string[];
  model?: string;
  permissionMode?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: Array<{ type: string; text?: string }> };
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function summarizeToolInput(input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const raw = s("command") ?? s("file_path") ?? s("pattern") ?? s("query") ?? s("path") ?? "";
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

export function normalizeHook(h: HookLike): DraftEvent[] {
  const agentId = h.agent_id ?? ORCHESTRATOR_ID;
  switch (h.hook_event_name) {
    case "SubagentStart":
      return [{ type: "agent.spawned", agentId: h.agent_id, payload: { role: h.agent_type ?? "agent", promptSummary: (h.prompt ?? "").slice(0, 80), parentId: ORCHESTRATOR_ID } }];
    case "SubagentStop":
      return [{ type: "agent.done", agentId: h.agent_id, payload: { stopReason: h.stop_reason ?? "normal" } }];
    case "PreToolUse":
      return [{ type: "tool.started", agentId, payload: { toolName: h.tool_name ?? "", inputSummary: summarizeToolInput(h.tool_input), toolUseId: h.tool_use_id ?? "" } }];
    case "PostToolUse":
      return [{ type: "tool.ended", agentId, payload: { toolUseId: h.tool_use_id ?? "", ok: true } }];
    case "PostToolUseFailure":
      return [{ type: "tool.failed", agentId, payload: { toolUseId: h.tool_use_id ?? "", ok: false } }];
    default:
      return [];
  }
}

export function normalizeSdkMessage(m: SdkMessageLike): DraftEvent[] {
  if (m.type === "system" && m.subtype === "init") {
    return [{ type: "session.created", payload: { title: "", model: m.model ?? "", permissionMode: m.permissionMode ?? "default", apiKeySource: m.apiKeySource ?? "", slashCommands: m.slash_commands ?? [] } }];
  }
  if (m.type === "assistant") {
    const text = (m.message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!text) return [];
    // parent_tool_use_id != null → from a subagent; MVP routes all text to the orchestrator's drawer chat.
    return [{ type: "message.delta", agentId: m.parent_tool_use_id ? undefined : ORCHESTRATOR_ID, payload: { text } }];
  }
  if (m.type === "result") {
    const tokens = (m.usage?.input_tokens ?? 0) + (m.usage?.output_tokens ?? 0);
    return [{ type: "usage.updated", payload: { tokens, cost: m.total_cost_usd ?? 0 } }];
  }
  return [];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/engine/normalize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/normalize.ts src/engine/normalize.test.ts
git commit -m "feat: 🧩 add pure hook+SDK→RoomEvent normalizer"
```

---

### Task 6: Record / replay (`src/engine/record.ts`)

Serialize `RoomEvent`s to JSONL and replay them — the basis for cost-free UI tests and the demo (spec §11).

**Files:**
- Create: `src/engine/record.ts`
- Test: `src/engine/record.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import { parseEvents, replay, serializeEvents } from "./record";

const sample: RoomEvent[] = [
  { seq: 1, ts: 100, sessionId: "s1", type: "agent.spawned", agentId: "ag-1", payload: { role: "coder" } },
  { seq: 2, ts: 150, sessionId: "s1", type: "tool.started", agentId: "ag-1", payload: { toolName: "Edit" } },
];

test("serialize → parse round-trips", () => {
  expect(parseEvents(serializeEvents(sample))).toEqual(sample);
});

test("replay emits events in order", () => {
  const got: RoomEvent[] = [];
  replay(sample, (e) => got.push(e));
  expect(got.map((e) => e.seq)).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/record.test.ts`
Expected: FAIL — `Cannot find module "./record"`.

- [ ] **Step 3: Implement `src/engine/record.ts`**

```ts
import type { RoomEvent } from "../shared/events";

export function serializeEvents(events: RoomEvent[]): string {
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

export function parseEvents(jsonl: string): RoomEvent[] {
  return jsonl
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RoomEvent);
}

// Synchronous, order-preserving replay (used by tests).
export function replay(events: RoomEvent[], emit: (e: RoomEvent) => void): void {
  for (const e of events) emit(e);
}

// Timed replay for the live demo: spaces events by their ts deltas (scaled).
export async function replayTimed(
  events: RoomEvent[],
  emit: (e: RoomEvent) => void,
  speed = 1,
): Promise<void> {
  let prev = events[0]?.ts ?? 0;
  for (const e of events) {
    const gap = Math.max(0, (e.ts - prev) / speed);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    prev = e.ts;
    emit(e);
  }
}

// File helpers (Bun runtime).
export async function loadFixture(path: string): Promise<RoomEvent[]> {
  return parseEvents(await Bun.file(path).text());
}

export async function appendEvent(path: string, e: RoomEvent): Promise<void> {
  const prev = (await Bun.file(path).exists()) ? await Bun.file(path).text() : "";
  await Bun.write(path, prev + JSON.stringify(e) + "\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/engine/record.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/record.ts src/engine/record.test.ts
git commit -m "feat: 🧩 add RoomEvent JSONL record/replay"
```

---

### Task 7: Agent SDK driver (`src/engine/driver.ts`)

Wraps one Agent SDK streaming-input session: pushes user turns, registers in-process observer hooks, iterates the message stream, and forwards draft events. Subscription auth = strip API-key env vars so the SDK falls back to OAuth (spec §8.1). Pure helpers are unit-tested; the live `query()` is smoke-tested in Task 14.

**Files:**
- Create: `src/engine/driver.ts`
- Test: `src/engine/driver.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers only)**

```ts
import { expect, test } from "bun:test";
import type { HookLike } from "./normalize";
import { buildHooks, stripSubscriptionEnv } from "./driver";

test("stripSubscriptionEnv removes API key + auth token, keeps the rest", () => {
  const out = stripSubscriptionEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_AUTH_TOKEN: "t" });
  expect(out.PATH).toBe("/bin");
  expect(out.ANTHROPIC_API_KEY).toBeUndefined();
  expect(out.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("buildHooks forwards hook input and returns a non-blocking {}", async () => {
  const seen: HookLike[] = [];
  const hooks = buildHooks((h) => seen.push(h));
  const cb = hooks?.PreToolUse?.[0]?.hooks[0];
  const out = await cb?.(
    { hook_event_name: "PreToolUse", tool_name: "Bash" } as never,
    "t1",
    { signal: new AbortController().signal },
  );
  expect(out).toEqual({});
  expect(seen[0]?.tool_name).toBe("Bash");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/driver.test.ts`
Expected: FAIL — `Cannot find module "./driver"`.

- [ ] **Step 3: Implement `src/engine/driver.ts`**

```ts
import { type Options, type Query, type SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk";
import { type DraftEvent, type HookLike, type SdkMessageLike, normalizeHook, normalizeSdkMessage } from "./normalize";

export function stripSubscriptionEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
  void ANTHROPIC_API_KEY;
  void ANTHROPIC_AUTH_TOKEN;
  return rest;
}

// Register passive observer hooks. Each returns {} immediately (never blocks the agent — spec §8.3/§10).
export function buildHooks(onHook: (h: HookLike) => void): Options["hooks"] {
  const observe = (i: unknown) => {
    onHook(i as HookLike);
    return Promise.resolve({});
  };
  return {
    PreToolUse: [{ matcher: "*", hooks: [observe] }],
    PostToolUse: [{ matcher: "*", hooks: [observe] }],
    PostToolUseFailure: [{ matcher: "*", hooks: [observe] }],
    SubagentStart: [{ hooks: [observe] }],
    SubagentStop: [{ hooks: [observe] }],
  };
}

export interface DriverCallbacks {
  onDraft: (drafts: DraftEvent[], ts: number) => void;
}

export interface IDriver {
  start(): void;
  send(text: string): void;
  setModel(model: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
}

export class Driver implements IDriver {
  private q: Query | null = null;
  private queue: SDKUserMessage[] = [];
  private resolveNext: (() => void) | null = null;
  private ended = false;

  constructor(
    private cb: DriverCallbacks,
    private model: string,
    private cwd: string,
  ) {}

  private async *userStream(): AsyncGenerator<SDKUserMessage> {
    while (!this.ended || this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((r) => {
        this.resolveNext = r;
      });
    }
  }

  start(): void {
    const onHook = (h: HookLike) => this.cb.onDraft(normalizeHook(h), Date.now());
    const options: Options = {
      model: this.model,
      permissionMode: "default",
      settingSources: ["user", "project"], // load CLAUDE.md + skills (spec §7.4)
      cwd: this.cwd,
      env: stripSubscriptionEnv({ ...process.env }),
      includePartialMessages: false,
      hooks: buildHooks(onHook),
    };
    this.q = query({ prompt: this.userStream(), options });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.q) return;
    try {
      for await (const msg of this.q) {
        const m = msg as unknown as SdkMessageLike;
        if (m.type === "system" && m.subtype === "init" && m.apiKeySource && m.apiKeySource !== "oauth") {
          console.warn(`[driver] apiKeySource=${m.apiKeySource} (expected 'oauth' for subscription)`);
        }
        this.cb.onDraft(normalizeSdkMessage(m), Date.now());
      }
    } catch (err) {
      this.cb.onDraft([{ type: "session.error", payload: { message: String(err) } }], Date.now());
    }
  }

  send(text: string): void {
    this.queue.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.resolveNext?.();
    this.resolveNext = null;
  }

  async setModel(model: string): Promise<void> {
    await this.q?.setModel(model);
  }

  async interrupt(): Promise<void> {
    await this.q?.interrupt();
  }

  end(): void {
    this.ended = true;
    this.resolveNext?.();
    this.resolveNext = null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/engine/driver.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/driver.ts src/engine/driver.test.ts
git commit -m "feat: 🧩 add Agent SDK streaming-input driver + observer hooks"
```

---

### Task 8: Session manager (`src/engine/session.ts`)

Owns drivers per session, stamps their draft events through the `Sequencer`, and fans `RoomEvent`s to subscribers. Driver creation is injected so it can be tested with a fake.

**Files:**
- Create: `src/engine/session.ts`
- Test: `src/engine/session.test.ts`

- [ ] **Step 1: Write the failing test (with a fake driver)**

```ts
import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import type { DriverCallbacks, IDriver } from "./driver";
import { SessionManager } from "./session";

function fakeDriverFactory(captured: { cb?: DriverCallbacks }) {
  return (cb: DriverCallbacks): IDriver => {
    captured.cb = cb;
    return { start() {}, send() {}, async setModel() {}, async interrupt() {}, end() {} };
  };
}

test("createSession wires a driver; drafts become sequenced RoomEvents", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeDriverFactory(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });
  captured.cb?.onDraft([{ type: "agent.spawned", agentId: "ag-1", payload: { role: "coder" } }], 100);

  expect(got).toHaveLength(1);
  expect(got[0]?.seq).toBe(1);
  expect(got[0]?.sessionId).toBe("s1");
  expect(got[0]?.agentId).toBe("ag-1");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/session.test.ts`
Expected: FAIL — `Cannot find module "./session"`.

- [ ] **Step 3: Implement `src/engine/session.ts`**

```ts
import type { RoomEvent } from "../shared/events";
import { Driver, type DriverCallbacks, type IDriver } from "./driver";
import { Sequencer } from "./sequencer";

export type DriverFactory = (cb: DriverCallbacks, model: string, cwd: string) => IDriver;
export type EventSink = (e: RoomEvent) => void;

const defaultFactory: DriverFactory = (cb, model, cwd) => new Driver(cb, model, cwd);

export class SessionManager {
  private seq = new Sequencer();
  private drivers = new Map<string, IDriver>();
  private sinks = new Set<EventSink>();

  constructor(
    private driverFactory: DriverFactory = defaultFactory,
    private cwd: string = process.cwd(),
  ) {}

  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  private emit(e: RoomEvent): void {
    for (const sink of this.sinks) sink(e);
  }

  createSession(id: string, opts: { title: string; model: string }): void {
    const cb: DriverCallbacks = {
      onDraft: (drafts, ts) => {
        for (const d of drafts) {
          this.emit(this.seq.stamp(id, d.type, d.payload, ts, d.agentId));
        }
      },
    };
    const driver = this.driverFactory(cb, opts.model, this.cwd);
    this.drivers.set(id, driver);
    driver.start();
  }

  sendMessage(id: string, text: string): void {
    this.drivers.get(id)?.send(text);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.drivers.get(id)?.setModel(model);
  }

  async interrupt(id: string): Promise<void> {
    await this.drivers.get(id)?.interrupt();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/engine/session.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/engine/session.ts src/engine/session.test.ts
git commit -m "feat: 🧩 add SessionManager fanning sequenced RoomEvents"
```

---

### Task 9: WebSocket gateway + server entry (`src/engine/ws-gateway.ts`, `src/engine/server.ts`)

Pushes `RoomEvent`s to web clients and parses inbound commands. `server.ts` wires it together and supports `--replay <fixture>` to drive the room from a JSONL fixture instead of a live (credit-spending) session.

**Files:**
- Create: `src/engine/ws-gateway.ts`, `src/engine/server.ts`
- Test: `src/engine/ws-gateway.test.ts`

- [ ] **Step 1: Write the failing test (pure command parsing)**

```ts
import { expect, test } from "bun:test";
import { parseCommand } from "./ws-gateway";

test("parseCommand accepts known commands and rejects junk", () => {
  expect(parseCommand('{"cmd":"sendMessage","sessionId":"s1","text":"hi"}')).toEqual({ cmd: "sendMessage", sessionId: "s1", text: "hi" });
  expect(parseCommand('{"cmd":"setModel","sessionId":"s1","model":"claude-opus-4-8"}')?.cmd).toBe("setModel");
  expect(parseCommand("not json")).toBeNull();
  expect(parseCommand('{"cmd":"explode"}')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/engine/ws-gateway.test.ts`
Expected: FAIL — `Cannot find module "./ws-gateway"`.

- [ ] **Step 3: Implement `src/engine/ws-gateway.ts`**

```ts
import { WebSocketServer, type WebSocket } from "ws";
import type { RoomEvent } from "../shared/events";
import type { SessionManager } from "./session";

export type Command =
  | { cmd: "newSession"; sessionId: string; title: string; model: string }
  | { cmd: "sendMessage"; sessionId: string; text: string }
  | { cmd: "setModel"; sessionId: string; model: string }
  | { cmd: "interrupt"; sessionId: string };

export function parseCommand(raw: string): Command | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  switch (o.cmd) {
    case "newSession":
      return typeof o.sessionId === "string" && typeof o.title === "string" && typeof o.model === "string" ? (o as Command) : null;
    case "sendMessage":
      return typeof o.sessionId === "string" && typeof o.text === "string" ? (o as Command) : null;
    case "setModel":
      return typeof o.sessionId === "string" && typeof o.model === "string" ? (o as Command) : null;
    case "interrupt":
      return typeof o.sessionId === "string" ? (o as Command) : null;
    default:
      return null;
  }
}

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number, private mgr: SessionManager) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("message", (data) => this.onCommand(String(data)));
      ws.on("close", () => this.clients.delete(ws));
    });
    mgr.subscribe((e) => this.broadcast(e));
  }

  broadcast(e: RoomEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  private onCommand(raw: string): void {
    const c = parseCommand(raw);
    if (!c) return;
    if (c.cmd === "newSession") this.mgr.createSession(c.sessionId, { title: c.title, model: c.model });
    else if (c.cmd === "sendMessage") this.mgr.sendMessage(c.sessionId, c.text);
    else if (c.cmd === "setModel") void this.mgr.setModel(c.sessionId, c.model);
    else if (c.cmd === "interrupt") void this.mgr.interrupt(c.sessionId);
  }
}
```

- [ ] **Step 4: Implement `src/engine/server.ts`**

```ts
import { WebSocketServer } from "ws";
import { loadFixture, replayTimed } from "./record";
import { SessionManager } from "./session";
import { WsGateway } from "./ws-gateway";

const PORT = Number(process.env.ROGUENT_PORT ?? 8787);
const replayArg = process.argv.indexOf("--replay");

if (replayArg !== -1) {
  // Cost-free demo: replay a fixture to every client, ignore commands.
  const fixture = process.argv[replayArg + 1];
  if (!fixture) throw new Error("--replay needs a fixture path");
  const wss = new WebSocketServer({ port: PORT });
  console.log(`[server] REPLAY ${fixture} on ws://localhost:${PORT}`);
  wss.on("connection", async (ws) => {
    const events = await loadFixture(fixture);
    await replayTimed(events, (e) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(e)), 1);
  });
} else {
  const mgr = new SessionManager();
  new WsGateway(PORT, mgr);
  console.log(`[server] LIVE on ws://localhost:${PORT}`);
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/engine/ws-gateway.test.ts`
Expected: PASS (1 test).
Run: `bun run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/ws-gateway.ts src/engine/server.ts src/engine/ws-gateway.test.ts
git commit -m "feat: 🧩 add WebSocket gateway + engine entry with replay mode"
```

---

### Task 10: Web store (`src/web/store.ts`)

Zustand store whose state is rebuilt from the `RoomEvent` stream by a **pure reducer** (`reduce`), so it is fully unit-testable. `currentSessionId` selects the render source (spec §7.3).

**Files:**
- Create: `src/web/store.ts`
- Test: `src/web/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, reduce } from "./store";

const empty: RoomState = { sessions: {}, currentSessionId: null };
const ev = (p: Partial<RoomEvent>): RoomEvent => ({ seq: 1, ts: 0, sessionId: "s1", type: "agent.spawned", payload: {}, ...p });

test("session.created adds a session and sets currentSessionId once", () => {
  const st = reduce(empty, ev({ type: "session.created", payload: { title: "code-review", model: "claude-opus-4-8" } }));
  expect(st.sessions.s1?.title).toBe("code-review");
  expect(st.currentSessionId).toBe("s1");
});

test("agent.spawned adds a working subagent; tool.started sets the head icon tool", () => {
  let st = reduce(empty, ev({ type: "session.created", payload: { title: "t", model: "m" } }));
  st = reduce(st, ev({ type: "agent.spawned", agentId: "ag-1", payload: { role: "coder", parentId: ORCHESTRATOR_ID } }));
  expect(st.sessions.s1?.agents["ag-1"]?.status).toBe("working");
  st = reduce(st, ev({ type: "tool.started", agentId: "ag-1", payload: { toolName: "Edit" } }));
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBe("Edit");
});

test("agent.done removes a subagent but never the orchestrator", () => {
  let st = reduce(empty, ev({ type: "session.created", payload: { title: "t", model: "m" } }));
  st = reduce(st, ev({ type: "agent.spawned", agentId: "ag-1", payload: { role: "coder", parentId: ORCHESTRATOR_ID } }));
  st = reduce(st, ev({ type: "agent.done", agentId: "ag-1", payload: { stopReason: "normal" } }));
  expect(st.sessions.s1?.agents["ag-1"]).toBeUndefined();
  st = reduce(st, ev({ type: "agent.done", agentId: ORCHESTRATOR_ID, payload: { stopReason: "normal" } }));
  expect(st.sessions.s1?.agents[ORCHESTRATOR_ID]).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/web/store.test.ts`
Expected: FAIL — `Cannot find module "./store"`.

- [ ] **Step 3: Implement `src/web/store.ts`**

```ts
import { create } from "zustand";
import { ORCHESTRATOR_ID, type Loot, type Session, createAgent, createSession } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { agentTypeToSkin } from "../shared/mapping";

export interface RoomState {
  sessions: Record<string, Session>;
  currentSessionId: string | null;
}

export function reduce(state: RoomState, e: RoomEvent): RoomState {
  const sessions = { ...state.sessions };

  if (e.type === "session.created") {
    const p = e.payload as { title: string; model: string; slashCommands?: string[] };
    sessions[e.sessionId] = createSession({ id: e.sessionId, title: p.title || e.sessionId, model: p.model, slashCommands: p.slashCommands ?? [] });
    return { sessions, currentSessionId: state.currentSessionId ?? e.sessionId };
  }

  const prev = sessions[e.sessionId];
  if (!prev) return state; // event for an unknown session — ignore
  const s: Session = { ...prev, agents: { ...prev.agents } };

  switch (e.type) {
    case "agent.spawned": {
      const p = e.payload as { role: string; parentId: string };
      if (e.agentId) {
        s.agents[e.agentId] = createAgent({ id: e.agentId, role: p.role, skin: agentTypeToSkin(p.role), parentId: p.parentId, status: "working" });
      }
      s.status = "busy";
      break;
    }
    case "tool.started": {
      const p = e.payload as { toolName: string };
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId) s.agents[e.agentId] = { ...a, status: "working", currentTool: p.toolName };
      break;
    }
    case "tool.ended":
    case "tool.failed": {
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId) s.agents[e.agentId] = { ...a, currentTool: undefined };
      break;
    }
    case "agent.idle": {
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId) s.agents[e.agentId] = { ...a, status: "idle", currentTool: undefined };
      break;
    }
    case "agent.done": {
      if (e.agentId && e.agentId !== ORCHESTRATOR_ID) delete s.agents[e.agentId];
      break;
    }
    case "loot.dropped": {
      const p = e.payload as { kind: Loot["kind"]; label: string; sourceRef: string };
      s.loot = [...s.loot, { id: String(e.seq), sessionId: e.sessionId, kind: p.kind, label: p.label, sourceRef: p.sourceRef, t: e.ts }];
      break;
    }
    case "usage.updated": {
      const p = e.payload as { tokens: number; cost: number };
      s.usage = { tokens: p.tokens, cost: p.cost };
      break;
    }
    case "session.cleared": {
      const orch = s.agents[ORCHESTRATOR_ID];
      s.agents = orch ? { [ORCHESTRATOR_ID]: orch } : {};
      s.status = "done";
      break;
    }
    default:
      break;
  }

  sessions[e.sessionId] = s;
  return { ...state, sessions };
}

export interface RoomStore extends RoomState {
  applyEvent: (e: RoomEvent) => void;
  switchSession: (id: string) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  sessions: {},
  currentSessionId: null,
  applyEvent: (e) => set((st) => reduce(st, e)),
  switchSession: (id) => set({ currentSessionId: id }),
}));
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/web/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/store.ts src/web/store.test.ts
git commit -m "feat: 🧩 add Zustand room store with pure event reducer"
```

---

### Task 11: WebSocket client (`src/web/ws-client.ts`)

Connects to the engine, applies incoming `RoomEvent`s to the store, sends commands up.

**Files:**
- Create: `src/web/ws-client.ts`
- Test: `src/web/ws-client.test.ts`

- [ ] **Step 1: Write the failing test (pure incoming handler)**

```ts
import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import { handleIncoming } from "./ws-client";

test("handleIncoming applies valid events and ignores malformed", () => {
  const got: RoomEvent[] = [];
  handleIncoming('{"seq":1,"ts":0,"sessionId":"s1","type":"agent.idle","payload":{}}', (e) => got.push(e));
  handleIncoming("not json", (e) => got.push(e));
  expect(got).toHaveLength(1);
  expect(got[0]?.type).toBe("agent.idle");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/web/ws-client.test.ts`
Expected: FAIL — `Cannot find module "./ws-client"`.

- [ ] **Step 3: Implement `src/web/ws-client.ts`**

```ts
import type { RoomEvent } from "../shared/events";
import { useRoomStore } from "./store";

export function handleIncoming(raw: string, apply: (e: RoomEvent) => void): void {
  try {
    apply(JSON.parse(raw) as RoomEvent);
  } catch {
    /* ignore malformed frames */
  }
}

export interface RoomConnection {
  send: (cmd: object) => void;
  close: () => void;
}

export function connectRoom(url = "ws://localhost:8787"): RoomConnection {
  const ws = new WebSocket(url);
  const apply = useRoomStore.getState().applyEvent;
  ws.onmessage = (ev) => handleIncoming(String(ev.data), apply);
  return {
    send: (cmd) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(cmd));
    },
    close: () => ws.close(),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/web/ws-client.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/web/ws-client.ts src/web/ws-client.test.ts
git commit -m "feat: 🧩 add web WebSocket client + store wiring"
```

---

### Task 12: Room layout (`src/web/room/layout.ts`)

Pure placement of agents in the room (orchestrator centered, subagents on a ring) — kept pure so it is unit-testable.

**Files:**
- Create: `src/web/room/layout.ts`
- Test: `src/web/room/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../../shared/domain";
import { roomLayout } from "./layout";

test("orchestrator is centered; subagents get distinct positions", () => {
  const p = roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560);
  expect(p[ORCHESTRATOR_ID]).toEqual({ x: 450, y: Math.round(560 * 0.42) });
  expect(p.a).not.toEqual(p.b);
  expect(p.a).toEqual(roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560).a); // deterministic
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/web/room/layout.test.ts`
Expected: FAIL — `Cannot find module "./layout"`.

- [ ] **Step 3: Implement `src/web/room/layout.ts`**

```ts
import { ORCHESTRATOR_ID } from "../../shared/domain";

export interface Pos {
  x: number;
  y: number;
}

export function roomLayout(agentIds: string[], w: number, h: number): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.42);
  if (agentIds.includes(ORCHESTRATOR_ID)) out[ORCHESTRATOR_ID] = { x: cx, y: cy };
  const others = agentIds.filter((id) => id !== ORCHESTRATOR_ID);
  const n = Math.max(1, others.length);
  others.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out[id] = { x: Math.round(cx + Math.cos(angle) * w * 0.22), y: Math.round(cy + 70 + Math.sin(angle) * h * 0.16) };
  });
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/web/room/layout.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/web/room/layout.ts src/web/room/layout.test.ts
git commit -m "feat: 🧩 add pure room layout placement"
```

---

### Task 13: PixiJS room components (`Room.tsx`, `Character.tsx`, `Portal.tsx`, `App.tsx`)

Renders the room from store state using `@pixi/react` v8 (`extend` + lowercase `pixi*` tags, `useTick` for the bob animation — Appendix A). For MVP, characters are drawn with the v8 `Graphics` API (asset-free); swapping in CC0 `AnimatedSprite`s is post-MVP (recipe in Appendix A). Visual verification, not unit tests.

**Files:**
- Create: `src/web/room/Room.tsx`, `src/web/room/Character.tsx`, `src/web/room/Portal.tsx`, `src/web/App.tsx`
- Modify: `src/web/main.tsx`

- [ ] **Step 1: Create `src/web/room/Portal.tsx`**

```tsx
import { Graphics } from "pixi.js";
import { useCallback } from "react";

export function Portal({ x, y }: { x: number; y: number }) {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.setStrokeStyle({ width: 2, color: 0x00ffe7 });
    g.ellipse(0, 0, 26, 11);
    g.stroke();
    g.setFillStyle({ color: 0x00ffe7, alpha: 0.35 });
    g.ellipse(0, 0, 20, 8);
    g.fill();
  }, []);
  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
}
```

- [ ] **Step 2: Create `src/web/room/Character.tsx`**

```tsx
import type { Graphics, TextStyle } from "pixi.js";
import { useCallback } from "react";

export function Character({
  x, y, color, icon, isLead, onSelect,
}: {
  x: number; y: number; color: number; icon: string; isLead: boolean; onSelect?: () => void;
}) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.setFillStyle({ color: 0x000000, alpha: 0.4 });
      g.ellipse(0, 16, 14, 4);
      g.fill();
      g.setFillStyle({ color });
      g.roundRect(-9, -2, 18, 16, 4);
      g.fill();
      g.setFillStyle({ color: 0xffe0b8 });
      g.roundRect(-8, -18, 16, 14, 5);
      g.fill();
      if (isLead) {
        g.setStrokeStyle({ width: 2, color: 0xffffff });
        g.roundRect(-8, -18, 16, 14, 5);
        g.stroke();
      }
    },
    [color, isLead],
  );

  return (
    <pixiContainer x={x} y={y} eventMode="static" cursor="pointer" onClick={onSelect}>
      <pixiGraphics draw={draw} />
      {icon ? <pixiText text={icon} anchor={0.5} y={-32} style={{ fontSize: 14 } as Partial<TextStyle>} /> : null}
    </pixiContainer>
  );
}
```

- [ ] **Step 3: Create `src/web/room/Room.tsx`**

```tsx
import { Application, extend, useTick } from "@pixi/react";
import { AnimatedSprite, Container, Graphics, Sprite, Text } from "pixi.js";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Agent } from "../../shared/domain";
import { toolNameToIcon } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { Character } from "./Character";
import { Portal } from "./Portal";
import { roomLayout } from "./layout";

// Register PixiJS classes → <pixiContainer>, <pixiGraphics>, <pixiText> (module scope — Appendix A).
extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

const W = 900;
const H = 560;
const SKIN_COLORS: Record<string, number> = {
  lead: 0xffd166, cyan: 0x00ffe7, mag: 0xff3ea5, grn: 0x5cff9d, gold: 0xffd166, purple: 0x9b5de5,
};

function Floor() {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x13243b });
    g.rect(0, 0, W, H);
    g.fill();
    g.setStrokeStyle({ width: 1, color: 0x1c3350 });
    for (let x = 0; x <= W; x += 30) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y <= H; y += 30) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
  }, []);
  return <pixiGraphics draw={draw} />;
}

function Scene() {
  const session = useRoomStore((s) => (s.currentSessionId ? s.sessions[s.currentSessionId] : undefined));
  const agents: Agent[] = useMemo(() => (session ? Object.values(session.agents) : []), [session]);
  const layout = useMemo(() => roomLayout(agents.map((a) => a.id), W, H), [agents]);
  const [t, setT] = useState(0);
  // Memoized so the ticker callback isn't re-registered every frame (Appendix A gotcha).
  const tick = useCallback((ticker: { deltaTime: number }) => setT((v) => v + ticker.deltaTime), []);
  useTick(tick);

  return (
    <pixiContainer>
      <Floor />
      <Portal x={70} y={H - 70} />
      {agents.map((a) => {
        const pos = layout[a.id] ?? { x: W / 2, y: H / 2 };
        const bob = a.status === "working" ? Math.sin(t * 0.15 + pos.x) * 3 : 0;
        const icon = a.currentTool ? toolNameToIcon(a.currentTool) : a.kind === "orchestrator" ? "★" : "";
        return (
          <Character key={a.id} x={pos.x} y={pos.y + bob} color={SKIN_COLORS[a.skin] ?? 0xffffff} icon={icon} isLead={a.kind === "orchestrator"} />
        );
      })}
    </pixiContainer>
  );
}

export function Room() {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0c1422} antialias>
        <Scene />
      </Application>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/web/App.tsx` and update `src/web/main.tsx`**

`src/web/App.tsx`:
```tsx
import { useEffect } from "react";
import { Room } from "./room/Room";
import { connectRoom } from "./ws-client";

export function App() {
  useEffect(() => {
    const conn = connectRoom();
    return () => conn.close();
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Room />
    </div>
  );
}
```

`src/web/main.tsx` (replace body):
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Type-check and lint**

Run: `bunx tsc --noEmit`
Expected: no type errors.
Run: `bun run check`
Expected: no errors.

- [ ] **Step 6: Visual smoke (uses the replay fixture from Task 15; if running Task 13 first, create a 2-line temp fixture)**

Terminal A: `bun run src/engine/server.ts --replay fixtures/sample-run.jsonl`
Terminal B: `bun run dev:web` → open `http://localhost:5173`
Expected: a dark gridded room; a gold ★ orchestrator centered; cyan/magenta subagents appear, bob while "working" with a tool icon overhead, then disappear. (If `fixtures/sample-run.jsonl` does not exist yet, do this step after Task 15.)

- [ ] **Step 7: Commit**

```bash
git add src/web/room/Room.tsx src/web/room/Character.tsx src/web/room/Portal.tsx src/web/App.tsx src/web/main.tsx
git commit -m "feat: 🧩 render PixiJS room from store state"
```

---

### Task 14: Game HUD — icon buttons, chat drawer, model & skill pickers

DOM overlay on top of the PixiJS canvas (spec §7). Main screen stays text-free; text lives in the drawer/pickers. Commands go up via `sendCommand`. Visual verification.

**Files:**
- Create: `src/web/ui-store.ts`, `src/web/hud/Hud.tsx`, `src/web/hud/ChatDrawer.tsx`, `src/web/hud/ModelPicker.tsx`, `src/web/hud/SkillGrid.tsx`
- Modify: `src/web/ws-client.ts` (add `sendCommand`), `src/web/App.tsx` (mount `<Hud/>`)

- [ ] **Step 1: Create `src/web/ui-store.ts`**

```ts
import { create } from "zustand";

type Panel = "drawerOpen" | "modelOpen" | "skillsOpen";

export interface UiState {
  drawerOpen: boolean;
  modelOpen: boolean;
  skillsOpen: boolean;
  selectedAgentId: string | null;
  toggle: (k: Panel) => void;
  select: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  modelOpen: false,
  skillsOpen: false,
  selectedAgentId: null,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<UiState>),
  select: (id) => set({ selectedAgentId: id }),
}));
```

- [ ] **Step 2: Modify `src/web/ws-client.ts` — add a module-level active connection + `sendCommand` (replace the file)**

```ts
import type { RoomEvent } from "../shared/events";
import { useRoomStore } from "./store";

export function handleIncoming(raw: string, apply: (e: RoomEvent) => void): void {
  try {
    apply(JSON.parse(raw) as RoomEvent);
  } catch {
    /* ignore malformed frames */
  }
}

export interface RoomConnection {
  send: (cmd: object) => void;
  close: () => void;
}

let active: RoomConnection | null = null;

export function sendCommand(cmd: object): void {
  active?.send(cmd);
}

export function connectRoom(url = "ws://localhost:8787"): RoomConnection {
  const ws = new WebSocket(url);
  const apply = useRoomStore.getState().applyEvent;
  ws.onmessage = (ev) => handleIncoming(String(ev.data), apply);
  const conn: RoomConnection = {
    send: (cmd) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(cmd));
    },
    close: () => ws.close(),
  };
  active = conn;
  return conn;
}
```

> The Task 11 `handleIncoming` test still passes (its export is unchanged).

- [ ] **Step 3: Create `src/web/hud/ModelPicker.tsx`**

```tsx
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

const MODELS = [
  { id: "claude-opus-4-8", label: "💠 Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "🔷 Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "🔹 Haiku 4.5" },
];

export function ModelPicker() {
  const open = useUiStore((s) => s.modelOpen);
  const toggle = useUiStore((s) => s.toggle);
  const currentId = useRoomStore((s) => s.currentSessionId);
  if (!open) return null;
  return (
    <div style={{ position: "absolute", top: 66, right: 12, background: "#101c2e", border: "2px solid #ffd166", borderRadius: 12, padding: 10 }}>
      {MODELS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            if (currentId) sendCommand({ cmd: "setModel", sessionId: currentId, model: m.id });
            toggle("modelOpen");
          }}
          style={{ display: "block", width: 160, textAlign: "left", marginBottom: 6, padding: 8, borderRadius: 8, background: "#13243b", border: "1px solid #2a4a5e", color: "#d7e6ef", cursor: "pointer" }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/web/hud/SkillGrid.tsx`**

```tsx
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function SkillGrid() {
  const open = useUiStore((s) => s.skillsOpen);
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) => (s.currentSessionId ? s.sessions[s.currentSessionId] : undefined));
  if (!open) return null;
  const cmds = session?.slashCommands ?? [];
  return (
    <div style={{ position: "absolute", bottom: 132, left: 12, background: "#101c2e", border: "2px solid #00ffe7", borderRadius: 12, padding: 10, maxWidth: 260, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
      {cmds.length === 0 ? (
        <div style={{ color: "#86c7d6", fontSize: 11 }}>无可用技能</div>
      ) : (
        cmds.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => {
              if (session) sendCommand({ cmd: "sendMessage", sessionId: session.id, text: `/${c.replace(/^\//, "")}` });
              toggle("skillsOpen");
            }}
            style={{ padding: 8, borderRadius: 9, background: "#13243b", border: "1px solid #2a4a5e", color: "#9fd", cursor: "pointer", fontSize: 10 }}
          >
            {c.replace(/^\//, "").slice(0, 8)}
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/web/hud/ChatDrawer.tsx`**

```tsx
import { useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function ChatDrawer() {
  const open = useUiStore((s) => s.drawerOpen);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const switchSession = useRoomStore((s) => s.switchSession);
  const [text, setText] = useState("");
  if (!open) return null;
  const list = Object.values(sessions);
  const send = () => {
    if (currentId && text.trim()) {
      sendCommand({ cmd: "sendMessage", sessionId: currentId, text });
      setText("");
    }
  };
  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "55%", background: "#0d1726", borderLeft: "2px solid #ff3ea5", display: "flex" }}>
      <div style={{ width: "38%", borderRight: "1px solid #21303f", padding: 8, overflow: "auto" }}>
        <div style={{ color: "#86c7d6", fontSize: 11, padding: 4 }}>会话</div>
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => switchSession(s.id)}
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: 8, borderRadius: 8, background: s.id === currentId ? "#181226" : "#101c2e", border: `1px solid ${s.id === currentId ? "#ff3ea5" : "#21303f"}`, color: "#d7e6ef", cursor: "pointer" }}
          >
            {s.title} · {s.status}
          </button>
        ))}
        <button
          type="button"
          onClick={() => sendCommand({ cmd: "newSession", sessionId: `s${list.length + 1}`, title: "new", model: "claude-opus-4-8" })}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px dashed #2a4a5e", background: "transparent", color: "#86c7d6", cursor: "pointer" }}
        >
          ＋ 新会话
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12 }}>
        <div style={{ flex: 1, color: "#9bb3c2", fontSize: 12 }}>{currentId ? `会话 ${currentId}` : "选一个会话"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="发消息…"
            style={{ flex: 1, padding: 8, borderRadius: 18, background: "#10202e", border: "2px solid #00ffe7", color: "#cffcf7" }}
          />
          <button type="button" onClick={send} style={{ padding: "8px 14px", borderRadius: 18, background: "#00ffe7", border: "none", cursor: "pointer" }}>▶</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/web/hud/Hud.tsx`**

```tsx
import type { CSSProperties } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { ChatDrawer } from "./ChatDrawer";
import { ModelPicker } from "./ModelPicker";
import { SkillGrid } from "./SkillGrid";

const btn: CSSProperties = {
  position: "absolute", width: 48, height: 48, borderRadius: 13,
  background: "#16263d", border: "2px solid #2a4a5e", color: "#cffcf7",
  fontSize: 21, cursor: "pointer",
};

export function Hud() {
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) => (s.currentSessionId ? s.sessions[s.currentSessionId] : undefined));
  const agentCount = Object.keys(session?.agents ?? {}).length;
  return (
    <>
      <button type="button" title="设置" style={{ ...btn, top: 12, left: 12 }}>⚙</button>
      <button type="button" title="模型" style={{ ...btn, top: 12, right: 70 }} onClick={() => toggle("modelOpen")}>💎</button>
      <button type="button" title="模式" style={{ ...btn, top: 12, right: 12 }}>🛡</button>
      <button type="button" title="技能" style={{ ...btn, bottom: 74, left: 12 }} onClick={() => toggle("skillsOpen")}>📜</button>
      <button type="button" title="背包" style={{ ...btn, bottom: 12, left: 12 }}>🎒</button>
      <button type="button" title="聊天" style={{ ...btn, bottom: 12, right: 12 }} onClick={() => toggle("drawerOpen")}>💬</button>
      <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", color: "#cffcf7", fontFamily: "monospace", fontSize: 12 }}>
        ⚔ {session?.title ?? "no session"} · {agentCount} agents
      </div>
      <ChatDrawer />
      <ModelPicker />
      <SkillGrid />
    </>
  );
}
```

- [ ] **Step 7: Mount `<Hud/>` in `src/web/App.tsx` (replace the file)**

```tsx
import { useEffect } from "react";
import { Hud } from "./hud/Hud";
import { Room } from "./room/Room";
import { connectRoom } from "./ws-client";

export function App() {
  useEffect(() => {
    const conn = connectRoom();
    return () => conn.close();
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Room />
      <Hud />
    </div>
  );
}
```

- [ ] **Step 8: Type-check, lint, run all tests**

Run: `bunx tsc --noEmit`
Expected: no type errors.
Run: `bun run check`
Expected: no errors.
Run: `bun test`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add src/web/ui-store.ts src/web/hud src/web/App.tsx src/web/ws-client.ts
git commit -m "feat: 🧩 add game HUD, chat drawer, model + skill pickers"
```

---

### Task 15: Fixture + end-to-end smoke + merge

Proves the full chain two ways: cost-free replay, then one real subscription run (spec §12.1 step 5).

**Files:**
- Create: `fixtures/sample-run.jsonl`

- [ ] **Step 1: Create `fixtures/sample-run.jsonl`** (one JSON object per line, exactly):

```jsonl
{"seq":1,"ts":0,"sessionId":"s1","type":"session.created","payload":{"title":"code-review · kata","model":"claude-opus-4-8","permissionMode":"default","apiKeySource":"oauth","slashCommands":["/code-review","/deep-research","/frontend-design"]}}
{"seq":2,"ts":400,"sessionId":"s1","type":"agent.spawned","agentId":"ag-coder","payload":{"role":"coder","promptSummary":"review concurrency","parentId":"orchestrator"}}
{"seq":3,"ts":700,"sessionId":"s1","type":"tool.started","agentId":"ag-coder","payload":{"toolName":"Edit","inputSummary":"src/x.ts","toolUseId":"t1"}}
{"seq":4,"ts":1200,"sessionId":"s1","type":"agent.spawned","agentId":"ag-research","payload":{"role":"researcher","promptSummary":"find refs","parentId":"orchestrator"}}
{"seq":5,"ts":1500,"sessionId":"s1","type":"tool.started","agentId":"ag-research","payload":{"toolName":"WebSearch","inputSummary":"race conditions","toolUseId":"t2"}}
{"seq":6,"ts":2200,"sessionId":"s1","type":"tool.ended","agentId":"ag-coder","payload":{"toolUseId":"t1","ok":true}}
{"seq":7,"ts":2600,"sessionId":"s1","type":"tool.ended","agentId":"ag-research","payload":{"toolUseId":"t2","ok":true}}
{"seq":8,"ts":3000,"sessionId":"s1","type":"agent.done","agentId":"ag-research","payload":{"stopReason":"normal"}}
{"seq":9,"ts":3400,"sessionId":"s1","type":"agent.done","agentId":"ag-coder","payload":{"stopReason":"normal"}}
{"seq":10,"ts":3800,"sessionId":"s1","type":"loot.dropped","payload":{"kind":"report","label":"2 races fixed","sourceRef":"results/review.md"}}
{"seq":11,"ts":4000,"sessionId":"s1","type":"usage.updated","payload":{"tokens":1820,"cost":0.021}}
{"seq":12,"ts":4600,"sessionId":"s1","type":"session.cleared","payload":{}}
```

- [ ] **Step 2: Replay smoke (cost-free)**

Terminal A: `bun run src/engine/server.ts --replay fixtures/sample-run.jsonl`
Terminal B: `bun run dev:web` → open `http://localhost:5173`
Expected: gold ★ orchestrator centered; a cyan coder + magenta researcher enter from the portal, bob while working with ⌨️/🔍 icons overhead, then leave; HUD shows `2 agents` then settles. Open 💬 — the `code-review · kata` session is listed; open 💎 — three models; open 📜 — the three slash_commands.

- [ ] **Step 3: Live smoke (one real subscription run — spends a little Agent-SDK credit)**

Prereqs (spec §8.1):
```bash
claude --version                 # CLI installed
# Ensure logged in to your subscription previously (claude /login). Then for the engine:
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
```
Terminal A: `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN && bun run dev:engine`
Terminal B: `bun run dev:web` → open `http://localhost:5173`
Steps: click 💬 → ＋新会话 → type: `用两个子 agent 分别调研这个仓库的结构并总结，然后汇总`。
Expected: the engine logs NO `apiKeySource` warning (⇒ subscription OAuth confirmed); within seconds real subagent(s) enter the room from the portal, show tool icons as they work, and leave when done. A `usage.updated` reflects real token/cost.

- [ ] **Step 4: Full verification**

Run: `bun test`
Expected: all suites pass (shared + engine + web).
Run: `bunx tsc --noEmit`
Expected: no type errors.
Run: `bun run check`
Expected: no lint errors.

- [ ] **Step 5: Commit fixture, then merge the worktree back to `main`**

```bash
git add fixtures/sample-run.jsonl
git commit -m "test: 🧪 add replay fixture + e2e smoke"

# All green → merge detached worktree HEAD into main (spec §15 workflow):
SHA=$(git rev-parse HEAD)
cd /Users/poco/Projects/Roguent        # main working tree
git merge --no-ff "$SHA" -m "merge: 🔀 land Roguent MVP (drive + visualize main chain)"
bun test                               # re-verify on main
git push origin main
git worktree remove .worktrees/<slug>  # cleanup
```

---

## Appendix A — Verified API reference (2026-06-04)

Exact signatures used by the tasks, verified against published types/docs. Re-check if you bump versions.

### A.1 Claude Agent SDK `@anthropic-ai/claude-agent-sdk@0.3.161`

- `query({ prompt, options }): Query` — pass `prompt` as `AsyncIterable<SDKUserMessage>` for **streaming-input mode** (required for `interrupt`/`setModel`/`setPermissionMode`).
- Minimal user turn: `{ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null }`.
- `Options` (subset): `{ model?, permissionMode?, allowedTools?, disallowedTools?, mcpServers?, includePartialMessages?, settingSources?, cwd?, env?, hooks? }`.
  - `settingSources` defaults to **loading nothing** → pass `["user","project"]` to load CLAUDE.md/skills.
  - `env`, if set, **replaces** the environment → spread `{ ...process.env }` (minus the API-key vars).
- `PermissionMode = "default"|"acceptEdits"|"bypassPermissions"|"plan"|"dontAsk"|"auto"`.
- Hooks: `options.hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>`.
  - `HookCallbackMatcher = { matcher?: string /* tool-name glob */; hooks: HookCallback[]; timeout? }` — **matcher is a string, callbacks under `hooks`** (not `{match, callback}`).
  - `HookCallback = (input, toolUseID: string|undefined, { signal }) => Promise<HookJSONOutput>` — return `{}` for a no-op observer.
  - Events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop` (all confirmed to exist). `SubagentStartHookInput = BaseHookInput & { hook_event_name:"SubagentStart"; agent_id; agent_type }`. `PreToolUseHookInput` adds `tool_name, tool_input, tool_use_id`. `BaseHookInput = { session_id, transcript_path, cwd, permission_mode?, agent_id?, agent_type?, effort? }` — `agent_id` present only inside a subagent.
- `Query` methods (streaming-input only): `interrupt()`, `setModel(model?)`, `setPermissionMode(mode)`, `supportedModels(): Promise<ModelInfo[]>`.
- Reading the stream: `msg.type === "system" && msg.subtype === "init"` → `{ session_id, apiKeySource, slash_commands }` (`apiKeySource === "oauth"` confirms subscription). `msg.type === "assistant"` → iterate `msg.message.content`, `block.type === "tool_use"` → `{ id, name, input }`; `msg.parent_tool_use_id` non-null ⇒ from a subagent. `msg.type === "result"` → `{ subtype, total_cost_usd, usage }`.
- **Gotchas:** detect the subagent tool by BOTH `"Task"` and `"Agent"` (renamed v2.1.63). Do NOT use `--bare`. The SDK is version-sensitive — Task 6 logs the real hook JSON before trusting field names.

### A.2 `@pixi/react@^8.0.5` (+ `pixi.js@^8.2.6`, `react@^19`)

- `extend({ Container, Sprite, AnimatedSprite, Graphics, Text })` at **module scope** → `<pixiContainer>`, `<pixiSprite>`, `<pixiAnimatedSprite>`, `<pixiGraphics>`, `<pixiText>`. Forgetting to register a class throws at mount.
- Root: `<Application resizeTo={ref} background={0x0c1422} antialias>…</Application>` (props forward to `PIXI.Application`).
- `useTick(cb)` — **wrap `cb` in `useCallback`** if it calls `setState` (else re-registered every frame). Only inside a child of `<Application>`.
- `useApplication() → { app }` (there is **no `useApp`** in v8).
- Graphics v8 fluent API in the `draw` callback: `g.clear(); g.setFillStyle({ color }); g.rect(x,y,w,h); g.fill(); g.setStrokeStyle({ width, color }); g.stroke();` (v7 `beginFill/drawRect/endFill` removed).
- Events: `eventMode="static"` + `onClick` (v7 `interactive` removed).
- AnimatedSprite (post-MVP art): `const sheet = await Assets.load("/atlas.json"); <pixiAnimatedSprite textures={sheet.animations["walk"]} animationSpeed={0.15} loop playing />`. Init texture state with `Texture.EMPTY`.

### A.3 Particles & glow (post-MVP polish)

- Particles on Pixi v8: use the community fork **`@barvynkoa/particle-emitter`** (official `@pixi/particle-emitter` is pinned to Pixi v6/v7 and won't resolve). `new Emitter(container, config)`, `emitter.update(deltaSeconds)` (seconds, not ms) or `playOnceAndDestroy()` for a burst. Pass a real `Texture` (preloaded via `Assets.load`) into the `textureSingle`/`textureRandom` behavior — `Texture.from(url)` no longer accepts URLs in v8.
- Glow: `pixi-filters@^6` (v8-compatible). `import { GlowFilter, AdvancedBloomFilter } from "pixi-filters";` then `sprite.filters = [new GlowFilter({ color: 0x00ffe7, outerStrength: 4 })]`. Animate `filter.outerStrength` in a ticker for a neon pulse.

---

## Self-review

- **Spec coverage:** §3 architecture → Tasks 7–9; §4 domain → Task 1; §5 events → Tasks 2,5; §6 mapping/state machine → Tasks 3,5,10,13; §7 UI/HUD/drawer → Tasks 13,14; §8 integration/auth/hooks → Tasks 5,7 + Appendix A; §9 cost (replay avoids spend) → Tasks 6,15; §10 robustness (seq ordering, async hooks) → Tasks 4,7; §11 testing (record/replay) → Tasks 6,15; §12.1 MVP → Tasks 13–15. Post-MVP items (§12.2) intentionally out of scope.
- **Placeholders:** none — every code/test step has complete content; `<slug>` in Task 15 is a real per-run worktree name supplied at execution.
- **Type consistency:** `Session.slashCommands` added in Task 1 and consumed in Tasks 10/14; `RoomEvent`/`DraftEvent`/`Command` names consistent across engine and web; `IDriver` implemented by `Driver` and faked in Task 8.







