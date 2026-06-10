import { describe, expect, it } from "bun:test";
import type { RoomEvent } from "../../shared/events";
import type { IntegrationEvent } from "../integrations/types";
import type { RuntimeEventDraft } from "../runtime/types";
import {
  ReplayValidationError,
  detectFixtureFormat,
  detectFixtureLineKind,
  loadAnyFixture,
  normalizeCodexFixture,
  parseReplayRecords,
  replayRecordToRoomEvents,
  validateReplayRecord,
} from "./prototype-fixtures";

// ── helpers ──────────────────────────────────────────────────────────────────

const baseRoomEvent = (): RoomEvent => ({
  seq: 1,
  ts: 1000,
  sessionId: "s1",
  type: "session.created",
  payload: {
    title: "test",
    model: "claude-opus-4-8",
    permissionMode: "default",
    apiKeySource: "oauth",
    slashCommands: [],
  },
});

const baseIntegrationEvent = (): IntegrationEvent => ({
  id: "evt-1",
  channel: "wechat",
  direction: "inbound",
  summary: "Hello from WeChat",
  receivedAt: 1717452000000,
  externalChatId: "wx-chat-42",
  bodyText: "Please help me debug this.",
  from: "wx_user_fake_id",
  displayName: "Test User",
});

const baseRuntimeDraft = (): RuntimeEventDraft => ({
  type: "message.delta",
  payload: { text: "Hello from Claude" },
  agentId: "orchestrator",
});

function makeSeq(): () => number {
  let n = 0;
  return () => ++n;
}

// ── detectFixtureLineKind ────────────────────────────────────────────────────

describe("detectFixtureLineKind", () => {
  it("detects replayRecord with atMs + kind=roomEvent", () => {
    expect(
      detectFixtureLineKind({ atMs: 0, kind: "roomEvent", event: {} }),
    ).toBe("replayRecord");
  });

  it("detects replayRecord with atMs + kind=integrationEvent", () => {
    expect(
      detectFixtureLineKind({ atMs: 100, kind: "integrationEvent", event: {} }),
    ).toBe("replayRecord");
  });

  it("detects replayRecord with atMs + kind=runtimeDraft", () => {
    expect(
      detectFixtureLineKind({
        atMs: 200,
        kind: "runtimeDraft",
        runtime: "claude",
        draft: {},
      }),
    ).toBe("replayRecord");
  });

  it("detects legacy roomEvent by seq + type", () => {
    expect(
      detectFixtureLineKind({
        seq: 1,
        ts: 0,
        sessionId: "s1",
        type: "session.created",
        payload: {},
      }),
    ).toBe("roomEvent");
  });

  it("detects codexEvent by kind field without atMs", () => {
    expect(
      detectFixtureLineKind({ kind: "thread.created", threadId: "t1" }),
    ).toBe("codexEvent");
  });

  it("returns unknown for unrecognized shapes", () => {
    expect(detectFixtureLineKind({ foo: "bar" })).toBe("unknown");
    expect(detectFixtureLineKind(null)).toBe("unknown");
    expect(detectFixtureLineKind(42)).toBe("unknown");
  });
});

// ── validateReplayRecord ─────────────────────────────────────────────────────

