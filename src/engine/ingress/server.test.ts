import { expect, test } from "bun:test";
import type { IntegrationRouteOptions } from "../integrations/types";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { MemorySecretStore } from "../secrets/memory-store";
import { createIngressHandler, resolveIngressPort } from "./server";
import { hmacSha256Base64, hmacSha256Hex } from "./signatures";

test("GET /health returns ok", async () => {
  const harness = createHarness();
  try {
    const response = await harness.fetch("http://ingress.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/github rejects invalid signature before JSON parsing", async () => {
  const harness = createHarness({
    env: { ROGUENT_GITHUB_WEBHOOK_SECRET: "hook-secret" },
  });
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/github",
      {
        method: "POST",
        headers: {
          "x-github-delivery": "delivery-1",
          "x-github-event": "push",
          "x-hub-signature-256": "sha256=bad",
        },
        body: "{not-json",
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid signature" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toEqual([
      expect.objectContaining({
        action: "webhook.rejected",
        delivery_id: "delivery-1",
        source: "ingress.github",
        summary: "github webhook invalid_signature",
      }),
    ]);
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/github audits accepted delivery and routes normalized event", async () => {
  const rawBody = JSON.stringify({
    repository: {
      full_name: "poco/roguent",
      html_url: "https://github.com/poco/roguent",
    },
  });
  const harness = createHarness({
    currentSessionId: () => "s1",
    env: { ROGUENT_GITHUB_WEBHOOK_SECRET: "hook-secret" },
  });
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/github",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery-2",
          "x-github-event": "push",
          "x-hub-signature-256": githubSignature("hook-secret", rawBody),
        },
        body: rawBody,
      },
    );

    expect(response.status).toBe(200);
    expect(harness.routed).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          channel: "github",
          deliveryId: "delivery-2",
          direction: "inbound",
          metadata: expect.objectContaining({
            eventName: "push",
            sourceUrl: "https://github.com/poco/roguent",
            url: "https://github.com/poco/roguent",
          }),
          summary: "push in poco/roguent",
        }),
        options: { currentSessionId: "s1" },
      }),
    ]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.accepted",
        delivery_id: "delivery-2",
        source: "ingress.github",
        summary: "github webhook accepted",
      }),
    );
    expect(harness.auditRows()[0]?.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/github resolves webhook secret through SecretStore ref", async () => {
  const rawBody = JSON.stringify({
    repository: { full_name: "poco/roguent" },
  });
  const secretStore = new MemorySecretStore();
  await secretStore.put("secret:github:webhook", "hook-secret");
  const harness = createHarness({
    env: { ROGUENT_GITHUB_WEBHOOK_SECRET_REF: "secret:github:webhook" },
    secretStore,
  });
  try {
    const denied = await harness.fetch("http://ingress.test/webhooks/github", {
      method: "POST",
      headers: {
        "x-github-delivery": "delivery-ref-denied",
        "x-github-event": "push",
        "x-hub-signature-256": githubSignature("wrong-secret", rawBody),
      },
      body: rawBody,
    });
    expect(denied.status).toBe(401);

    const accepted = await harness.fetch(
      "http://ingress.test/webhooks/github",
      {
        method: "POST",
        headers: {
          "x-github-delivery": "delivery-ref-ok",
          "x-github-event": "push",
          "x-hub-signature-256": githubSignature("hook-secret", rawBody),
        },
        body: rawBody,
      },
    );

    expect(accepted.status).toBe(200);
    expect(harness.routed.at(-1)?.event).toMatchObject({
      channel: "github",
      deliveryId: "delivery-ref-ok",
    });
  } finally {
    harness.cleanup();
  }
});

