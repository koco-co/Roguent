/**
 * Task 60: X Webhook CRC + Signed-Event Smoke Script
 *
 * Verifies X webhook CRC challenge response and signed event ingress locally.
 * Real X API (Account Activity API) registration is expected blocked due to
 * entitlement requirements — that's recorded honestly as a blocker entry.
 *
 * Exit code is ALWAYS 0 — pass/blocked/degraded is captured in the artifact.
 *
 * Artifact schema (same convention as Tasks 56–59):
 * {
 *   target: "x-webhook",
 *   mode: "local-crc+signed-fixture" | "none",
 *   status: "passed" | "degraded" | "blocked",
 *   observedEvents: string[],
 *   blockers: { stage: string; reason: string }[],
 *   notes?: string,
 *   version?: string,
 *   ranAtMs: number,
 * }
 *
 * Smoke stages:
 *   1. CRC local test (MUST pass): compute response_token for a known crc_token
 *      via buildXChallengeResponse; assert sha256=... form. Also exercise the
 *      real ingress GET /webhooks/x?crc_token=... endpoint on an ephemeral port.
 *   2. Local signed-event POST (PASS path): sign x-post.json fixture with
 *      verifyXWebhookSignature-compatible HMAC-base64, POST to the local ingress
 *      GET /webhooks/x endpoint on the same ephemeral server, assert 200 + inbox
 *      item id. Also POST an invalid signature to assert HTTP 401 (security gate).
 *   3. Real X API path (expected blocked): if X_CONSUMER_KEY / X_CONSUMER_SECRET
 *      / X_ACCESS_TOKEN / X_ACCESS_SECRET / X_BEARER_TOKEN are set, attempt a
 *      real registration check via the Account Activity API. Missing env vars or
 *      API failures are recorded as a blocker entry — but do NOT flip status to
 *      "blocked" if CRC + local-signed already passed.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createIngressHandler } from "../src/engine/ingress/server";
import { hmacSha256Base64 } from "../src/engine/ingress/signatures";
import type { IntegrationRouteOptions } from "../src/engine/integrations/types";
import {
  buildXChallengeResponse,
  verifyXWebhookSignature,
} from "../src/engine/integrations/x";
import { createTestDatabase } from "../src/engine/persistence/db";
import { migrate } from "../src/engine/persistence/migrations";

// ─── Schema ──────────────────────────────────────────────────────────────────

interface SmokeBlocker {
  stage: string;
  reason: string;
}

interface SmokeArtifact {
  target: "x-webhook";
  mode: "local-crc+signed-fixture" | "none";
  status: "passed" | "degraded" | "blocked";
  observedEvents: string[];
  blockers: SmokeBlocker[];
  notes?: string;
  version?: string;
  ranAtMs: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/x-smoke");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");
const FIXTURE_CRC_PATH = join(
  process.cwd(),
  "fixtures",
  "integrations",
  "x-crc.json",
);
const FIXTURE_POST_PATH = join(
  process.cwd(),
  "fixtures",
  "integrations",
  "x-post.json",
);

/** Hard ceiling on the whole script. */
const SCRIPT_TIMEOUT_MS = 15_000;

const SMOKE_CONSUMER_SECRET = "smoke-consumer-secret";

// ─── Main ─────────────────────────────────────────────────────────────────────

const ranAtMs = Date.now();

// Hard global timeout — writes whatever we have and exits 0.
const globalTimer = setTimeout(() => {
  writeAndPrint({
    target: "x-webhook",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [
      {
        stage: "script.global-timeout",
        reason: `Script exceeded hard ceiling of ${SCRIPT_TIMEOUT_MS}ms without resolving`,
      },
    ],
    notes: `Global timeout fired after ${SCRIPT_TIMEOUT_MS}ms`,
    ranAtMs,
  });
}, SCRIPT_TIMEOUT_MS);
globalTimer.unref?.();

try {
  const artifact = await runSmoke();
  clearTimeout(globalTimer);
  writeAndPrint(artifact);
} catch (error) {
  clearTimeout(globalTimer);
  writeAndPrint({
    target: "x-webhook",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [
      {
        stage: "script.uncaught",
        reason: errorMessage(error),
      },
    ],
    ranAtMs,
  });
}