describe("validateReplayRecord — roomEvent", () => {
  it("accepts a valid roomEvent record", () => {
    const r = validateReplayRecord({
      atMs: 0,
      kind: "roomEvent",
      event: baseRoomEvent(),
    });
    expect(r.kind).toBe("roomEvent");
    if (r.kind === "roomEvent") {
      expect(r.event.seq).toBe(1);
      expect(r.event.type).toBe("session.created");
    }
  });

  it("rejects roomEvent with missing event.seq", () => {
    const raw = {
      atMs: 0,
      kind: "roomEvent",
      event: { ts: 0, sessionId: "s1", type: "session.created", payload: {} },
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects roomEvent with missing event.type", () => {
    const raw = {
      atMs: 0,
      kind: "roomEvent",
      event: { seq: 1, ts: 0, sessionId: "s1", payload: {} },
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });
});

describe("validateReplayRecord — integrationEvent", () => {
  it("accepts a valid integrationEvent record", () => {
    const r = validateReplayRecord({
      atMs: 100,
      kind: "integrationEvent",
      event: baseIntegrationEvent(),
    });
    expect(r.kind).toBe("integrationEvent");
    if (r.kind === "integrationEvent") {
      expect(r.event.channel).toBe("wechat");
      expect(r.event.direction).toBe("inbound");
    }
  });

  it("rejects integrationEvent with bad channel", () => {
    const raw = {
      atMs: 100,
      kind: "integrationEvent",
      event: { ...baseIntegrationEvent(), channel: "telegram" },
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects integrationEvent with bad direction", () => {
    const raw = {
      atMs: 100,
      kind: "integrationEvent",
      event: { ...baseIntegrationEvent(), direction: "sideways" },
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects integrationEvent with missing id", () => {
    const { id: _id, ...noId } = baseIntegrationEvent();
    const raw = { atMs: 100, kind: "integrationEvent", event: noId };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });
});

describe("validateReplayRecord — runtimeDraft", () => {
  it("accepts a valid runtimeDraft record", () => {
    const r = validateReplayRecord({
      atMs: 200,
      kind: "runtimeDraft",
      runtime: "claude",
      draft: baseRuntimeDraft(),
    });
    expect(r.kind).toBe("runtimeDraft");
    if (r.kind === "runtimeDraft") {
      expect(r.runtime).toBe("claude");
      expect(r.draft.type).toBe("message.delta");
    }
  });

  it("accepts runtimeDraft with runtime=codex", () => {
    const r = validateReplayRecord({
      atMs: 300,
      kind: "runtimeDraft",
      runtime: "codex",
      draft: { type: "agent.thinking", payload: {} },
    });
    expect(r.kind).toBe("runtimeDraft");
    if (r.kind === "runtimeDraft") {
      expect(r.runtime).toBe("codex");
    }
  });

  it("rejects runtimeDraft with unknown runtime", () => {
    const raw = {
      atMs: 200,
      kind: "runtimeDraft",
      runtime: "gemini",
      draft: baseRuntimeDraft(),
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects runtimeDraft with missing draft.type", () => {
    const raw = {
      atMs: 200,
      kind: "runtimeDraft",
      runtime: "claude",
      draft: { payload: {} },
    };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });
});

describe("validateReplayRecord — common errors", () => {
  it("rejects missing atMs", () => {
    const raw = { kind: "roomEvent", event: baseRoomEvent() };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects unknown kind", () => {
    const raw = { atMs: 0, kind: "webhookPayload", data: {} };
    expect(() => validateReplayRecord(raw)).toThrow(ReplayValidationError);
  });

  it("rejects non-object", () => {
    expect(() => validateReplayRecord("hello")).toThrow(ReplayValidationError);
    expect(() => validateReplayRecord(null)).toThrow(ReplayValidationError);
    expect(() => validateReplayRecord(42)).toThrow(ReplayValidationError);
  });
});

// ── parseReplayRecords ────────────────────────────────────────────────────────

describe("parseReplayRecords", () => {
  it("parses a JSONL with mixed record kinds", () => {
    const records = [
      { atMs: 0, kind: "roomEvent", event: baseRoomEvent() },
      {
        atMs: 100,
        kind: "integrationEvent",
        event: baseIntegrationEvent(),
      },
      {
        atMs: 200,
        kind: "runtimeDraft",
        runtime: "claude",
        draft: baseRuntimeDraft(),
      },
    ];
    const jsonl = records.map((r) => JSON.stringify(r)).join("\n");
    const parsed = parseReplayRecords(jsonl);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.kind).toBe("roomEvent");
    expect(parsed[1]?.kind).toBe("integrationEvent");
    expect(parsed[2]?.kind).toBe("runtimeDraft");
  });

  it("skips empty lines", () => {
    const jsonl = `${JSON.stringify({ atMs: 0, kind: "roomEvent", event: baseRoomEvent() })}\n\n\n`;
    const parsed = parseReplayRecords(jsonl);
    expect(parsed).toHaveLength(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReplayRecords("{bad json}")).toThrow(
      ReplayValidationError,
    );
  });

  it("throws on invalid record", () => {
    const jsonl = JSON.stringify({ atMs: 0, kind: "unknown_kind", event: {} });
    expect(() => parseReplayRecords(jsonl)).toThrow(ReplayValidationError);
  });
});

// ── replayRecordToRoomEvents ─────────────────────────────────────────────────

describe("replayRecordToRoomEvents", () => {
  it("emits roomEvent as-is", () => {
    const record = validateReplayRecord({
      atMs: 0,
      kind: "roomEvent",
      event: baseRoomEvent(),
    });
    const ctx = { sessionId: "test", seq: makeSeq() };
    const events = replayRecordToRoomEvents(record, ctx);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(baseRoomEvent());
  });

  it("converts integrationEvent to integration.event.received", () => {
    const record = validateReplayRecord({
      atMs: 100,
      kind: "integrationEvent",
      event: baseIntegrationEvent(),
    });
    const ctx = { sessionId: "s-int", seq: makeSeq() };
    const events = replayRecordToRoomEvents(record, ctx);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type).toBe("integration.event.received");
    expect(e.sessionId).toBe("s-int");
    const payload = e.payload as { channel: string; direction: string };
    expect(payload.channel).toBe("wechat");
    expect(payload.direction).toBe("inbound");
  });

  it("converts runtimeDraft to RoomEvent with correct type", () => {
    const record = validateReplayRecord({
      atMs: 200,
      kind: "runtimeDraft",
      runtime: "claude",
      draft: baseRuntimeDraft(),
    });
    const ctx = { sessionId: "s-rt", seq: makeSeq() };
    const events = replayRecordToRoomEvents(record, ctx);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type).toBe("message.delta");
    expect(e.sessionId).toBe("s-rt");
    expect(e.agentId).toBe("orchestrator");
    const payload = e.payload as { text: string };
    expect(payload.text).toBe("Hello from Claude");
  });
});

// ── detectFixtureFormat ────────────────────────────────────────────────────

describe("detectFixtureFormat", () => {
  it("detects replayRecord format", () => {
    const line = JSON.stringify({
      atMs: 0,
      kind: "roomEvent",
      event: baseRoomEvent(),
    });
    expect(detectFixtureFormat(line)).toBe("replayRecord");
  });

  it("detects legacy roomEvent format (seq+type)", () => {
    const line = JSON.stringify(baseRoomEvent());
    expect(detectFixtureFormat(line)).toBe("roomEvent");
  });

  it("detects codexEvent format", () => {
    const line = JSON.stringify({ kind: "thread.created", threadId: "t1" });
    expect(detectFixtureFormat(line)).toBe("codexEvent");
  });

  it("defaults to roomEvent for empty string", () => {
    expect(detectFixtureFormat("")).toBe("roomEvent");
    expect(detectFixtureFormat("   \n   ")).toBe("roomEvent");
  });
});

// ── normalizeCodexFixture ────────────────────────────────────────────────────

describe("normalizeCodexFixture", () => {
  it("converts codex events to room events", () => {
    const codexEvents = [
      {
        kind: "thread.created",
        threadId: "t1",
        model: "gpt-5",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        networkAccess: false,
      },
      {
        kind: "assistant.delta",
        threadId: "t1",
        turnId: "turn-1",
        itemId: "msg-1",
        text: "Hello",
      },
    ];
    const jsonl = codexEvents.map((e) => JSON.stringify(e)).join("\n");
    const events = normalizeCodexFixture(jsonl, "s-codex");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.sessionId === "s-codex")).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("session.created");
  });
});

