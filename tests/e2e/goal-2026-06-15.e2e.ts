import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import type { ClientCommand } from "../../src/shared/commands";
import type { PluginsMessage, RoomEvent } from "../../src/shared/events";
import { artifactDir, openReplay } from "./helpers";

const EMPTY_SETTINGS = null;
const SEEDED_SETTINGS = JSON.stringify({
  accent: "#36c5e0",
  theme: "teal",
  motion: true,
  density: "comfy",
  cjkPixel: true,
  avatarHero: "orc_warrior",
});

test("Goal 2026-06-15 replay: fresh login, slash menu, and system routes", async ({
  page,
}) => {
  const handle = await openReplay(page, "fixtures/runtime/claude-chat.jsonl", {
    settings: EMPTY_SETTINGS,
  });

  try {
    const dir = await artifactDir("goal-2026-06-15");
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.locator(".login-gate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await page.screenshot({
      path: `${dir}/01-login-gate.png`,
      fullPage: false,
    });

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("CHOOSE HERO")).toBeVisible();
    await expect(page.locator(".charsel-cell")).toHaveCount(9);
    await page.screenshot({
      path: `${dir}/02-hero-select.png`,
      fullPage: false,
    });

    await page.getByRole("button", { name: "Orc" }).click();
    await expect(page.locator(".login-gate")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "内景" })).toBeEnabled({
      timeout: 8_000,
    });
    await page.screenshot({
      path: `${dir}/03-lobby-after-hero.png`,
      fullPage: false,
    });

    await page.getByRole("button", { name: "内景" }).click();
    await expect(page.locator(".session-banner")).toContainText(
      "Claude Chat Demo",
    );
    await page.getByRole("button", { name: /聊天/ }).click();
    const drawer = page.locator(".cdrawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Bash")).toBeVisible({ timeout: 8_000 });

    const composer = drawer.locator("textarea.pxinput");
    await expect(composer).toBeEnabled();
    await composer.fill("/");
    const slashMenu = drawer.locator(".slash-menu");
    await expect(slashMenu).toBeVisible();
    await expect(
      slashMenu.getByRole("button", { name: "/debug" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${dir}/04-chat-slash-menu.png`,
      fullPage: false,
    });

    await slashMenu.getByRole("button", { name: "/debug" }).click();
    await expect(composer).toHaveValue("/debug ");

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();

    await page.getByRole("button", { name: "菜单" }).click();
    const systemMenu = page.locator(".sysmenu");
    await expect(systemMenu).toBeVisible();
    await expect(systemMenu.locator(".sys-btn")).toHaveCount(9);
    await page.screenshot({
      path: `${dir}/05-system-menu.png`,
      fullPage: false,
    });

    await systemMenu.getByRole("button", { name: "关于 Roguent" }).click();
    await expect(page.getByText("ABOUT", { exact: true })).toBeVisible();
    await expect(page.getByText("v0.1 · dev")).toBeVisible();
    await page.screenshot({
      path: `${dir}/06-menu-about-route.png`,
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "菜单" }).click();
    await page
      .locator(".sysmenu")
      .getByRole("button", { name: "外观 / 主题" })
      .click();
    await expect(page.getByText("CONFIG", { exact: true })).toBeVisible();
    await expect(page.locator(".runtime-settings-title")).toContainText(
      "Claude Runtime",
    );
    await page.screenshot({
      path: `${dir}/07-menu-appearance-route.png`,
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "菜单" }).click();
    await page
      .locator(".sysmenu")
      .getByRole("button", { name: "导入会话" })
      .click();
    await expect(page.getByText("IMPORT", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${dir}/08-menu-import-route.png`,
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "菜单" }).click();
    await page
      .locator(".sysmenu")
      .getByRole("button", { name: "保存 / 导出会话" })
      .click();
    await expect(page.locator(".sysmenu")).not.toBeVisible();

    await page.getByRole("button", { name: "菜单" }).click();
    await page
      .locator(".sysmenu")
      .getByRole("button", { name: "退出" })
      .click();
    await expect(page.locator(".sysmenu")).not.toBeVisible();
  } finally {
    handle.cleanup();
  }
});

