import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import {
  type RoomState,
  type RoomStateWithPrototype,
  reduce,
  useRoomStore,
} from "./store";

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
const bindingEvent = (
  channel: "wechat" | "feishu",
  externalChatId: string,
  sessionId: string,
): RoomEvent =>
  ev({
    sessionId,
    type: "pairing.binding.updated",
    payload: {
      binding: {
        id: `${channel}-${externalChatId}-${sessionId}`,
        channel,
        status: "active",
        externalChatId,
        sessionId,
        forwardingEnabled: true,
        boundAt: 10,
      },
    },
  });

test("session.created adds a session and sets currentSessionId once", () => {
  const st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "code-review", model: "claude-opus-4-8" },
    }),
  );
  expect(st.sessions.s1?.title).toBe("code-review");
  expect(st.currentSessionId).toBe("s1");
});

test("session.created stores Codex runtime config", () => {
  const st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: {
        title: "codex",
        model: "gpt-5",
        runtime: "codex",
        approvalPolicy: "on-request",
        sandboxMode: "read-only",
        reasoningEffort: "high",
        networkAccess: false,
      },
    }),
  );

  expect(st.sessions.s1?.runtime).toBe("codex");
  expect(st.sessions.s1?.model).toBe("gpt-5");
  expect(st.sessions.s1?.approvalPolicy).toBe("on-request");
  expect(st.sessions.s1?.sandboxMode).toBe("read-only");
  expect(st.sessions.s1?.reasoningEffort).toBe("high");
  expect(st.sessions.s1?.networkAccess).toBe(false);
});

test("runtime.status stores degraded Codex batch metadata on the session", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: {
        title: "codex",
        model: "gpt-5",
        runtime: "codex",
      },
    }),
  );

  st = reduce(
    st,
    ev({
      type: "runtime.status",
      payload: {
        runtime: "codex",
        status: "degraded",
        config: {
          runtime: "codex",
          model: "gpt-5",
          permissionMode: "default",
          sandboxMode: "workspace-write",
          networkAccess: false,
        },
        cwd: "/repo",
        message:
          "Codex app-server unavailable; using codex exec --json batch mode.",
        metadata: {
          mode: "exec-json",
          realtime: false,
          degraded: true,
        },
      },
    }),
  );

  expect(st.sessions.s1?.runtimeStatus?.status).toBe("degraded");
  expect(st.runtimeStatusBySession.s1?.status).toBe("degraded");
  expect(st.sessions.s1?.runtimeStatus?.metadata?.mode).toBe("exec-json");
  expect(st.sessions.s1?.status).toBe("idle");
});

test("runtime.status folds before session exists without stealing focus", () => {
  const st = reduce(
    initialState(),
    ev({
      sessionId: "late-runtime",
      type: "runtime.status",
      payload: {
        runtime: "codex",
        status: "starting",
        config: {
          runtime: "codex",
          model: "gpt-5",
          permissionMode: "default",
          sandboxMode: "workspace-write",
          networkAccess: false,
        },
      },
    }),
  );

  expect(st.runtimeStatusBySession["late-runtime"]?.status).toBe("starting");
  expect(st.sessions["late-runtime"]).toBeUndefined();
  expect(st.currentSessionId).toBeNull();
});

test("pairing binding update overwrites by channel and external chat id", () => {
  const state = reduce(initialState(), bindingEvent("wechat", "chat-a", "s1"));
  const next = reduce(state, bindingEvent("wechat", "chat-a", "s2"));
  expect(next.pairings.byExternalKey["wechat:chat-a"]?.sessionId).toBe("s2");
});

test("pairing binding rebind removes the stale binding id", () => {
  const state = reduce(initialState(), bindingEvent("wechat", "chat-a", "s1"));
  const next = reduce(state, bindingEvent("wechat", "chat-a", "s2"));

  expect(next.pairings.byId["wechat-chat-a-s1"]).toBeUndefined();
  expect(next.pairings.byId["wechat-chat-a-s2"]?.sessionId).toBe("s2");
});

test("pairing qr null clears stale qrs", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "pairing.qr.updated",
      payload: {
        qr: {
          id: "qr-1",
          channel: "wechat",
          status: "pending",
          url: "https://example.test/qr",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "pairing.qr.updated",
      payload: {
        qr: {
          id: "qr-2",
          channel: "feishu",
          status: "pending",
          url: "https://example.test/feishu-qr",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "pairing.qr.updated",
      payload: {
        qr: null,
      },
    }),
  );

  expect(st.pairings.qrByChannel).toEqual({});
});

