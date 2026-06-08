import { expect, test } from "bun:test";
import { createSession } from "../shared/domain";
import type { MailboxItem, RoomEvent } from "../shared/events";
import {
  type RoomStateWithPrototype,
  reduce,
  selectMailboxBoardItems,
} from "./store";

const now = new Date(2026, 0, 2, 12).getTime();

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

const ev = (item: MailboxItem): RoomEvent => ({
  seq: 1,
  ts: item.ts,
  sessionId: item.sessionId ?? "lobby",
  type: "mailbox.item.created",
  payload: { item },
});

function item(overrides: Partial<MailboxItem>): MailboxItem {
  return {
    id: overrides.id ?? "mail-1",
    source: overrides.source ?? "system",
    title: overrides.title ?? "Alert",
    summary: overrides.summary ?? "Something happened",
    ts: overrides.ts ?? now,
    status: overrides.status ?? "unread",
    kind: overrides.kind ?? "alert",
    priority: overrides.priority ?? "high",
    sessionId: overrides.sessionId,
    metadata: overrides.metadata,
  };
}

test("selectMailboxBoardItems shows only today's board items and unread alerts", () => {
  let state = initialState();
  for (const mailboxItem of [
    item({
      id: "github-board",
      source: "github",
      kind: "event",
      status: "read",
      ts: now,
      metadata: { board: true, sourceUrl: "https://github.example/pull/1" },
      sessionId: "routed-session",
    }),
    item({ id: "runtime-alert", source: "runtime", ts: now + 20 }),
    item({
      id: "read-alert",
      source: "runtime",
      status: "read",
      ts: now + 30,
    }),
    item({
      id: "old-board",
      source: "x",
      kind: "event",
      status: "read",
      ts: new Date(2026, 0, 1, 23).getTime(),
      metadata: { board: true },
    }),
    item({
      id: "old-unread-alert",
      source: "runtime",
      kind: "alert",
      priority: "high",
      ts: new Date(2026, 0, 1, 22).getTime(),
    }),
    item({
      id: "archived-board",
      source: "github",
      kind: "event",
      status: "archived",
      ts: now + 40,
      metadata: { board: true },
    }),
    item({
      id: "normal-message",
      source: "wechat",
      kind: "message",
      priority: "normal",
      ts: now + 50,
    }),
  ]) {
    state = reduce(state, ev(mailboxItem));
  }

  const board = selectMailboxBoardItems(state, { now });
  expect(board.map((i) => i.id)).toEqual([
    "runtime-alert",
    "github-board",
    "old-unread-alert",
  ]);
  expect(board[1]?.priority).toBe("high");
  expect(board[1]?.metadata?.sourceUrl).toBe("https://github.example/pull/1");
  expect(board[1]?.sessionId).toBe("routed-session");
  expect(board[1]?.ts).toBe(now);
});

test("prompt, runtime, and scheduler alerts enter mailbox state", () => {
  let state = initialState();
  state = {
    ...state,
    sessions: {
      s1: createSession({ id: "s1", title: "Session", model: "m" }),
    },
    currentSessionId: "s1",
  };

  state = reduce(state, {
    seq: 10,
    ts: now,
    sessionId: "s1",
    type: "prompt.requested",
    payload: {
      promptId: "prompt-1",
      promptKind: "question",
      data: {
        questions: [
          {
            question: "Which branch should I use?",
            header: "Branch",
            options: [{ label: "main" }],
            multiSelect: false,
          },
        ],
      },
    },
  });
  state = reduce(state, {
    seq: 11,
    ts: now + 1,
    sessionId: "s1",
    type: "runtime.status",
    payload: {
      runtime: "codex",
      status: "error",
      error: "Codex app-server unavailable",
    },
  });
  state = reduce(state, {
    seq: 12,
    ts: now + 2,
    sessionId: "s1",
    type: "scheduler.task.created",
    payload: {
      task: {
        id: "task-1",
        title: "Nightly",
        prompt: "Run checks",
        status: "enabled",
        createdAt: now,
      },
    },
  });
  state = reduce(state, {
    seq: 13,
    ts: now + 3,
    sessionId: "s1",
    type: "scheduler.run.finished",
    payload: {
      run: {
        id: "run-1",
        taskId: "task-1",
        status: "failed",
        finishedAt: now + 3,
        sessionId: "s1",
        error: "Tests failed",
      },
    },
  });

  expect(state.mailbox.items["prompt:prompt-1"]).toMatchObject({
    source: "runtime",
    summary: "Which branch should I use?",
    priority: "high",
    sessionId: "s1",
  });
  expect(state.mailbox.items["runtime:s1:error:11"]).toMatchObject({
    source: "runtime",
    summary: "Codex app-server unavailable",
    priority: "high",
  });
  expect(state.mailbox.items["scheduler:run-1:finished"]).toMatchObject({
    source: "scheduler",
    summary: "Tests failed",
    priority: "high",
    sessionId: "s1",
  });
});

test("selectMailboxBoardItems respects limit after newest-first sorting", () => {
  let state = initialState();
  state = reduce(
    state,
    ev(item({ id: "older", ts: now, metadata: { board: true } })),
  );
  state = reduce(
    state,
    ev(item({ id: "newer", ts: now + 10, metadata: { board: true } })),
  );

  expect(
    selectMailboxBoardItems(state, { now, limit: 1 }).map((i) => i.id),
  ).toEqual(["newer"]);
});
