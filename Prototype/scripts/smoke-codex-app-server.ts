/**
 * Task 56: Codex App-Server Smoke Script
 *
 * Verifies the local Codex app-server (or exec-json fallback) with a single
 * non-destructive prompt.  Exit code 0 always; status "passed" / "degraded" /
 * "blocked" is captured in the artifact JSON.
 *
 * Artifact schema (Tasks 57-60 follow this convention):
 * {
 *   target: string,
 *   mode: "app-server" | "exec-json" | "none",
 *   status: "passed" | "degraded" | "blocked",
 *   observedEvents: string[],
 *   blockers: { stage: string; reason: string }[],
 *   version?: string,
 *   notes?: string,
 *   ranAtMs: number,
 * }
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CodexAppServerClient } from "../src/engine/runtime/codex-app-server";
import {
  probeCodexCapabilities,
  resolveCodexCliPath,
} from "../src/engine/runtime/codex-capabilities";
import type { CodexRuntimeEvent } from "../src/engine/runtime/codex-protocol";

// ─── Schema ──────────────────────────────────────────────────────────────────

interface SmokeBlocker {
  stage: string;
  reason: string;
}

interface SmokeArtifact {
  target: "codex-app-server";
  mode: "app-server" | "exec-json" | "none";
  status: "passed" | "degraded" | "blocked";
  observedEvents: string[];
  blockers: SmokeBlocker[];
  version?: string;
  notes?: string;
  ranAtMs: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/codex-smoke");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");
const PROBE_TIMEOUT_MS = 3_000;
const INTERACTION_TIMEOUT_MS = 60_000;
const PROMPT = "List the files in the current directory.";

// ─── Main ─────────────────────────────────────────────────────────────────────

const ranAtMs = Date.now();
const artifact = await runSmoke();
writeAndPrint(artifact);

async function runSmoke(): Promise<SmokeArtifact> {
  // Step 1: probe capabilities
  let caps: Awaited<ReturnType<typeof probeCodexCapabilities>>;
  try {
    caps = await probeCodexCapabilities({ timeoutMs: PROBE_TIMEOUT_MS });
  } catch (error) {
    return blocked(
      "probe",
      `probeCodexCapabilities threw: ${errorMessage(error)}`,
    );
  }

  const version = caps.version;

  if (caps.appServer === "available") {
    // Step 2a: try app-server
    return await withTimeout(
      tryAppServer(version),
      INTERACTION_TIMEOUT_MS,
      "app-server interaction timed out",
    );
  }

  if (caps.execJson === "available") {
    // Step 2b: fallback to exec-json
    return await withTimeout(
      tryExecJson(version, caps.reason),
      INTERACTION_TIMEOUT_MS,
      "exec-json interaction timed out",
    );
  }

  // Neither available
  return {
    target: "codex-app-server",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [
      {
        stage: "probe",
        reason:
          caps.reason ?? "codex app-server and exec-json are both unavailable",
      },
    ],
    ...(version ? { version } : {}),
    ranAtMs,
  };
}

// ─── App-server path ─────────────────────────────────────────────────────────

async function tryAppServer(
  version: string | undefined,
): Promise<SmokeArtifact> {
  const observedEvents: string[] = [];
  let client: CodexAppServerClient | null = null;

  try {
    client = await CodexAppServerClient.start({
      cliPath: resolveCodexCliPath(process.env),
      clientInfo: { name: "roguent-smoke", version: "0" },
      startupTimeoutMs: 10_000,
      requestTimeoutMs: 10_000,
      onLog: (entry) => {
        process.stderr.write(`[codex ${entry.stream}] ${entry.text}\n`);
      },
    });
  } catch (error) {
    const reason = errorMessage(error);
    // Auth or unavailability blocker
    if (isAuthError(reason)) {
      return blocked("app-server.start", `auth: ${reason}`);
    }
    return blocked("app-server.start", reason);
  }

  // Subscribe to events to observe kinds
  const unsubscribe = client.onEvent((event: CodexRuntimeEvent) => {
    if (!observedEvents.includes(event.kind)) {
      observedEvents.push(event.kind);
    }
  });

  try {
    // Send a single non-destructive prompt
    const turnResult = await client.send(PROMPT, {
      thread: {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
        experimentalRawEvents: true,
      },
    });

    // Wait briefly to collect a few events (max 15s)
    await sleep(Math.min(15_000, INTERACTION_TIMEOUT_MS / 4));

    // Interrupt and close cleanly
    try {
      await client.interrupt();
    } catch {
      // ignore interrupt errors
    }

    unsubscribe();
    await client.close();

    // Include "turn.started" from the turn result as an observed event
    if (turnResult.turn?.id && !observedEvents.includes("turn.started")) {
      observedEvents.unshift("turn.started");
    }

    return {
      target: "codex-app-server",
      mode: "app-server",
      status: "passed",
      observedEvents,
      blockers: [],
      ...(version ? { version } : {}),
      notes: `Sent prompt: "${PROMPT.slice(0, 60)}"; interrupted after collecting events.`,
      ranAtMs,
    };
  } catch (error) {
    unsubscribe();
    try {
      await client.close();
    } catch {
      // ignore
    }
    const reason = errorMessage(error);
    if (isAuthError(reason)) {
      return blocked("app-server.send", `auth: ${reason}`);
    }
    return {
      target: "codex-app-server",
      mode: "app-server",
      status: "blocked",
      observedEvents,
      blockers: [{ stage: "app-server.send", reason }],
      ...(version ? { version } : {}),
      ranAtMs,
    };
  }
}

// ─── Exec-json fallback path ──────────────────────────────────────────────────

async function tryExecJson(
  version: string | undefined,
  probeReason: string | undefined,
): Promise<SmokeArtifact> {
  const { spawn } = await import("node:child_process");
  const cliPath = resolveCodexCliPath(process.env);
  const observedEvents: string[] = [];

  return new Promise<SmokeArtifact>((resolve) => {
    let settled = false;
    let stdoutBuffer = "";

    const child = spawn(
      cliPath,
      [
        "--model",
        "claude-opus-4-5",
        "--sandbox",
        "workspace",
        "--cd",
        process.cwd(),
        "exec",
        "--json",
        "-",
      ],
      {
        env: process.env as Record<string, string>,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const finish = (artifact: SmokeArtifact) => {
      if (settled) return;
      settled = true;
      resolve(artifact);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const kind =
            typeof parsed.type === "string"
              ? parsed.type
              : typeof parsed.kind === "string"
                ? parsed.kind
                : typeof parsed.event === "string"
                  ? parsed.event
                  : "codex.exec";
          if (!observedEvents.includes(kind)) observedEvents.push(kind);
        } catch {
          // not JSON — skip
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[codex exec stderr] ${String(chunk)}`);
    });

    child.once("error", (error: Error) => {
      finish(blocked("exec-json.spawn", errorMessage(error), version));
    });

    child.once("close", (code: number | null) => {
      const exitOk = code === 0;
      finish({
        target: "codex-app-server",
        mode: "exec-json",
        status: "degraded",
        observedEvents,
        blockers: exitOk
          ? []
          : [
              {
                stage: "exec-json.exit",
                reason: `exited with code ${code ?? "unknown"}`,
              },
            ],
        ...(version ? { version } : {}),
        notes: `app-server unavailable (${probeReason ?? "unknown reason"}); fell back to exec-json. Prompt: "${PROMPT.slice(0, 60)}"`,
        ranAtMs,
      });
    });

    // Write the prompt to stdin
    child.stdin?.end(PROMPT);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blocked(
  stage: string,
  reason: string,
  version?: string,
): SmokeArtifact {
  return {
    target: "codex-app-server",
    mode: "none",
    status: "blocked",
    observedEvents: [],
    blockers: [{ stage, reason }],
    ...(version ? { version } : {}),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("auth") ||
    lower.includes("login") ||
    lower.includes("unauthorized") ||
    lower.includes("credentials") ||
    lower.includes("not logged") ||
    lower.includes("unauthenticated")
  );
}

function writeAndPrint(artifact: SmokeArtifact): never {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

  const summary = [
    "\n--- Codex App-Server Smoke ---",
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
