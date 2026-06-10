import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createIngressHandler } from "../ingress/server";
import { hmacSha256Hex } from "../ingress/signatures";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { MemorySecretStore } from "../secrets/memory-store";
import {
  DEFAULT_RELAY_TOKEN_REF,
  relayConnectorStatus,
  resolveRelayToken,
  storeRelayToken,
} from "./relay";
import type { IntegrationRouteOptions } from "./types";

test("relay token is stored and resolved through SecretStore ref", async () => {
  const store = new MemorySecretStore();

  await expect(storeRelayToken(store, "relay-secret")).resolves.toEqual({
    ref: DEFAULT_RELAY_TOKEN_REF,
    source: "secret-store",
  });

  expect(
    await resolveRelayToken(
      { ROGUENT_RELAY_TOKEN_REF: DEFAULT_RELAY_TOKEN_REF },
      store,
    ),
  ).toBe("relay-secret");
  expect(await store.listRefs("secret:relay")).toEqual([
    DEFAULT_RELAY_TOKEN_REF,
  ]);
});

test("relay connector status reports connected, disconnected, and blocked", async () => {
  const store = new MemorySecretStore();
  await store.put(DEFAULT_RELAY_TOKEN_REF, "relay-secret");

  await expect(relayConnectorStatus({}, store)).resolves.toMatchObject({
    channel: "relay",
    metadata: expect.objectContaining({ reason: "missing_token" }),
    state: "disconnected",
  });
  await expect(
    relayConnectorStatus(
      {
        ROGUENT_RELAY_TOKEN_REF: DEFAULT_RELAY_TOKEN_REF,
        ROGUENT_RELAY_URL: "https://relay.example.com",
      },
      store,
    ),
  ).resolves.toMatchObject({
    channel: "relay",
    metadata: expect.objectContaining({
      mode: "relay",
      status: "configured",
    }),
    state: "connected",
  });
  await expect(
    relayConnectorStatus({
      ROGUENT_RELAY_BLOCKED_REASON: "relay entitlement missing",
    }),
  ).resolves.toMatchObject({
    error: "relay entitlement missing",
    state: "blocked",
  });
});

test("relay endpoint rejects invalid relay bearer token before inner validation", async () => {
  const harness = await createRelayHarness();
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: JSON.stringify({
          channel: "github",
          headers: {},
          rawBodyBase64: Buffer.from("{}").toString("base64"),
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid relay token" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.rejected",
        source: "ingress.github",
        summary: "github webhook invalid_relay_token",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("relay endpoint still rejects invalid inner GitHub signature", async () => {
  const harness = await createRelayHarness();
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer relay-secret" },
        body: JSON.stringify({
          channel: "github",
          headers: {
            "content-type": "application/json",
            "x-github-delivery": "relay-delivery-bad-signature",
            "x-github-event": "push",
            "x-hub-signature-256": githubSignature("wrong-secret", "{}"),
          },
          rawBodyBase64: Buffer.from("{}").toString("base64"),
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid signature" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.rejected",
        delivery_id: "relay-delivery-bad-signature",
        source: "ingress.github",
        summary: "github webhook invalid_signature",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("relay endpoint rejects malformed inner headers before forwarding", async () => {
  const harness = await createRelayHarness();
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer relay-secret" },
        body: JSON.stringify({
          channel: "github",
          headers: {
            "bad header": "ok",
            "x-github-event": "push",
          },
          rawBodyBase64: Buffer.from("{}").toString("base64"),
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_headers" });
    expect(harness.routed).toEqual([]);
    expect(harness.auditRows()).toContainEqual(
      expect.objectContaining({
        action: "webhook.rejected",
        source: "ingress.github",
        summary: "github webhook invalid_headers",
      }),
    );
  } finally {
    harness.cleanup();
  }
});

test("local fake relay forwards GitHub fixture through original signature validation", async () => {
  const fixtureBody = readFixtureText("github-push.json");
  const harness = await createRelayHarness({
    currentSessionId: () => "s-relay",
  });
  try {
    const response = await harness.fetch(
      "http://ingress.test/webhooks/relay/github",
      {
        method: "POST",
        headers: { authorization: "Bearer relay-secret" },
        body: JSON.stringify({
          channel: "github",
          headers: {
            "content-type": "application/json",
            "x-github-delivery": "relay-delivery-ok",
            "x-github-event": "push",
            "x-hub-signature-256": githubSignature(
              "github-webhook-secret",
              fixtureBody,
            ),
          },
          rawBodyBase64: Buffer.from(fixtureBody).toString("base64"),
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "github:relay-delivery-ok",
      ok: true,
    });
    expect(harness.routed).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          channel: "github",
          deliveryId: "relay-delivery-ok",
          metadata: expect.objectContaining({
            eventName: "push",
            repository: "poco/roguent",
          }),
          summary: expect.stringContaining("push"),
        }),
        options: { currentSessionId: "s-relay" },
      }),
    ]);
    expect(harness.routed[0]?.event).not.toMatchObject({
      channel: "relay",
    });
  } finally {
    harness.cleanup();
  }
});

async function createRelayHarness(
  options: {
    currentSessionId?: () => string | null | undefined;
  } = {},
) {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  const secretStore = new MemorySecretStore();
  await secretStore.put(DEFAULT_RELAY_TOKEN_REF, "relay-secret");
  await secretStore.put("secret:github:webhook", "github-webhook-secret");
  const routed: Array<{
    event: unknown;
    options: IntegrationRouteOptions;
  }> = [];
  const handler = createIngressHandler({
    currentSessionId: options.currentSessionId,
    db: testDb.db,
    env: {
      ROGUENT_GITHUB_WEBHOOK_SECRET_REF: "secret:github:webhook",
      ROGUENT_RELAY_TOKEN_REF: DEFAULT_RELAY_TOKEN_REF,
    },
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
    secretStore,
  });

  return {
    auditRows() {
      return testDb.db
        .query<
          {
            action: string;
            delivery_id: string | null;
            source: string;
            summary: string;
          },
          []
        >(
          "SELECT action, delivery_id, source, summary FROM audit_records ORDER BY created_at",
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

function readFixtureText(name: string): string {
  return readFileSync(
    join(process.cwd(), "fixtures", "integrations", name),
    "utf8",
  );
}

function githubSignature(secret: string, rawBody: string): string {
  return `sha256=${hmacSha256Hex(secret, Buffer.from(rawBody))}`;
}
