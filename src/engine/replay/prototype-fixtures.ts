/**
 * Replay Fixture Harness for Prototype Integrations
 *
 * Supports three fixture "kinds" in a unified JSONL format:
 *   - roomEvent    → already-normalized RoomEvent, broadcast as-is
 *   - runtimeDraft → RuntimeEventDraft for a given RuntimeKind; normalized via
 *                    the same normalizer the live engine uses
 *   - integrationEvent → IntegrationEvent; converted to RoomEvent(s) via a
 *                        lightweight in-process router (no real connectors)
 *
 * Backward-compat: existing fixtures that use bare RoomEvent lines (with `seq`
 * and `type`) or bare CodexRuntimeEvent lines (with `kind` but no `atMs`) are
 * detected automatically and handled via the appropriate legacy path so the
 * existing replay command keeps working unchanged.
 */

import type { RoomEvent, RoomEventType } from "../../shared/events";
import type { NormalizedIntegrationEvent } from "../../shared/integrations";
import type { RuntimeKind } from "../../shared/runtime";
import type { IntegrationEvent } from "../integrations/types";
import { normalizeCodexRuntimeEvents } from "../runtime/codex-normalize";
import type { CodexRuntimeEvent } from "../runtime/codex-protocol";
import type { RuntimeEventDraft } from "../runtime/types";

// ── ReplayRecord union ──────────────────────────────────────────────────────

export type ReplayRecord =
  | { atMs: number; kind: "roomEvent"; event: RoomEvent }
  | {
      atMs: number;
      kind: "integrationEvent";
      event: IntegrationEvent;
    }
  | {
      atMs: number;
      kind: "runtimeDraft";
      runtime: RuntimeKind;
      draft: RuntimeEventDraft;
    };

// ── Detected fixture line format ────────────────────────────────────────────

export type FixtureLineKind =
  | "replayRecord" // has atMs + kind ∈ {roomEvent,integrationEvent,runtimeDraft}
  | "roomEvent" // legacy: has seq + type (old RoomEvent JSONL)
  | "codexEvent" // legacy: has kind (CodexRuntimeEvent) but no atMs
  | "unknown";

export function detectFixtureLineKind(line: unknown): FixtureLineKind {
  if (!line || typeof line !== "object" || Array.isArray(line))
    return "unknown";
  const o = line as Record<string, unknown>;

  // ReplayRecord: must have numeric atMs AND kind in the known set
  if (
    typeof o.atMs === "number" &&
    typeof o.kind === "string" &&
    (o.kind === "roomEvent" ||
      o.kind === "integrationEvent" ||
      o.kind === "runtimeDraft")
  ) {
    return "replayRecord";
  }

  // Legacy RoomEvent: has seq (number) and type (string)
  if (typeof o.seq === "number" && typeof o.type === "string") {
    return "roomEvent";
  }

  // Codex runtime event: has kind (string), no atMs — treat as CodexRuntimeEvent
  if (typeof o.kind === "string") {
    return "codexEvent";
  }

  return "unknown";
}

// ── Validation ──────────────────────────────────────────────────────────────

export class ReplayValidationError extends Error {
  constructor(
    message: string,
    public readonly lineIndex?: number,
  ) {
    super(lineIndex !== undefined ? `line ${lineIndex}: ${message}` : message);
    this.name = "ReplayValidationError";
  }
}

function assertString(
  value: unknown,
  field: string,
  lineIndex?: number,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ReplayValidationError(
      `field "${field}" must be a non-empty string`,
      lineIndex,
    );
  }
  return value;
}

function assertNumber(
  value: unknown,
  field: string,
  lineIndex?: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ReplayValidationError(
      `field "${field}" must be a finite number`,
      lineIndex,
    );
  }
  return value;
}

function validateIntegrationEvent(
  raw: unknown,
  lineIndex?: number,
): IntegrationEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReplayValidationError(
      "integrationEvent.event must be an object",
      lineIndex,
    );
  }
  const o = raw as Record<string, unknown>;
  const id = assertString(o.id, "event.id", lineIndex);
  const channel = assertString(o.channel, "event.channel", lineIndex);
  const VALID_CHANNELS = new Set(["wechat", "feishu", "github", "x", "relay"]);
  if (!VALID_CHANNELS.has(channel)) {
    throw new ReplayValidationError(
      `event.channel must be one of ${[...VALID_CHANNELS].join("|")}, got "${channel}"`,
      lineIndex,
    );
  }
  const direction = assertString(o.direction, "event.direction", lineIndex);
  if (direction !== "inbound" && direction !== "outbound") {
    throw new ReplayValidationError(
      `event.direction must be "inbound" or "outbound", got "${direction}"`,
      lineIndex,
    );
  }
  const summary = assertString(o.summary, "event.summary", lineIndex);
  const receivedAt = assertNumber(o.receivedAt, "event.receivedAt", lineIndex);
  return {
    id,
    channel: channel as IntegrationEvent["channel"],
    direction: direction as "inbound" | "outbound",
    summary,
    receivedAt,
    externalChatId:
      typeof o.externalChatId === "string" ? o.externalChatId : undefined,
    deliveryId: typeof o.deliveryId === "string" ? o.deliveryId : undefined,
    bodyText: typeof o.bodyText === "string" ? o.bodyText : undefined,
    from: typeof o.from === "string" ? o.from : undefined,
    to: typeof o.to === "string" ? o.to : undefined,
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
    metadata:
      o.metadata && typeof o.metadata === "object" && !Array.isArray(o.metadata)
        ? (o.metadata as Record<string, unknown>)
        : undefined,
  };
}

