/**
 * E2E helpers — Task 48.
 *
 * openReplay(page, fixture):
 *   Spawns a dedicated engine subprocess replaying the given fixture on an
 *   ephemeral port (no ROGUENT_PORT → kernel assigns), navigates the page to
 *   /?engine=ws://127.0.0.1:<port>, and returns a cleanup function that kills
 *   the subprocess.  Teardown is guaranteed even on test failure when the
 *   caller uses test.afterEach or a try/finally block.
 *
 * artifactDir(name):
 *   Returns an absolute path under tests/e2e/artifacts/<name>/ and ensures
 *   the directory exists.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

// ESM-safe __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

const ROOT = resolve(__dirname, "../..");
const ARTIFACTS_BASE = resolve(__dirname, "artifacts");

/** Resolve fixture path relative to project root if not absolute. */
function resolveFixture(fixture: string): string {
  if (fixture.startsWith("/")) return fixture;
  return join(ROOT, fixture);
}

/** Standard localStorage settings that suppress first-run gates. */
const DEFAULT_SETTINGS = JSON.stringify({
  accent: "#36c5e0",
  theme: "teal",
  motion: true,
  density: "comfy",
  cjkPixel: true,
  avatarHero: "knight_m",
});

export type ReplayHandle = {
  /** The ephemeral port the engine is listening on. */
  port: number;
  /** Kill the engine subprocess and clean up. Idempotent. */
  cleanup: () => void;
};

/**
 * Spawn a dedicated engine process replaying `fixture`, wait for it to be
 * ready, then navigate `page` to `/?engine=ws://127.0.0.1:<port>`.
 *
 * Returns a handle with `cleanup()` — call this in test teardown.
 */
export async function openReplay(
  page: Page,
  fixture: string,
): Promise<ReplayHandle> {
  const fixturePath = resolveFixture(fixture);

  // Spawn engine without ROGUENT_PORT so the kernel picks an ephemeral port.
  // The engine prints "PORT=<n>" on stdout once the WS server is listening.
  // Playwright test runner runs under Node.js (not Bun), so use node:child_process.
  const proc: ChildProcess = spawn(
    "bun",
    ["run", "src/engine/server.ts", "--replay", fixturePath],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        // Explicitly unset ROGUENT_PORT so we get an ephemeral port.
        ROGUENT_PORT: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  };

  // Read stdout line-by-line until we see "PORT=<n>"
  const port = await readEnginePort(proc, 15_000).catch((err) => {
    cleanup();
    throw err;
  });

  // Navigate with the engine override in the query string.
  // addInitScript runs before any page JS, so the query-param read in
  // resolveEngineUrl() will see it on the first navigation.
  await page.addInitScript((settings) => {
    localStorage.setItem("roguent:settings", settings);
  }, DEFAULT_SETTINGS);

  await page.goto(`/?engine=ws://127.0.0.1:${port}`);

  return { port, cleanup };
}

/**
 * Read lines from the engine's stdout (Node.js Readable) until we see
 * "PORT=<n>", then return n.  Rejects after `timeoutMs` if no PORT line
 * appears.
 */
async function readEnginePort(
  proc: ChildProcess,
  timeoutMs: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const stdout = proc.stdout;
    if (!stdout) {
      reject(new Error("Engine process has no stdout"));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for engine PORT= line"));
    }, timeoutMs);

    let buf = "";

    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      for (const line of buf.split("\n")) {
        const m = line.match(/^PORT=(\d+)/);
        if (m) {
          clearTimeout(timer);
          stdout.off("data", onData);
          stdout.off("end", onEnd);
          stdout.off("error", onError);
          resolve(Number(m[1]));
          return;
        }
      }
      // Keep only chars after last newline (incomplete line)
      const lastNl = buf.lastIndexOf("\n");
      if (lastNl >= 0) buf = buf.slice(lastNl + 1);
    };

    const onEnd = () => {
      clearTimeout(timer);
      reject(new Error("Engine stdout closed without emitting PORT="));
    };

    const onError = (err: Error) => {
      clearTimeout(timer);
      reject(err);
    };

    stdout.on("data", onData);
    stdout.on("end", onEnd);
    stdout.on("error", onError);
  });
}

/**
 * Return a path under tests/e2e/artifacts/<name>/ and ensure the dir exists.
 */
export async function artifactDir(name: string): Promise<string> {
  const dir = join(ARTIFACTS_BASE, name);
  await mkdir(dir, { recursive: true });
  return dir;
}