// ── loadAnyFixture — real fixtures ────────────────────────────────────────────

describe("loadAnyFixture — real fixtures", () => {
  it("loads sample-run.jsonl (legacy roomEvent format)", async () => {
    const events = await loadAnyFixture("fixtures/sample-run.jsonl", "replay");
    expect(events.length).toBeGreaterThan(0);
    // All events should have seq and type
    for (const e of events) {
      expect(typeof e.seq).toBe("number");
      expect(typeof e.type).toBe("string");
    }
  });

  it("loads codex-chat.jsonl (codex event format → normalized)", async () => {
    const events = await loadAnyFixture(
      "fixtures/runtime/codex-chat.jsonl",
      "replay",
    );
    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain("session.created");
  });

  it("loads claude-chat.jsonl (replayRecord format)", async () => {
    const events = await loadAnyFixture(
      "fixtures/runtime/claude-chat.jsonl",
      "replay",
    );
    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain("session.created");
  });
});

// ── Validate existing integration fixtures as raw webhook payloads ─────────

describe("existing integration fixtures — raw webhook shape validation", () => {
  // These fixtures are raw webhook payloads (NOT normalized IntegrationEvents)
  // Validate the fields their respective channels emit.

  it("feishu-inbound.json has event_id and message fields", async () => {
    const raw = (await Bun.file(
      "fixtures/integrations/feishu-inbound.json",
    ).json()) as Record<string, unknown>;
    expect(typeof raw.event_id).toBe("string");
    // message field
    expect(raw.message).toBeDefined();
    const message = raw.message as Record<string, unknown>;
    expect(typeof message.message_id).toBe("string");
  });

  it("github-push.json has ref and commits fields", async () => {
    const raw = (await Bun.file(
      "fixtures/integrations/github-push.json",
    ).json()) as Record<string, unknown>;
    expect(typeof raw.ref).toBe("string");
    expect(Array.isArray(raw.commits)).toBe(true);
    const commits = raw.commits as Array<Record<string, unknown>>;
    expect(commits.length).toBeGreaterThan(0);
  });

  it("github-workflow.json has workflow_run field", async () => {
    const raw = (await Bun.file(
      "fixtures/integrations/github-workflow.json",
    ).json()) as Record<string, unknown>;
    expect(raw.workflow_run).toBeDefined();
    const wf = raw.workflow_run as Record<string, unknown>;
    expect(typeof wf.status).toBe("string");
  });

  it("x-post.json has tweet_create_events", async () => {
    const raw = (await Bun.file(
      "fixtures/integrations/x-post.json",
    ).json()) as Record<string, unknown>;
    expect(Array.isArray(raw.tweet_create_events)).toBe(true);
    const tweets = raw.tweet_create_events as Array<Record<string, unknown>>;
    expect(tweets.length).toBeGreaterThan(0);
    expect(typeof tweets[0]!.text).toBe("string");
  });

  it("x-crc.json has crc_token", async () => {
    const raw = (await Bun.file(
      "fixtures/integrations/x-crc.json",
    ).json()) as Record<string, unknown>;
    expect(typeof raw.crc_token).toBe("string");
  });

  it("wechat-inbound.json has channel=wechat and direction=inbound", async () => {
    // wechat-inbound.json is authored as IntegrationEvent (not raw webhook)
    const raw = (await Bun.file(
      "fixtures/integrations/wechat-inbound.json",
    ).json()) as Record<string, unknown>;
    expect(raw.channel).toBe("wechat");
    expect(raw.direction).toBe("inbound");
    expect(typeof raw.id).toBe("string");
    expect(typeof raw.summary).toBe("string");
    expect(typeof raw.receivedAt).toBe("number");
  });
});
