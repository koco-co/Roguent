/**
 * Task 58: Feishu/Lark Long-Connection Smoke Script
 *
 * Attempts a real Feishu/Lark bot long-connection or records a structured
 * configuration/permission blocker.  Exit code is ALWAYS 0 — pass/blocked/degraded
 * is captured in the artifact JSON.
 *
 * Artifact schema (same convention as Task 56 smoke-codex-app-server.ts):
 * {
 *   target: "feishu-long-connection",
 *   mode: "long-connection" | "none",
 *   status: "passed" | "degraded" | "blocked",
 *   observedEvents: string[],
 *   blockers: { stage: string; reason: string }[],
 *   version?: string,
 *   notes?: string,
 *   ranAtMs: number,
 * }
 *
 * Credential resolution order:
 *   1. env FEISHU_APP_ID / FEISHU_APP_SECRET   (direct env vars)
 *   2. KeychainSecretStore with refs "feishu/appId" / "feishu/appSecret"
 *      (production secret-store convention)
 *
 * Timeout configuration:
 *   FEISHU_SMOKE_TIMEOUT_MS  — default 10000 (short for smoke runs)
 *                              set to 30000+ if you have a real Feishu app configured
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FeishuConnector,
  FeishuConnectorError,
} from "../src/engine/integrations/feishu";
import type { ImConnectorEvent } from "../src/engine/integrations/wechat-types";
import { KeychainSecretStore } from "../src/engine/secrets/keychain";
import { MemorySecretStore } from "../src/engine/secrets/memory-store";
import type { SecretStore } from "../src/engine/secrets/types";

// ─── Schema ──────────────────────────────────────────────────────────────────

interface SmokeBlocker {
  stage: string;
  reason: string;
}

interface SmokeArtifact {
  target: "feishu-long-connection";
  mode: "long-connection" | "none";
  status: "passed" | "degraded" | "blocked";
  observedEvents: string[];
  blockers: SmokeBlocker[];
  version?: string;
  notes?: string;
  ranAtMs: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/feishu-smoke");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");

/**
 * Connection timeout — configurable via env.
 * Default is short (10s) so the smoke script never hangs in CI or dev.
 * Override with: FEISHU_SMOKE_TIMEOUT_MS=30000 bun run scripts/smoke-feishu-long-connection.ts
 */
const CONNECTION_TIMEOUT_MS = Number(
  process.env.FEISHU_SMOKE_TIMEOUT_MS ?? "10000",
);

/** Hard ceiling on the whole script — always exits. */
const SCRIPT_TIMEOUT_MS = CONNECTION_TIMEOUT_MS + 8_000;

/** Feishu secret-store key convention for production use. */
const FEISHU_APP_ID_REF = "feishu/appId";
const FEISHU_APP_SECRET_REF = "feishu/appSecret";

// ─── Main ─────────────────────────────────────────────────────────────────────

const ranAtMs = Date.now();

