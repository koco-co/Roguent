import { expect, test } from "bun:test";
import type { SecretStore } from "../secrets/types";
import { WeChatIlinkConnector, createWeChatConnector } from "./wechat-ilink";
import type { ImConnectorEvent } from "./wechat-types";

const BASE = "https://ilinkai.weixin.qq.com";

interface ScriptedCall {
  url: string;
  method: string;
  body?: unknown;
  headers: Record<string, string>;
}

/**
 * A scripted fetch double. Queue responses per endpoint substring; each call
 * pops the next queued response for the first matching endpoint. Records every
 * call for assertions. Unknown endpoints throw so tests fail loudly.
 */
class ScriptedFetch {
  readonly calls: ScriptedCall[] = [];
  private readonly queues = new Map<string, unknown[]>();
  /** Last response per endpoint; replayed once a queue drains (sticky) so a
   * background long-poll loop stays inert instead of throwing/spinning. */
  private readonly sticky = new Map<string, unknown>();

  queue(endpoint: string, ...responses: unknown[]): this {
    const existing = this.queues.get(endpoint) ?? [];
    existing.push(...responses);
    this.queues.set(endpoint, existing);
    if (responses.length > 0) {
      this.sticky.set(endpoint, responses[responses.length - 1]);
    }
    return this;
  }

  readonly fetch: typeof fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = normalizeHeaders(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({
      url,
      method: init?.method ?? "GET",
      body,
      headers,
    });
    for (const [endpoint, queue] of this.queues) {
      if (url.includes(endpoint)) {
        if (queue.length > 0) return jsonResponse(queue.shift());
        if (this.sticky.has(endpoint)) {
          return jsonResponse(this.sticky.get(endpoint));
        }
      }
    }
    throw new Error(`ScriptedFetch: no queued response for ${url}`);
  }) as unknown as typeof fetch;
}

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key] = String(value);
  }
  return out;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

class MemorySecretStore implements SecretStore {
  readonly map = new Map<string, string>();
  async put(ref: string, value: string): Promise<void> {
    this.map.set(ref, value);
  }
  async get(ref: string): Promise<string | undefined> {
    return this.map.get(ref);
  }
  async delete(ref: string): Promise<void> {
    this.map.delete(ref);
  }
  async listRefs(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((key) => key.startsWith(prefix));
  }
}

/**
 * A sleep double that yields to the macrotask queue (so the connector's
 * background loops interleave with the test) without burning wall-clock time.
 * A pure microtask no-op would starve `flush()` and let a loop spin forever.
 */
const yieldingSleep = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/** Let the connector's background loops drain a few macrotask turns. */
async function flush(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const NOW = 1_717_452_000_000;

function makeConnector(
  fetchImpl: typeof fetch,
  secretStore: SecretStore = new MemorySecretStore(),
) {
  return new WeChatIlinkConnector({
    fetchImpl,
    now: () => NOW,
    sleep: yieldingSleep,
    secretStore,
    baseUrl: BASE,
  });
}

test("startPairing posts get_bot_qrcode and emits pending pairing.qr with url", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue("get_bot_qrcode", {
    qrcode: "qrcode-token-1",
    qrcode_img_content: "https://weixin.qq.com/q/abc",
  });
  // Keep the poll loop alive but inert so the test only checks the initial QR.
  scripted.queue("get_qrcode_status", { status: "wait" });
  const connector = makeConnector(scripted.fetch);

  const qr = await connector.startPairing("s1");
  connector.stopLoops();

  expect(qr).toMatchObject({
    channel: "wechat",
    sessionId: "s1",
    status: "pending",
    url: "https://weixin.qq.com/q/abc",
    expiresAt: NOW + 180_000,
  });

  const qrCall = scripted.calls.find((call) =>
    call.url.includes("get_bot_qrcode"),
  );
  expect(qrCall).toBeDefined();
  expect(qrCall?.method).toBe("POST");
  expect(qrCall?.url).toContain("bot_type=3");
  expect(qrCall?.body).toEqual({ local_token_list: [] });

  const events = connector.observedEvents.filter(
    (event) => event.type === "pairing.qr",
  );
  expect(events.length).toBeGreaterThanOrEqual(1);
  expect(events[0]).toMatchObject({
    type: "pairing.qr",
    qr: { status: "pending", url: "https://weixin.qq.com/q/abc" },
  });
});