test("Goal 2026-06-15 replay: session grid filters and card entry reach the selected interior", async ({
  page,
}) => {
  const handle = await openReplay(page, "fixtures/e2e-full.jsonl", {
    settings: EMPTY_SETTINGS,
  });

  try {
    const dir = await artifactDir("goal-2026-06-15");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Orc" }).click();
    await expect(page.locator(".login-gate")).not.toBeVisible();

    await page.getByRole("button", { name: "任务台 QUEST CONSOLE" }).click();
    const grid = page.locator(".modal-pop", { hasText: "SESSIONS" });
    await expect(grid.locator(".title")).toHaveText("SESSIONS");
    await expect(grid).toContainText("2 / 2");
    const roguentCard = grid
      .locator(".sg-card")
      .filter({ hasText: "roguent · 主线开发" });
    const alphaCard = grid
      .locator(".sg-card")
      .filter({ hasText: "alpha · 实验" });
    await expect(roguentCard).toBeVisible();
    await expect(alphaCard).toBeVisible();
    await page.screenshot({
      path: `${dir}/22-session-grid-overview.png`,
      fullPage: false,
    });

    await grid.locator(".fchip", { hasText: "Sonnet" }).click();
    await expect(grid).toContainText("1 / 2");
    await expect(alphaCard).toBeVisible();
    await expect(roguentCard).not.toBeVisible();
    await page.screenshot({
      path: `${dir}/23-session-grid-sonnet-filter.png`,
      fullPage: false,
    });

    await alphaCard.click();
    await expect(grid).not.toBeVisible();
    const banner = page.locator(".session-banner");
    await expect(banner).toContainText("alpha · 实验", { timeout: 8_000 });
    await expect(banner).toContainText("Sonnet");
    await page.screenshot({
      path: `${dir}/24-session-grid-card-enter-alpha.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});

test("Goal 2026-06-15 live engine: model picker updates the visible session model", async ({
  page,
}) => {
  const engine = await startLiveEngine();
  const ws = await openWs(engine.url);
  const events: RoomEvent[] = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(String(data)) as RoomEvent | { kind: string };
    if (!("kind" in parsed)) events.push(parsed);
  });

  try {
    const dir = await artifactDir("goal-2026-06-15");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((settings) => {
      localStorage.setItem("roguent:settings", settings);
      const OrigWS = window.WebSocket;
      class PatchedWebSocket extends OrigWS {
        constructor(...args: ConstructorParameters<typeof OrigWS>) {
          super(...args);
          this.addEventListener("open", () => {
            (window as unknown as { __engineWsOpen: boolean }).__engineWsOpen =
              true;
          });
        }
      }
      (window as unknown as { WebSocket: typeof OrigWS }).WebSocket =
        PatchedWebSocket as unknown as typeof OrigWS;
    }, SEEDED_SETTINGS);

    await page.goto(`/?engine=${engine.url}`);
    await page.waitForSelector('[data-testid="lobby-view"]', {
      state: "attached",
    });
    await page.waitForFunction(
      () =>
        (window as unknown as { __engineWsOpen?: boolean }).__engineWsOpen ===
        true,
      undefined,
      { timeout: 10_000 },
    );

    sendWs(ws, {
      cmd: "newSession",
      sessionId: "s-goal-model",
      title: "Goal Model Switch",
      model: "claude-opus-4-8",
      runtime: "claude",
      permissionMode: "default",
      sandboxMode: "workspace-write",
      networkAccess: false,
    });
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s-goal-model" && event.type === "session.created",
    );

    await expect(page.getByRole("button", { name: "内景" })).toBeEnabled();
    await page.getByRole("button", { name: "内景" }).click();
    const banner = page.locator(".session-banner");
    await expect(banner).toContainText("Opus");

    await page.getByRole("button", { name: "模型" }).click();
    await expect(page.getByText("MODEL", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${dir}/09-model-picker-before.png`,
      fullPage: false,
    });

    await page.getByRole("button", { name: /Sonnet 4.6/ }).click();
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s-goal-model" &&
        event.type === "session.created" &&
        (event.payload as { model?: string }).model === "claude-sonnet-4-6",
    );
    await expect(banner).toContainText("Sonnet");
    await page.screenshot({
      path: `${dir}/10-model-picker-after-sonnet.png`,
      fullPage: false,
    });
  } finally {
    ws.close();
    engine.stop();
  }
});

