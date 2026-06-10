# 导入本地会话历史 M1（导入 + 压缩回放）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Roguent 能在应用内浏览 Claude Code 本地会话 transcript（`~/.claude/projects/*/*.jsonl`），选中后零额度、压缩计时地在地牢里重演那次会话。

**Architecture:** 继 LIVE / REPLAY 之后的第三个 `RoomEvent` 来源。纯函数 `normalizeTranscript` 把 CC 原生行转成现有 `DraftEvent`；`local-sessions.ts` 负责文件 IO；`import.ts` 的 `Replayer` 按封顶间隔 + speed 计时发事件；`SessionManager.importSession` 把它接进现有 `Sequencer`/广播；前端只加一个 `ImportPanel` 入口，渲染/reduce 全复用。列表查询是请求/响应（定向回包），其余走广播。

**Tech Stack:** Bun + TypeScript、bun:test、ws、现有 `normalize.ts`/`record.ts`/`store.ts`。

设计来源：[docs/superpowers/specs/2026-06-05-import-local-sessions-design.md](../specs/2026-06-05-import-local-sessions-design.md)。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/engine/transcript.ts` | 纯函数 `normalizeTranscript(lines) → TimedDraft[]` | 新建 |
| `src/engine/transcript.test.ts` | 转换映射单测 | 新建 |
| `src/shared/local-sessions.ts` | `LocalSessionMeta` + 控制消息类型 | 新建 |
| `src/engine/local-sessions.ts` | 文件 IO：`listLocalSessions` / `readTranscriptLines` | 新建 |
| `src/engine/local-sessions.test.ts` | IO 单测（临时目录） | 新建 |
| `src/engine/import.ts` | `Replayer`（封顶间隔 + speed 计时发事件） | 新建 |
| `src/engine/import.test.ts` | Replayer + importSession 单测（注入 sleep） | 新建 |
| `src/engine/session.ts` | 加 `importSession` / `setReplaySpeed` | 改 |
| `src/web/import.e2e.test.ts` | fixture → 转换 → reduce 端到端 | 新建 |
| `fixtures/sample-transcript.jsonl` | mini CC transcript | 新建 |
| `src/engine/ws-gateway.ts` | 3 命令 + onCommand 带 ws + 定向回包 | 改 |
| `src/engine/ws-gateway.test.ts` | parseCommand 新命令断言 | 改 |
| `src/web/ws-client.ts` | 控制消息分流 | 改 |
| `src/web/ws-client.test.ts` | 控制消息分流断言 | 改 |
| `src/web/ui-store.ts` | `localSessions` / `importError` 状态 | 改 |
| `src/web/ui-store.test.ts` | 新状态断言 | 改 |
| `src/web/hud/ImportPanel.tsx` | 导入面板 UI | 新建 |
| `src/web/hud/Hud.tsx` | 「📂 导入」入口按钮 | 改 |

---

## Task 1: `normalizeTranscript` 纯函数转换器（核心）

**Files:**
- Create: `src/engine/transcript.ts`
- Test: `src/engine/transcript.test.ts`

参考既有形状：`DraftEvent`/`summarizeToolInput` 来自 `src/engine/normalize.ts`；`ORCHESTRATOR_ID` 来自 `src/shared/domain.ts`；payload 形状见 `src/shared/events.ts`。CC transcript 行结构：`{ type, timestamp(ISO), cwd, sessionId, message:{ role, model?, content } }`，`content` 是字符串（user）或块数组；块有 `text` / `thinking` / `tool_use{id,name,input}` / `tool_result{tool_use_id,content,is_error?}`。

- [ ] **Step 1: 写失败测试**

```ts
// src/engine/transcript.test.ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { SessionCreatedPayload } from "../shared/events";
import { normalizeTranscript } from "./transcript";

const T = "2026-06-05T10:00:00.000Z";
const T2 = "2026-06-05T10:00:01.000Z";

test("session.created comes first with title/model/cwd from the transcript", () => {
  const lines = [
    { type: "user", timestamp: T, cwd: "/work/kata", sessionId: "sX", message: { role: "user", content: "复核并发改动" } },
    { type: "assistant", timestamp: T2, message: { role: "assistant", model: "claude-opus-4-8", content: [{ type: "text", text: "好的" }] } },
  ];
  const out = normalizeTranscript(lines);
  expect(out[0]?.type).toBe("session.created");
  const p = out[0]?.payload as SessionCreatedPayload;
  expect(p.title).toBe("复核并发改动");
  expect(p.model).toBe("claude-opus-4-8");
  expect(p.cwd).toBe("/work/kata");
  expect(out[0]?.ts).toBe(Date.parse(T));
});

test("assistant text → message.delta on the orchestrator", () => {
  const lines = [
    { type: "user", timestamp: T, cwd: "/w", sessionId: "s", message: { role: "user", content: "hi" } },
    { type: "assistant", timestamp: T2, message: { role: "assistant", content: [{ type: "text", text: "开工" }, { type: "thinking", text: "secret" }] } },
  ];
  const out = normalizeTranscript(lines);
  const delta = out.find((d) => d.type === "message.delta");
  expect(delta?.agentId).toBe(ORCHESTRATOR_ID);
  expect((delta?.payload as { text: string }).text).toBe("开工");
});

