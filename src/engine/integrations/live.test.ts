import { expect, test } from "bun:test";
import type { RoomEvent } from "../../shared/events";
import type { DriverCallbacks, IDriver } from "../driver";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import type { RuntimeDriverCreator } from "../runtime/manager";
import { SessionManager } from "../session";
import { startLiveIntegrations } from "./live";
import { PairingService } from "./pairing";
import type { IntegrationEvent } from "./types";
import type {
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

test("live integrations subscribe to SessionManager assistant finals for outbound IM replies", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    createRepositories(testDb.db).sessions.upsert({
      id: "s1",
      runtime: "claude",
      title: "IM task",
      model: "claude-sonnet-4",
      cwd: null,
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: false,
      approvalPolicy: null,
      metadataJson: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await new PairingService(testDb.db).bind({
      channel: "wechat",
      externalChatId: "chat-1",
      sessionId: "s1",
      boundAt: 2,
    });

    const runtime = new CapturingRuntime();
    const sessions = new SessionManager(runtime, "/tmp/roguent", {
      auditDb: testDb.db,
    });
    const published: RoomEvent[] = [];
    sessions.subscribe((event) => published.push(event));
    sessions.createSession("s1", { title: "IM task", model: "m" });
    const connector = new RecordingConnector();
    const live = startLiveIntegrations({
      db: testDb.db,
      sessions,
      imConnectors: { wechat: connector },
    });

    await connector.emitInbound({
      id: "im-1",
      externalChatId: "chat-1",
      text: "fix tests",
    });
    expect(runtime.sent).toEqual([{ sessionId: "s1", text: "fix tests" }]);

    runtime.callbacks?.onDraft(
      [{ type: "message.final", payload: { text: "tests fixed" } }],
      1_717_452_000_200,
    );
    await waitFor(() => connector.sent.length > 0);

    expect(connector.sent).toEqual([
      { target: { externalChatId: "chat-1" }, text: "tests fixed" },
    ]);
    await waitFor(() =>
      published.some(
        (event) =>
          event.type === "integration.event.received" &&
          (event.payload as { direction?: unknown }).direction === "outbound",
      ),
    );
    expect(published).toContainEqual(
      expect.objectContaining({
        sessionId: "s1",
        type: "integration.event.received",
        payload: expect.objectContaining({
          direction: "outbound",
          bodyText: "tests fixed",
        }),
      }),
    );
    live.stop();
  } finally {
    testDb.cleanup();
  }
});

test("live integrations contain outbound publish failures from SessionManager events", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    createRepositories(testDb.db).sessions.upsert({
      id: "s1",
      runtime: "claude",
      title: "IM task",
      model: "claude-sonnet-4",
      cwd: null,
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: false,
      approvalPolicy: null,
      metadataJson: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await new PairingService(testDb.db).bind({
      channel: "wechat",
      externalChatId: "chat-1",
      sessionId: "s1",
      boundAt: 2,
    });

    const runtime = new CapturingRuntime();
    const sessions = new SessionManager(runtime, "/tmp/roguent", {
      auditDb: testDb.db,
    });
    const published: RoomEvent[] = [];
    sessions.subscribe((event) => published.push(event));
    sessions.createSession("s1", { title: "IM task", model: "m" });
    const connector = new RecordingConnector();
    const live = startLiveIntegrations({
      db: testDb.db,
      sessions,
      imConnectors: { wechat: connector },
    });

    await connector.emitInbound({
      id: "im-1",
      externalChatId: "chat-1",
      text: "fix tests",
    });
    testDb.db.query("DROP TABLE audit_records").run();

    runtime.callbacks?.onDraft(
      [{ type: "message.final", payload: { text: "tests fixed" } }],
      1_717_452_000_200,
    );
    await waitFor(() =>
      published.some(
        (event) =>
          event.type === "integration.status" &&
          (event.payload as { status?: { metadata?: { code?: unknown } } })
            .status?.metadata?.code === "outbound-room-event-failed",
      ),
    );

    expect(connector.sent).toEqual([
      { target: { externalChatId: "chat-1" }, text: "tests fixed" },
    ]);
    expect(published).toContainEqual(
      expect.objectContaining({
        sessionId: "integrations",
        type: "integration.status",
        payload: expect.objectContaining({
          status: expect.objectContaining({
            channel: "wechat",
            state: "degraded",
            metadata: { code: "outbound-room-event-failed" },
          }),
        }),
      }),
    );
    live.stop();
  } finally {
    testDb.cleanup();
  }
});

test("live integrations publish X webhook connector status on startup", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const sessions = new SessionManager(
      new CapturingRuntime(),
      "/tmp/roguent",
      {
        auditDb: testDb.db,
      },
    );
    const published: RoomEvent[] = [];
    sessions.subscribe((event) => published.push(event));

    const live = startLiveIntegrations({
      db: testDb.db,
      env: {},
      imConnectors: {},
      sessions,
    });

    await waitFor(() =>
      published.some(
        (event) =>
          event.type === "integration.status" &&
          (event.payload as { status?: { channel?: unknown } }).status
            ?.channel === "x",
      ),
    );

    expect(published).toContainEqual(
      expect.objectContaining({
        sessionId: "integrations",
        type: "integration.status",
        payload: expect.objectContaining({
          status: expect.objectContaining({
            channel: "x",
            metadata: { reason: "missing_webhook_secret" },
            state: "blocked",
          }),
        }),
      }),
    );
    live.stop();
  } finally {
    testDb.cleanup();
  }
});

class CapturingRuntime implements RuntimeDriverCreator {
  callbacks: DriverCallbacks | null = null;
  readonly sent: Array<{ sessionId: string; text: string }> = [];

  createDriver(callbacks: DriverCallbacks): IDriver {
    this.callbacks = callbacks;
    return {
      start() {},
      send: (text: string) => {
        this.sent.push({ sessionId: "s1", text });
      },
      setModel: async () => {},
      setPermissionMode: async () => {},
      getContextUsage: async () => null,
      askPermission: async () => ({ behavior: "allow" }),
      respondPermission: async () => {},
      interrupt: async () => {},
      end() {},
    };
  }
}

class RecordingConnector {
  readonly sent: Array<{ target: OutboundImTarget; text: string }> = [];
  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private counter = 0;

  async startPairing(sessionId: string): Promise<PairingQrState> {
    return {
      id: `qr-${sessionId}`,
      channel: "wechat",
      sessionId,
      status: "pending",
    };
  }

  async stopPairing(): Promise<void> {}

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    this.sent.push({ target, text });
    return {
      id: `outbound-${++this.counter}`,
      channel: "wechat",
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt: 1_717_452_000_300,
    };
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emitInbound(input: {
    id: string;
    externalChatId: string;
    text: string;
  }): Promise<void> {
    const event: IntegrationEvent = {
      id: input.id,
      channel: "wechat",
      direction: "inbound",
      externalChatId: input.externalChatId,
      deliveryId: input.id,
      summary: input.text,
      bodyText: input.text,
      receivedAt: 1_717_452_000_100,
    };
    for (const handler of this.handlers) {
      await handler({ type: "message", event });
    }
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
