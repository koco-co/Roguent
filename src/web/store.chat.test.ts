import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID, type TimelineMessageItem } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, type RoomStateWithPrototype, reduce } from "./store";

const initialState = (): RoomStateWithPrototype => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  runtimeStatusBySession: {},
  connectorStatus: {},
  pairings: { qrByChannel: {}, byId: {}, byExternalKey: {} },
  mailbox: { items: {}, order: [] },
  scheduler: { tasks: {}, runs: {} },
  ledger: { entries: [], balances: {} },
  achievements: {},
  inventory: {},
  settings: null,
});

const empty: RoomState = initialState();

const ev = (p: Partial<RoomEvent>): RoomEvent => ({
  seq: 1,
  ts: 0,
  sessionId: "s1",
  type: "agent.spawned",
  payload: {},
  ...p,
});

// @ts-expect-error timeline message items require source/runtime/status metadata.
const missingTimelineMeta: TimelineMessageItem = {
  kind: "message",
  id: "missing-meta",
  role: "assistant",
  text: "no metadata",
  ts: 1,
};
void missingTimelineMeta;

test("message delta merge preserves one assistant item with desktop source runtime and streaming status", () => {
  let st = reduce(
    empty,
    ev({
      seq: 1,
      ts: 10,
      type: "session.created",
      payload: { title: "codex", model: "gpt-5", runtime: "codex" },
    }),
  );

  st = reduce(
    st,
    ev({
      seq: 2,
      ts: 20,
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 3,
      ts: 30,
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello world" },
    }),
  );

  const timeline = st.sessions.s1?.timeline ?? [];
  expect(timeline).toHaveLength(1);
  const item = timeline[0];
  expect(item).toMatchObject({
    kind: "message",
    id: "2",
    role: "assistant",
    agentId: ORCHESTRATOR_ID,
    text: "hello world",
    source: { kind: "desktop" },
    runtime: "codex",
    status: "streaming",
  });
});

test("message final finalizes an existing assistant item without changing its stable id", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 8,
      ts: 80,
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "draft" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      ts: 90,
      type: "message.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "final answer" },
    }),
  );

  const timeline = st.sessions.s1?.timeline ?? [];
  expect(timeline).toHaveLength(1);
  expect(timeline[0]).toMatchObject({
    kind: "message",
    id: "8",
    text: "final answer",
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  });
});

test("message final appends deterministically when no assistant delta exists", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 12,
      ts: 120,
      type: "message.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "complete" },
    }),
  );

  expect(st.sessions.s1?.timeline[0]).toMatchObject({
    kind: "message",
    id: "12",
    text: "complete",
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  });
});

test("assistant final after final appends instead of replacing prior final answer", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 12,
      ts: 120,
      type: "message.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "first complete answer" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 13,
      ts: 130,
      type: "message.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "second complete answer" },
    }),
  );

  const timeline = st.sessions.s1?.timeline ?? [];
  expect(timeline).toHaveLength(2);
  expect(timeline.map((item) => item.kind === "message" && item.text)).toEqual([
    "first complete answer",
    "second complete answer",
  ]);
});

test("assistant delta after a final answer starts a new streaming item", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 12,
      ts: 120,
      type: "message.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "complete" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 13,
      ts: 130,
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "new draft" },
    }),
  );

  const timeline = st.sessions.s1?.timeline ?? [];
  expect(timeline).toHaveLength(2);
  expect(timeline[1]).toMatchObject({
    kind: "message",
    id: "13",
    text: "new draft",
    status: "streaming",
  });
});

test("wechat integration event with bodyText appends inbound IM timeline item with external identity", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 5,
      ts: 50,
      type: "integration.event.received",
      payload: {
        id: "evt-1",
        channel: "wechat",
        direction: "inbound",
        summary: "fallback summary",
        bodyText: "hello from wechat",
        receivedAt: 49,
        externalChatId: "chat-123",
        from: "Ada",
        connectorId: "wechat-main",
      },
    }),
  );

  expect(st.connectorStatus["wechat-main"]?.lastEventAt).toBe(49);
  expect(st.sessions.s1?.timeline[0]).toMatchObject({
    kind: "message",
    id: "integration:evt-1",
    role: "user",
    text: "hello from wechat",
    source: {
      kind: "im",
      channel: "wechat",
      externalChatId: "chat-123",
      displayName: "Ada",
    },
    runtime: "claude",
    status: "final",
  });
});

test("outbound IM integration events do not append inbound user timeline items", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 6,
      ts: 60,
      type: "integration.event.received",
      payload: {
        id: "evt-out",
        channel: "wechat",
        direction: "outbound",
        summary: "sent to wechat",
        bodyText: "assistant reply",
        receivedAt: 59,
        externalChatId: "chat-123",
        to: "Ada",
        connectorId: "wechat-main",
      },
    }),
  );

  expect(st.connectorStatus["wechat-main"]?.lastEventAt).toBe(59);
  expect(st.sessions.s1?.timeline).toHaveLength(0);
});

