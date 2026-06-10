import { spawn } from "node:child_process";

export interface CodexCapabilities {
  cliPath?: string;
  version?: string;
  appServer: "available" | "unavailable";
  execJson: "available" | "unavailable";
  reason?: string;
}

export interface CodexProbeCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  error?: string;
}

export interface CodexProbeCommandOptions {
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}

export type CodexProbeRunner = (
  argv: string[],
  options: CodexProbeCommandOptions,
) => Promise<CodexProbeCommandResult>;

export interface CodexAppServerProbeResult {
  available: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
  timedOut?: boolean;
}

export type CodexAppServerProbe = (
  argv: string[],
  options: CodexProbeCommandOptions,
) => Promise<CodexAppServerProbeResult>;

export interface ProbeCodexCapabilitiesOptions {
  env?: Record<string, string | undefined>;
  run?: CodexProbeRunner;
  probeAppServer?: CodexAppServerProbe;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;
const APP_SERVER_ARGS = ["app-server", "--listen", "stdio://"];

export function resolveCodexCliPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.ROGUENT_CODEX_PATH?.trim();
  return override || "codex";
}

export async function probeCodexCapabilities(
  options: ProbeCodexCapabilitiesOptions = {},
): Promise<CodexCapabilities> {
  const env = options.env ?? process.env;
  const cliPath = resolveCodexCliPath(env);
  const run = options.run ?? runCodexProbeCommand;
  const probeAppServer = options.probeAppServer ?? probeCodexAppServer;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reasons: string[] = [];

  const versionProbe = await safeRun(run, [cliPath, "--version"], {
    timeoutMs,
    env,
  });
  if (!probeSucceeded(versionProbe)) {
    return {
      cliPath,
      appServer: "unavailable",
      execJson: "unavailable",
      reason: `version probe failed: ${summarizeProbe(versionProbe)}`,
    };
  }

  const version = parseCodexVersion(versionProbe.stdout || versionProbe.stderr);
  if (!version) reasons.push("version probe returned no version");

  const execProbe = await safeRun(run, [cliPath, "exec", "--help"], {
    timeoutMs,
    env,
  });
  const execJson =
    probeSucceeded(execProbe) && supportsExecJson(execProbe)
      ? "available"
      : "unavailable";
  if (execJson === "unavailable") {
    reasons.push(`exec --json unavailable: ${summarizeProbe(execProbe)}`);
  }

  const appProbe = await safeProbeAppServer(
    probeAppServer,
    [cliPath, ...APP_SERVER_ARGS],
    {
      timeoutMs,
      env,
    },
  );
  const appServer = appProbe.available ? "available" : "unavailable";
  if (appServer === "unavailable") {
    reasons.push(
      `app-server unavailable: ${summarizeAppServerProbe(appProbe)}`,
    );
  }

  return {
    cliPath,
    ...(version ? { version } : {}),
    appServer,
    execJson,
    ...(reasons.length > 0 ? { reason: reasons.join("; ") } : {}),
  };
}

export function probeCodexAppServer(
  argv: string[],
  options: CodexProbeCommandOptions,
): Promise<CodexAppServerProbeResult> {
  const [command, ...args] = argv;
  if (!command) {
    return Promise.resolve({
      available: false,
      stdout: "",
      stderr: "",
      reason: "empty command",
    });
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let resolved = false;
    let timedOut = false;
    let finalResult: Partial<CodexAppServerProbeResult> | undefined;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command, args, {
      env: mergeEnv(process.env, options.env),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const resolveFinal = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve({
        available: finalResult?.available ?? hasInitializeResponse(stdout),
        stdout,
        stderr,
        ...(timedOut || finalResult?.timedOut ? { timedOut: true } : {}),
        ...(finalResult?.reason ? { reason: finalResult.reason } : {}),
      });
    };

    const beginShutdown = (result: Partial<CodexAppServerProbeResult>) => {
      if (finalResult) return;
      finalResult = result;
      clearTimeout(timeoutTimer);
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 250);
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      beginShutdown({
        available: hasInitializeResponse(stdout),
        timedOut: true,
        reason: hasInitializeResponse(stdout) ? undefined : "timed out",
      });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (hasInitializeResponse(stdout)) {
        beginShutdown({ available: true });
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      finalResult = { available: false, reason: String(error) };
      resolveFinal();
    });
    child.once("close", (code) => {
      if (!finalResult) {
        finalResult = {
          available: hasInitializeResponse(stdout),
          reason: hasInitializeResponse(stdout)
            ? undefined
            : `exit code ${code ?? "unknown"}`,
        };
      }
      resolveFinal();
    });
    child.stdin?.on("error", () => {});

    child.stdin?.write(`${JSON.stringify(initializeRequest())}\n`);
  });
}

export function runCodexProbeCommand(
  argv: string[],
  options: CodexProbeCommandOptions,
): Promise<CodexProbeCommandResult> {
  const [command, ...args] = argv;
  if (!command) {
    return Promise.resolve({
      code: null,
      stdout: "",
      stderr: "",
      error: "empty command",
    });
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command, args, {
      env: mergeEnv(process.env, options.env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result: Partial<CodexProbeCommandResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve({
        code: result.code ?? null,
        stdout,
        stderr,
        ...(timedOut || result.timedOut ? { timedOut: true } : {}),
        ...(result.error ? { error: result.error } : {}),
      });
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ code: null, timedOut: true });
      }, 250);
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      finish({ code: null, error: String(error) });
    });
    child.once("close", (code) => {
      finish({ code, timedOut });
    });
  });
}

function safeRun(
  run: CodexProbeRunner,
  argv: string[],
  options: CodexProbeCommandOptions,
): Promise<CodexProbeCommandResult> {
  return run(argv, options).catch((error) => ({
    code: null,
    stdout: "",
    stderr: "",
    error: String(error),
  }));
}

function safeProbeAppServer(
  probe: CodexAppServerProbe,
  argv: string[],
  options: CodexProbeCommandOptions,
): Promise<CodexAppServerProbeResult> {
  return probe(argv, options).catch((error) => ({
    available: false,
    stdout: "",
    stderr: "",
    reason: String(error),
  }));
}

function probeSucceeded(result: CodexProbeCommandResult): boolean {
  return result.code === 0 && !result.error;
}

function parseCodexVersion(output: string): string | undefined {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine;
}

function supportsExecJson(result: CodexProbeCommandResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return /(?:^|\s)--json(?:\s|$)/.test(output);
}

function hasInitializeResponse(output: string): boolean {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.id !== 1) continue;
      const result =
        parsed.result && typeof parsed.result === "object"
          ? (parsed.result as Record<string, unknown>)
          : undefined;
      if (result && typeof result.userAgent === "string") return true;
    } catch {
      // Ignore logs and partial lines.
    }
  }
  return false;
}

function initializeRequest(): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      clientInfo: { name: "roguent-capability-probe", version: "0" },
    },
  };
}

function summarizeAppServerProbe(result: CodexAppServerProbeResult): string {
  if (result.reason) return result.reason;
  if (result.timedOut) return "timed out";
  const output = `${result.stderr || result.stdout}`.trim();
  if (output) return output.slice(0, 200);
  return "no initialize response";
}

function summarizeProbe(result: CodexProbeCommandResult): string {
  if (result.error) return result.error;
  if (result.timedOut) return "timed out";
  const output = `${result.stderr || result.stdout}`.trim();
  if (output) return output.slice(0, 200);
  return `exit code ${result.code ?? "unknown"}`;
}

function mergeEnv(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...base, ...override })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