test("Agent tool_use → agent.spawned; its tool_result → agent.done", () => {
  const lines = [
    { type: "user", timestamp: T, cwd: "/w", sessionId: "s", message: { role: "user", content: "go" } },
    { type: "assistant", timestamp: T2, message: { role: "assistant", content: [{ type: "tool_use", id: "tu1", name: "Agent", input: { subagent_type: "coder", description: "review concurrency" } }] } },
    { type: "user", timestamp: T2, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "done" }] } },
  ];
  const out = normalizeTranscript(lines);
  const spawned = out.find((d) => d.type === "agent.spawned");
  expect(spawned?.agentId).toBe("tu1");
  expect((spawned?.payload as { role: string; parentId: string }).role).toBe("coder");
  expect((spawned?.payload as { parentId: string }).parentId).toBe(ORCHESTRATOR_ID);
  expect(out.find((d) => d.type === "agent.done")?.agentId).toBe("tu1");
});

test("plain tool_use → tool.started; ok result → tool.ended; is_error → tool.failed", () => {
  const lines = [
    { type: "user", timestamp: T, cwd: "/w", sessionId: "s", message: { role: "user", content: "go" } },
    { type: "assistant", timestamp: T2, message: { role: "assistant", content: [{ type: "tool_use", id: "e1", name: "Edit", input: { file_path: "src/x.ts" } }] } },
    { type: "user", timestamp: T2, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }] } },
    { type: "assistant", timestamp: T2, message: { role: "assistant", content: [{ type: "tool_use", id: "b1", name: "Bash", input: { command: "false" } }] } },
    { type: "user", timestamp: T2, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "b1", is_error: true, content: "boom" }] } },
  ];
  const out = normalizeTranscript(lines);
  const started = out.find((d) => d.type === "tool.started");
  expect(started?.agentId).toBe(ORCHESTRATOR_ID);
  expect((started?.payload as { toolName: string; toolUseId: string }).toolName).toBe("Edit");
  expect((started?.payload as { toolUseId: string }).toolUseId).toBe("e1");
  expect(out.find((d) => d.type === "tool.ended")?.type).toBe("tool.ended");
  expect(out.find((d) => d.type === "tool.failed")?.type).toBe("tool.failed");
});