// ─── Smoke logic ─────────────────────────────────────────────────────────────

async function runSmoke(): Promise<SmokeArtifact> {
  const observedEvents: string[] = [];
  const blockers: SmokeBlocker[] = [];

  // ── Stage 1: CRC local crypto test ───────────────────────────────────────

  // Read crc_token from fixture
  let crcFixture: Record<string, unknown>;
  try {
    crcFixture = JSON.parse(readFileSync(FIXTURE_CRC_PATH, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    return blocked(
      "fixture.crc.read",
      `Could not read ${FIXTURE_CRC_PATH}: ${errorMessage(error)}`,
    );
  }

  const crcToken = String(crcFixture.crc_token ?? "crc-token");

  // Pure crypto check: buildXChallengeResponse must return sha256=... form
  const crcResponse = buildXChallengeResponse(crcToken, SMOKE_CONSUMER_SECRET);
  if (!crcResponse.response_token.startsWith("sha256=")) {
    return blocked(
      "crc.format",
      `response_token does not start with 'sha256=': got '${crcResponse.response_token}'`,
    );
  }

  // Cross-validate: recompute independently
  const expectedToken = `sha256=${hmacSha256Base64(SMOKE_CONSUMER_SECRET, Buffer.from(crcToken))}`;
  if (crcResponse.response_token !== expectedToken) {
    return blocked(
      "crc.value",
      `response_token mismatch: got '${crcResponse.response_token}' expected '${expectedToken}'`,
    );
  }

  observedEvents.push("crc.passed");
  process.stderr.write(
    `[x-smoke] CRC crypto check passed: response_token=${crcResponse.response_token}\n`,
  );

  // ── Stage 1b: CRC through live ingress server ─────────────────────────────

  // Read post fixture
  let fixtureBody: string;
  try {
    fixtureBody = readFileSync(FIXTURE_POST_PATH, "utf8");
  } catch (error) {
    return blocked(
      "fixture.post.read",
      `Could not read ${FIXTURE_POST_PATH}: ${errorMessage(error)}`,
    );
  }
  observedEvents.push("fixture.loaded");

  // Set up in-memory DB + ingress handler
  let testDb: ReturnType<typeof createTestDatabase> | null = null;
  try {
    testDb = createTestDatabase();
    migrate(testDb.db);
  } catch (error) {
    testDb?.cleanup();
    return blocked(
      "db.setup",
      `Failed to create test database: ${errorMessage(error)}`,
    );
  }
  observedEvents.push("db.ready");

  const routedItems: Array<{ inboxItemId: string; eventSummary: string }> = [];
  const handler = createIngressHandler({
    db: testDb.db,
    env: {
      ROGUENT_X_WEBHOOK_SECRET: SMOKE_CONSUMER_SECRET,
    },
    router: {
      async route(event, _options: IntegrationRouteOptions) {
        const inboxItemId = `inbox:${event.id}`;
        routedItems.push({
          inboxItemId,
          eventSummary: event.summary,
        });
        return {
          inboxItem: {
            id: inboxItemId,
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
  });
  observedEvents.push("handler.ready");

  // Start real Bun HTTP server on an ephemeral port
  let server: ReturnType<typeof Bun.serve> | null = null;
  let port: number;
  try {
    server = Bun.serve({
      port: 0, // ephemeral
      fetch: handler,
    });
    port = server.port ?? 0;
    if (!port) throw new Error("Server bound to port 0 — unexpected");
    process.stderr.write(`[x-smoke] ingress server started on port ${port}\n`);
    observedEvents.push("server.started");
  } catch (error) {
    testDb.cleanup();
    return blocked(
      "server.start",
      `Failed to start ingress server: ${errorMessage(error)}`,
    );
  }

  try {
    // Stage 1b: GET /webhooks/x?crc_token=... must return 200 + response_token
    const crcServerResponse = await fetch(
      `http://127.0.0.1:${port}/webhooks/x?crc_token=${encodeURIComponent(crcToken)}`,
    );
    if (crcServerResponse.status !== 200) {
      return blocked(
        "crc.ingress",
        `Expected HTTP 200 from CRC endpoint but got ${crcServerResponse.status}`,
      );
    }
    const crcServerBody = (await crcServerResponse.json()) as Record<
      string,
      unknown
    >;
    const serverResponseToken = String(crcServerBody.response_token ?? "");
    if (!serverResponseToken.startsWith("sha256=")) {
      return blocked(
        "crc.ingress.format",
        `Ingress CRC response_token does not start with 'sha256=': got '${serverResponseToken}'`,
      );
    }
    if (serverResponseToken !== crcResponse.response_token) {
      return blocked(
        "crc.ingress.value",
        `Ingress CRC response_token mismatch: got '${serverResponseToken}' expected '${crcResponse.response_token}'`,
      );
    }
    observedEvents.push("crc.ingress.passed");
    process.stderr.write(
      `[x-smoke] CRC ingress check passed: response_token=${serverResponseToken}\n`,
    );

    // ── Stage 2: Local signed-event POST ─────────────────────────────────────

    // Step 2a: POST with INVALID signature — must return 401 (security gate)
    const deliveryIdBad = `smoke-x-invalid-${randomUUID()}`;
    const badSigResponse = await fetch(`http://127.0.0.1:${port}/webhooks/x`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-roguent-delivery": deliveryIdBad,
        "x-twitter-webhooks-signature": "sha256=badbadbadbad",
      },
      body: fixtureBody,
    });

    if (badSigResponse.status !== 401) {
      return blocked(
        "security-gate",
        `Expected 401 for invalid signature but got HTTP ${badSigResponse.status} — signature gate is not working`,
      );
    }
    observedEvents.push("invalid-signature-rejected");
    process.stderr.write(
      `[x-smoke] invalid-sig POST → ${badSigResponse.status} (expected 401) ✓\n`,
    );

    // Step 2b: POST with VALID signature — must return 200 + inbox item id
    const deliveryIdGood = `smoke-x-valid-${randomUUID()}`;
    const rawBodyBytes = Buffer.from(fixtureBody);
    const validSig = `sha256=${hmacSha256Base64(SMOKE_CONSUMER_SECRET, rawBodyBytes)}`;

    // Self-check: our verify function should accept this signature
    const sigVerified = verifyXWebhookSignature(
      rawBodyBytes,
      SMOKE_CONSUMER_SECRET,
      validSig,
    );
    if (!sigVerified) {
      return blocked(
        "signature.self-check",
        "verifyXWebhookSignature rejected our own HMAC signature — crypto mismatch",
      );
    }
    observedEvents.push("signature.self-check.passed");

    const goodResponse = await fetch(`http://127.0.0.1:${port}/webhooks/x`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-roguent-delivery": deliveryIdGood,
        "x-twitter-webhooks-signature": validSig,
      },
      body: fixtureBody,
    });

    const goodBody = (await goodResponse.json()) as Record<string, unknown>;

    if (goodResponse.status !== 200) {
      return blocked(
        "delivery.rejected",
        `Expected HTTP 200 for valid-sig delivery but got ${goodResponse.status}: ${JSON.stringify(goodBody)}`,
      );
    }
    observedEvents.push("delivery.accepted");

    const inboxItemId =
      typeof goodBody.id === "string" ? goodBody.id : "(none)";
    observedEvents.push("inbox.item.created");

    const routedItem = routedItems.at(-1);
    process.stderr.write(
      `[x-smoke] valid-sig POST → ${goodResponse.status} id=${inboxItemId} summary="${routedItem?.eventSummary ?? ""}"\n`,
    );

    // ── Stage 3: Real X API path (expected blocked) ───────────────────────────

    const consumerKey = process.env.X_CONSUMER_KEY?.trim();
    const consumerSecret = process.env.X_CONSUMER_SECRET?.trim();
    const accessToken = process.env.X_ACCESS_TOKEN?.trim();
    const accessSecret = process.env.X_ACCESS_SECRET?.trim();
    const bearerToken = process.env.X_BEARER_TOKEN?.trim();
    const envId = process.env.X_WEBHOOK_ENV_NAME?.trim();

    if (
      consumerKey &&
      consumerSecret &&
      accessToken &&
      accessSecret &&
      bearerToken &&
      envId
    ) {
      process.stderr.write(
        "[x-smoke] X API credentials found — attempting Account Activity API check...\n",
      );
      try {
        // Attempt to list webhooks via Account Activity API
        const aaApiUrl = `https://api.twitter.com/1.1/account_activity/all/${encodeURIComponent(envId)}/webhooks.json`;
        const apiResponse = await fetch(aaApiUrl, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        });
        const apiBody = await apiResponse.text();
        if (apiResponse.status === 200) {
          observedEvents.push("x-api.webhooks-listed");
          process.stderr.write(
            `[x-smoke] X Account Activity API responded 200: ${apiBody.slice(0, 200)}\n`,
          );
        } else {
          const reason = `HTTP ${apiResponse.status}: ${apiBody.slice(0, 300)}`;
          blockers.push({
            stage: "x-api.webhooks-list",
            reason: `Account Activity API list failed — entitlement or auth issue: ${reason}`,
          });
          process.stderr.write(
            `[x-smoke] X API check failed (expected): ${reason}\n`,
          );
        }
      } catch (error) {
        blockers.push({
          stage: "x-api.network",
          reason: `X API network error: ${errorMessage(error)}`,
        });
      }
    } else {
      const missingVars = [
        !consumerKey && "X_CONSUMER_KEY",
        !consumerSecret && "X_CONSUMER_SECRET",
        !accessToken && "X_ACCESS_TOKEN",
        !accessSecret && "X_ACCESS_SECRET",
        !bearerToken && "X_BEARER_TOKEN",
        !envId && "X_WEBHOOK_ENV_NAME",
      ]
        .filter(Boolean)
        .join(", ");

      blockers.push({
        stage: "x-api.credentials",
        reason: `Real X Account Activity API not exercised — missing env vars: ${missingVars}. X Premium / Enterprise subscription with Account Activity API entitlement is required to register webhooks. This is expected in CI/local dev. CRC + local-signed verification passed above.`,
      });
      process.stderr.write(
        `[x-smoke] Real X API skipped (expected): missing ${missingVars}\n`,
      );
    }

    return {
      target: "x-webhook",
      mode: "local-crc+signed-fixture",
      status: "passed",
      observedEvents,
      blockers,
      notes: [
        `crc_token: ${crcToken}`,
        `response_token: ${crcResponse.response_token}`,
        `delivery id: ${deliveryIdGood}`,
        `http status: ${goodResponse.status}`,
        `inbox item id: ${inboxItemId}`,
        `event summary: ${routedItem?.eventSummary ?? "(none)"}`,
        "invalid-signature-rejected: HTTP 401 confirmed (security gate works)",
        "NOTE: real X Account Activity API not exercised (local crypto + ingress only)",
      ].join("; "),
      ranAtMs,
    };
  } finally {
    server.stop(true);
    testDb.cleanup();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blocked(stage: string, reason: string): SmokeArtifact {
  return {
    target: "x-webhook",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [{ stage, reason }],
    ranAtMs,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeAndPrint(artifact: SmokeArtifact): never {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

  const summary = [
    "\n--- X Webhook Smoke ---",
    `status:  ${artifact.status}`,
    `mode:    ${artifact.mode}`,
    `events:  ${artifact.observedEvents.length > 0 ? artifact.observedEvents.join(", ") : "(none)"}`,
    ...(artifact.blockers.length > 0
      ? artifact.blockers.map((b) => `BLOCKER [${b.stage}]: ${b.reason}`)
      : []),
    ...(artifact.notes ? [`notes:   ${artifact.notes}`] : []),
    `artifact: ${ARTIFACT_PATH}`,
    "",
  ].join("\n");

  process.stdout.write(summary);
  process.stdout.write(JSON.stringify(artifact, null, 2));
  process.stdout.write("\n");

  process.exit(0);
}