test("poll wait -> confirmed persists creds and emits pairing.scanned", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue("get_bot_qrcode", {
    qrcode: "qrcode-token-1",
    qrcode_img_content: "https://weixin.qq.com/q/abc",
  });
  scripted.queue(
    "get_qrcode_status",
    { status: "wait" },
    {
      status: "confirmed",
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
      ilink_user_id: "user-42",
    },
  );
  // After confirmed the connector begins getupdates; keep it inert.
  scripted.queue("getupdates", { ret: 0, msgs: [], get_updates_buf: "cur-1" });
  const secretStore = new MemorySecretStore();
  const connector = makeConnector(scripted.fetch, secretStore);

  await connector.startPairing("s1");
  await flush();
  connector.stopLoops();

  const scanned = connector.observedEvents.find(
    (event): event is Extract<ImConnectorEvent, { type: "pairing.scanned" }> =>
      event.type === "pairing.scanned",
  );
  expect(scanned).toMatchObject({
    type: "pairing.scanned",
    channel: "wechat",
    sessionId: "s1",
    externalChatId: "user-42",
    externalUserId: "user-42",
    scannedAt: NOW,
  });

  // Credentials persisted keyed by ilink_bot_id.
  const stored = await secretStore.get("wechat:ilink:bot-9000");
  expect(stored).toBeDefined();
  const parsed = JSON.parse(stored as string);
  expect(parsed).toMatchObject({
    bot_token: "bot-token-secret-xyz",
    ilink_bot_id: "bot-9000",
    baseurl: BASE,
  });
});

test("need_verifycode pauses until submitVerifyCode then resumes with verify_code", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue("get_bot_qrcode", {
    qrcode: "qrcode-token-1",
    qrcode_img_content: "https://weixin.qq.com/q/abc",
  });
  scripted.queue(
    "get_qrcode_status",
    { status: "need_verifycode" },
    {
      status: "confirmed",
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
      ilink_user_id: "user-42",
    },
  );
  scripted.queue("getupdates", { ret: 0, msgs: [], get_updates_buf: "cur-1" });
  const connector = makeConnector(scripted.fetch);

  await connector.startPairing("s1");
  await flush();

  // Before code submission the loop must be paused (only the bot_qrcode + the
  // need_verifycode status call have happened).
  const statusCallsBefore = scripted.calls.filter((call) =>
    call.url.includes("get_qrcode_status"),
  );
  expect(statusCallsBefore.length).toBe(1);
  expect(statusCallsBefore[0]?.url).not.toContain("verify_code");

  await connector.submitVerifyCode("s1", "1234");
  await flush();
  connector.stopLoops();

  const statusCalls = scripted.calls.filter((call) =>
    call.url.includes("get_qrcode_status"),
  );
  expect(statusCalls.length).toBe(2);
  expect(statusCalls[1]?.url).toContain("verify_code=1234");

  const scanned = connector.observedEvents.find(
    (event) => event.type === "pairing.scanned",
  );
  expect(scanned).toBeDefined();
});