test("relay endpoint validates bearer token and preserves requested channel", async () => {
  const rawBody = JSON.stringify({
    bodyText: "Deploy finished",
    externalChatId: "repo-1",
    summary: "deploy event",
  });
  const harness = createHarness({
    env: { ROGUENT_RELAY_TOKEN: "relay-secret" },
  });
  try {
    const denied = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: rawBody,
      },
    );
    expect(denied.status).toBe(401);

    const accepted = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer relay-secret" },
        body: rawBody,
      },
    );

    expect(accepted.status).toBe(200);
    expect(harness.routed.at(-1)?.event).toMatchObject({
      bodyText: "Deploy finished",
      channel: "github",
      externalChatId: "repo-1",
      summary: "deploy event",
    });
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/x validates signature and routes event", async () => {
  const rawBody = JSON.stringify({
    for_user_id: "12345",
    tweet_create_events: [
      {
        id_str: "1800000000000000000",
        text: "Roguent dungeon build completed.",
        user: { screen_name: "roguent" },
      },
    ],
  });
  const harness = createHarness({
    env: { ROGUENT_X_WEBHOOK_SECRET: "consumer-secret" },
  });
  try {
    const response = await harness.fetch("http://ingress.test/webhooks/x", {
      method: "POST",
      headers: {
        "x-roguent-delivery": "x-delivery-1",
        "x-twitter-webhooks-signature": `sha256=${hmacSha256Base64(
          "consumer-secret",
          Buffer.from(rawBody),
        )}`,
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    expect(harness.routed.at(-1)?.event).toMatchObject({
      bodyText: "Roguent dungeon build completed.",
      channel: "x",
      deliveryId: "x-delivery-1",
      metadata: expect.objectContaining({
        sourceUrl: "https://x.com/roguent/status/1800000000000000000",
      }),
      summary: "tweet from @roguent",
    });
  } finally {
    harness.cleanup();
  }
});

test("GET /webhooks/x returns CRC response token", async () => {
  const harness = createHarness({
    env: { ROGUENT_X_WEBHOOK_SECRET: "consumer-secret" },
  });
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/x?crc_token=token-1",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      response_token: `sha256=${hmacSha256Base64(
        "consumer-secret",
        Buffer.from("token-1"),
      )}`,
    });
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.accepted",
        delivery_id: "x:crc:token-1",
        source: "ingress.x",
        summary: "x webhook accepted",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/feishu fails closed when platform token is unconfigured", async () => {
  const harness = createHarness();
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/feishu",
      {
        method: "POST",
        body: "{not-json",
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "missing feishu token" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.rejected",
        source: "ingress.feishu",
        summary: "feishu webhook missing_feishu_token",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/feishu answers URL verification challenge", async () => {
  const rawBody = JSON.stringify({
    challenge: "challenge-value",
    token: "feishu-token",
    type: "url_verification",
  });
  const harness = createHarness({
    env: { ROGUENT_FEISHU_WEBHOOK_TOKEN: "feishu-token" },
  });
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/feishu",
      {
        method: "POST",
        body: rawBody,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "challenge-value" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.accepted",
        source: "ingress.feishu",
        summary: "feishu webhook accepted",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("POST /webhooks/feishu validates platform token and routes event", async () => {
  const rawBody = JSON.stringify({
    bodyText: "Feishu message",
    externalChatId: "chat-1",
    summary: "message received",
    token: "feishu-token",
  });
  const harness = createHarness({
    env: { ROGUENT_FEISHU_WEBHOOK_TOKEN: "feishu-token" },
  });
  try {
    const wrongTokenBody = JSON.stringify({
      summary: "wrong token",
      token: "wrong",
    });
    const denied = await harness.fetch("http://ingress.test/webhooks/feishu", {
      method: "POST",
      body: wrongTokenBody,
    });
    expect(denied.status).toBe(401);

    const accepted = await harness.fetch(
      "http://ingress.test/webhooks/feishu",
      {
        method: "POST",
        body: rawBody,
      },
    );

    expect(accepted.status).toBe(200);
    expect(harness.routed.at(-1)?.event).toMatchObject({
      bodyText: "Feishu message",
      channel: "feishu",
      externalChatId: "chat-1",
      summary: "message received",
    });
  } finally {
    harness.cleanup();
  }
});

test("resolveIngressPort starts only when explicitly configured", () => {
  expect(resolveIngressPort({})).toBeNull();
  expect(resolveIngressPort({ ROGUENT_INGRESS_PORT: "  " })).toBeNull();
  expect(resolveIngressPort({ ROGUENT_INGRESS_PORT: "8788" })).toBe(8788);
  expect(resolveIngressPort({ ROGUENT_INGRESS_PORT: "bad" })).toBeNull();
});

function createHarness(
  options: {
    currentSessionId?: () => string | null | undefined;
    env?: Record<string, string | undefined>;
    secretStore?: MemorySecretStore;
  } = {},
) {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  const routed: Array<{
    event: unknown;
    options: IntegrationRouteOptions;
  }> = [];
  const handler = createIngressHandler({
    currentSessionId: options.currentSessionId,
    db: testDb.db,
    env: options.env ?? {},
    router: {
      async route(event, routeOptions) {
        routed.push({ event, options: routeOptions ?? {} });
        return {
          inboxItem: {
            id: "inbox:test",
            source: event.channel,
            title: event.summary,
            summary: event.summary,
            ts: event.receivedAt,
            status: "unread",
          },
          createdSession: false,
        };
      },
    },
    secretStore: options.secretStore,
  });

  return {
    auditRows() {
      return testDb.db
        .query<
          {
            action: string;
            delivery_id: string | null;
            payload_hash: string;
            source: string;
            summary: string;
          },
          []
        >(
          "SELECT action, delivery_id, payload_hash, source, summary FROM audit_records ORDER BY created_at",
        )
        .all();
    },
    cleanup: testDb.cleanup,
    fetch(input: string, init?: RequestInit) {
      return handler(new Request(input, init));
    },
    routed,
  };
}

function githubSignature(secret: string, rawBody: string): string {
  return `sha256=${hmacSha256Hex(secret, Buffer.from(rawBody))}`;
}
