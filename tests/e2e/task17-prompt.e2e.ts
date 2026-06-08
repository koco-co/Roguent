import { expect, test } from "@playwright/test";

const artifactPath = "tests/e2e/artifacts/task17/prompt-card-resolved.png";

test("Task 17 prompt card sends response and resolves in browser flow", async ({
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
        const command = JSON.parse(raw) as Record<string, unknown>;
        sent.push(command);
        if (command.cmd === "respondPermission") {
          this.emit({
            seq: 3,
            ts: 3,
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
          sessionId: "s-prompt",
          type: "session.created",
          payload: {
            title: "Prompt Replay",
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
        this.emit({
          seq: 2,
          ts: 2,
          sessionId: "s-prompt",
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
  await expect(page.getByText("Command approval requested")).toBeVisible();

  await page.getByRole("button", { name: "允许" }).click();

  await expect(page.getByText("✓ 已回答")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __roguentWsSent: unknown[] }).__roguentWsSent,
      ),
    )
    .toContainEqual({
      cmd: "respondPermission",
      sessionId: "s-prompt",
      promptId: "approval-1",
      behavior: "allow",
    });

  await page.screenshot({ path: artifactPath, fullPage: false });
});