test("malformed lines are skipped, not thrown", () => {
  const lines = [
    { type: "user", timestamp: T, cwd: "/w", sessionId: "s", message: { role: "user", content: "go" } },
    null,
    "garbage",
    { type: "mode", mode: "x" },
    { type: "assistant", timestamp: T2, message: { role: "assistant", content: [{ type: "text", text: "ok" }] } },
  ];
  const out = normalizeTranscript(lines);
  expect(out[0]?.type).toBe("session.created");
  expect(out.some((d) => d.type === "message.delta")).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test src/engine/transcript.test.ts`
Expected: FAIL（`normalizeTranscript` 不存在 / 模块找不到）

- [ ] **Step 3: 写最小实现**

```ts
// src/engine/transcript.ts
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { SessionCreatedPayload } from "../shared/events";
import { type DraftEvent, summarizeToolInput } from "./normalize";

export interface TimedDraft extends DraftEvent {
  ts: number; // epoch ms，来自该行 ISO timestamp
}

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}
interface Line {
  type?: string;
  timestamp?: string;
  cwd?: string;
  message?: { role?: string; model?: string; content?: ContentBlock[] | string };
}

function asLine(x: unknown): Line | null {
  return x && typeof x === "object" ? (x as Line) : null;
}
function tsOf(l: Line, prev: number): number {
  const t = l.timestamp ? Date.parse(l.timestamp) : Number.NaN;
  return Number.isNaN(t) ? prev : t;
}
function blocks(l: Line): ContentBlock[] {
  const c = l.message?.content;
  return Array.isArray(c) ? c : [];
}

export function normalizeTranscript(input: unknown[]): TimedDraft[] {
  const lines = input.map(asLine);

  // Pass 1：派生 session.created 的元信息。
  let cwd = "";
  let model = "";
  let title = "";
  let firstTs = 0;
  for (const l of lines) {
    if (!l) continue;
    if (!firstTs && l.timestamp) firstTs = tsOf(l, 0);
    if (!cwd && typeof l.cwd === "string") cwd = l.cwd;
    if (!model && typeof l.message?.model === "string") model = l.message.model;
    if (!title && l.type === "user" && typeof l.message?.content === "string") {
      title = l.message.content.slice(0, 60);
    }
  }

  const created: SessionCreatedPayload = {
    title: title || "imported session",
    model,
    permissionMode: "default",
    apiKeySource: "",
    slashCommands: [],
    cwd: cwd || undefined,
  };
  const out: TimedDraft[] = [
    { type: "session.created", payload: created, ts: firstTs },
  ];

  // Pass 2：事件流。记录哪些 tool_use id 是 subagent，决定其 result 是 done 还是 ended。
  const subagentIds = new Set<string>();
  let prev = firstTs;
  for (const l of lines) {
    if (!l) continue;
    const ts = tsOf(l, prev);
    prev = ts;

    if (l.type === "assistant" && typeof l.message?.content === "string") continue;

    for (const b of blocks(l)) {
      if (b.type === "text" && b.text) {
        out.push({ type: "message.delta", agentId: ORCHESTRATOR_ID, payload: { text: b.text }, ts });
      } else if (b.type === "tool_use" && b.id) {
        if (SUBAGENT_TOOLS.has(b.name ?? "")) {
          subagentIds.add(b.id);
          const role = (b.input?.subagent_type as string) ?? "agent";
          const prompt = (b.input?.description as string) ?? (b.input?.prompt as string) ?? "";
          out.push({
            type: "agent.spawned",
            agentId: b.id,
            payload: { role, promptSummary: prompt.slice(0, 80), parentId: ORCHESTRATOR_ID },
            ts,
          });
        } else {
          out.push({
            type: "tool.started",
            agentId: ORCHESTRATOR_ID,
            payload: { toolName: b.name ?? "", inputSummary: summarizeToolInput(b.input), toolUseId: b.id },
            ts,
          });
        }
      } else if (b.type === "tool_result" && b.tool_use_id) {
        if (subagentIds.has(b.tool_use_id)) {
          out.push({ type: "agent.done", agentId: b.tool_use_id, payload: { stopReason: "normal" }, ts });
        } else {
          out.push(
            b.is_error
              ? { type: "tool.failed", agentId: ORCHESTRATOR_ID, payload: { toolUseId: b.tool_use_id, ok: false }, ts }
              : { type: "tool.ended", agentId: ORCHESTRATOR_ID, payload: { toolUseId: b.tool_use_id, ok: true }, ts },
          );
        }
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test src/engine/transcript.test.ts`
Expected: PASS（5 个 test）

- [ ] **Step 5: 提交**

```bash
git add src/engine/transcript.ts src/engine/transcript.test.ts
git commit -m "feat: 🧩 transcript→RoomEvent 纯函数转换器（subagent 认 Task/Agent）"
```

---

## Task 2: 本地会话文件 IO（list / read）

**Files:**
- Create: `src/shared/local-sessions.ts`
- Create: `src/engine/local-sessions.ts`
- Test: `src/engine/local-sessions.test.ts`

- [ ] **Step 1: 写共享类型（无行为，先建文件）**

```ts
// src/shared/local-sessions.ts
export interface LocalSessionMeta {
  project: string; // 目录名（encoded cwd）
  sessionId: string; // 文件名去掉 .jsonl
  path: string; // 绝对路径
  mtime: number; // epoch ms
  firstMessage: string; // 首条 user 文本预览
  msgCount: number; // 行数
}

// engine → client 的定向控制消息（非 RoomEvent 信封）。
export type ControlMessage =
  | { kind: "control"; type: "localSessions"; items: LocalSessionMeta[] }
  | { kind: "control"; type: "importError"; path: string; reason: string };
```

- [ ] **Step 2: 写失败测试**

```ts
// src/engine/local-sessions.test.ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLocalSessions, readTranscriptLines } from "./local-sessions";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "roguent-cc-"));
  const proj = join(root, "-Users-me-proj");
  mkdirSync(proj);
  writeFileSync(
    join(proj, "s1.jsonl"),
    `${JSON.stringify({ type: "user", message: { role: "user", content: "hello there" } })}\n${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } })}\n`,
  );
  writeFileSync(join(proj, "broken.jsonl"), "not json\n");
  return root;
}

test("listLocalSessions returns meta per .jsonl, newest first, with first-user preview", () => {
  const items = listLocalSessions(fixtureRoot());
  const s1 = items.find((i) => i.sessionId === "s1");
  expect(s1).toBeDefined();
  expect(s1?.project).toBe("-Users-me-proj");
  expect(s1?.firstMessage).toBe("hello there");
  expect(s1?.msgCount).toBe(2);
});

test("listLocalSessions on a missing root returns []", () => {
  expect(listLocalSessions(join(tmpdir(), "roguent-does-not-exist-xyz"))).toEqual([]);
});

test("readTranscriptLines parses each JSON line and skips blanks/garbage", () => {
  const root = fixtureRoot();
  const lines = readTranscriptLines(join(root, "-Users-me-proj", "broken.jsonl"));
  expect(lines).toEqual([]); // 唯一一行是坏的 → 跳过
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test src/engine/local-sessions.test.ts`
Expected: FAIL（模块/函数不存在）

- [ ] **Step 4: 写最小实现**

```ts
// src/engine/local-sessions.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { LocalSessionMeta } from "../shared/local-sessions";

export function defaultProjectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function readTranscriptLines(path: string): unknown[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* 跳过坏行 */
    }
  }
  return out;
}

function firstUserText(lines: unknown[]): string {
  for (const l of lines) {
    const o = l as { type?: string; message?: { content?: unknown } };
    if (o?.type === "user" && typeof o.message?.content === "string") {
      return o.message.content.slice(0, 80);
    }
  }
  return "";
}

export function listLocalSessions(root = defaultProjectsRoot()): LocalSessionMeta[] {
  if (!existsSync(root)) return [];
  const out: LocalSessionMeta[] = [];
  for (const project of readdirSync(root)) {
    const dir = join(root, project);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(dir, f);
      const lines = readTranscriptLines(path);
      if (lines.length === 0) continue;
      out.push({
        project,
        sessionId: basename(f, ".jsonl"),
        path,
        mtime: statSync(path).mtimeMs,
        firstMessage: firstUserText(lines),
        msgCount: lines.length,
      });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test src/engine/local-sessions.test.ts`
Expected: PASS（3 个 test）

- [ ] **Step 6: 提交**

```bash
git add src/shared/local-sessions.ts src/engine/local-sessions.ts src/engine/local-sessions.test.ts
git commit -m "feat: 🧩 扫描/读取 ~/.claude/projects 本地会话（meta + 容错读行）"
```

---

## Task 3: `Replayer` 计时回放 + `SessionManager.importSession`

**Files:**
- Create: `src/engine/import.ts`
- Modify: `src/engine/session.ts`
- Test: `src/engine/import.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/engine/import.test.ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RoomEvent, SessionCreatedPayload } from "../shared/events";
import { Replayer } from "./import";
import { SessionManager } from "./session";
import type { TimedDraft } from "./transcript";

test("Replayer caps long gaps at 2s and scales by speed", async () => {
  const drafts: TimedDraft[] = [
    { type: "session.created", payload: {}, ts: 0 },
    { type: "message.delta", payload: { text: "a" }, ts: 100 }, // gap 100
    { type: "message.delta", payload: { text: "b" }, ts: 999100 }, // gap capped → 2000
  ];
  const slept: number[] = [];
  const emitted: TimedDraft[] = [];
  const r = new Replayer(drafts, 2, {
    emit: (d) => emitted.push(d),
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  await r.run();
  expect(emitted).toHaveLength(3);
  // speed=2：gap 100 → 50ms；capped 2000 → 1000ms。
  expect(slept).toEqual([50, 1000]);
});

test("setSpeed mid-flight changes subsequent pacing", async () => {
  const drafts: TimedDraft[] = [
    { type: "session.created", payload: {}, ts: 0 },
    { type: "message.delta", payload: { text: "a" }, ts: 1000 },
    { type: "message.delta", payload: { text: "b" }, ts: 2000 },
  ];
  const slept: number[] = [];
  const r = new Replayer(drafts, 1, {
    emit: () => {},
    sleep: async (ms) => {
      slept.push(ms);
      if (slept.length === 1) r.setSpeed(4); // 提速后第二段 1000/4=250
    },
  });
  await r.run();
  expect(slept).toEqual([1000, 250]);
});

test("SessionManager.importSession stamps seq, injects project, broadcasts in order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roguent-imp-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    `${JSON.stringify({ type: "user", timestamp: "2026-06-05T10:00:00Z", cwd: dir, message: { role: "user", content: "go" } })}\n${JSON.stringify({ type: "assistant", timestamp: "2026-06-05T10:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } })}\n`,
  );
  const got: RoomEvent[] = [];
  const mgr = new SessionManager();
  mgr.subscribe((e) => got.push(e));
  await mgr.importSession("imp1", path, 1, { sleep: async () => {} });

  expect(got[0]?.type).toBe("session.created");
  expect(got[0]?.seq).toBe(1);
  expect(got[1]?.seq).toBe(2);
  // project 由 SessionManager 注入（projectFor(cwd)）。
  expect((got[0]?.payload as SessionCreatedPayload).project).toBeDefined();
  expect(got.some((e) => e.type === "message.delta")).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test src/engine/import.test.ts`
Expected: FAIL（`Replayer` / `importSession` 不存在）

- [ ] **Step 3: 写 `import.ts`**

```ts
// src/engine/import.ts
import type { TimedDraft } from "./transcript";

export interface ReplayDeps {
  emit: (d: TimedDraft) => void;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_GAP_MS = 2000;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 按封顶间隔 + speed 计时逐条发出 drafts。speed 可运行时改。 */
export class Replayer {
  private speed: number;
  constructor(
    private drafts: TimedDraft[],
    speed: number,
    private deps: ReplayDeps,
  ) {
    this.speed = speed > 0 ? speed : 1;
  }

  setSpeed(speed: number): void {
    if (speed > 0) this.speed = speed;
  }

  async run(): Promise<void> {
    const sleep = this.deps.sleep ?? realSleep;
    let prev = this.drafts[0]?.ts ?? 0;
    for (const d of this.drafts) {
      const gap = Math.min(Math.max(0, d.ts - prev), MAX_GAP_MS) / this.speed;
      if (gap > 0) await sleep(gap);
      prev = d.ts;
      this.deps.emit(d);
    }
  }
}
```

- [ ] **Step 4: 改 `session.ts` 加 `importSession` / `setReplaySpeed`**

在 import 区加：
```ts
import { readTranscriptLines } from "./local-sessions";
import { normalizeTranscript } from "./transcript";
import { Replayer, type ReplayDeps } from "./import";
import type { SessionCreatedPayload } from "../shared/events";
```

在 `SessionManager` 类里，`drivers` 字段旁加：
```ts
  private replayers = new Map<string, Replayer>();
```

在 `deleteSession` 之前加方法：
```ts
  // 第三个事件来源:导入本地 CC transcript,零额度压缩回放。不建 Driver,
  // 走 Replayer 计时发事件,seq 与 LIVE 会话同享 Sequencer。
  async importSession(
    id: string,
    path: string,
    speed: number,
    deps?: Pick<ReplayDeps, "sleep">,
  ): Promise<void> {
    const drafts = normalizeTranscript(readTranscriptLines(path));
    if (drafts.length === 0) return;
    const created = drafts[0].payload as SessionCreatedPayload;
    const cwd = created.cwd?.trim() || this.cwd;
    const project = projectFor(cwd);
    const replayer = new Replayer(drafts, speed, {
      sleep: deps?.sleep,
      emit: (d) => {
        const payload =
          d.type === "session.created"
            ? { ...(d.payload as Record<string, unknown>), cwd, project }
            : d.payload;
        this.emit(this.seq.stamp(id, d.type, payload, d.ts, d.agentId));
      },
    });
    this.replayers.set(id, replayer);
    await replayer.run();
  }

  setReplaySpeed(id: string, speed: number): void {
    this.replayers.get(id)?.setSpeed(speed);
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test src/engine/import.test.ts`
Expected: PASS（3 个 test）

- [ ] **Step 6: 提交**

```bash
git add src/engine/import.ts src/engine/import.test.ts src/engine/session.ts
git commit -m "feat: 🧩 Replayer 压缩计时回放 + SessionManager.importSession"
```

---

## Task 4: 端到端（fixture → 转换 → reduce）

**Files:**
- Create: `fixtures/sample-transcript.jsonl`
- Test: `src/web/import.e2e.test.ts`

- [ ] **Step 1: 建 mini CC transcript fixture**

```
{"type":"user","timestamp":"2026-06-05T10:00:00.000Z","cwd":"/work/kata","sessionId":"sX","message":{"role":"user","content":"复核并发改动"}}
{"type":"assistant","timestamp":"2026-06-05T10:00:00.200Z","message":{"role":"assistant","model":"claude-opus-4-8","content":[{"type":"text","text":"开始复核,派一个分身去查。"}]}}
{"type":"assistant","timestamp":"2026-06-05T10:00:00.400Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-coder","name":"Agent","input":{"subagent_type":"coder","description":"review concurrency"}}]}}
{"type":"assistant","timestamp":"2026-06-05T10:00:00.700Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"e1","name":"Edit","input":{"file_path":"src/x.ts"}}]}}
{"type":"user","timestamp":"2026-06-05T10:00:01.200Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"e1","content":"patched"}]}}
{"type":"user","timestamp":"2026-06-05T10:00:01.500Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-coder","content":"done"}]}}
```

- [ ] **Step 2: 写失败测试**

```ts
// src/web/import.e2e.test.ts
import { expect, test } from "bun:test";
import { readTranscriptLines } from "../engine/local-sessions";
import { normalizeTranscript } from "../engine/transcript";
import { ORCHESTRATOR_ID } from "../shared/domain";
import { type RoomState, reduce } from "./store";

// 端到端(零额度):本地 transcript → 纯转换 → DraftEvent 当 RoomEvent 喂 reduce,
// 断言「事件流 → 房间表现」与 LIVE/REPLAY 等价(spec §5 测试)。
test("imported transcript drives spawn → tool cycle → done → message", () => {
  const drafts = normalizeTranscript(readTranscriptLines("fixtures/sample-transcript.jsonl"));
  let st: RoomState = { sessions: {}, currentSessionId: null, projectOrder: [] };
  let seq = 0;
  for (const d of drafts) {
    st = reduce(st, { seq: ++seq, ts: d.ts, sessionId: "imp", type: d.type, agentId: d.agentId, payload: d.payload });
  }

  const s = st.sessions.imp;
  expect(s).toBeDefined();
  expect(st.currentSessionId).toBe("imp");

  // subagent 上场又离场。
  expect(Object.keys(s?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);

  // 助手对话进了 transcript。
  expect((s?.messages ?? []).filter((m) => m.role === "assistant").length).toBeGreaterThan(0);

  // 普通工具(Edit)在 orchestrator 上起又落。
  expect(s?.agents[ORCHESTRATOR_ID]?.currentTool).toBeUndefined();
});

test("subagent appears mid-stream before its result", () => {
  const drafts = normalizeTranscript(readTranscriptLines("fixtures/sample-transcript.jsonl"));
  let st: RoomState = { sessions: {}, currentSessionId: null, projectOrder: [] };
  let seq = 0;
  // 只放到 agent.spawned 之前那条之后(spawn 已发、done 未发)。
  const upto = drafts.findIndex((d) => d.type === "agent.spawned");
  for (let i = 0; i <= upto; i++) {
    const d = drafts[i];
    st = reduce(st, { seq: ++seq, ts: d.ts, sessionId: "imp", type: d.type, agentId: d.agentId, payload: d.payload });
  }
  expect(st.sessions.imp?.agents["tu-coder"]).toBeDefined();
});
```

- [ ] **Step 3: 运行测试确认失败 → 然后通过**

Run: `bun test src/web/import.e2e.test.ts`
Expected: 先 FAIL（fixture 不存在则报读不到 / 断言不符），建好 fixture + 前序任务已实现后 PASS（2 个 test）

- [ ] **Step 4: 提交**

```bash
git add fixtures/sample-transcript.jsonl src/web/import.e2e.test.ts
git commit -m "test: 🧪 导入 transcript 端到端(转换→reduce)主链路断言"
```

---

## Task 5: WS 协议（3 命令 + 定向回包）

**Files:**
- Modify: `src/engine/ws-gateway.ts`
- Test: `src/engine/ws-gateway.test.ts`

- [ ] **Step 1: 写失败测试（扩 `ws-gateway.test.ts`）**

在文件末尾追加：
```ts
test("parseCommand accepts listLocalSessions / importSession / setReplaySpeed", () => {
  expect(parseCommand('{"cmd":"listLocalSessions"}')).toEqual({ cmd: "listLocalSessions" });
  expect(
    parseCommand('{"cmd":"importSession","path":"/a/b.jsonl","speed":2}'),
  ).toEqual({ cmd: "importSession", path: "/a/b.jsonl", speed: 2 });
  // speed 可省(默认 1)。
  expect(
    parseCommand('{"cmd":"importSession","path":"/a/b.jsonl"}')?.cmd,
  ).toBe("importSession");
  expect(
    parseCommand('{"cmd":"setReplaySpeed","sessionId":"s1","speed":4}'),
  ).toEqual({ cmd: "setReplaySpeed", sessionId: "s1", speed: 4 });
  // 非法:path 非字符串 / speed 非数字 / 缺字段。
  expect(parseCommand('{"cmd":"importSession","path":5}')).toBeNull();
  expect(parseCommand('{"cmd":"setReplaySpeed","sessionId":"s1"}')).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test src/engine/ws-gateway.test.ts`
Expected: FAIL（新命令返回 null）

- [ ] **Step 3: 改 `ws-gateway.ts`**

`Command` 联合类型追加成员：
```ts
  | { cmd: "listLocalSessions" }
  | { cmd: "importSession"; path: string; speed?: number }
  | { cmd: "setReplaySpeed"; sessionId: string; speed: number }
```

`parseCommand` 的 switch 追加分支（放在 `default` 之前）：
```ts
    case "listLocalSessions":
      return { cmd: "listLocalSessions" };
    case "importSession":
      return typeof o.path === "string" &&
        (o.speed === undefined || typeof o.speed === "number")
        ? (o as Command)
        : null;
    case "setReplaySpeed":
      return typeof o.sessionId === "string" && typeof o.speed === "number"
        ? (o as Command)
        : null;
```

顶部 import 追加：
```ts
import { basename } from "node:path";
import { listLocalSessions } from "./local-sessions";
import type { ControlMessage } from "../shared/local-sessions";
```

`WsGateway` 加导入计数字段（在 `clients` 旁）：
```ts
  private importSeq = 0;
```

连接处理改成把 `ws` 传进 `onCommand`：
```ts
      ws.on("message", (data) => void this.onCommand(String(data), ws));
```

`onCommand` 改为带 ws、异步，并加 3 分支：
```ts
  private async onCommand(raw: string, ws: WebSocket): Promise<void> {
    const c = parseCommand(raw);
    if (!c) return;
    if (c.cmd === "newSession")
      this.mgr.createSession(c.sessionId, { title: c.title, model: c.model, cwd: c.cwd });
    else if (c.cmd === "sendMessage") this.mgr.sendMessage(c.sessionId, c.text);
    else if (c.cmd === "setModel") void this.mgr.setModel(c.sessionId, c.model);
    else if (c.cmd === "interrupt") void this.mgr.interrupt(c.sessionId);
    else if (c.cmd === "deleteSession") this.mgr.deleteSession(c.sessionId);
    else if (c.cmd === "listLocalSessions") this.reply(ws, { kind: "control", type: "localSessions", items: listLocalSessions() });
    else if (c.cmd === "importSession") {
      const id = `${basename(c.path, ".jsonl")}#imp${++this.importSeq}`;
      try {
        await this.mgr.importSession(id, c.path, c.speed ?? 1);
      } catch (e) {
        this.reply(ws, { kind: "control", type: "importError", path: c.path, reason: e instanceof Error ? e.message : String(e) });
      }
    } else if (c.cmd === "setReplaySpeed") this.mgr.setReplaySpeed(c.sessionId, c.speed);
  }

  private reply(ws: WebSocket, msg: ControlMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test src/engine/ws-gateway.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/engine/ws-gateway.ts src/engine/ws-gateway.test.ts
git commit -m "feat: 🧩 WS 加 list/import/setReplaySpeed 命令 + 定向控制回包"
```

---

## Task 6: 前端控制消息分流 + ui-store 状态

**Files:**
- Modify: `src/web/ws-client.ts`
- Modify: `src/web/ws-client.test.ts`
- Modify: `src/web/ui-store.ts`
- Modify: `src/web/ui-store.test.ts`

- [ ] **Step 1: 写失败测试（ws-client）**

在 `ws-client.test.ts` 末尾追加：
```ts
import type { ControlMessage } from "../shared/local-sessions";

test("handleIncoming routes control messages to onControl, not the event sink", () => {
  const events: RoomEvent[] = [];
  const controls: ControlMessage[] = [];
  handleIncoming(
    '{"kind":"control","type":"localSessions","items":[]}',
    (e) => events.push(e),
    (c) => controls.push(c),
  );
  expect(events).toHaveLength(0);
  expect(controls).toHaveLength(1);
  expect(controls[0]?.type).toBe("localSessions");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test src/web/ws-client.test.ts`
Expected: FAIL（handleIncoming 不接受第三参 / 未分流）

- [ ] **Step 3: 改 `ws-client.ts`**

`handleIncoming` 改为：
```ts
import type { ControlMessage } from "../shared/local-sessions";

export function handleIncoming(
  raw: string,
  apply: (e: RoomEvent) => void,
  onControl?: (c: ControlMessage) => void,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // ignore malformed frames
  }
  if (parsed && typeof parsed === "object" && (parsed as { kind?: string }).kind === "control") {
    onControl?.(parsed as ControlMessage);
    return;
  }
  apply(parsed as RoomEvent);
}
```

`connectRoom` 里把 ui-store 的动作接上（在 `apply` 取得处下方）：
```ts
  const onControl = (c: ControlMessage) => {
    const ui = useUiStore.getState();
    if (c.kind === "control" && c.type === "localSessions") ui.setLocalSessions(c.items);
    else if (c.kind === "control" && c.type === "importError") ui.setImportError(c.reason);
  };
```
并在 `ws.onmessage` 处改为：
```ts
    ws.onmessage = (ev) => handleIncoming(String(ev.data), apply, onControl);
```
顶部加：
```ts
import { useUiStore } from "./ui-store";
import type { ControlMessage } from "../shared/local-sessions";
```

- [ ] **Step 4: 写失败测试（ui-store）**

在 `ui-store.test.ts` 末尾追加：
```ts
import type { LocalSessionMeta } from "../shared/local-sessions";

test("setLocalSessions / setImportError update import state", () => {
  const meta: LocalSessionMeta = { project: "p", sessionId: "s", path: "/p/s.jsonl", mtime: 1, firstMessage: "hi", msgCount: 2 };
  useUiStore.getState().setLocalSessions([meta]);
  expect(useUiStore.getState().localSessions).toEqual([meta]);
  useUiStore.getState().setImportError("boom");
  expect(useUiStore.getState().importError).toBe("boom");
  useUiStore.getState().setLocalSessions([]); // 重新列表清掉旧错误
  expect(useUiStore.getState().importError).toBeNull();
});
```

- [ ] **Step 5: 改 `ui-store.ts`**

在 state 接口加字段：
```ts
  localSessions: LocalSessionMeta[];
  importError: string | null;
  setLocalSessions: (items: LocalSessionMeta[]) => void;
  setImportError: (reason: string | null) => void;
```
顶部 import：
```ts
import type { LocalSessionMeta } from "../shared/local-sessions";
```
初始值加 `localSessions: [], importError: null,`，并加动作：
```ts
  setLocalSessions: (items) => set({ localSessions: items, importError: null }),
  setImportError: (reason) => set({ importError: reason }),
```
> 注：若 `ui-store.ts` 的 `toggle` 用了 `infoOpen/modelOpen/...` 集合,新增一个 `importOpen` 面板开关到同一处（与现有 `lootOpen` 同形），供 Task 7 的入口按钮用。

- [ ] **Step 6: 运行两处测试确认通过**

Run: `bun test src/web/ws-client.test.ts src/web/ui-store.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/web/ws-client.ts src/web/ws-client.test.ts src/web/ui-store.ts src/web/ui-store.test.ts
git commit -m "feat: 🧩 前端控制消息分流 + ui-store 导入列表/错误状态"
```

---

## Task 7: 导入面板 UI + HUD 入口

**Files:**
- Create: `src/web/hud/ImportPanel.tsx`
- Modify: `src/web/hud/Hud.tsx`

> `.tsx` 组件按本仓库约定不走 bun:test（无 DOM）：用 `bun run build` + `bun run check` + 回放冒烟验证。可测逻辑已在前序任务下沉到纯函数。

- [ ] **Step 1: 建 `ImportPanel.tsx`**

```tsx
// src/web/hud/ImportPanel.tsx
import { useEffect } from "react";
import { sendCommand } from "../ws-client";
import { useUiStore } from "../ui-store";

const SPEEDS = [1, 2, 4];

export function ImportPanel() {
  const open = useUiStore((s) => s.importOpen);
  const items = useUiStore((s) => s.localSessions);
  const error = useUiStore((s) => s.importError);

  // 面板打开即拉一次列表。
  useEffect(() => {
    if (open) sendCommand({ cmd: "listLocalSessions" });
  }, [open]);

  if (!open) return null;
  return (
    <div className="px-panel px-pop" style={{ position: "absolute", top: 70, right: 12, width: 300, maxHeight: 420, overflowY: "auto", padding: 12 }}>
      <div className="px-title">📂 导入本地会话</div>
      {error && <div style={{ color: "var(--pink)", margin: "6px 0" }}>⚠ {error}</div>}
      {items.length === 0 && <div className="px-stat">没有本地会话</div>}
      {items.map((m) => (
        <button
          key={m.path}
          type="button"
          className="px-row"
          style={{ display: "block", width: "100%", textAlign: "left", margin: "4px 0", cursor: "pointer" }}
          onClick={() => sendCommand({ cmd: "importSession", path: m.path, speed: 1 })}
        >
          <div className="px-stat cy">{m.project}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{m.firstMessage || m.sessionId}</div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>{m.msgCount} 行</div>
        </button>
      ))}
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <span className="px-stat">速度</span>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            className="px-stat"
            style={{ cursor: "pointer" }}
            onClick={() => {
              const id = useUiStore.getState().currentImportId;
              if (id) sendCommand({ cmd: "setReplaySpeed", sessionId: id, speed: sp });
            }}
          >
            {sp}x
          </button>
        ))}
      </div>
    </div>
  );
}
```

> `currentImportId`：在 `ui-store` 加一个可选 `currentImportId: string | null`（初始 null），并在 `connectRoom` 的 `apply` 之外不便取，故简化：本任务先让速度键对「最近一次导入的会话」生效 —— 在 ui-store 的 `setLocalSessions` 邻近加 `currentImportId`，并在前端发 `importSession` 时本地记下 id。**实现细节**：把 `importSession` 的 id 生成移到前端不可行（id 在 engine 生成）。因此 M1 先用「当前选中会话 = `useRoomStore.getState().currentSessionId`」作为调速目标：把上面 `onClick` 改成 `const id = useRoomStore.getState().currentSessionId;`，并 `import { useRoomStore } from "../store";`。删除对 `currentImportId` 的依赖。

- [ ] **Step 2: 按上面注记修正调速目标为 `useRoomStore.getState().currentSessionId`**

把 `ImportPanel.tsx` 顶部加 `import { useRoomStore } from "../store";`，速度键 `onClick` 改为：
```tsx
            onClick={() => {
              const id = useRoomStore.getState().currentSessionId;
              if (id) sendCommand({ cmd: "setReplaySpeed", sessionId: id, speed: sp });
            }}
```
（不再用 `currentImportId`，ui-store 无需该字段。）

- [ ] **Step 3: 改 `Hud.tsx` 加入口按钮 + 挂载面板**

import 追加：
```tsx
import { ImportPanel } from "./ImportPanel";
```
在 `💬 聊天` 的 `IconButton` 之后加一个入口（放右上、`💎 模型` 下方）：
```tsx
      <IconButton
        icon="📂"
        title="导入会话"
        lit={ui.importOpen}
        pos={{ top: 70, right: 12 }}
        onClick={() => toggle("importOpen")}
      />
```
在 `<SkillGrid />` 同级挂载：
```tsx
      <ImportPanel />
```

- [ ] **Step 4: 构建 + 校验**

Run: `bun run check && bun run build`
Expected: 均无错误（biome 干净、Vite 构建通过）

- [ ] **Step 5: 回放冒烟（手动，零额度）**

1. 一个终端 `bun run dev:engine`（LIVE 模式即可，导入不依赖 fixture replay）。
2. 另一终端 `bun run dev:web`，浏览器开 `http://localhost:5173`。
3. 点右上 `📂` → 面板列出 `~/.claude/projects` 下的本地会话（分组、预览）。
4. 选一条 → 总览世界出现该会话房间 → 进入内景看到小人按压缩时间线重演（spawn/工具/对话）。
5. 切 `1x/2x/4x` → 后续事件节奏变化。
6. 把观察结果记到本任务下。

- [ ] **Step 6: 提交**

```bash
git add src/web/hud/ImportPanel.tsx src/web/hud/Hud.tsx
git commit -m "feat: 🧩 导入面板 UI + HUD 📂 入口（列表/选择/调速）"
```

---

## 全量验证 + 收口

- [ ] **Step 1: 全量测试 + 校验**

Run: `bun test && bun run check`
Expected: 全绿（含新增约 15 个 test）、biome 干净

- [ ] **Step 2: 回写 spec 状态**

把 `docs/superpowers/specs/2026-06-05-import-local-sessions-design.md` frontmatter 的 `status: design` 改 `status: M1-done`，M1 里程碑行标注完成 commit。

- [ ] **Step 3: 合并回 main（按 workflow.md）**

记 worktree HEAD SHA → 回主工作树 `git merge --no-ff <sha>` → 主树再跑 `bun test` → **push 需用户确认**。

---

## Self-Review 记录

- **Spec 覆盖**:§1 组件 → Task 1-7 全覆盖;§2 数据流 → Task 3/5/6/7;§3 转换映射 → Task 1（含 subagent 认 Task/Agent、is_error→failed、gap 封顶在 Task 3）;§4 错误处理 → Task 1（坏行跳过）/Task 2（缺目录→[]）/Task 5（importError 回包）;§5 测试 → Task 1-6 各自单测 + Task 4 e2e;§6 M2 接缝 → 不在本计划（spec 已注明后续）。
- **Placeholder**:无 TBD/TODO;每个代码步给了完整代码。
- **类型一致**:`TimedDraft`(Task 1)→ import/session(Task 3)一致;`LocalSessionMeta`/`ControlMessage`(Task 2)→ ws-gateway(Task 5)/ws-client/ui-store(Task 6)/ImportPanel(Task 7)一致;`normalizeTranscript(lines)`/`readTranscriptLines(path)`/`listLocalSessions(root?)`/`Replayer`/`importSession`/`setReplaySpeed` 各处签名统一。
- **已知简化**:Task 7 调速目标用 `currentSessionId`(当前选中会话),非严格「该导入会话」;M1 可接受,记录在案。