test("Goal 2026-06-15 live engine: market catalog and project doors render real engine data", async ({
  page,
}) => {
  const claudeConfigDir = copyPluginFixtureConfig();
  const engine = await startLiveEngine({
    env: { CLAUDE_CONFIG_DIR: claudeConfigDir },
  });
  const ws = await openWs(engine.url);
  const events: RoomEvent[] = [];
  const pluginFrames: PluginsMessage[] = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(String(data)) as
      | RoomEvent
      | PluginsMessage
      | { kind: string };
    if ("kind" in parsed) {
      if (parsed.kind === "plugins")
        pluginFrames.push(parsed as PluginsMessage);
      return;
    }
    events.push(parsed);
  });

  try {
    const dir = await artifactDir("goal-2026-06-15");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.removeItem("roguent:settings");
      const OrigWS = window.WebSocket;
      class PatchedWebSocket extends OrigWS {
        constructor(...args: ConstructorParameters<typeof OrigWS>) {
          super(...args);
          this.addEventListener("open", () => {
            (window as unknown as { __engineWsOpen: boolean }).__engineWsOpen =
              true;
          });
        }
      }
      (window as unknown as { WebSocket: typeof OrigWS }).WebSocket =
        PatchedWebSocket as unknown as typeof OrigWS;
    });

    await page.goto(`/?engine=${engine.url}`);
    await page.waitForSelector('[data-testid="lobby-view"]', {
      state: "attached",
    });
    await page.waitForFunction(
      () =>
        (window as unknown as { __engineWsOpen?: boolean }).__engineWsOpen ===
        true,
      undefined,
      { timeout: 10_000 },
    );
    await waitForPluginFrame(pluginFrames, (frame) =>
      frame.plugins.some((plugin) => plugin.id === "alpha-mcp@official"),
    );

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Orc" }).click();
    await expect(page.locator(".login-gate")).not.toBeVisible();

    await page.getByRole("button", { name: "插件市场 MARKET" }).click();
    const market = page.locator(".modal-pop", { hasText: "MARKET" });
    await expect(market.locator(".title")).toHaveText("MARKET");
    await expect(
      market.locator(".plugin-name", { hasText: "Alpha MCP" }),
    ).toBeVisible();
    await expect(
      market.locator(".plugin-name", { hasText: "beta-skill" }),
    ).toBeVisible();
    await expect(
      market.locator(".plugin-name", { hasText: "gamma-cmd" }),
    ).toBeVisible();
    await expect(
      market.locator(".plugin-name", { hasText: "tide" }),
    ).toBeVisible();
    await expect(market.getByText("1.0k 次安装")).toBeVisible();
    await expect(market.getByText("已启用")).toBeVisible();
    await page.screenshot({
      path: `${dir}/18-market-live-catalog.png`,
      fullPage: false,
    });

    await market.locator(".shop-cat", { hasText: "已安装" }).click();
    await expect(
      market.locator(".plugin-name", { hasText: "Alpha MCP" }),
    ).toBeVisible();
    await expect(
      market.locator(".plugin-name", { hasText: "beta-skill" }),
    ).toBeVisible();
    await expect(
      market.locator(".plugin-name", { hasText: "gamma-cmd" }),
    ).not.toBeVisible();
    await page.screenshot({
      path: `${dir}/19-market-live-installed-filter.png`,
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await expect(market).not.toBeVisible();

    await page.getByRole("button", { name: "Claude 项目" }).click();
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s1" &&
        event.type === "session.created" &&
        (event.payload as { title?: string; runtime?: string }).title ===
          "Claude 会话 1" &&
        (event.payload as { title?: string; runtime?: string }).runtime ===
          "claude",
    );
    await expect(page.getByRole("button", { name: "内景" })).toBeEnabled();
    await page.getByRole("button", { name: "内景" }).click();
    await expect(page.locator(".session-banner")).toContainText(
      "Claude 会话 1",
    );
    await expect(page.locator(".session-banner")).toContainText("Claude");
    await page.screenshot({
      path: `${dir}/20-project-door-claude-session.png`,
      fullPage: false,
    });

    await page.getByRole("button", { name: "大厅", exact: true }).click();
    await page.getByRole("button", { name: "Codex 项目" }).click();
    await waitForEvent(
      events,
      (event) =>
        event.sessionId === "s2" &&
        event.type === "session.created" &&
        (event.payload as { title?: string; runtime?: string }).title ===
          "Codex 会话 2" &&
        (event.payload as { title?: string; runtime?: string }).runtime ===
          "codex",
    );
    await page.getByRole("button", { name: "内景" }).click();
    await expect(page.locator(".session-banner")).toContainText("Codex 会话 2");
    await expect(page.locator(".session-banner")).toContainText("Codex");
    await expect(page.locator(".session-banner")).toContainText("gpt-5");
    await page.screenshot({
      path: `${dir}/21-project-door-codex-session.png`,
      fullPage: false,
    });
  } finally {
    ws.close();
    engine.stop();
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("Goal 2026-06-15 fake WS: stop, prompt cards, and account menu routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.removeItem("roguent:settings");
    const sent: unknown[] = [];
    (window as unknown as { __roguentWsSent: unknown[] }).__roguentWsSent =
      sent;

    class FakeWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;

      constructor(readonly url: string) {
        super();
        setTimeout(() => this.open(), 0);
      }

      send(raw: string): void {
        const command = JSON.parse(raw) as Record<string, unknown>;
        sent.push(command);
        if (command.cmd === "interrupt") {
          this.emit({
            seq: 5,
            ts: 5,
            sessionId: command.sessionId,
            type: "runtime.status",
            payload: {
              runtime: "claude",
              status: "stopped",
              config: {
                runtime: "claude",
                model: "claude-opus-4-8",
                permissionMode: "default",
                sandboxMode: "workspace-write",
                networkAccess: false,
              },
              cwd: "/tmp/roguent",
              message: "Interrupted",
            },
          });
        }
        if (command.cmd === "respondPermission") {
          this.emit({
            seq: 6,
            ts: 6,
            sessionId: command.sessionId,
            type: "prompt.resolved",
            payload: { promptId: command.promptId, result: "answered" },
          });
        }
        if (command.cmd === "respondQuestion") {
          this.emit({
            seq: 7,
            ts: 7,
            sessionId: command.sessionId,
            type: "prompt.resolved",
            payload: { promptId: command.promptId, result: "answered" },
          });
        }
      }

      close(): void {
        this.readyState = this.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }

      private open(): void {
        this.readyState = this.OPEN;
        this.onopen?.(new Event("open"));
        this.emit({
          seq: 1,
          ts: 1,
          sessionId: "s-prompts",
          type: "session.created",
          payload: {
            title: "Prompt Controls",
            model: "claude-opus-4-8",
            runtime: "claude",
            permissionMode: "default",
            sandboxMode: "workspace-write",
            networkAccess: false,
            apiKeySource: "oauth",
            slashCommands: [],
            cwd: "/tmp/roguent",
            project: "roguent",
          },
        });
        this.emit({
          seq: 2,
          ts: 2,
          sessionId: "s-prompts",
          type: "runtime.status",
          payload: {
            runtime: "claude",
            status: "running",
            config: {
              runtime: "claude",
              model: "claude-opus-4-8",
              permissionMode: "default",
              sandboxMode: "workspace-write",
              networkAccess: false,
            },
            cwd: "/tmp/roguent",
            message: "Running",
          },
        });
        this.emit({
          seq: 3,
          ts: 3,
          sessionId: "s-prompts",
          type: "prompt.requested",
          payload: {
            promptId: "approval-1",
            promptKind: "permission",
            data: {
              toolName: "Bash",
              inputSummary: "git status",
              title: "Command approval requested",
              displayName: "git status",
              description: "item/commandExecution/requestApproval",
            },
          },
        });
        this.emit({
          seq: 4,
          ts: 4,
          sessionId: "s-prompts",
          type: "prompt.requested",
          payload: {
            promptId: "question-1",
            promptKind: "question",
            data: {
              questions: [
                {
                  question: "Continue with the fix?",
                  header: "Decision",
                  multiSelect: false,
                  options: [
                    {
                      label: "Continue",
                      description: "Proceed with the current fix.",
                    },
                    { label: "Pause", description: "Stop here." },
                  ],
                },
              ],
            },
          },
        });
      }

      private emit(event: unknown): void {
        this.onmessage?.(
          new MessageEvent("message", { data: JSON.stringify(event) }),
        );
      }
    }

    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;
  });

  const dir = await artifactDir("goal-2026-06-15");
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Orc" }).click();
  await expect(page.getByRole("button", { name: "内景" })).toBeEnabled({
    timeout: 8_000,
  });
  await page.getByRole("button", { name: "内景" }).click();
  await expect(page.locator(".session-banner")).toContainText(
    "Prompt Controls",
  );

  await page.getByRole("button", { name: /聊天/ }).click();
  const drawer = page.locator(".cdrawer");
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  await expect(page.getByText("Command approval requested")).toBeVisible();
  await expect(page.getByText("Continue with the fix?")).toBeVisible();
  await page.screenshot({
    path: `${dir}/11-chat-stop-permission-question.png`,
    fullPage: false,
  });

  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByRole("button", { name: "发送" })).toBeVisible({
    timeout: 8_000,
  });
  const composer = drawer.locator("textarea.pxinput");
  await expect(composer).toBeEnabled();
  await composer.fill("stop 后继续输入");
  await expect(composer).toHaveValue("stop 后继续输入");
  await page.screenshot({
    path: `${dir}/12-chat-stop-editable.png`,
    fullPage: false,
  });

  await page.getByRole("button", { name: "允许" }).click();
  await expect(page.getByText("✓ 已回答")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("✓ 已回答")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __roguentWsSent: unknown[] }).__roguentWsSent,
      ),
    )
    .toEqual(
      expect.arrayContaining([
        { cmd: "interrupt", sessionId: "s-prompts" },
        {
          cmd: "respondPermission",
          sessionId: "s-prompts",
          promptId: "approval-1",
          behavior: "allow",
        },
        {
          cmd: "respondQuestion",
          sessionId: "s-prompts",
          promptId: "question-1",
          selectedLabels: ["Continue"],
        },
      ]),
    );
  await page.screenshot({
    path: `${dir}/13-chat-prompts-resolved.png`,
    fullPage: false,
  });

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "菜单" }).click();
  await page
    .locator(".sysmenu")
    .getByRole("button", { name: "账号 · 订阅" })
    .click();
  await expect(page.getByText("PROFILE", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${dir}/14-menu-account-route.png`,
    fullPage: false,
  });

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "菜单" }).click();
  await page
    .locator(".sysmenu")
    .getByRole("button", { name: "runtime 管理" })
    .click();
  await expect(page.getByText("PROFILE", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${dir}/15-menu-runtime-route.png`,
    fullPage: false,
  });
});