test("prototype domain events fold without a known session", () => {
  let st = initialState();
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "integration.status",
      payload: {
        status: {
          id: "wechat-main",
          channel: "wechat",
          state: "connected",
          lastEventAt: 10,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "pairing.qr.updated",
      payload: {
        qr: {
          id: "qr-1",
          channel: "wechat",
          status: "pending",
          url: "https://example.test/qr",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "mailbox.item.created",
      payload: {
        item: {
          id: "mail-1",
          source: "wechat",
          title: "Inbound",
          summary: "hello",
          ts: 20,
          status: "unread",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "scheduler.task.created",
      payload: {
        task: {
          id: "task-1",
          title: "Daily",
          prompt: "Summarize",
          status: "enabled",
          createdAt: 30,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "scheduler.run.started",
      payload: {
        run: {
          id: "run-1",
          taskId: "task-1",
          status: "running",
          startedAt: 40,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "economy.ledger.appended",
      payload: {
        entry: {
          id: "ledger-1",
          ts: 50,
          reason: "test",
          amount: 5,
          currency: "gems",
          delta: { gems: 5 },
          balance: { gems: 5 },
          sourceEventId: "event-ledger-1",
          metadata: {
            inventory: {
              item: {
                id: "skin-1",
                sku: "skin.green",
                kind: "skin",
                label: "Green",
                quantity: 1,
              },
              action: "added",
            },
          },
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "achievement.updated",
      payload: {
        achievement: {
          id: "ach-1",
          title: "First",
          progress: 1,
          target: 3,
          completed: false,
          updatedAt: 60,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "inventory.updated",
      payload: {
        item: {
          id: "skin-1",
          sku: "skin.green",
          kind: "skin",
          label: "Green",
          quantity: 1,
        },
        action: "added",
      },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "ghost",
      type: "settings.updated",
      payload: {
        scope: "user",
        settings: { scheduler: { enabled: true } },
      },
    }),
  );

  expect(st.sessions.ghost).toBeUndefined();
  expect(st.connectorStatus["wechat-main"]?.state).toBe("connected");
  expect(st.pairings.qrByChannel.wechat?.id).toBe("qr-1");
  expect(st.mailbox.order).toEqual(["mail-1", "scheduler:run-1:started"]);
  expect(st.mailbox.items["scheduler:run-1:started"]?.source).toBe("scheduler");
  expect(st.mailbox.items["scheduler:run-1:started"]?.status).toBe("unread");
  expect(st.scheduler.tasks["task-1"]?.status).toBe("enabled");
  expect(st.scheduler.runs["run-1"]?.status).toBe("running");
  expect(st.ledger.balances.gems).toBe(5);
  expect(st.achievements["ach-1"]?.progress).toBe(1);
  expect(st.inventory["skin-1"]?.sku).toBe("skin.green");
  expect(st.settings?.scheduler?.enabled).toBe(true);
});

test("mailbox.item.updated merges changes and does not duplicate order", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "mailbox.item.created",
      payload: {
        item: {
          id: "mail-1",
          source: "system",
          title: "Original",
          summary: "old",
          ts: 1,
          status: "unread",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "mailbox.item.updated",
      payload: {
        item: {
          id: "mail-1",
          source: "system",
          title: "Ignored",
          summary: "ignored",
          ts: 1,
          status: "unread",
        },
        changes: { status: "read", summary: "new" },
      },
    }),
  );

  expect(st.mailbox.items["mail-1"]?.title).toBe("Original");
  expect(st.mailbox.items["mail-1"]?.summary).toBe("new");
  expect(st.mailbox.items["mail-1"]?.status).toBe("read");
  expect(st.mailbox.order).toEqual(["mail-1"]);
});

test("mailbox.item.updated uses full payload item when changes are omitted", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "mailbox.item.created",
      payload: {
        item: {
          id: "mail-1",
          source: "system",
          title: "Original",
          summary: "old",
          ts: 1,
          status: "unread",
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "mailbox.item.updated",
      payload: {
        item: {
          id: "mail-1",
          source: "system",
          title: "Updated",
          summary: "new",
          ts: 2,
          status: "read",
        },
      },
    }),
  );

  expect(st.mailbox.items["mail-1"]?.title).toBe("Updated");
  expect(st.mailbox.items["mail-1"]?.summary).toBe("new");
  expect(st.mailbox.items["mail-1"]?.status).toBe("read");
  expect(st.mailbox.order).toEqual(["mail-1"]);
});

test("scheduler.run.finished overwrites run while preserving task map", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "scheduler.task.created",
      payload: {
        task: {
          id: "task-1",
          title: "Daily",
          prompt: "Summarize",
          status: "enabled",
          createdAt: 1,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "scheduler.run.started",
      payload: {
        run: {
          id: "run-1",
          taskId: "task-1",
          status: "running",
          startedAt: 2,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "scheduler.run.finished",
      payload: {
        run: {
          id: "run-1",
          taskId: "task-1",
          status: "succeeded",
          finishedAt: 3,
          summary: "done",
        },
      },
    }),
  );

  expect(st.scheduler.tasks["task-1"]?.status).toBe("enabled");
  expect(st.scheduler.runs["run-1"]?.status).toBe("succeeded");
  expect(st.scheduler.runs["run-1"]?.summary).toBe("done");
});

test("scheduler.task.updated uses full payload task when changes are omitted", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "scheduler.task.created",
      payload: {
        task: {
          id: "task-1",
          title: "Daily",
          prompt: "Summarize",
          status: "enabled",
          createdAt: 1,
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "scheduler.task.updated",
      payload: {
        task: {
          id: "task-1",
          title: "Updated daily",
          prompt: "Review",
          status: "paused",
          createdAt: 1,
          updatedAt: 2,
        },
      },
    }),
  );

  expect(st.scheduler.tasks["task-1"]?.title).toBe("Updated daily");
  expect(st.scheduler.tasks["task-1"]?.prompt).toBe("Review");
  expect(st.scheduler.tasks["task-1"]?.status).toBe("paused");
});

test("inventory.updated cannot bypass ledger-derived inventory", () => {
  let st = reduce(
    initialState(),
    ev({
      type: "economy.ledger.appended",
      payload: {
        entry: {
          id: "ledger-skin-add",
          ts: 1,
          reason: "test",
          amount: 1,
          currency: "item:skin.green",
          delta: { "item:skin.green": 1 },
          balance: { "item:skin.green": 1 },
          sourceEventId: "event-skin-add",
          metadata: {
            inventory: {
              item: {
                id: "skin-1",
                sku: "skin.green",
                kind: "skin",
                label: "Green",
                quantity: 1,
              },
              action: "added",
            },
          },
        },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "inventory.updated",
      payload: {
        item: {
          id: "skin-1",
          sku: "skin.green",
          kind: "skin",
          label: "Green",
          quantity: 0,
        },
        action: "removed",
      },
    }),
  );

  expect(st.inventory["skin-1"]?.sku).toBe("skin.green");
});

test("a second session.created (from SDK init) merges, keeping messages and filling slashCommands", () => {
  // engine 先合成 session.created;SDK init 到来后又派生一个 session.created。
  // 后者必须合并(补 slashCommands/model),绝不能重建会话清空已有 transcript。
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "会话 1", model: "claude-opus-4-8", slashCommands: [] },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "first reply" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "会话 1", model: "m", slashCommands: ["/review"] },
    }),
  );
  expect(st.sessions.s1?.timeline).toHaveLength(1);
  expect((st.sessions.s1?.timeline[0] as { text: string })?.text).toBe(
    "first reply",
  );
  expect(st.sessions.s1?.slashCommands).toEqual(["/review"]);
});

test("session.created merges runtime config without resetting timeline", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: {
        title: "codex",
        model: "gpt-5",
        runtime: "codex",
        sandboxMode: "workspace-write",
        networkAccess: false,
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "kept" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: {
        title: "codex",
        model: "gpt-5",
        runtime: "codex",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "medium",
        networkAccess: true,
      },
    }),
  );

  expect(st.sessions.s1?.timeline).toHaveLength(1);
  expect(st.sessions.s1?.runtime).toBe("codex");
  expect(st.sessions.s1?.approvalPolicy).toBe("never");
  expect(st.sessions.s1?.sandboxMode).toBe("danger-full-access");
  expect(st.sessions.s1?.reasoningEffort).toBe("medium");
  expect(st.sessions.s1?.networkAccess).toBe(true);
});