test("expired refreshes the QR and re-emits pairing.qr", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue(
    "get_bot_qrcode",
    {
      qrcode: "qrcode-token-1",
      qrcode_img_content: "https://weixin.qq.com/q/1",
    },
    {
      qrcode: "qrcode-token-2",
      qrcode_img_content: "https://weixin.qq.com/q/2",
    },
  );
  scripted.queue(
    "get_qrcode_status",
    { status: "expired" },
    {
      status: "confirmed",
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
      ilink_user_id: "user-42",
    },
  );
  scripted.queue("getupdates", { ret: 0, msgs: [], get_updates_buf: "cur-1" });
  const connector = makeConnector(scripted.fetch);

  await connector.startPairing("s1");
  await flush();
  connector.stopLoops();

  const qrEvents = connector.observedEvents.filter(
    (event) => event.type === "pairing.qr",
  );
  // Initial QR + the refreshed QR.
  expect(qrEvents.length).toBe(2);
  const urls = qrEvents.map((event) =>
    event.type === "pairing.qr" ? event.qr.url : undefined,
  );
  expect(urls).toEqual([
    "https://weixin.qq.com/q/1",
    "https://weixin.qq.com/q/2",
  ]);

  const qrCalls = scripted.calls.filter((call) =>
    call.url.includes("get_bot_qrcode"),
  );
  expect(qrCalls.length).toBe(2);
});

test("expired more than 3 times emits pairing.expired", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue(
    "get_bot_qrcode",
    { qrcode: "q1", qrcode_img_content: "u1" },
    { qrcode: "q2", qrcode_img_content: "u2" },
    { qrcode: "q3", qrcode_img_content: "u3" },
  );
  scripted.queue(
    "get_qrcode_status",
    { status: "expired" },
    { status: "expired" },
    { status: "expired" },
    { status: "expired" },
  );
  const connector = makeConnector(scripted.fetch);

  await connector.startPairing("s1");
  await flush();
  connector.stopLoops();

  const expired = connector.observedEvents.find(
    (event) => event.type === "pairing.expired",
  );
  expect(expired).toBeDefined();
});

test("getupdates inbound USER message emits a message event", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue(
    "getupdates",
    {
      ret: 0,
      get_updates_buf: "cursor-2",
      msgs: [
        {
          message_id: 1001,
          from_user_id: "user-42",
          create_time_ms: NOW,
          message_type: 1,
          context_token: "ctx-token-1",
          item_list: [{ type: 1, text_item: { text: "请检查 CI" } }],
        },
        {
          message_id: 1002,
          from_user_id: "bot-self",
          create_time_ms: NOW,
          message_type: 2,
          item_list: [{ type: 1, text_item: { text: "ignore me" } }],
        },
      ],
    },
    { ret: 0, msgs: [], get_updates_buf: "cursor-3" },
  );
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "wechat:ilink:bot-9000",
    JSON.stringify({
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
    }),
  );
  const connector = makeConnector(scripted.fetch, secretStore);

  await connector.start();
  await flush();
  connector.stopLoops();

  const messages = connector.observedEvents.filter(
    (event) => event.type === "message",
  );
  expect(messages.length).toBe(1);
  expect(messages[0]).toMatchObject({
    type: "message",
    event: {
      channel: "wechat",
      direction: "inbound",
      externalChatId: "user-42",
      bodyText: "请检查 CI",
      summary: "请检查 CI",
      from: "user-42",
      metadata: { contextAvailable: true },
      receivedAt: NOW,
    },
  });

  // The getupdates call carries the auth headers + cursor advancing.
  const updateCalls = scripted.calls.filter((call) =>
    call.url.includes("getupdates"),
  );
  expect(updateCalls[0]?.headers.AuthorizationType).toBe("ilink_bot_token");
  expect(updateCalls[0]?.headers.Authorization).toBe(
    "Bearer bot-token-secret-xyz",
  );
  expect(
    (updateCalls[0]?.body as { get_updates_buf?: string }).get_updates_buf,
  ).toBe("");
  expect(
    (updateCalls[1]?.body as { get_updates_buf?: string }).get_updates_buf,
  ).toBe("cursor-2");
});

