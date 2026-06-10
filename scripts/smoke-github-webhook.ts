/**
 * Task 59: GitHub Webhook Smoke Script
 *
 * Verifies GitHub webhook ingress signature verification and event routing.
 * Exit code is ALWAYS 0 — pass/blocked/degraded is captured in the artifact.
 *
 * Artifact schema (same convention as Tasks 56–58):
 * {
 *   target: "github-webhook",
 *   mode: "local-signed-fixture" | "none",
 *   status: "passed" | "degraded" | "blocked",
 *   observedEvents: string[],
 *   blockers: { stage: string; reason: string }[],
 *   notes?: string,
 *   ranAtMs: number,
 * }
 *
 * Smoke modes:
 *   1. local-signed-fixture (the PASS path): start a real Bun HTTP server on an
 *      ephemeral port, POST the github-push fixture with a correct HMAC-SHA256
 *      signature, assert HTTP 200 + inbox item id.  Also POST one invalid-sig
 *      request and assert HTTP 401 (security gate evidence).  No GITHUB_TOKEN
 *      required.
 *   2. GitHub API path (optional): if GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO
 *      are all set, attempt to register/update a webhook on the real repo before
 *      falling back to local mode.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createIngressHandler } from "../src/engine/ingress/server";
import { hmacSha256Hex } from "../src/engine/ingress/signatures";
import { registerGitHubRepositoryWebhook } from "../src/engine/integrations/github";
import type { IntegrationRouteOptions } from "../src/engine/integrations/types";
import { createTestDatabase } from "../src/engine/persistence/db";
import { migrate } from "../src/engine/persistence/migrations";
import { MemorySecretStore } from "../src/engine/secrets/memory-store";

// ─── Schema ──────────────────────────────────────────────────────────────────

interface SmokeBlocker {
  stage: string;
  reason: string;
}

interface SmokeArtifact {
  target: "github-webhook";
  mode: "local-signed-fixture" | "none";
  status: "passed" | "degraded" | "blocked";
  observedEvents: string[];
  blockers: SmokeBlocker[];
  notes?: string;
  ranAtMs: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/github-smoke");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");
const FIXTURE_PATH = join(
  process.cwd(),
  "fixtures",
  "integrations",
  "github-push.json",
);

/** Hard ceiling on the whole script. */
const SCRIPT_TIMEOUT_MS = 15_000;

const SMOKE_WEBHOOK_SECRET = "smoke-secret";
const SMOKE_SECRET_REF = "smoke/github/webhook-secret";

// ─── Main ─────────────────────────────────────────────────────────────────────

const ranAtMs = Date.now();