test("Goal 2026-06-15 replay: atlas failure overlay can retry", async ({
  page,
}) => {
  let blockAtlas = true;
  await page.route("**/assets/0x72/dungeon.json", async (route) => {
    if (blockAtlas) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const handle = await openReplay(page, "fixtures/runtime/claude-chat.jsonl", {
    settings: EMPTY_SETTINGS,
  });

  try {
    const dir = await artifactDir("goal-2026-06-15");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Orc" }).click();
    await expect(page.getByRole("button", { name: "内景" })).toBeEnabled({
      timeout: 8_000,
    });
    await page.getByRole("button", { name: "内景" }).click();

    await expect(page.getByText("atlas load failed")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
    await page.screenshot({
      path: `${dir}/16-atlas-error-overlay.png`,
      fullPage: false,
    });

    blockAtlas = false;
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByText("atlas load failed")).not.toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({
      path: `${dir}/17-atlas-retry-recovered.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
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
  timeoutMs = 5_000,
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

function waitForPluginFrame(
  frames: PluginsMessage[],
  predicate: (frame: PluginsMessage) => boolean,
  timeoutMs = 5_000,
): Promise<PluginsMessage> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const frame = frames.find(predicate);
      if (frame) {
        resolve(frame);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("Timed out waiting for plugins frame"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

function copyPluginFixtureConfig(): string {
  const configDir = mkdtempSync(join(tmpdir(), "roguent-e2e-claude-cfg-"));
  cpSync(resolve("tests/fixtures/plugins/cfg"), configDir, { recursive: true });
  return configDir;
}

function startLiveEngine(
  options: {
    env?: Record<string, string>;
  } = {},
): Promise<{
  url: string;
  stop: () => void;
}> {
  const dbDir = mkdtempSync(join(tmpdir(), "roguent-e2e-db-"));
  const dbPath = join(dbDir, "roguent.sqlite");
  let cleaned = false;
  const cleanupDb = () => {
    if (cleaned) return;
    cleaned = true;
    rmSync(dbDir, { recursive: true, force: true });
  };

  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "src/engine/server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ROGUENT_PORT: "0",
        ROGUENT_DB_PATH: dbPath,
        ANTHROPIC_BASE_URL: "http://127.0.0.1/skip-usage",
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stop = () => {
      stopChild(child);
      cleanupDb();
    };
    let settled = false;
    const failTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
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
        stop,
      });
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      cleanupDb();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      cleanupDb();
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

function stopChild(child: ChildProcess): void {
  if (!child.killed) child.kill("SIGTERM");
}