test("creating a new session steals focus; a re-init of another session does not", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "s1", model: "m" } }),
  );
  expect(st.currentSessionId).toBe("s1");
  // 新建 s2(首次)→ 焦点立即跳到 s2。
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "s2", model: "m" },
    }),
  );
  expect(st.currentSessionId).toBe("s2");
  // s1 延迟到来的 SDK init 派生的第二条 session.created(会话已存在)→ 不抢焦点。
  st = reduce(
    st,
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "s1", model: "m", slashCommands: ["/x"] },
    }),
  );
  expect(st.currentSessionId).toBe("s2");
});

test("agent.spawned adds a working subagent; tool.started sets the head icon tool", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-1",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.status).toBe("working");
  st = reduce(
    st,
    ev({
      type: "tool.started",
      agentId: "ag-1",
      payload: { toolName: "Edit" },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBe("Edit");
});

test("agent.thinking sets thinking status and clears the tool icon", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-1",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "tool.started",
      agentId: "ag-1",
      payload: { toolName: "Edit" },
    }),
  );
  st = reduce(st, ev({ type: "agent.thinking", agentId: "ag-1", payload: {} }));
  expect(st.sessions.s1?.agents["ag-1"]?.status).toBe("thinking");
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBeUndefined();
});

test("agent.done removes a subagent but never the orchestrator", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-1",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.done",
      agentId: "ag-1",
      payload: { stopReason: "normal" },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]).toBeUndefined();
  st = reduce(
    st,
    ev({
      type: "agent.done",
      agentId: ORCHESTRATOR_ID,
      payload: { stopReason: "normal" },
    }),
  );
  expect(st.sessions.s1?.agents[ORCHESTRATOR_ID]).toBeDefined();
});

