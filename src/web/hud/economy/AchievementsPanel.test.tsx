import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AchievementProgress } from "../../../shared/economy";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { type RoomConnection, connectRoom } from "../../ws-client";
import { AchievementsPanel } from "./AchievementsPanel";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
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

function progress(
  overrides: Partial<AchievementProgress>,
): AchievementProgress {
  return {
    id: "first-codex-session",
    title: "First Codex Session",
    description: "Create a Codex runtime session.",
    progress: 1,
    target: 1,
    completed: true,
    claimed: false,
    reward: { gem: 20 },
    updatedAt: Date.parse("2026-01-02T08:00:00.000Z"),
    ...overrides,
  };
}

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.instances = [];
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    achievements: {},
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

test("achievements panel renders completed and claimed states", () => {
  useRoomStore.setState({
    achievements: {
      "first-codex-session": progress({}),
      claimed: progress({
        id: "claimed",
        title: "Claimed Trophy",
        claimed: true,
      }),
    },
  });
  useUiStore.setState({ activePanel: "achievements" });

  render(<AchievementsPanel />);

  expect(screen.getByText("First Codex Session")).toBeTruthy();
  expect(
    screen.getByLabelText("First Codex Session progress").textContent,
  ).toContain("1 / 1");
  expect(
    screen.getByRole("button", { name: "Claim First Codex Session" }),
  ).toBeTruthy();
  expect(screen.getByText("Claimed Trophy")).toBeTruthy();
  expect(screen.getByText("Claimed")).toBeTruthy();
});

test("claim button sends economy claimAchievement command", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useRoomStore.setState({
    achievements: {
      "first-codex-session": progress({}),
    },
  });
  useUiStore.setState({ activePanel: "achievements" });

  render(<AchievementsPanel />);

  await userEvent.click(
    screen.getByRole("button", { name: "Claim First Codex Session" }),
  );

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toEqual({
    cmd: "economy",
    action: "claimAchievement",
    achievementId: "first-codex-session",
  });
});
