import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { hmacSha256Base64 } from "../ingress/signatures";
import { IntegrationRouter } from "./router";
import type { IntegrationAuditInput, IntegrationRouterEvent } from "./types";
import {
  buildXChallengeResponse,
  normalizeXEvent,
  verifyXWebhookSignature,
  xConnectorStatus,
} from "./x";

test("buildXChallengeResponse returns sha256 response token", () => {
  const fixture = readFixture("x-crc.json");
  const crcToken = String(fixture.crc_token);
  const response = buildXChallengeResponse(crcToken, "consumer-secret");

  expect(response.response_token).toStartWith("sha256=");
  expect(response.response_token).toBe(
    `sha256=${hmacSha256Base64("consumer-secret", Buffer.from(crcToken))}`,
  );
});

test("verifyXWebhookSignature validates raw body HMAC", () => {
  const rawBody = Buffer.from(JSON.stringify(readFixture("x-post.json")));
  const signature = `sha256=${hmacSha256Base64("consumer-secret", rawBody)}`;

  expect(verifyXWebhookSignature(rawBody, "consumer-secret", signature)).toBe(
    true,
  );
  expect(verifyXWebhookSignature(rawBody, "wrong-secret", signature)).toBe(
    false,
  );
});

test("normalizeXEvent maps tweet_create_events fixture", () => {
  const fixture = readFixture("x-post.json");

  expect(
    normalizeXEvent(fixture, {
      deliveryId: "x-delivery-1",
      eventName: "tweet_create_events",
      rawBodyHash: "hash-1",
      receivedAt: 1_717_452_000_000,
    }),
  ).toMatchObject({
    bodyText: "Roguent dungeon build completed.",
    channel: "x",
    deliveryId: "x-delivery-1",
    direction: "inbound",
    from: "@roguent",
    metadata: expect.objectContaining({
      eventName: "tweet_create_events",
      rawBodyHash: "hash-1",
      sourceUrl: "https://x.com/roguent/status/1800000000000000000",
      url: "https://x.com/roguent/status/1800000000000000000",
      userId: "12345",
    }),
    summary: "tweet from @roguent",
  });
});

test("xConnectorStatus records blocked reasons for missing config and entitlement", () => {
  expect(xConnectorStatus({})).toMatchObject({
    channel: "x",
    error: "X webhook secret is required",
    metadata: {
      reason: "missing_webhook_secret",
    },
    state: "blocked",
  });
  expect(
    xConnectorStatus({
      ROGUENT_X_ENTITLEMENT_BLOCKER: "Account Activity API is unavailable",
      ROGUENT_X_WEBHOOK_SECRET: "consumer-secret",
    }),
  ).toMatchObject({
    metadata: {
      reason: "entitlement_blocked",
    },
    state: "blocked",
  });
  expect(
    xConnectorStatus({ ROGUENT_X_WEBHOOK_SECRET: "consumer-secret" }),
  ).toMatchObject({
    metadata: {
      mode: "webhook",
      status: "configured",
    },
    state: "disconnected",
  });
});

test("local X fixture routes to inbox, audit, and selected session", async () => {
  const event = normalizeXEvent(readFixture("x-post.json"), {
    deliveryId: "x-delivery-2",
    eventName: "tweet_create_events",
    receivedAt: 1_717_452_000_000,
  });
  const inboxItems: MailboxItem[] = [];
  const auditRecords: IntegrationAuditInput[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];
  const router = new IntegrationRouter({
    pairingBindings: {
      getByExternalKey(): PairingBinding | null {
        return null;
      },
    },
    inbox: {
      create(item) {
        inboxItems.push(item);
      },
      assignSession() {},
    },
    audit: {
      append(input) {
        auditRecords.push(input);
      },
    },
    sessions: {
      createSubscriptionSession() {},
      forwardToRuntime(sessionId, text) {
        forwarded.push({ sessionId, text });
        return true;
      },
    },
    publish(event) {
      published.push(event);
    },
  });

  const result = await router.route(event, { currentSessionId: "s1" });

  expect(result.sessionId).toBe("s1");
  expect(inboxItems).toEqual([
    expect.objectContaining({
      channel: "x",
      kind: "event",
      relatedEventId: "x:x-delivery-2",
      sessionId: "s1",
      title: "tweet from @roguent",
    }),
  ]);
  expect(auditRecords).toContainEqual(
    expect.objectContaining({
      deliveryId: "x-delivery-2",
      source: "integration.x",
    }),
  );
  expect(published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "integration.event.received",
      payload: expect.objectContaining({
        channel: "x",
        deliveryId: "x-delivery-2",
      }),
    }),
  );
  expect(forwarded[0]?.text).toContain("[x]");
});

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "integrations", name), "utf8"),
  ) as Record<string, unknown>;
}