test("message.delta appends an assistant bubble to the session transcript", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello world" },
    }),
  );
  const items = st.sessions.s1?.timeline ?? [];
  expect(items).toHaveLength(1);
  expect((items[0] as { role: string })?.role).toBe("assistant");
  expect((items[0] as { text: string })?.text).toBe("hello world");
  expect((items[0] as { agentId: string })?.agentId).toBe(ORCHESTRATOR_ID);
});

test("message.final also appends an assistant bubble", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({ type: "message.final", payload: { text: "done thinking" } }),
  );
  expect((st.sessions.s1?.timeline.at(-1) as { text: string })?.text).toBe(
    "done thinking",
  );
});

test("thinking.final adds thinking item to timeline", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "thinking.final",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hmm..." },
    }),
  );
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("thinking");
  expect((item as { text: string })?.text).toBe("hmm...");
});

test("session.error surfaces and marks error even before session.created", () => {
  const st = reduce(
    empty,
    ev({ type: "session.error", payload: { message: "auth failed" } }),
  );
  expect(st.sessions.s1?.status).toBe("error");
  expect(st.currentSessionId).toBe("s1");
  const last = st.sessions.s1?.timeline.at(-1);
  expect((last as { role: string })?.role).toBe("system");
  expect((last as { text: string })?.text).toContain("auth failed");
});

test("appendUserMessage adds a user bubble optimistically", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  useRoomStore
    .getState()
    .applyEvent(
      ev({ type: "session.created", payload: { title: "t", model: "m" } }),
    );
  useRoomStore.getState().appendUserMessage("s1", "hi there");
  const last = useRoomStore.getState().sessions.s1?.timeline.at(-1);
  expect((last as { role: string })?.role).toBe("user");
  expect((last as { text: string })?.text).toBe("hi there");
});

// ── 总览世界:会话生命周期 / 项目派生 / ≤10 LRU(spec §生命周期 & 最小数据) ──

test("session.created records cwd/project and appends a stable projectOrder", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: {
        title: "a",
        model: "m",
        cwd: "/repo/alpha",
        project: "alpha",
      },
    }),
  );
  expect(st.sessions.s1?.cwd).toBe("/repo/alpha");
  expect(st.sessions.s1?.project).toBe("alpha");
  expect(st.projectOrder).toEqual(["alpha"]);
  // 第二个会话、新项目 → 追加;同项目不重复入列。
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "b", model: "m", cwd: "/repo/beta", project: "beta" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s3",
      type: "session.created",
      payload: { title: "c", model: "m", cwd: "/repo/alpha", project: "alpha" },
    }),
  );
  expect(st.projectOrder).toEqual(["alpha", "beta"]);
});

