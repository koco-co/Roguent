import { expect, test } from "bun:test";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { TimelinePromptItem } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import type { DriverCallbacks, IDriver } from "./driver";
import { SessionManager } from "./session";

function driverStub(overrides: Partial<IDriver> = {}): IDriver {
  return {
    start() {},
    send() {},
    async setModel() {},
    async setPermissionMode() {},
    async interrupt() {},
    end() {},
    getContextUsage: async () => null,
    askPermission: async () => ({ behavior: "allow" as const }),
    respondPermission() {},
    ...overrides,
  };
}

test("respondPermission resolves a pending runtime prompt once", () => {
  let callbacks: DriverCallbacks | undefined;
  const resolutions: Array<{ promptId: string; result: PermissionResult }> = [];
  const driver = driverStub({
    respondPermission(promptId, result) {
      resolutions.push({ promptId, result });
      callbacks?.onDraft(
        [
          {
            type: "prompt.resolved",
            payload: { promptId, result: "answered" },
          },
        ],
        20,
      );
    },
  });
  const manager = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  const events: RoomEvent[] = [];
  manager.subscribe((event) => events.push(event));
  manager.createSession("s1", { title: "t", model: "m" });

  callbacks?.onDraft(
    [
      {
        type: "prompt.requested",
        payload: {
          promptId: "p1",
          promptKind: "permission",
          data: { toolName: "Bash", inputSummary: "ls" },
        },
      },
    ],
    10,
  );
  manager.respondPermission("s1", "p1", { behavior: "allow" });
  manager.respondPermission("s1", "p1", {
    behavior: "deny",
    message: "duplicate",
  });

  expect(resolutions).toEqual([
    { promptId: "p1", result: { behavior: "allow" } },
  ]);
  expect(
    events.filter((event) => event.type === "prompt.resolved"),
  ).toHaveLength(1);
});

test("respondPermission can retry after an asynchronous driver failure", async () => {
  let callbacks: DriverCallbacks | undefined;
  const resolutions: string[] = [];
  let shouldFail = true;
  const driver = driverStub({
    async respondPermission(promptId) {
      resolutions.push(promptId);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transport closed");
      }
      callbacks?.onDraft(
        [
          {
            type: "prompt.resolved",
            payload: { promptId, result: "answered" },
          },
        ],
        30,
      );
    },
  });
  const manager = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  const events: RoomEvent[] = [];
  manager.subscribe((event) => events.push(event));
  manager.createSession("s1", { title: "t", model: "m" });

  callbacks?.onDraft(
    [
      {
        type: "prompt.requested",
        payload: {
          promptId: "p-retry",
          promptKind: "permission",
          data: { toolName: "Bash", inputSummary: "ls" },
        },
      },
    ],
    10,
  );
  manager.respondPermission("s1", "p-retry", { behavior: "allow" });
  await waitFor(() => events.some((event) => event.type === "session.error"));
  manager.respondPermission("s1", "p-retry", { behavior: "allow" });
  await waitFor(() => events.some((event) => event.type === "prompt.resolved"));

  expect(resolutions).toEqual(["p-retry", "p-retry"]);
});

test("respondPermission blocks duplicate responses while one is in flight", async () => {
  let callbacks: DriverCallbacks | undefined;
  let release: (() => void) | undefined;
  const resolutions: string[] = [];
  const driver = driverStub({
    async respondPermission(promptId) {
      resolutions.push(promptId);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      callbacks?.onDraft(
        [
          {
            type: "prompt.resolved",
            payload: { promptId, result: "answered" },
          },
        ],
        30,
      );
    },
  });
  const manager = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  manager.createSession("s1", { title: "t", model: "m" });
  callbacks?.onDraft(
    [
      {
        type: "prompt.requested",
        payload: {
          promptId: "p-inflight",
          promptKind: "permission",
          data: { toolName: "Bash", inputSummary: "ls" },
        },
      },
    ],
    10,
  );

  manager.respondPermission("s1", "p-inflight", { behavior: "allow" });
  manager.respondPermission("s1", "p-inflight", { behavior: "allow" });
  expect(resolutions).toEqual(["p-inflight"]);
  release?.();
  await waitFor(() => resolutions.length === 1);
});

test("respondQuestion uses driver prompt response when available and only once", () => {
  let callbacks: DriverCallbacks | undefined;
  const questionResponses: Array<{
    promptId: string;
    selectedLabels: string[];
  }> = [];
  const sent: string[] = [];
  const driver = {
    ...driverStub({
      send(text) {
        sent.push(text);
      },
    }),
    respondQuestion(promptId: string, selectedLabels: string[]) {
      questionResponses.push({ promptId, selectedLabels });
      callbacks?.onDraft(
        [
          {
            type: "prompt.resolved",
            payload: { promptId, result: "answered" },
          },
        ],
        20,
      );
    },
  } as IDriver & {
    respondQuestion(promptId: string, selectedLabels: string[]): void;
  };
  const manager = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  const events: RoomEvent[] = [];
  manager.subscribe((event) => events.push(event));
  manager.createSession("s1", { title: "t", model: "m" });

  callbacks?.onDraft(
    [
      {
        type: "prompt.requested",
        payload: {
          promptId: "q1",
          promptKind: "question",
          data: {
            questions: [
              {
                header: "Mode",
                question: "Pick one",
                multiSelect: false,
                options: [{ label: "Fast" }],
              },
            ],
          },
        },
      },
    ],
    10,
  );
  manager.respondQuestion("s1", "q1", ["Fast"]);
  manager.respondQuestion("s1", "q1", ["Slow"]);

  expect(questionResponses).toEqual([
    { promptId: "q1", selectedLabels: ["Fast"] },
  ]);
  expect(sent).toEqual([]);
  expect(
    events.filter((event) => event.type === "prompt.resolved"),
  ).toHaveLength(1);
});

test("respondQuestion falls back to a user message and local resolution once", () => {
  let callbacks: DriverCallbacks | undefined;
  const sent: string[] = [];
  const driver = driverStub({
    send(text) {
      sent.push(text);
    },
  });
  const manager = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  const events: RoomEvent[] = [];
  manager.subscribe((event) => events.push(event));
  manager.createSession("s1", { title: "t", model: "m" });

  callbacks?.onDraft(
    [
      {
        type: "prompt.requested",
        payload: {
          promptId: "q2",
          promptKind: "question",
          data: {
            questions: [
              {
                header: "Mode",
                question: "Pick one",
                multiSelect: false,
                options: [{ label: "Careful" }],
              },
            ],
          },
        },
      },
    ],
    10,
  );
  manager.respondQuestion("s1", "q2", ["Careful"]);
  manager.respondQuestion("s1", "q2", ["Fast"]);

  expect(sent).toEqual(["Careful"]);
  const resolved = events.filter(
    (event) => event.type === "prompt.resolved",
  ) as Array<
    RoomEvent<{ promptId: string; result: TimelinePromptItem["status"] }>
  >;
  expect(resolved).toHaveLength(1);
  expect(resolved[0]?.payload).toEqual({ promptId: "q2", result: "answered" });
});

async function waitFor(assertion: () => boolean): Promise<void> {
  const started = Date.now();
  while (!assertion()) {
    if (Date.now() - started > 250) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
