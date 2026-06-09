import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { Settings } from "./Settings";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(raw: string): void {
    this.sent.push(raw);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.instances = [];
  cleanup();
  useRoomStore.setState({
    connectorStatus: {},
    connection: "connecting",
    currentSessionId: null,
    projectOrder: [],
    sessions: {},
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

test("settings panel shows relay connector status from the room store", () => {
  useUiStore.setState({ activePanel: "settings" });
  useRoomStore.setState({
    connectorStatus: {
      relay: {
        id: "relay",
        channel: "relay",
        state: "blocked",
        error: "relay entitlement missing",
      },
    },
  });

  render(<Settings />);

  expect(screen.getByText("Relay")).toBeTruthy();
  expect(screen.getByText("blocked")).toBeTruthy();
  expect(screen.getByText("relay entitlement missing")).toBeTruthy();
});

test("settings save sends real Codex runtime and MCP profile command", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useUiStore.setState({ activePanel: "settings" });

  render(<Settings />);

  await userEvent.click(screen.getByRole("button", { name: /Codex/ }));
  await userEvent.selectOptions(screen.getByLabelText(/模型 model/), "gpt-5");
  await userEvent.click(screen.getByRole("button", { name: /IM \/ 订阅/ }));
  await userEvent.click(screen.getByRole("button", { name: "GitHub 订阅" }));
  await userEvent.type(screen.getByLabelText("GitHub repo"), "poco/roguent");
  await userEvent.type(
    screen.getByLabelText("GitHub webhookSecret"),
    "github-secret-value",
  );
  await userEvent.click(screen.getByRole("button", { name: "X 订阅" }));
  await userEvent.type(screen.getByLabelText("X bearerToken"), "x-token-value");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toMatchObject({
    cmd: "settings",
    action: "update",
    scope: "user",
    settings: {
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        reasoningEffort: "medium",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        networkAccess: false,
      },
      metadata: {
        codex: {
          provider: "openai",
          mcpServers: ["github-mcp"],
          mcpProfile: "default",
        },
      },
      integrations: {
        wechat: {
          enabled: true,
          metadata: { pairingMode: "single-active-session" },
        },
        github: {
          enabled: true,
          metadata: {
            repo: "poco/roguent",
            webhookSecret: "github-secret-value",
          },
        },
        x: {
          enabled: true,
          metadata: {
            bearerToken: "x-token-value",
          },
        },
      },
    },
    changedKeys: expect.arrayContaining([
      "cx_model",
      "github_enabled",
      "github_repo",
      "github_webhook_secret",
      "x_enabled",
      "x_bearer_token",
    ]),
    metadata: { source: "settings-panel", runtime: "codex" },
  });
});

test("settings panel hydrates saved Codex settings and preserves secret refs", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useUiStore.setState({ activePanel: "settings" });
  useRoomStore.setState({
    settings: {
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: true,
      },
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "poco/roguent",
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
      metadata: {
        codex: {
          provider: "custom",
          mcpServers: ["github-mcp", "linear-mcp"],
          mcpProfile: "mobile-dev",
        },
      },
    },
  });

  render(<Settings />);

  await userEvent.click(screen.getByRole("button", { name: /Codex/ }));
  expect((screen.getByLabelText(/模型 model/) as HTMLSelectElement).value).toBe(
    "gpt-5",
  );
  expect(screen.getByText("mobile-dev")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toMatchObject({
    cmd: "settings",
    action: "update",
    settings: {
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: true,
      },
      metadata: {
        codex: {
          provider: "custom",
          mcpServers: ["github-mcp", "linear-mcp"],
          mcpProfile: "mobile-dev",
        },
      },
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "poco/roguent",
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
    },
    changedKeys: [],
  });
});