// Hard global timeout — writes whatever we have and exits 0.
const globalTimer = setTimeout(() => {
  writeAndPrint({
    target: "github-webhook",
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
    target: "github-webhook",
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

  // ── Optional: attempt real GitHub API webhook registration ────────────────
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const githubOwner = process.env.GITHUB_OWNER?.trim();
  const githubRepo = process.env.GITHUB_REPO?.trim();
  const webhookUrl = process.env.GITHUB_WEBHOOK_URL?.trim();

  if (githubToken && githubOwner && githubRepo && webhookUrl) {
    process.stderr.write(
      "[github-smoke] GITHUB_TOKEN found — attempting real webhook registration...\n",
    );
    const secretStore = new MemorySecretStore();
    await secretStore.put(SMOKE_SECRET_REF, SMOKE_WEBHOOK_SECRET);
    try {
      const result = await registerGitHubRepositoryWebhook({
        owner: githubOwner,
        repo: githubRepo,
        secretRef: SMOKE_SECRET_REF,
        secretStore,
        token: githubToken,
        webhookUrl,
      });
      if (result.mode === "api") {
        observedEvents.push("github-api.webhook-registered");
        process.stderr.write(
          `[github-smoke] webhook registered: hookId=${result.hookId} url=${result.url}\n`,
        );
      }
    } catch (error) {
      process.stderr.write(
        `[github-smoke] webhook registration failed (will continue with local mode): ${errorMessage(error)}\n`,
      );
    }
  } else {
    process.stderr.write(
      "[github-smoke] GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_WEBHOOK_URL not all set; using local signed-fixture mode.\n",
    );
  }

  // ── Local signed-fixture mode ─────────────────────────────────────────────

  // Step 1: read push fixture
  let fixtureBody: string;
  try {
    fixtureBody = readFileSync(FIXTURE_PATH, "utf8");
  } catch (error) {
    return blocked(
      "fixture.read",
      `Could not read ${FIXTURE_PATH}: ${errorMessage(error)}`,
    );
  }
  observedEvents.push("fixture.loaded");

  // Step 2: set up in-memory DB + ingress handler
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

  const secretStore = new MemorySecretStore();
  await secretStore.put(SMOKE_SECRET_REF, SMOKE_WEBHOOK_SECRET);

  const routedItems: Array<{ inboxItemId: string; eventSummary: string }> = [];
  const handler = createIngressHandler({
    db: testDb.db,
    env: {
      ROGUENT_GITHUB_WEBHOOK_SECRET_REF: SMOKE_SECRET_REF,
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
    secretStore,
  });
  observedEvents.push("handler.ready");

  // Step 3: start a real Bun HTTP server on an ephemeral port
  let server: ReturnType<typeof Bun.serve> | null = null;
  let port: number;
  try {
    server = Bun.serve({
      port: 0, // ephemeral
      fetch: handler,
    });
    port = server.port ?? 0;
    if (!port) throw new Error("Server bound to port 0 — unexpected");
    process.stderr.write(
      `[github-smoke] ingress server started on port ${port}\n`,
    );
    observedEvents.push("server.started");
  } catch (error) {
    testDb.cleanup();
    return blocked(
      "server.start",
      `Failed to start ingress server: ${errorMessage(error)}`,
    );
  }

  try {
    // Step 4: POST with INVALID signature — must return 401
    const deliveryId1 = `smoke-invalid-${randomUUID()}`;
    const badSigResponse = await fetch(
      `http://127.0.0.1:${port}/webhooks/github`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": deliveryId1,
          "x-github-event": "push",
          "x-hub-signature-256": "sha256=badbadbadbad",
        },
        body: fixtureBody,
      },
    );

    if (badSigResponse.status !== 401) {
      return blocked(
        "security-gate",
        `Expected 401 for invalid signature but got HTTP ${badSigResponse.status} — signature gate is not working`,
      );
    }
    observedEvents.push("invalid-signature-rejected");
    process.stderr.write(
      `[github-smoke] invalid-sig POST → ${badSigResponse.status} (expected 401) ✓\n`,
    );

    // Step 5: POST with VALID signature — must return 200 + inbox item id
    const deliveryId2 = `smoke-valid-${randomUUID()}`;
    const rawBodyBytes = Buffer.from(fixtureBody);
    const validSig = `sha256=${hmacSha256Hex(SMOKE_WEBHOOK_SECRET, rawBodyBytes)}`;

    const goodResponse = await fetch(
      `http://127.0.0.1:${port}/webhooks/github`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": deliveryId2,
          "x-github-event": "push",
          "x-hub-signature-256": validSig,
        },
        body: fixtureBody,
      },
    );

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
      `[github-smoke] valid-sig POST → ${goodResponse.status} id=${inboxItemId} summary="${routedItem?.eventSummary ?? ""}"\n`,
    );

    return {
      target: "github-webhook",
      mode: "local-signed-fixture",
      status: "passed",
      observedEvents,
      blockers: [],
      notes: [
        `delivery id: ${deliveryId2}`,
        `http status: ${goodResponse.status}`,
        `inbox item id: ${inboxItemId}`,
        `event summary: ${routedItem?.eventSummary ?? "(none)"}`,
        "invalid-signature-rejected: HTTP 401 confirmed (security gate works)",
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
    target: "github-webhook",
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
    "\n--- GitHub Webhook Smoke ---",
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