test("activity events bump lastActiveAt", () => {
  let st = reduce(
    empty,
    ev({ ts: 5, type: "session.created", payload: { title: "t", model: "m" } }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(5);
  st = reduce(
    st,
    ev({
      ts: 42,
      type: "tool.started",
      agentId: ORCHESTRATOR_ID,
      payload: { toolName: "Edit" },
    }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(42);
});

test("creating the 11th active session soft-archives the least-recently-active one", () => {
  let st = empty;
  // 10 个活跃会话,lastActiveAt = 序号(s1 最旧)。
  for (let i = 1; i <= 10; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  const activeCount = (s: RoomState) =>
    Object.values(s.sessions).filter((x) => !x.archived).length;
  expect(activeCount(st)).toBe(10);
  // 第 11 个 → 最旧(s1)被软归档,活跃仍 ≤ 10。
  st = reduce(
    st,
    ev({
      sessionId: "s11",
      ts: 11,
      type: "session.created",
      payload: { title: "s11", model: "m", project: "p11" },
    }),
  );
  expect(activeCount(st)).toBe(10);
  expect(st.sessions.s1?.archived).toBe(true);
  expect(st.sessions.s11?.archived).toBe(false);
});

test("archive/unarchive/remove session actions", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  api.archiveSession("s1");
  expect(useRoomStore.getState().sessions.s1?.archived).toBe(true);
  expect(useRoomStore.getState().currentSessionId).toBeNull();
  api.unarchiveSession("s1");
  expect(useRoomStore.getState().sessions.s1?.archived).toBe(false);
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  api.removeSession("s1");
  expect(useRoomStore.getState().sessions.s1).toBeUndefined();
  expect(useRoomStore.getState().currentSessionId).toBeNull();
});

test("reconcileSessions: 清掉花名册外的幽灵会话,保留在册的;焦点被清→null", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "a", model: "m" },
    }),
  );
  api.applyEvent(
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "b", model: "m" },
    }),
  );
  expect(useRoomStore.getState().currentSessionId).toBe("s2"); // 新建即跳焦
  // 引擎花名册只剩 s1 → s2 是幽灵,清掉;焦点(s2)被清 → null
  api.reconcileSessions(["s1"]);
  expect(useRoomStore.getState().sessions.s1?.title).toBe("a");
  expect(useRoomStore.getState().sessions.s2).toBeUndefined();
  expect(useRoomStore.getState().currentSessionId).toBeNull();
});

test("reconcileSessions: 空花名册清空所有会话(引擎重启/换引擎)", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "a", model: "m" },
    }),
  );
  api.reconcileSessions([]);
  expect(Object.keys(useRoomStore.getState().sessions)).toHaveLength(0);
  expect(useRoomStore.getState().currentSessionId).toBeNull();
});

test("reconcileSessions: 在册会话与焦点原样保留(短抖重连不丢数据)", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "a", model: "m" },
    }),
  );
  const before = useRoomStore.getState().sessions.s1;
  api.reconcileSessions(["s1"]);
  expect(useRoomStore.getState().sessions.s1).toBe(before); // 同引用,未重建
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
});

test("reconcileSessions: 导入会话豁免对账,空花名册不删它(引擎 --watch 重启)", () => {
  // 导入会话是客户端自有的静态存档回看,没有 Driver、不归引擎花名册管辖。
  // dev:engine --watch 每次保存都重启引擎 → 新连接下发空花名册;若把导入会话当幽灵
  // 清掉就回到空大厅 + 黑画布(本次 bug)。reconcile 必须豁免 imported 会话。
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({
      sessionId: "imp1",
      type: "session.created",
      payload: { title: "存档", model: "m", imported: true },
    }),
  );
  api.reconcileSessions([]); // 引擎重启后的空花名册
  expect(useRoomStore.getState().sessions.imp1?.title).toBe("存档"); // 没被清
  expect(useRoomStore.getState().currentSessionId).toBe("imp1"); // 焦点保住
});

