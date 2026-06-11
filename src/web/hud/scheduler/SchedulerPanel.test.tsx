import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../../shared/domain";
import type { SchedulerRun, SchedulerTask } from "../../../shared/scheduler";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { type RoomConnection, connectRoom } from "../../ws-client";
import { SessionGrid } from "../SessionGrid";
import { SchedulerPanel } from "./SchedulerPanel";

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

function schedulerTask(overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id: "task-1",
    title: "Daily review",
    prompt: "Summarize changes",
    status: "enabled",
    createdAt: Date.UTC(2026, 0, 2, 8),
    updatedAt: Date.UTC(2026, 0, 2, 8),
    nextRunAt: Date.UTC(2026, 0, 3, 9, 30),
    cwd: "/repo",
    runtime: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "default",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    schedule: { kind: "daily", hour: 9, minute: 30, timezone: "UTC" },
    targetSessionId: "s1",
    ...overrides,
  };
}

function schedulerRun(overrides: Partial<SchedulerRun> = {}): SchedulerRun {
  return {
    id: "run-1",
    taskId: "task-1",
    status: "succeeded",
    queuedAt: Date.UTC(2026, 0, 2, 9),
    startedAt: Date.UTC(2026, 0, 2, 9),
    finishedAt: Date.UTC(2026, 0, 2, 9, 1),
    sessionId: "s1",
    summary: "prompt dispatched",
    ...overrides,
  };
}

function seedScheduler() {
  useRoomStore.setState({
    sessions: {
      s1: createSession({
        id: "s1",
        title: "Roguent",
        model: "gpt-5",
        runtime: "codex",
        cwd: "/repo",
      }),
    },
    currentSessionId: "s1",
    scheduler: {
      tasks: { "task-1": schedulerTask() },
      runs: { "run-1": schedulerRun() },
    },
  });
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
    scheduler: { tasks: {}, runs: {} },
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
    transition: null,
  });
});

test("scheduler panel lists real tasks, last run, and sends run-now command", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  seedScheduler();

  render(<SchedulerPanel />);

  expect(screen.getByText("Daily review")).toBeTruthy();
  expect(screen.getByText("enabled")).toBeTruthy();
  expect(screen.getByText(/Next:/)).toBeTruthy();
  expect(screen.getByText(/Last: succeeded/)).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Run Now" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toEqual({
    cmd: "scheduler",
    action: "runTask",
    taskId: "task-1",
  });
});

test("scheduler form creates a task with runtime, permissions, recurrence, and target", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  seedScheduler();

  render(<SchedulerPanel />);

  await userEvent.clear(screen.getByLabelText("Title"));
  await userEvent.type(screen.getByLabelText("Title"), "Ship mobile fix");
  await userEvent.clear(screen.getByLabelText("Prompt"));
  await userEvent.type(screen.getByLabelText("Prompt"), "Ship it");
  await userEvent.clear(screen.getByLabelText("CWD"));
  await userEvent.type(screen.getByLabelText("CWD"), "/repo/mobile");
  await userEvent.selectOptions(screen.getByLabelText("Runtime"), "codex");
  await userEvent.clear(screen.getByLabelText("Model"));
  await userEvent.type(screen.getByLabelText("Model"), "gpt-5");
  await userEvent.selectOptions(screen.getByLabelText("Reasoning"), "high");
  await userEvent.selectOptions(screen.getByLabelText("Approval"), "never");
  await userEvent.selectOptions(
    screen.getByLabelText("Sandbox"),
    "danger-full-access",
  );
  await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "daily");
  await userEvent.clear(screen.getByLabelText("Hour"));
  await userEvent.type(screen.getByLabelText("Hour"), "10");
  await userEvent.clear(screen.getByLabelText("Minute"));
  await userEvent.type(screen.getByLabelText("Minute"), "15");
  await userEvent.click(screen.getByLabelText("Network"));
  await userEvent.click(screen.getByRole("button", { name: "Create" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toMatchObject({
    cmd: "scheduler",
    action: "createTask",
    task: {
      title: "Ship mobile fix",
      prompt: "Ship it",
      cwd: "/repo/mobile",
      targetSessionId: "s1",
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: false,
      },
      schedule: { kind: "daily", hour: 10, minute: 15, timezone: "UTC" },
    },
  });
});

test("session grid scheduled tasks mode renders the real scheduler panel", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  seedScheduler();
  useUiStore.setState({ activePanel: "sessiongrid" });

  render(<SessionGrid />);

  await userEvent.click(
    screen.getByRole("button", { name: "Scheduled Tasks" }),
  );

  expect(screen.getByText("Daily review")).toBeTruthy();
  expect(screen.getByText(/Last: succeeded/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Run Now" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toEqual({
    cmd: "scheduler",
    action: "runTask",
    taskId: "task-1",
  });
});

test("session grid runtime tabs filter Claude and Codex sessions", async () => {
  useRoomStore.setState({
    sessions: {
      claude: createSession({
        id: "claude",
        title: "Claude work",
        model: "claude-opus-4-8",
        runtime: "claude",
      }),
      codex: createSession({
        id: "codex",
        title: "Codex work",
        model: "gpt-5",
        runtime: "codex",
      }),
    },
    currentSessionId: "codex",
    scheduler: { tasks: {}, runs: {} },
  });
  useUiStore.setState({ activePanel: "sessiongrid" });

  render(<SessionGrid />);

  expect(screen.getByText("Claude work")).toBeTruthy();
  expect(screen.getByText("Codex work")).toBeTruthy();

  // v2: runtime 过滤改用 FChip(label + 计数),按名包含匹配。
  await userEvent.click(screen.getByRole("button", { name: /^Codex/ }));
  expect(screen.queryByText("Claude work")).toBeNull();
  expect(screen.getByText("Codex work")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: /^Claude/ }));
  expect(screen.getByText("Claude work")).toBeTruthy();
  expect(screen.queryByText("Codex work")).toBeNull();
});
