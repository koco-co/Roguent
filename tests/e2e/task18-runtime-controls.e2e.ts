import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import type { ClientCommand } from "../../src/shared/commands";
import type { RoomEvent } from "../../src/shared/events";

const artifactPath = "tests/e2e/artifacts/task18/runtime-controls.png";

test("Task 18 runtime controls round-trip through live engine WebSocket", async ({
  page,
}) => {
  const engine = await startLiveEngine();
  const ws = await openWs(engine.url);
  const events: RoomEvent[] = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(String(data)) as RoomEvent | { kind?: string };
    if (!("kind" in parsed)) events.push(parsed);
  });

  try {
    await page.addInitScript((url) => {
      localStorage.setItem(
        "roguent:settings",
        JSON.stringify({
          accent: "#36c5e0",
          theme: "teal",
          motion: true,
          density: "comfy",
          cjkPixel: true,
          avatarHero: "knight_m",
        }),
      );
      (
        window as unknown as {
          __TAURI__: { core: { invoke: (cmd: string) => Promise<string> } };
        }
      ).__TAURI__ = {
        core: {
          invoke: async (cmd: string) => {
            if (cmd !== "engine_url") throw new Error(`unknown invoke ${cmd}`);
            return url;
          },
        },
      };
      // Patch WebSocket to track when the page's engine connection opens.
      // The app calls new WebSocket(engineUrl) inside connectRoom(); we intercept
      // onopen to expose a flag the test can poll from outside the page.
      const OrigWS = window.WebSocket;
      class PatchedWebSocket extends OrigWS {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args);
          this.addEventListener("open", () => {
            (window as unknown as { __engineWsOpen: boolean }).__engineWsOpen =
              true;
          });
        }
      }
      (window as unknown as { WebSocket: typeof WebSocket }).WebSocket =
        PatchedWebSocket as unknown as typeof WebSocket;
    }, engine.url);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Wait for the lobby (lobby-first UI) — confirms the app is mounted and
    // React has rendered the lobby view.  The lobby-view div is a zero-height
    // wrapper (its .hub child is position:absolute), so check attachment rather
    // than visibility.
    await page.waitForSelector('[data-testid="lobby-view"]', {
      state: "attached",
    });

    // Wait for the page's WebSocket to the live engine to open before sending
    // any commands, so the page doesn't miss the broadcast session.created.
    await page.waitForFunction(
      () =>
        (window as unknown as { __engineWsOpen?: boolean }).__engineWsOpen ===
        true,
      undefined,
      { timeout: 10_000 },
    );

    sendWs(ws, {
      cmd: "newSession",
      sessionId: "s-runtime",
      title: "Runtime Controls",
      model: "gpt-5",
      runtime: "codex",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    });
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s-runtime" && event.type === "session.created",
    );

    // Wait for the 内景 button to become enabled — the page must also have
    // received the session.created broadcast and updated its store (which sets
    // currentSessionId and lifts the disabled state on the button).
    await expect(page.getByRole("button", { name: "内景" })).toBeEnabled();
    await page.getByRole("button", { name: "内景" }).click();
    await page.getByRole("button", { name: /聊天/ }).click();
    await expect(page.getByLabel("reasoning effort")).toBeVisible();

    await page.getByRole("checkbox", { name: "network access" }).click();
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s-runtime" &&
        event.type === "runtime.config.updated" &&
        (event.payload as { config?: { networkAccess?: boolean } }).config
          ?.networkAccess === true,
    );

    await page.getByLabel("reasoning effort").selectOption("high");
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s-runtime" &&
        event.type === "runtime.config.updated" &&
        (event.payload as { config?: { reasoningEffort?: string } }).config
          ?.reasoningEffort === "high" &&
        (event.payload as { config?: { networkAccess?: boolean } }).config
          ?.networkAccess === true,
    );

    await expect(
      page.getByRole("checkbox", { name: "network access" }),
    ).toBeChecked();
    await page.screenshot({ path: artifactPath, fullPage: false });
  } finally {
    ws.close();
    engine.stop();
  }
});

function sendWs(ws: WebSocket, command: ClientCommand): void {
  ws.send(JSON.stringify(command));
}

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitForEvent(
  events: RoomEvent[],
  predicate: (event: RoomEvent) => boolean,
  timeoutMs = 5000,
): Promise<RoomEvent> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const event = events.find(predicate);
      if (event) {
        resolve(event);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("Timed out waiting for runtime event"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

function startLiveEngine(): Promise<{
  url: string;
  stop: () => void;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "src/engine/server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ROGUENT_PORT: "0",
        ANTHROPIC_BASE_URL: "http://127.0.0.1/skip-usage",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const failTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopChild(child);
      reject(new Error("Timed out waiting for live engine PORT"));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      const match = text.match(/PORT=(\d+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(failTimer);
      resolve({
        url: `ws://127.0.0.1:${match[1]}`,
        stop: () => stopChild(child),
      });
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      reject(
        new Error(
          `Live engine exited before PORT (code ${code ?? "unknown"}, signal ${
            signal ?? "none"
          })`,
        ),
      );
    });
  });
}

function stopChild(child: ChildProcessWithoutNullStreams): void {
  if (!child.killed) child.kill("SIGTERM");
}