test("outbound IM integration events update assistant delivery status", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 10,
      ts: 100,
      type: "message.final",
      payload: { text: "tests fixed" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 11,
      ts: 110,
      type: "integration.event.received",
      payload: {
        id: "evt-out",
        channel: "wechat",
        direction: "outbound",
        summary: "sent to wechat",
        bodyText: "tests fixed",
        receivedAt: 109,
        externalChatId: "chat-123",
        deliveryId: "outbound-1",
        metadata: {
          deliveryStatus: "delivered",
          replyToTimelineItemId: "10",
        },
      },
    }),
  );

  expect(st.sessions.s1?.timeline[0]).toMatchObject({
    kind: "message",
    id: "10",
    role: "assistant",
    delivery: {
      channel: "wechat",
      deliveryId: "outbound-1",
      status: "delivered",
      updatedAt: 109,
    },
  });
});

test("outbound IM delivery with unmatched correlation does not update latest assistant", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      seq: 10,
      ts: 100,
      type: "message.final",
      payload: { text: "newer unrelated reply" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 11,
      ts: 110,
      type: "integration.event.received",
      payload: {
        id: "evt-out",
        channel: "wechat",
        direction: "outbound",
        summary: "sent to wechat",
        bodyText: "old reply",
        receivedAt: 109,
        externalChatId: "chat-123",
        deliveryId: "outbound-1",
        metadata: {
          deliveryStatus: "delivered",
          replyToTimelineItemId: "missing-old-message",
        },
      },
    }),
  );

  expect(st.sessions.s1?.timeline[0]).toMatchObject({
    kind: "message",
    id: "10",
    role: "assistant",
  });
  expect(
    st.sessions.s1?.timeline[0]?.kind === "message"
      ? st.sessions.s1.timeline[0].delivery
      : undefined,
  ).toBeUndefined();
});

test("inbound IM event prefers active pairing session over envelope session", () => {
  let st = reduce(
    empty,
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "envelope", model: "m", runtime: "claude" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "bound", model: "gpt-5", runtime: "codex" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "pairing.binding.updated",
      payload: {
        binding: {
          id: "bind-1",
          channel: "wechat",
          status: "active",
          externalChatId: "chat-123",
          sessionId: "s2",
          forwardingEnabled: true,
          boundAt: 100,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s1",
      seq: 7,
      ts: 70,
      type: "integration.event.received",
      payload: {
        id: "evt-bound",
        channel: "wechat",
        direction: "inbound",
        summary: "from bound chat",
        externalChatId: "chat-123",
      },
    }),
  );

  expect(st.sessions.s1?.timeline).toHaveLength(0);
  expect(st.sessions.s2?.timeline[0]).toMatchObject({
    kind: "message",
    id: "integration:evt-bound",
    runtime: "codex",
    text: "from bound chat",
  });
});

test("inbound IM event does not route through inactive or disabled binding", () => {
  let st = reduce(
    empty,
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "envelope", model: "m" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "bound", model: "m" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "pairing.binding.updated",
      payload: {
        binding: {
          id: "bind-1",
          channel: "wechat",
          status: "revoked",
          externalChatId: "chat-123",
          sessionId: "s2",
          forwardingEnabled: true,
          boundAt: 100,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s1",
      seq: 7,
      ts: 70,
      type: "integration.event.received",
      payload: {
        id: "evt-revoked",
        channel: "wechat",
        direction: "inbound",
        summary: "should not route",
        externalChatId: "chat-123",
      },
    }),
  );

  expect(st.sessions.s1?.timeline).toHaveLength(0);
  expect(st.sessions.s2?.timeline).toHaveLength(0);

  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "pairing.binding.updated",
      payload: {
        binding: {
          id: "bind-2",
          channel: "wechat",
          status: "active",
          externalChatId: "chat-123",
          sessionId: "s2",
          forwardingEnabled: false,
          boundAt: 101,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s1",
      seq: 8,
      ts: 80,
      type: "integration.event.received",
      payload: {
        id: "evt-disabled",
        channel: "wechat",
        direction: "inbound",
        summary: "should not route either",
        externalChatId: "chat-123",
      },
    }),
  );

  expect(st.sessions.s1?.timeline).toHaveLength(0);
  expect(st.sessions.s2?.timeline).toHaveLength(0);
});

test("scheduler run started for same session appends scheduler timeline item and keeps run state", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "codex", model: "gpt-5", runtime: "codex" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 4,
      ts: 40,
      type: "scheduler.run.started",
      payload: {
        run: {
          id: "run-1",
          taskId: "task-1",
          status: "running",
          startedAt: 40,
          sessionId: "s1",
        },
      },
    }),
  );

  expect(st.scheduler.runs["run-1"]?.status).toBe("running");
  expect(st.sessions.s1?.timeline[0]).toMatchObject({
    kind: "message",
    id: "scheduler:run-1:started",
    role: "system",
    text: "Scheduler run started: task-1",
    source: { kind: "scheduler", taskId: "task-1", runId: "run-1" },
    runtime: "codex",
    status: "final",
  });
});
