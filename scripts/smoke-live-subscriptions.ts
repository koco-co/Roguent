/**
 * Live subscription smoke:
 * - starts local ingress + live integration router
 * - opens a temporary localhost.run tunnel
 * - applies GitHub/X subscription settings through the production applier
 * - pushes a temporary GitHub branch and waits for the real webhook delivery
 *
 * The script always writes an artifact. A non-passed artifact is evidence that
 * a prerequisite or external delivery failed, not a substitute for a test pass.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DriverCallbacks, IDriver } from "../src/engine/driver";
import { startIngressServer } from "../src/engine/ingress/server";
import { startLiveIntegrations } from "../src/engine/integrations/live";
import type { IntegrationRouterEvent } from "../src/engine/integrations/types";
import { createTestDatabase } from "../src/engine/persistence/db";
import { migrate } from "../src/engine/persistence/migrations";
import type { RuntimeDriverCreator } from "../src/engine/runtime/manager";
import { MemorySecretStore } from "../src/engine/secrets/memory-store";
import { SessionManager } from "../src/engine/session";
import type { RoomEvent } from "../src/shared/events";
import type { IntegrationConnectorStatus } from "../src/shared/integrations";

type SmokeStatus = "passed" | "partial" | "blocked" | "failed";

interface SmokeArtifact {
  artifactPath: string;
  blockers: Array<{ reason: string; stage: string }>;
  cleanup: {
    hookDeleted?: boolean;
    remoteBranchDeleted?: boolean;
    tunnelStopped?: boolean;
  };
  github: {
    branch?: string;
    hookId?: number;
    receivedDeliveryId?: string;
    receivedSummary?: string;
    repo: string;
    status: SmokeStatus;
    webhookUrl?: string;
  };
  observedEvents: string[];
  ranAtMs: number;
  status: SmokeStatus;
  target: "live-subscriptions";
  x: {
    account: string;
    reason?: string;
    state?: string;
    status: SmokeStatus;
  };
}

const ARTIFACT_DIR = resolve("tests/e2e/artifacts/live-subscriptions");
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, "result.json");
const GITHUB_OWNER = process.env.GITHUB_OWNER?.trim() || "koco-co";
const GITHUB_REPO = process.env.GITHUB_REPO?.trim() || "Roguent";
const GITHUB_REPO_FULL = `${GITHUB_OWNER}/${GITHUB_REPO}`;
const X_HANDLE = process.env.X_HANDLE?.trim() || "@SugerQvQ";
const GITHUB_SECRET_REF = "smoke/live-subscriptions/github-webhook-secret";
const X_SECRET_REF = "smoke/live-subscriptions/x-webhook-secret";
const WEBHOOK_SECRET = `smoke-secret-${Date.now()}`;
const SCRIPT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 90_000);
const PROVIDED_INGRESS_PORT = numericEnv("SMOKE_INGRESS_PORT");

const artifact: SmokeArtifact = {
  artifactPath: ARTIFACT_PATH,
  blockers: [],
  cleanup: {},
  github: {
    repo: GITHUB_REPO_FULL,
    status: "blocked",
  },
  observedEvents: [],
  ranAtMs: Date.now(),
  status: "blocked",
  target: "live-subscriptions",
  x: {
    account: X_HANDLE,
    status: "blocked",
  },
};

const globalTimer = setTimeout(() => {
  artifact.blockers.push({
    reason: `script exceeded ${SCRIPT_TIMEOUT_MS}ms`,
    stage: "script.timeout",
  });
  writeArtifactAndExit(artifact, 1);
}, SCRIPT_TIMEOUT_MS);
globalTimer.unref?.();

try {
  await runSmoke();
  clearTimeout(globalTimer);
  writeArtifactAndExit(
    artifact,
    artifact.status === "passed" || artifact.status === "partial" ? 0 : 1,
  );
} catch (error) {
  clearTimeout(globalTimer);
  artifact.status = "failed";
  artifact.blockers.push({
    reason: errorMessage(error),
    stage: "script.uncaught",
  });
  writeArtifactAndExit(artifact, 1);
}

async function runSmoke(): Promise<void> {
  const token = firstNonEmpty(
    process.env.ROGUENT_GITHUB_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
  );
  if (!token) {
    artifact.blockers.push({
      reason:
        "ROGUENT_GITHUB_TOKEN, GITHUB_TOKEN, or GH_TOKEN is required for live GitHub registration",
      stage: "env.github-token",
    });
    return;
  }

  const testDb = createTestDatabase();
  let tunnel: TunnelRuntime | null = null;
  let hookId: number | undefined;
  let branch: string | undefined;
  try {
    migrate(testDb.db);
    artifact.observedEvents.push("db.migrated");

    const secretStore = new MemorySecretStore();
    await secretStore.put(GITHUB_SECRET_REF, WEBHOOK_SECRET);
    await secretStore.put(X_SECRET_REF, WEBHOOK_SECRET);

    const runtime = new NoopRuntime();
    const sessions = new SessionManager(runtime, process.cwd(), {
      auditDb: testDb.db,
    });
    const published: RoomEvent[] = [];
    sessions.subscribe((event) => {
      published.push(event);
      if (event.type === "integration.event.received") {
        const payload = event.payload as { channel?: unknown };
        artifact.observedEvents.push(`integration.event.${payload.channel}`);
      }
    });

    const env: Record<string, string | undefined> = {
      ROGUENT_GITHUB_TOKEN: token,
    };
    const live = startLiveIntegrations({
      db: testDb.db,
      env,
      imConnectors: {},
      secretStore,
      sessions,
    });
    const ingress = startIngressServer({
      db: testDb.db,
      env: {
        ROGUENT_GITHUB_WEBHOOK_SECRET_REF: GITHUB_SECRET_REF,
        ROGUENT_X_WEBHOOK_SECRET_REF: X_SECRET_REF,
      },
      port: PROVIDED_INGRESS_PORT ?? 0,
      router: live.router,
      secretStore,
    });
    if (!ingress) throw new Error("ingress did not start");
    artifact.observedEvents.push(`ingress.started:${ingress.port}`);

    const providedWebhookBaseUrl =
      process.env.ROGUENT_PUBLIC_WEBHOOK_BASE_URL?.trim();
    if (providedWebhookBaseUrl) {
      env.ROGUENT_PUBLIC_WEBHOOK_BASE_URL = providedWebhookBaseUrl;
      artifact.observedEvents.push(`tunnel.provided:${providedWebhookBaseUrl}`);
    } else {
      tunnel = await startTunnel(ingress.port);
      env.ROGUENT_PUBLIC_WEBHOOK_BASE_URL = tunnel.url;
      artifact.observedEvents.push(`tunnel.started:${tunnel.url}`);
    }

    const subscriptionStatusOffset = published.length;
    await live.applySubscriptionSettings({
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: GITHUB_REPO_FULL,
            webhookSecret: { secretRef: GITHUB_SECRET_REF },
          },
        },
        x: {
          enabled: true,
          metadata: {
            handle: X_HANDLE,
            webhookSecret: { secretRef: X_SECRET_REF },
          },
        },
      },
    });
    artifact.observedEvents.push("settings.applied");

    const githubStatus = await waitForConnectorStatus(
      published,
      "github",
      "connected",
      20_000,
      subscriptionStatusOffset,
    );
    hookId = numberMetadata(githubStatus, "hookId");
    if (!hookId) throw new Error("GitHub connected status missing hookId");
    artifact.github.hookId = hookId;
    artifact.github.webhookUrl = stringMetadata(githubStatus, "webhookUrl");
    artifact.observedEvents.push(`github.connected:${hookId}`);

    const xStatus = await waitForConnectorStatus(
      published,
      "x",
      undefined,
      5_000,
      subscriptionStatusOffset,
    );
    artifact.x.state = xStatus.state;
    artifact.x.reason = stringMetadata(xStatus, "reason");
    artifact.x.status = xStatus.state === "connected" ? "passed" : "blocked";

    branch = `codex/subscription-smoke-${Date.now()}`;
    artifact.github.branch = branch;
    await gitPushRef(token, `HEAD:refs/heads/${branch}`);
    artifact.observedEvents.push(`github.branch-pushed:${branch}`);

    const githubEvent = await waitForGitHubEvent(published, branch, 60_000);
    artifact.github.receivedDeliveryId = githubEvent.deliveryId;
    artifact.github.receivedSummary = githubEvent.summary;
    artifact.github.status = "passed";
    artifact.observedEvents.push("github.webhook-received");

    artifact.status =
      artifact.github.status === "passed" && artifact.x.status === "blocked"
        ? "partial"
        : "failed";

    if (artifact.x.status === "blocked") {
      artifact.blockers.push({
        reason: artifact.x.reason ?? "X live registration did not connect",
        stage: "x.registration",
      });
    }

    live.stop();
    ingress.stop();
  } finally {
    if (branch) {
      artifact.cleanup.remoteBranchDeleted = await deleteRemoteBranch(
        token,
        branch,
      );
    }
    if (hookId) {
      artifact.cleanup.hookDeleted = await deleteGitHubHook(token, hookId);
    }
    if (tunnel) {
      tunnel.stop();
      artifact.cleanup.tunnelStopped = true;
    }
    testDb.cleanup();
  }
}

interface TunnelRuntime {
  stop(): void;
  url: string;
}

async function startTunnel(port: number): Promise<TunnelRuntime> {
  const proc = Bun.spawn(
    [
      "ssh",
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ServerAliveInterval=15",
      "-R",
      `80:127.0.0.1:${port}`,
      "nokey@localhost.run",
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const url = await waitForTunnelUrl(proc, 20_000);
  return {
    stop() {
      proc.kill("SIGTERM");
    },
    url,
  };
}

async function waitForTunnelUrl(
  proc: ReturnType<typeof Bun.spawn>,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const decoder = new TextDecoder();
  let buffer = "";
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  for (const stream of [proc.stdout, proc.stderr]) {
    if (!stream || typeof stream === "number") continue;
    readers.push((stream as unknown as ReadableStream<Uint8Array>).getReader());
  }

  while (Date.now() < deadline) {
    const reads = readers.map((reader) => reader.read());
    const result = await Promise.race([
      Promise.race(reads),
      sleep(250).then(() => null),
    ]);
    if (result?.value) {
      buffer += decoder.decode(result.value, { stream: true });
      const match = buffer.match(/https:\/\/[a-z0-9.-]+/i);
      if (match?.[0]) return match[0].replace(/[),.;]+$/, "");
    }
    const exitCode = await Promise.race([
      proc.exited,
      sleep(0).then(() => null),
    ]);
    if (exitCode !== null) {
      throw new Error(`localhost.run tunnel exited before URL: ${buffer}`);
    }
  }
  proc.kill("SIGTERM");
  throw new Error(`timed out waiting for localhost.run URL: ${buffer}`);
}

async function waitForConnectorStatus(
  events: RoomEvent[],
  channel: string,
  state: string | undefined,
  timeoutMs: number,
  fromIndex = 0,
): Promise<IntegrationConnectorStatus> {
  const event = await waitFor(
    () =>
      events.slice(fromIndex).find((entry) => {
        if (entry.type !== "integration.status") return false;
        const status = (
          entry.payload as { status?: IntegrationConnectorStatus }
        ).status;
        return (
          status?.channel === channel && (!state || status.state === state)
        );
      }),
    timeoutMs,
    `connector status ${channel}:${state ?? "*"}`,
  );
  return (event.payload as { status: IntegrationConnectorStatus }).status;
}

async function waitForGitHubEvent(
  events: RoomEvent[],
  branch: string,
  timeoutMs: number,
): Promise<{
  deliveryId?: string;
  summary?: string;
}> {
  const branchName = branch.split("/").at(-1) ?? branch;
  const event = await waitFor(
    () =>
      events.find((entry) => {
        if (entry.type !== "integration.event.received") return false;
        const payload = entry.payload as {
          channel?: unknown;
          metadata?: Record<string, unknown>;
          summary?: unknown;
        };
        return (
          payload.channel === "github" &&
          payload.metadata?.repository === GITHUB_REPO_FULL &&
          typeof payload.summary === "string" &&
          payload.summary.includes(branchName)
        );
      }),
    timeoutMs,
    `github webhook event for ${branch}`,
  );
  const payload = event.payload as { deliveryId?: string; summary?: string };
  return {
    deliveryId: payload.deliveryId,
    summary: payload.summary,
  };
}

async function waitFor<T>(
  fn: () => T | undefined,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value !== undefined) return value;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function gitPushRef(token: string, refspec: string): Promise<void> {
  const remoteUrl = `https://x-access-token:${encodeURIComponent(
    token,
  )}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
  await runCommand(["git", "push", remoteUrl, refspec], token);
}

async function deleteRemoteBranch(
  token: string,
  branch: string,
): Promise<boolean> {
  try {
    await gitPushRef(token, `:refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

async function deleteGitHubHook(
  token: string,
  hookId: number,
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks/${hookId}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "DELETE",
      },
    );
    return response.status === 204 || response.status === 404;
  } catch {
    return false;
  }
}

async function runCommand(args: string[], token?: string): Promise<string> {
  const proc = Bun.spawn(args, {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    const command = args
      .map((arg) =>
        token && arg.includes(token)
          ? `https://x-access-token:<redacted>@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`
          : arg,
      )
      .join(" ");
    throw new Error(
      `${command} exited ${exitCode}: ${(stderr || stdout).trim()}`,
    );
  }
  return stdout;
}

function writeArtifactAndExit(result: SmokeArtifact, exitCode: number): never {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function numericEnv(key: string): number | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 65535
    ? value
    : undefined;
}

function numberMetadata(
  status: IntegrationConnectorStatus,
  key: string,
): number | undefined {
  const value = status.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function stringMetadata(
  status: IntegrationConnectorStatus,
  key: string,
): string | undefined {
  const value = status.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class NoopRuntime implements RuntimeDriverCreator {
  createDriver(_callbacks: DriverCallbacks): IDriver {
    return {
      askPermission: async () => ({ behavior: "allow" }),
      end() {},
      getContextUsage: async () => null,
      interrupt: async () => {},
      respondPermission: async () => {},
      send: () => {},
      setModel: async () => {},
      setPermissionMode: async () => {},
      start() {},
    };
  }
}