// Hard global timeout — writes whatever we have and exits 0.
const globalTimer = setTimeout(() => {
  writeAndPrint({
    target: "feishu-long-connection",
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

const artifact = await runSmoke();
clearTimeout(globalTimer);
writeAndPrint(artifact);

// ─── Smoke logic ─────────────────────────────────────────────────────────────

async function runSmoke(): Promise<SmokeArtifact> {
  // Step 1: resolve credentials
  const { appId, appSecret, credSource } = await resolveCredentials();

  if (!appId || !appSecret) {
    return {
      target: "feishu-long-connection",
      mode: "none",
      status: "blocked",
      observedEvents: [],
      blockers: [
        {
          stage: "config",
          reason: `Feishu appId/appSecret not configured. Set FEISHU_APP_ID + FEISHU_APP_SECRET env vars, or store in KeychainSecretStore under refs "${FEISHU_APP_ID_REF}" / "${FEISHU_APP_SECRET_REF}".`,
        },
      ],
      notes:
        "No credentials found in env or keychain. This is expected in CI / dev environments without a Feishu app.",
      ranAtMs,
    };
  }

  process.stderr.write(
    `[feishu-smoke] credentials found via ${credSource}; attempting long-connection...\n`,
  );

  // Step 2: construct connector with a MemorySecretStore pre-populated with the creds
  const memStore = new MemorySecretStore();
  await memStore.put(FEISHU_APP_ID_REF, appId);
  await memStore.put(FEISHU_APP_SECRET_REF, appSecret);

  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: FEISHU_APP_ID_REF,
      appSecretRef: FEISHU_APP_SECRET_REF,
    },
    secretStore: memStore,
    readyTimeoutMs: CONNECTION_TIMEOUT_MS,
  });

  const observedEvents: string[] = [];
  const unsubscribe = connector.onEvent((event: ImConnectorEvent) => {
    if (!observedEvents.includes(event.type)) {
      observedEvents.push(event.type);
    }
  });

  // Step 3: attempt start (long-connection handshake)
  try {
    await withTimeout(
      connector.start(),
      CONNECTION_TIMEOUT_MS,
      `Feishu long connection did not become ready within ${CONNECTION_TIMEOUT_MS}ms`,
    );
  } catch (error) {
    unsubscribe();
    await connector.stop().catch(() => {});

    const reason = errorMessage(error);
    const stage = classifyFeishuError(error, reason);

    return {
      target: "feishu-long-connection",
      mode: "long-connection",
      status: "blocked",
      observedEvents,
      blockers: [{ stage, reason }],
      notes: `Attempted long-connection with credentials from ${credSource}. Connection failed.`,
      ranAtMs,
    };
  }

  // Step 4: connection is live — wait briefly for an inbound event (best-effort)
  process.stderr.write(
    "[feishu-smoke] long-connection ready; waiting up to 5s for inbound event...\n",
  );
  observedEvents.push("connection.ready");

  const inboundResult = await waitForInboundOrTimeout(
    connector,
    observedEvents,
    5_000,
  );

  unsubscribe();
  await connector.stop().catch(() => {});

  const status = inboundResult === "timeout" ? "degraded" : "passed";
  const notes =
    inboundResult === "timeout"
      ? `Long-connection established but no inbound event received within 5s. Send a message to the bot to advance to "passed". Credentials from ${credSource}.`
      : `Long-connection established and inbound event received (${inboundResult}). Credentials from ${credSource}.`;

  return {
    target: "feishu-long-connection",
    mode: "long-connection",
    status,
    observedEvents,
    blockers: [],
    notes,
    ranAtMs,
  };
}

// ─── Credential resolution ────────────────────────────────────────────────────

interface CredentialResolution {
  appId: string | undefined;
  appSecret: string | undefined;
  credSource: string;
}

async function resolveCredentials(): Promise<CredentialResolution> {
  // 1. Try direct env vars first — fastest, no keychain prompts
  const envAppId = process.env.FEISHU_APP_ID;
  const envAppSecret = process.env.FEISHU_APP_SECRET;
  if (envAppId && envAppSecret) {
    return { appId: envAppId, appSecret: envAppSecret, credSource: "env" };
  }

  // 2. Try KeychainSecretStore (macOS only; gracefully skip on failure)
  try {
    const keychainStore = new KeychainSecretStore();
    const [keychainAppId, keychainAppSecret] = await Promise.all([
      keychainStore.get(FEISHU_APP_ID_REF),
      keychainStore.get(FEISHU_APP_SECRET_REF),
    ]);
    if (keychainAppId && keychainAppSecret) {
      return {
        appId: keychainAppId,
        appSecret: keychainAppSecret,
        credSource: "keychain",
      };
    }
  } catch {
    // Keychain unavailable (non-macOS, locked, etc.) — fall through
  }

  // 3. No credentials found
  return { appId: undefined, appSecret: undefined, credSource: "none" };
}

// ─── Inbound-event wait helper ────────────────────────────────────────────────

type InboundWaitOutcome = "timeout" | string; // string = event type on inbound

function waitForInboundOrTimeout(
  connector: FeishuConnector,
  observedEvents: string[],
  timeoutMs: number,
): Promise<InboundWaitOutcome> {
  return new Promise<InboundWaitOutcome>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve("timeout");
    }, timeoutMs);

    const unsubscribe = connector.onEvent((event: ImConnectorEvent) => {
      if (settled) return;
      if (!observedEvents.includes(event.type)) {
        observedEvents.push(event.type);
      }
      if (event.type === "message") {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve("message");
      }
    });
  });
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyFeishuError(error: unknown, reason: string): string {
  if (error instanceof FeishuConnectorError) {
    if (error.code === "configuration-required") return "config";
    return "feishu-sdk-error";
  }
  const lower = reason.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "long-connection.timeout";
  }
  if (
    lower.includes("auth") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid app")
  ) {
    return "long-connection.auth";
  }
  if (
    lower.includes("permission") ||
    lower.includes("entitlement") ||
    lower.includes("approval")
  ) {
    return "long-connection.permission";
  }
  if (lower.includes("network") || lower.includes("econnrefused")) {
    return "long-connection.network";
  }
  return "long-connection.start";
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function blocked(stage: string, reason: string): SmokeArtifact {
  return {
    target: "feishu-long-connection",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [{ stage, reason }],
    ranAtMs,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeAndPrint(artifact: SmokeArtifact): never {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

  const summary = [
    "\n--- Feishu Long-Connection Smoke ---",
    `status:  ${artifact.status}`,
    `mode:    ${artifact.mode}`,
    ...(artifact.version ? [`version: ${artifact.version}`] : []),
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