test("reconcileSessions: 导入会话与 live 会话混存,只清 live 幽灵、留导入", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({
      sessionId: "imp1",
      type: "session.created",
      payload: { title: "存档", model: "m", imported: true },
    }),
  );
  api.applyEvent(
    ev({
      sessionId: "live1",
      type: "session.created",
      payload: { title: "活的", model: "m" },
    }),
  );
  api.reconcileSessions([]); // 引擎没了 → live1 是幽灵,imp1 是存档
  expect(useRoomStore.getState().sessions.imp1?.title).toBe("存档");
  expect(useRoomStore.getState().sessions.live1).toBeUndefined();
});

test("SDK-init session.created merges the real permissionMode over the synthesized default", () => {
  // engine 合成的第一条 permissionMode=default;SDK init 派生的第二条带真实模式。
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("default");
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "plan" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("plan");
});

test("a default-mode re-init does not clobber an already-known non-default mode", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "acceptEdits" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("acceptEdits");
});

test("an invalid non-default permissionMode does not clobber an existing non-default mode", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "plan" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "ask" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("plan");
});

test("an early session.error placeholder stamps lastActiveAt and never steals a lobby slot", () => {
  // 先来一条 session.error(无 project 的占位),再建 10 个带 project 的会话。
  // 占位不计入 ACTIVE_CAP,所以 10 个真实会话全部保持活跃。
  let st = reduce(
    empty,
    ev({ ts: 7, type: "session.error", payload: { message: "auth failed" } }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(7);
  expect(st.sessions.s1?.project).toBeUndefined();
  for (let i = 2; i <= 11; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
  // 错误占位还在,但没被算进大厅、也没被归档(它没 project)。
  expect(st.sessions.s1?.archived).toBe(false);
});

test("the just-created session is never the LRU victim even if the clock went backward", () => {
  let st = empty;
  for (let i = 1; i <= 10; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: 100 + i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  // 第 11 个会话的 ts 比所有人都小(时钟回拨)。它绝不能把自己挤掉。
  st = reduce(
    st,
    ev({
      sessionId: "s11",
      ts: 1,
      type: "session.created",
      payload: { title: "s11", model: "m", project: "p11" },
    }),
  );
  expect(st.sessions.s11?.archived).toBe(false);
  // 被归档的是其它会话里 lastActiveAt 最低的(s1=101)。
  expect(st.sessions.s1?.archived).toBe(true);
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
});

test("switchSession changes currentSessionId without modifying sessions", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({ type: "session.created", payload: { title: "s1", model: "m" } }),
  );
  api.applyEvent(
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "s2", model: "m" },
    }),
  );
  // After two sessions, focus is on s2 (last new session wins).
  expect(useRoomStore.getState().currentSessionId).toBe("s2");

  api.switchSession("s1");
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  // The sessions themselves are untouched.
  expect(Object.keys(useRoomStore.getState().sessions)).toHaveLength(2);
  expect(useRoomStore.getState().sessions.s1?.title).toBe("s1");
  expect(useRoomStore.getState().sessions.s2?.title).toBe("s2");
});

test("message.delta from a subagent records the subagent agentId in the transcript", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-sub",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: "ag-sub",
      payload: { text: "sub reply" },
    }),
  );
  const item = st.sessions.s1?.timeline.at(-1);
  expect((item as { agentId: string })?.agentId).toBe("ag-sub");
  expect((item as { role: string })?.role).toBe("assistant");
  expect((item as { text: string })?.text).toBe("sub reply");
});

test("context.updated folds into session.context", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "context.updated",
      payload: { usedTokens: 200000, windowSize: 1000000, utilization: 20 },
    }),
  );
  expect(st.sessions.s1?.context).toEqual({
    usedTokens: 200000,
    windowSize: 1000000,
    utilization: 20,
  });
});

test("context.updated for unknown session is ignored", () => {
  const st = reduce(
    empty,
    ev({
      type: "context.updated",
      sessionId: "ghost",
      payload: { usedTokens: 1, windowSize: 2, utilization: 50 },
    }),
  );
  expect(st.sessions.ghost).toBeUndefined();
});

