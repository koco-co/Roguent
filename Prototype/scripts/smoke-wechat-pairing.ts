/**
 * Task 57: WeChat QR Pairing Smoke Script
 *
 * Attempts real WeChat QR pairing and records a structured artifact.
 * Exit code is ALWAYS 0 — pass/blocked/degraded is captured in the artifact.
 *
 * Artifact schema (same convention as Task 56 smoke-codex-app-server.ts):
 * {
 *   target: "wechat-pairing",
 *   mode: "bun-sdk" | "node-host" | "none",
 *   status: "passed" | "degraded" | "blocked",
 *   observedEvents: string[],
 *   blockers: { stage: string; reason: string }[],
 *   version?: string,
 *   notes?: string,
 *   ranAtMs: number,
 * }
 *
 * Timeout configuration:
 *   WECHAT_PAIRING_TIMEOUT_MS  — default 10000 (short for smoke runs)
 *                                 set to 120000 for a real scan attempt
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ImConnectorEvent } from "../src/engine/integrations/wechat-types";

// ─── Schema ──────────────────────────────────────────────────────────────────

interface SmokeBlocker {
  stage: string;
  reason: string;
}

interface SmokeArtifact {
  target: "wechat-pairing";
  mode: "bun-sdk" | "node-host" | "none";
  status: "passed" | "degraded" | "blocked";
  observedEvents: string[];
  blockers: SmokeBlocker[];
  version?: string;
  notes?: string;
  ranAtMs: number;
}

// ─── Minimal structural interface (avoids coupling to connector types) ────────

interface MinimalConnector {
  onEvent(handler: (event: ImConnectorEvent) => void): () => void;
  startPairing(sessionId: string): Promise<{ url?: string }>;
  stopPairing(sessionId: string): Promise<void>;
  sendMessage(
    target: { externalChatId: string },
    text: string,
  ): Promise<{ id: string; externalChatId: string }>;
  close?(): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/wechat-smoke");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");

/**
 * Pairing timeout — configurable via env.
 * Default is short (10s) so the smoke script never hangs in CI or dev.
 * Override with: WECHAT_PAIRING_TIMEOUT_MS=120000 bun run scripts/smoke-wechat-pairing.ts
 */
const PAIRING_TIMEOUT_MS = Number(
  process.env.WECHAT_PAIRING_TIMEOUT_MS ?? "10000",
);

/** Hard ceiling on the whole script — always exits. */
const SCRIPT_TIMEOUT_MS = PAIRING_TIMEOUT_MS + 8_000;

const SMOKE_SESSION_ID = "smoke-wechat-pairing";

// ─── Main ─────────────────────────────────────────────────────────────────────

const ranAtMs = Date.now();