function validateRuntimeDraft(
  raw: unknown,
  lineIndex?: number,
): RuntimeEventDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReplayValidationError(
      "runtimeDraft.draft must be an object",
      lineIndex,
    );
  }
  const o = raw as Record<string, unknown>;
  const type = assertString(o.type, "draft.type", lineIndex);
  if (!o.payload || typeof o.payload !== "object") {
    throw new ReplayValidationError(
      `draft.payload must be an object (got ${typeof o.payload})`,
      lineIndex,
    );
  }
  return {
    type: type as RoomEventType,
    payload: o.payload,
    agentId: typeof o.agentId === "string" ? o.agentId : undefined,
    ts: typeof o.ts === "number" ? o.ts : undefined,
  };
}

function validateRoomEvent(raw: unknown, lineIndex?: number): RoomEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReplayValidationError(
      "roomEvent.event must be an object",
      lineIndex,
    );
  }
  const o = raw as Record<string, unknown>;
  assertNumber(o.seq, "event.seq", lineIndex);
  assertNumber(o.ts, "event.ts", lineIndex);
  assertString(o.sessionId, "event.sessionId", lineIndex);
  assertString(o.type, "event.type", lineIndex);
  if (o.payload === undefined || o.payload === null) {
    throw new ReplayValidationError("event.payload must be present", lineIndex);
  }
  return raw as RoomEvent;
}

/**
 * Validate and parse a single parsed JSON object as a ReplayRecord.
 * Throws ReplayValidationError if validation fails.
 */
export function validateReplayRecord(
  raw: unknown,
  lineIndex?: number,
): ReplayRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReplayValidationError("record must be a JSON object", lineIndex);
  }
  const o = raw as Record<string, unknown>;
  const atMs = assertNumber(o.atMs, "atMs", lineIndex);
  const kind = assertString(o.kind, "kind", lineIndex);

  switch (kind) {
    case "roomEvent": {
      const event = validateRoomEvent(o.event, lineIndex);
      return { atMs, kind: "roomEvent", event };
    }
    case "integrationEvent": {
      const event = validateIntegrationEvent(o.event, lineIndex);
      return { atMs, kind: "integrationEvent", event };
    }
    case "runtimeDraft": {
      const runtime = assertString(o.runtime, "runtime", lineIndex);
      const VALID_RUNTIMES: RuntimeKind[] = ["claude", "codex"];
      if (!VALID_RUNTIMES.includes(runtime as RuntimeKind)) {
        throw new ReplayValidationError(
          `runtime must be one of ${VALID_RUNTIMES.join("|")}, got "${runtime}"`,
          lineIndex,
        );
      }
      const draft = validateRuntimeDraft(o.draft, lineIndex);
      return {
        atMs,
        kind: "runtimeDraft",
        runtime: runtime as RuntimeKind,
        draft,
      };
    }
    default:
      throw new ReplayValidationError(
        `unknown kind "${kind}"; expected roomEvent|integrationEvent|runtimeDraft`,
        lineIndex,
      );
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a JSONL text into validated ReplayRecords.
 * Lines that don't parse as JSON or fail validation throw ReplayValidationError.
 */
export function parseReplayRecords(jsonl: string): ReplayRecord[] {
  const records: ReplayRecord[] = [];
  const lines = jsonl.split("\n").filter((l) => l.trim().length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line ?? "");
    } catch {
      throw new ReplayValidationError(`invalid JSON: ${line}`, i);
    }
    records.push(validateReplayRecord(parsed, i));
  }
  return records;
}

/**
 * Load a JSONL fixture file and return validated ReplayRecords.
 * Throws if any line fails validation.
 */
export async function loadReplayFixture(path: string): Promise<ReplayRecord[]> {
  const text = await Bun.file(path).text();
  return parseReplayRecords(text);
}

// ── Converting ReplayRecord → RoomEvent(s) ────────────────────────────────

/**
 * Minimal session context injected when expanding replay records into RoomEvents.
 */