test("sendMessage posts the iLink envelope and emits outbound.ack", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue("sendmessage", { ret: 0 });
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "wechat:ilink:bot-9000",
    JSON.stringify({
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
    }),
  );
  const connector = makeConnector(scripted.fetch, secretStore);
  // Load creds without launching the long-poll loop.
  await connector.loadStoredCredentials();

  const result = await connector.sendMessage(
    { externalChatId: "user-42" },
    "agent reply",
  );

  expect(result).toMatchObject({
    channel: "wechat",
    externalChatId: "user-42",
    status: "delivered",
    sentAt: NOW,
  });

  const sendCall = scripted.calls.find((call) =>
    call.url.includes("sendmessage"),
  );
  expect(sendCall?.method).toBe("POST");
  expect(sendCall?.body).toEqual({
    msg: {
      to_user_id: "user-42",
      item_list: [{ type: 1, text_item: { text: "agent reply" } }],
    },
  });
  expect(sendCall?.headers.Authorization).toBe("Bearer bot-token-secret-xyz");
  expect(sendCall?.headers.AuthorizationType).toBe("ilink_bot_token");

  const ack = connector.observedEvents.find(
    (event) => event.type === "outbound.ack",
  );
  expect(ack).toMatchObject({
    type: "outbound.ack",
    result: { externalChatId: "user-42", status: "delivered" },
  });
});

test("sendMessage includes remembered context_token from a prior inbound", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue(
    "getupdates",
    {
      ret: 0,
      get_updates_buf: "cursor-2",
      msgs: [
        {
          message_id: 1001,
          from_user_id: "user-42",
          create_time_ms: NOW,
          message_type: 1,
          context_token: "ctx-token-1",
          item_list: [{ type: 1, text_item: { text: "hi" } }],
        },
      ],
    },
    { ret: 0, msgs: [], get_updates_buf: "cursor-3" },
  );
  scripted.queue("sendmessage", { ret: 0 });
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "wechat:ilink:bot-9000",
    JSON.stringify({
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
    }),
  );
  const connector = makeConnector(scripted.fetch, secretStore);

  await connector.start();
  await flush();
  connector.stopLoops();

  await connector.sendMessage({ externalChatId: "user-42" }, "reply");
  const sendCall = scripted.calls.find((call) =>
    call.url.includes("sendmessage"),
  );
  expect(
    (sendCall?.body as { msg: { context_token?: string } }).msg.context_token,
  ).toBe("ctx-token-1");
});

test("getupdates tolerates ret!=0 without crashing the loop", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue(
    "getupdates",
    { ret: -14, errmsg: "session timeout", get_updates_buf: "cursor-1" },
    { ret: 0, msgs: [], get_updates_buf: "cursor-2" },
  );
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "wechat:ilink:bot-9000",
    JSON.stringify({
      bot_token: "bot-token-secret-xyz",
      ilink_bot_id: "bot-9000",
      baseurl: BASE,
    }),
  );
  const connector = makeConnector(scripted.fetch, secretStore);

  await connector.start();
  await flush();
  connector.stopLoops();

  // Two getupdates calls happened (the loop retried after ret!=0).
  const updateCalls = scripted.calls.filter((call) =>
    call.url.includes("getupdates"),
  );
  expect(updateCalls.length).toBeGreaterThanOrEqual(2);
});

test("never logs the bot token in plaintext when serializing events", async () => {
  const scripted = new ScriptedFetch();
  scripted.queue("get_bot_qrcode", {
    qrcode: "qrcode-token-1",
    qrcode_img_content: "https://weixin.qq.com/q/abc",
  });
  scripted.queue("get_qrcode_status", {
    status: "confirmed",
    bot_token: "bot-token-secret-xyz",
    ilink_bot_id: "bot-9000",
    baseurl: BASE,
    ilink_user_id: "user-42",
  });
  scripted.queue("getupdates", { ret: 0, msgs: [], get_updates_buf: "cur-1" });
  const connector = makeConnector(scripted.fetch);

  await connector.startPairing("s1");
  await flush();
  connector.stopLoops();

  expect(JSON.stringify(connector.observedEvents)).not.toContain(
    "bot-token-secret-xyz",
  );
});

test("createWeChatConnector returns a WeChatIlinkConnector", () => {
  const connector = createWeChatConnector({
    fetchImpl: new ScriptedFetch().fetch,
    secretStore: new MemorySecretStore(),
  });
  expect(connector).toBeInstanceOf(WeChatIlinkConnector);
});
