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
  localStorage.clear();
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
  await userEvent.type(
    screen.getByLabelText("Webhook base URL"),
    "https://hooks.example.com",
  );
  await userEvent.click(screen.getByRole("button", { name: "GitHub 订阅" }));
  await userEvent.type(screen.getByLabelText("GitHub repo"), "poco/roguent");
  await userEvent.type(screen.getByLabelText("GitHub token"), "ghp_token");
  await userEvent.type(
    screen.getByLabelText("GitHub webhookSecret"),
    "github-secret-value",
  );
  await userEvent.click(screen.getByRole("button", { name: "X 订阅" }));
  await userEvent.type(screen.getByLabelText("X handle"), "@SugerQvQ");
  await userEvent.type(
    screen.getByLabelText("X consumerKey"),
    "x-consumer-key",
  );
  await userEvent.type(
    screen.getByLabelText("X secretKey"),
    "x-consumer-secret",
  );
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
        webhookBaseUrl: "https://hooks.example.com",
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
            token: "ghp_token",
            webhookSecret: "github-secret-value",
          },
        },
        x: {
          enabled: true,
          metadata: {
            bearerToken: "x-token-value",
            consumerKey: "x-consumer-key",
            handle: "@SugerQvQ",
            webhookSecret: "x-consumer-secret",
          },
        },
      },
    },
    changedKeys: expect.arrayContaining([
      "cx_model",
      "public_webhook_base_url",
      "github_enabled",
      "github_repo",
      "github_token",
      "github_webhook_secret",
      "public_webhook_base_url",
      "x_enabled",
      "x_handle",
      "x_consumer_key",
      "x_webhook_secret",
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
            token: {
              secretRef: "settings/user.integrations.github.metadata.token",
            },
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
        x: {
          enabled: true,
          metadata: {
            bearerToken: {
              secretRef: "settings/user.integrations.x.metadata.bearerToken",
            },
            consumerKey: {
              secretRef: "settings/user.integrations.x.metadata.consumerKey",
            },
            handle: "@SugerQvQ",
            webhookSecret: {
              secretRef: "settings/user.integrations.x.metadata.webhookSecret",
            },
          },
        },
      },
      metadata: {
        webhookBaseUrl: "https://hooks.example.com",
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
        webhookBaseUrl: "https://hooks.example.com",
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
            token: {
              secretRef: "settings/user.integrations.github.metadata.token",
            },
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
        x: {
          enabled: true,
          metadata: {
            bearerToken: {
              secretRef: "settings/user.integrations.x.metadata.bearerToken",
            },
            consumerKey: {
              secretRef: "settings/user.integrations.x.metadata.consumerKey",
            },
            handle: "@SugerQvQ",
            webhookSecret: {
              secretRef: "settings/user.integrations.x.metadata.webhookSecret",
            },
          },
        },
      },
    },
    changedKeys: [],
  });
});

test("art style preview shows generated UI button kit art", async () => {
  useUiStore.setState({ activePanel: "settings" });

  const { container } = render(<Settings />);

  await userEvent.click(
    screen.getByRole("button", { name: /美术风格 Art Style/ }),
  );
  await userEvent.click(
    container.querySelector(
      '.artpack-card[data-pk="deep-space"]',
    ) as HTMLElement,
  );

  const kit = container.querySelector(".apv-ui-kit") as HTMLElement | null;
  expect(kit).toBeTruthy();
  expect(kit?.style.backgroundImage).toContain(
    "/assets/artpacks/deep-space/ui/buttons.png",
  );
  expect(screen.getAllByText("BUTTON UI / 按钮").length).toBeGreaterThanOrEqual(
    1,
  );
});

test("art style preview shows generated NPC tiles props structure HUD easter and UI sheets", async () => {
  useUiStore.setState({ activePanel: "settings" });

  const { container } = render(<Settings />);

  await userEvent.click(
    screen.getByRole("button", { name: /美术风格 Art Style/ }),
  );
  await userEvent.click(
    container.querySelector(
      '.artpack-card[data-pk="holo-blueprint"]',
    ) as HTMLElement,
  );

  const sheets = Array.from(
    container.querySelectorAll(".apv-sheet"),
  ) as HTMLElement[];
  expect(sheets).toHaveLength(7);
  expect(sheets.map((el) => el.dataset.sheet)).toEqual([
    "characters",
    "environment",
    "props",
    "structures",
    "hud",
    "easter",
    "ui",
  ]);
  expect(sheets[0]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/characters/npcs.png",
  );
  expect(sheets[1]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/tiles/environment.png",
  );
  expect(sheets[2]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/items/props.png",
  );
  expect(sheets[3]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/structures/source-sheet.png",
  );
  expect(sheets[4]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/hud/icons.png",
  );
  expect(sheets[5]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/easter/sprites.png",
  );
  expect(sheets[6]?.style.backgroundImage).toContain(
    "/assets/artpacks/holo-blueprint/ui/buttons.png",
  );
});