test("todos.updated populates Session.todos by agentId and replaces on re-send", () => {
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  st = reduce(st, {
    seq: 1,
    ts: 1,
    sessionId: "s1",
    type: "session.created",
    payload: { title: "t", model: "m", project: "p" },
  });
  // 主控发一版 todos
  st = reduce(st, {
    seq: 2,
    ts: 2,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "orchestrator",
    payload: {
      todos: [
        { content: "A", status: "in_progress" },
        { content: "B", status: "pending" },
      ],
    },
  });
  expect(st.sessions.s1?.todos.orchestrator).toHaveLength(2);
  // 同 agent 再发 → 整表覆盖(不累加)
  st = reduce(st, {
    seq: 3,
    ts: 3,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "orchestrator",
    payload: { todos: [{ content: "A", status: "completed" }] },
  });
  expect(st.sessions.s1?.todos.orchestrator).toHaveLength(1);
  expect(st.sessions.s1?.todos.orchestrator?.[0]?.status).toBe("completed");
});

test("agent.done clears that subagent's todos (no ghosts)", () => {
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  st = reduce(st, {
    seq: 1,
    ts: 1,
    sessionId: "s1",
    type: "session.created",
    payload: { title: "t", model: "m", project: "p" },
  });
  st = reduce(st, {
    seq: 2,
    ts: 2,
    sessionId: "s1",
    type: "agent.spawned",
    agentId: "ag-x",
    payload: { role: "coder", parentId: "orchestrator" },
  });
  st = reduce(st, {
    seq: 3,
    ts: 3,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "ag-x",
    payload: { todos: [{ content: "X", status: "pending" }] },
  });
  expect(st.sessions.s1?.todos["ag-x"]).toHaveLength(1);
  st = reduce(st, {
    seq: 4,
    ts: 4,
    sessionId: "s1",
    type: "agent.done",
    agentId: "ag-x",
    payload: { stopReason: "normal" },
  });
  expect(st.sessions.s1?.todos["ag-x"]).toBeUndefined();
});

test("setLimits stores account limits and applyEvent preserves it", () => {
  const store = useRoomStore.getState();
  store.setLimits({
    planName: "Max",
    fiveHour: { utilization: 30, resetsAt: null },
    sevenDay: { utilization: 80, resetsAt: null },
  });
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
  useRoomStore
    .getState()
    .applyEvent(
      ev({ type: "session.created", payload: { title: "t", model: "m" } }),
    );
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
});

test("message.delta builds timeline message item, streaming replaces last assistant", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello" },
    }),
  );
  expect(st.sessions.s1?.timeline).toHaveLength(1);
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("message");
  expect((item as { text: string })?.text).toBe("hello");

  // streaming: second delta from same agent replaces (not appends)
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello world" },
    }),
  );
  expect(st.sessions.s1?.timeline).toHaveLength(1);
  expect((st.sessions.s1?.timeline[0] as { text: string })?.text).toBe(
    "hello world",
  );
});

test("prompt.requested adds pending prompt item", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "prompt.requested",
      payload: {
        promptId: "p1",
        promptKind: "permission",
        data: { toolName: "Bash", inputSummary: "ls" },
      },
    }),
  );
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("prompt");
  expect((item as { status: string })?.status).toBe("pending");
  // NEW assertions:
  expect((item as { promptKind: string })?.promptKind).toBe("permission");
  expect((item as { id: string })?.id).toBe("p1");
});

test("tool.started adds running ToolCard to timeline (non-AskUserQuestion)", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "tool.started",
      agentId: ORCHESTRATOR_ID,
      payload: { toolName: "Bash", inputSummary: "ls", toolUseId: "tu-1" },
    }),
  );
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("tool");
  expect((item as { status: string })?.status).toBe("running");
});

test("tool.ended updates timeline ToolCard status to ok", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "tool.started",
      agentId: ORCHESTRATOR_ID,
      payload: { toolName: "Bash", inputSummary: "ls", toolUseId: "tu-2" },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "tool.ended",
      agentId: ORCHESTRATOR_ID,
      payload: { toolUseId: "tu-2" },
    }),
  );
  const item = st.sessions.s1?.timeline[0];
  expect((item as { status: string })?.status).toBe("ok");
});

test("prompt.resolved marks prompt as answered", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "prompt.requested",
      payload: {
        promptId: "p1",
        promptKind: "permission",
        data: { toolName: "Bash", inputSummary: "" },
      },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "prompt.resolved",
      payload: { promptId: "p1", result: "answered" },
    }),
  );
  const item = st.sessions.s1?.timeline[0];
  expect((item as { status: string })?.status).toBe("answered");
});