// Hard global timeout — writes whatever we have and exits 0.
const globalTimer = setTimeout(() => {
  writeAndPrint({
    target: "wechat-pairing",
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
globalTimer.unref?.(); // don't block process exit if everything finishes cleanly

const artifact = await runSmoke();
clearTimeout(globalTimer);
writeAndPrint(artifact);

// ─── Smoke logic ─────────────────────────────────────────────────────────────

async function runSmoke(): Promise<SmokeArtifact> {
  // Step 1: probe SDK availability by attempting to import the connectors
  let wechatModule: typeof import("../src/engine/integrations/wechat");
  // biome-ignore format: tsc requires single-line typeof import()
  let nodeHostModule: typeof import("../src/engine/integrations/wechat-node-host");

  try {
    wechatModule = await import("../src/engine/integrations/wechat" as string);
  } catch (error) {
    return blocked(
      "sdk.import",
      `Failed to import WeChatConnector: ${errorMessage(error)}`,
    );
  }

  try {
    nodeHostModule = await import(
      "../src/engine/integrations/wechat-node-host" as string
    );
  } catch (error) {
    return blocked(
      "sdk.import-node-host",
      `Failed to import WeChatNodeHostConnector: ${errorMessage(error)}`,
    );
  }

  // Step 2: try Bun SDK path first
  const { WeChatConnector, WeChatConnectorError } = wechatModule;
  const { WeChatNodeHostConnector, parseNodeMajorVersion } = nodeHostModule;

  const connector: MinimalConnector = new WeChatConnector();
  const bunResult = await runPairingFlow("bun-sdk", connector, (error) => {
    if (
      error instanceof WeChatConnectorError &&
      error.code === "wechat_bun_incompatible"
    ) {
      return "bun-sdk.incompatible";
    }
    return null;
  });

  // If Bun is incompatible, fall back to Node host
  if (
    bunResult.status === "blocked" &&
    bunResult.blockers.some((b) => b.stage === "bun-sdk.incompatible")
  ) {
    process.stderr.write(
      "[wechat-smoke] Bun SDK incompatible, trying Node host fallback...\n",
    );

    // Check Node version before spawning
    let nodeMajor: number | null = null;
    try {
      const result = Bun.spawnSync(["node", "--version"]);
      const versionStr = result.stdout.toString() || result.stderr.toString();
      nodeMajor = parseNodeMajorVersion(versionStr);
    } catch {
      // ignore — will be caught below
    }

    if (nodeMajor === null || nodeMajor < 22) {
      return {
        target: "wechat-pairing",
        mode: "node-host",
        status: "blocked",
        observedEvents: [],
        blockers: [
          {
            stage: "node-host.version-check",
            reason:
              nodeMajor === null
                ? "Node.js not found; required for WeChat fallback host"
                : `Node.js >=22 required for WeChat fallback host, found v${nodeMajor}`,
          },
        ],
        ranAtMs,
      };
    }

    const nodeConnector: MinimalConnector = new WeChatNodeHostConnector();
    return runPairingFlow("node-host", nodeConnector, () => null);
  }

  return bunResult;
}

// ─── Core pairing flow (shared by bun-sdk and node-host) ─────────────────────

async function runPairingFlow(
  mode: "bun-sdk" | "node-host",
  connector: MinimalConnector,
  classifyStartPairingError: (error: unknown) => string | null,
): Promise<SmokeArtifact> {
  const observedEvents: string[] = [];
  const unsubscribe = connector.onEvent((event) => {
    if (!observedEvents.includes(event.type)) {
      observedEvents.push(event.type);
    }
  });

  // Attempt pairing to get a QR URL
  let qrState: { url?: string };
  try {
    qrState = await withTimeout(
      connector.startPairing(SMOKE_SESSION_ID),
      PAIRING_TIMEOUT_MS,
      `startPairing timed out after ${PAIRING_TIMEOUT_MS}ms — no QR was produced`,
    );
  } catch (error) {
    unsubscribe();
    await connector.stopPairing(SMOKE_SESSION_ID).catch(() => {});
    await connector.close?.().catch(() => {});
    const reason = errorMessage(error);
    const classifiedStage = classifyStartPairingError(error);
    if (classifiedStage !== null) {
      return {
        target: "wechat-pairing",
        mode,
        status: "blocked",
        observedEvents,
        blockers: [{ stage: classifiedStage, reason }],
        notes:
          classifiedStage === "bun-sdk.incompatible"
            ? "Bun runtime is incompatible with @wechatbot/wechatbot; will try Node host"
            : undefined,
        ranAtMs,
      };
    }
    if (reason.includes("timed out")) {
      return {
        target: "wechat-pairing",
        mode,
        status: "blocked",
        observedEvents,
        blockers: [{ stage: `${mode}.startPairing.timeout`, reason }],
        notes: `Pairing timeout ${PAIRING_TIMEOUT_MS}ms; no QR produced. Increase WECHAT_PAIRING_TIMEOUT_MS and provide a real phone to complete.`,
        ranAtMs,
      };
    }
    return {
      target: "wechat-pairing",
      mode,
      status: "blocked",
      observedEvents,
      blockers: [{ stage: `${mode}.startPairing`, reason }],
      ranAtMs,
    };
  }

  // QR was produced — print it to stdout for human inspection
  const qrUrl = qrState.url ?? "(no URL in QR state)";
  process.stdout.write(`\n[wechat-smoke] QR URL (${mode}): ${qrUrl}\n`);
  process.stdout.write(
    `[wechat-smoke] Waiting up to ${PAIRING_TIMEOUT_MS}ms for scan...\n`,
  );
  observedEvents.push("pairing.qr");

  // Wait for scan + confirm or timeout
  const scanResult = await waitForScanOrTimeout(connector, observedEvents);
  unsubscribe();

  if (scanResult === "timeout") {
    await connector.stopPairing(SMOKE_SESSION_ID).catch(() => {});
    await connector.close?.().catch(() => {});
    return {
      target: "wechat-pairing",
      mode,
      status: "blocked",
      observedEvents,
      blockers: [
        {
          stage: `${mode}.scan.timeout`,
          reason: `QR not scanned within ${PAIRING_TIMEOUT_MS}ms; no phone available in smoke environment`,
        },
      ],
      notes: `QR URL was produced (${qrUrl.slice(0, 80)}${qrUrl.length > 80 ? "..." : ""}). Increase WECHAT_PAIRING_TIMEOUT_MS and scan with a real phone to advance to "passed".`,
      ranAtMs,
    };
  }

  if (scanResult === "expired") {
    await connector.stopPairing(SMOKE_SESSION_ID).catch(() => {});
    await connector.close?.().catch(() => {});
    return {
      target: "wechat-pairing",
      mode,
      status: "blocked",
      observedEvents,
      blockers: [
        {
          stage: `${mode}.scan.expired`,
          reason: "QR expired before it was scanned",
        },
      ],
      ranAtMs,
    };
  }

  // scanResult = externalChatId — pairing confirmed, send a test message
  observedEvents.push("pairing.scanned");
  observedEvents.push("pairing.confirmed");
  let sendResult: { id: string; externalChatId: string };
  try {
    sendResult = await connector.sendMessage(
      { externalChatId: scanResult },
      "[roguent-smoke] WeChat pairing smoke test - please ignore",
    );
  } catch (error) {
    await connector.stopPairing(SMOKE_SESSION_ID).catch(() => {});
    await connector.close?.().catch(() => {});
    return {
      target: "wechat-pairing",
      mode,
      status: "blocked",
      observedEvents,
      blockers: [{ stage: `${mode}.sendMessage`, reason: errorMessage(error) }],
      ranAtMs,
    };
  }
  observedEvents.push("outbound.ack");

  await connector.stopPairing(SMOKE_SESSION_ID).catch(() => {});
  await connector.close?.().catch(() => {});

  return {
    target: "wechat-pairing",
    mode,
    status: "passed",
    observedEvents,
    blockers: [],
    notes: `Outbound test message delivered (id=${sendResult.id}) to externalChatId=${sendResult.externalChatId}`,
    ranAtMs,
  };
}

// ─── Scan/timeout helper ──────────────────────────────────────────────────────

type ScanOutcome = "timeout" | "expired" | string; // string = externalChatId on confirm

function waitForScanOrTimeout(
  connector: MinimalConnector,
  observedEvents: string[],
): Promise<ScanOutcome> {
  return new Promise<ScanOutcome>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve("timeout");
    }, PAIRING_TIMEOUT_MS);

    const unsubscribe = connector.onEvent((event) => {
      if (settled) return;
      if (!observedEvents.includes(event.type)) {
        observedEvents.push(event.type);
      }
      if (event.type === "pairing.scanned") {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(event.externalChatId);
      } else if (event.type === "pairing.expired") {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve("expired");
      }
    });
  });
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function blocked(stage: string, reason: string): SmokeArtifact {
  return {
    target: "wechat-pairing",
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
    "\n--- WeChat Pairing Smoke ---",
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
