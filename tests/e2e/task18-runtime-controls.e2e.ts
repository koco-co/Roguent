import { expect, test } from "@playwright/test";

const artifactPath = "tests/e2e/artifacts/task18/runtime-controls.png";

test("Task 18 runtime controls send config updates in browser flow", async ({
  page,
}) => {
  await page.addInitScript(() => {
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
        sent.push(JSON.parse(raw));
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
          sessionId: "s-runtime",
          type: "session.created",
          payload: {
            title: "Runtime Controls",
            model: "gpt-5",
            runtime: "codex",
            permissionMode: "default",
            approvalPolicy: "on-request",
            sandboxMode: "workspace-write",
            reasoningEffort: "medium",
            networkAccess: false,
            apiKeySource: "",
            slashCommands: [],
            cwd: "/tmp/roguent",
            project: "roguent",
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "内景" }).click();
  await page.getByRole("button", { name: /聊天/ }).click();

  await expect(page.getByLabel("reasoning effort")).toBeVisible();
  await page.getByRole("checkbox", { name: "network access" }).click();
  await page.getByLabel("reasoning effort").selectOption("high");

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __roguentWsSent: unknown[] }).__roguentWsSent,
      ),
    )
    .toContainEqual({
      cmd: "setRuntimeConfig",
      sessionId: "s-runtime",
      config: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "medium",
        networkAccess: true,
      },
    });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __roguentWsSent: unknown[] }).__roguentWsSent,
      ),
    )
    .toContainEqual({
      cmd: "setRuntimeConfig",
      sessionId: "s-runtime",
      config: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "high",
        networkAccess: false,
      },
    });

  await page.screenshot({ path: artifactPath, fullPage: false });
});