export interface ReplaySessionContext {
  sessionId: string;
  seq: () => number; // monotonic counter
}

/**
 * Convert a single ReplayRecord into one or more RoomEvents ready to broadcast.
 *
 * - roomEvent: emitted as-is (seq/sessionId from record preserved)
 * - runtimeDraft: draft's type/payload/agentId wrapped in the envelope
 * - integrationEvent: converted to NormalizedIntegrationEvent and wrapped as
 *   integration.event.received (lightweight — no router side-effects in replay)
 */
export function replayRecordToRoomEvents(
  record: ReplayRecord,
  ctx: ReplaySessionContext,
): RoomEvent[] {
  const now = Date.now();

  if (record.kind === "roomEvent") {
    // Emit as-is; seq/sessionId from the stored event are preserved.
    return [record.event];
  }

  if (record.kind === "runtimeDraft") {
    const { draft } = record;
    const event: RoomEvent = {
      seq: ctx.seq(),
      ts: draft.ts ?? now,
      sessionId: ctx.sessionId,
      type: draft.type,
      payload: draft.payload,
    };
    if (draft.agentId) event.agentId = draft.agentId;
    return [event];
  }

  if (record.kind === "integrationEvent") {
    const { event: intEvent } = record;
    const normalized: NormalizedIntegrationEvent = {
      id: intEvent.id,
      channel: intEvent.channel,
      direction: intEvent.direction,
      summary: intEvent.summary,
      receivedAt: intEvent.receivedAt,
      ts: intEvent.receivedAt,
      externalChatId: intEvent.externalChatId,
      deliveryId: intEvent.deliveryId,
      bodyText: intEvent.bodyText,
      from: intEvent.from,
      displayName: intEvent.displayName,
      metadata: intEvent.metadata,
    };
    return [
      {
        seq: ctx.seq(),
        ts: intEvent.receivedAt,
        sessionId: ctx.sessionId,
        type: "integration.event.received",
        payload: normalized,
      },
    ];
  }

  return [];
}

// ── Auto-detect and load any fixture format ──────────────────────────────────

/**
 * Detects what format a fixture uses by inspecting its first non-empty line.
 */
export type FixtureFormat =
  | "replayRecord" // new ReplayRecord JSONL
  | "roomEvent" // legacy bare RoomEvent JSONL (seq+type)
  | "codexEvent"; // CodexRuntimeEvent JSONL (kind field, no atMs)

export function detectFixtureFormat(jsonl: string): FixtureFormat {
  const firstLine = jsonl
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "roomEvent"; // empty → treat as legacy

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return "roomEvent";
  }

  const lineKind = detectFixtureLineKind(parsed);
  if (lineKind === "replayRecord") return "replayRecord";
  if (lineKind === "codexEvent") return "codexEvent";
  return "roomEvent";
}

/**
 * Load any fixture format into RoomEvents ready for `replayTimed`.
 *
 * - replayRecord JSONL → validated, converted via replayRecordToRoomEvents
 * - codexEvent JSONL   → normalized via codex-normalize
 * - roomEvent JSONL    → parsed as-is (old path)
 *
 * Uses the provided sessionId and a monotonic seq counter when generating new events.
 */
export async function loadAnyFixture(
  path: string,
  sessionId = "replay",
): Promise<RoomEvent[]> {
  const text = await Bun.file(path).text();
  const format = detectFixtureFormat(text);

  if (format === "replayRecord") {
    const records = parseReplayRecords(text);
    let seq = 1;
    const ctx: ReplaySessionContext = {
      sessionId,
      seq: () => seq++,
    };
    return records.flatMap((r) => replayRecordToRoomEvents(r, ctx));
  }

  if (format === "codexEvent") {
    return normalizeCodexFixture(text, sessionId);
  }

  // Legacy roomEvent JSONL
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RoomEvent);
}

/**
 * Normalize a CodexRuntimeEvent JSONL into RoomEvents.
 * Used for fixtures like fixtures/runtime/codex-chat.jsonl.
 */
export function normalizeCodexFixture(
  jsonl: string,
  sessionId = "replay",
): RoomEvent[] {
  const lines = jsonl.split("\n").filter((l) => l.trim().length > 0);
  const codexEvents: CodexRuntimeEvent[] = lines.map(
    (l) => JSON.parse(l) as CodexRuntimeEvent,
  );
  const drafts = normalizeCodexRuntimeEvents(codexEvents);
  let seq = 1;
  const now = Date.now();
  return drafts.map((d) => {
    const event: RoomEvent = {
      seq: seq++,
      ts: d.ts ?? now,
      sessionId,
      type: d.type,
      payload: d.payload,
    };
    if (d.agentId) event.agentId = d.agentId;
    return event;
  });
}
