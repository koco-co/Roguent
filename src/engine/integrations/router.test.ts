import { expect, test } from "bun:test";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { IntegrationRouter } from "./router";
import type { IntegrationEvent, IntegrationRouterEvent } from "./types";

function event(overrides: Partial<IntegrationEvent> = {}): IntegrationEvent {
  return {
    id: "event-1",
    channel: "wechat",
    direction: "inbound",
    externalChatId: "chat-1",
    deliveryId: "delivery-1",
    summary: "Build is blocked",
    bodyText: "Please inspect the failing build.",
    receivedAt: 1_717_452_000_000,
    ...overrides,
  };
}

function activeBinding(
  overrides: Partial<PairingBinding> = {},
): PairingBinding {
  return {
    id: "binding-1",
    channel: "wechat",
    status: "active",
    externalChatId: "chat-1",
    sessionId: "paired-session",
    forwardingEnabled: true,
    boundAt: 1_717_451_000_000,
    ...overrides,
  };
}

function createHarness(binding: PairingBinding | null = null) {
  const inboxItems: MailboxItem[] = [];
  const inboxUpdates: Array<{ itemId: string; sessionId: string }> = [];
  const auditRecords: unknown[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];
  const created: Array<{
    id: string;
    title: string;
    source: "integration.subscription";
  }> = [];
  const calls: string[] = [];

  const router = new IntegrationRouter({
    pairingBindings: {
      getByExternalKey(channel, externalChatId) {
        calls.push(`pairing:${channel}:${externalChatId}`);
        return binding;
      },
    },
    inbox: {
      create(item) {
        calls.push(`inbox.create:${item.id}`);
        inboxItems.push(item);
      },
      assignSession(itemId, sessionId) {
        calls.push(`inbox.assign:${itemId}:${sessionId}`);
        inboxUpdates.push({ itemId, sessionId });
      },
    },
    audit: {
      append(input) {
        calls.push(`audit:${input.action}`);
        auditRecords.push(input);
      },
    },
    sessions: {
      createSubscriptionSession(input) {
        calls.push(`session.create:${input.id}`);
        created.push(input);
      },
      forwardToRuntime(sessionId, text) {
        calls.push(`runtime.forward:${sessionId}`);
        forwarded.push({ sessionId, text });
        return true;
      },
    },
    publish(event) {
      calls.push(`publish:${event.type}`);
      published.push(event);
    },
  });

  return {
    auditRecords,
    calls,
    created,
    inboxItems,
    inboxUpdates,
    published,
    router,
    forwarded,
  };
}

test("paired IM events route precisely through pairing binding", async () => {
  const harness = createHarness(activeBinding());

  const result = await harness.router.route(event(), {
    currentSessionId: "selected-session",
  });

  expect(result.sessionId).toBe("paired-session");
  expect(harness.forwarded).toEqual([
    {
      sessionId: "paired-session",
      text: "Please inspect the failing build.",
    },
  ]);
  expect(harness.inboxItems[0]).toMatchObject({
    id: "inbox:event-1",
    channel: "wechat",
    relatedEventId: "event-1",
    sessionId: "paired-session",
  });
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "paired-session",
      type: "integration.event.received",
      payload: expect.objectContaining({
        id: "event-1",
        channel: "wechat",
        externalChatId: "chat-1",
      }),
    }),
  );
  expect(harness.calls.indexOf("inbox.create:inbox:event-1")).toBeLessThan(
    harness.calls.indexOf("runtime.forward:paired-session"),
  );
  expect(
    harness.calls.indexOf("audit:integration.event.received"),
  ).toBeLessThan(harness.calls.indexOf("runtime.forward:paired-session"));
});

test("unpaired IM events are recorded but not routed through selected sessions", async () => {
  const harness = createHarness(null);

  const result = await harness.router.route(event(), {
    currentSessionId: "selected-session",
  });

  expect(result).toMatchObject({
    sessionId: undefined,
    createdSession: false,
  });
  expect(harness.inboxItems).toHaveLength(1);
  expect(harness.auditRecords).toHaveLength(1);
  expect(harness.created).toEqual([]);
  expect(harness.forwarded).toEqual([]);
  expect(harness.published).toEqual([]);
  expect(harness.calls).toEqual([
    "pairing:wechat:chat-1",
    "inbox.create:inbox:event-1",
    "audit:integration.event.received",
  ]);
});

test("subscription events write mailbox and forward to current session", async () => {
  const harness = createHarness();

  const result = await harness.router.route(
    event({
      id: "github-1",
      channel: "github",
      externalChatId: undefined,
      summary: "CI failed on main",
      bodyText: "workflow build failed",
    }),
    { currentSessionId: "selected-session" },
  );

  expect(result.sessionId).toBe("selected-session");
  expect(harness.created).toEqual([]);
  expect(harness.forwarded).toEqual([
    {
      sessionId: "selected-session",
      text: "[github] CI failed on main\n\nworkflow build failed",
    },
  ]);
  expect(harness.inboxItems[0]).toMatchObject({
    id: "inbox:github-1",
    source: "github",
    title: "CI failed on main",
    kind: "event",
    channel: "github",
    sessionId: "selected-session",
    metadata: expect.objectContaining({ board: true }),
  });
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "selected-session",
      type: "mailbox.item.created",
      payload: { item: harness.inboxItems[0] },
    }),
  );
  expect(harness.calls.indexOf("publish:mailbox.item.created")).toBeLessThan(
    harness.calls.indexOf("runtime.forward:selected-session"),
  );
});

test("subscription events auto-create session and write sessionId back to inbox", async () => {
  const harness = createHarness();

  const result = await harness.router.route(
    event({
      id: "x-42",
      channel: "x",
      externalChatId: undefined,
      summary: "Mentioned by customer",
      bodyText: undefined,
    }),
  );

  expect(result.sessionId).toBe("integration-x-x-42");
  expect(result.inboxItem.sessionId).toBe("integration-x-x-42");
  expect(harness.created).toEqual([
    {
      id: "integration-x-x-42",
      title: "X · Mentioned by customer",
      source: "integration.subscription",
    },
  ]);
  expect(harness.inboxItems[0]).toMatchObject({
    id: "inbox:x-42",
    channel: "x",
    sessionId: undefined,
  });
  expect(harness.inboxUpdates).toEqual([
    { itemId: "inbox:x-42", sessionId: "integration-x-x-42" },
  ]);
  expect(harness.forwarded).toEqual([
    {
      sessionId: "integration-x-x-42",
      text: "[x] Mentioned by customer",
    },
  ]);
  expect(harness.calls).toEqual([
    "inbox.create:inbox:x-42",
    "audit:integration.event.received",
    "session.create:integration-x-x-42",
    "inbox.assign:inbox:x-42:integration-x-x-42",
    "publish:mailbox.item.created",
    "publish:integration.event.received",
    "runtime.forward:integration-x-x-42",
  ]);
});
