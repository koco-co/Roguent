import { beforeEach, expect, test } from "bun:test";
import type { LocalSessionMeta } from "../shared/local-sessions";
import { useUiStore } from "./ui-store";

beforeEach(() => {
  useUiStore.setState({
    activePanel: null,
    localSessions: [],
    importError: null,
    commandError: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
  });
});

test("enterInterior sets view to { interior: id } and clears NPC selection", () => {
  useUiStore.getState().selectNpc("session-1");
  expect(useUiStore.getState().selectedNpcId).toBe("session-1");

  useUiStore.getState().enterInterior("session-1");
  expect(useUiStore.getState().view).toEqual({ interior: "session-1" });
  expect(useUiStore.getState().selectedNpcId).toBeNull();
});

test("exitOverworld returns to overworld view and clears selectedAgentId", () => {
  useUiStore.getState().enterInterior("session-1");
  useUiStore.getState().select("ag-1");
  expect(useUiStore.getState().selectedAgentId).toBe("ag-1");

  useUiStore.getState().exitOverworld();
  expect(useUiStore.getState().view).toBe("overworld");
  expect(useUiStore.getState().selectedAgentId).toBeNull();
});

test("enterInterior then exitOverworld round-trips back to overworld", () => {
  useUiStore.getState().enterInterior("sess-abc");
  expect(useUiStore.getState().view).toEqual({ interior: "sess-abc" });
  useUiStore.getState().exitOverworld();
  expect(useUiStore.getState().view).toBe("overworld");
});

test("activePanel starts null; openPanel sets it; closePanel clears it", () => {
  expect(useUiStore.getState().activePanel).toBeNull();
  useUiStore.getState().openPanel("about");
  expect(useUiStore.getState().activePanel).toBe("about");
  useUiStore.getState().closePanel();
  expect(useUiStore.getState().activePanel).toBeNull();
});

test("openPanel is mutually exclusive — later id overrides earlier", () => {
  useUiStore.getState().openPanel("about");
  expect(useUiStore.getState().activePanel).toBe("about");
  useUiStore.getState().openPanel("skills");
  expect(useUiStore.getState().activePanel).toBe("skills");
});

test("setLocalSessions / setImportError update import state", () => {
  const meta: LocalSessionMeta = {
    project: "p",
    sessionId: "s",
    path: "/p/s.jsonl",
    mtime: 1,
    firstMessage: "hi",
    msgCount: 2,
  };
  useUiStore.getState().setLocalSessions([meta]);
  expect(useUiStore.getState().localSessions).toEqual([meta]);
  useUiStore.getState().setImportError("boom");
  expect(useUiStore.getState().importError).toBe("boom");
  useUiStore.getState().setLocalSessions([]); // 重新列表清掉旧错误
  expect(useUiStore.getState().importError).toBeNull();
});

test("setCommandError updates generic command error state", () => {
  useUiStore.getState().setCommandError("Command not implemented");
  expect(useUiStore.getState().commandError).toBe("Command not implemented");
  useUiStore.getState().setCommandError(null);
  expect(useUiStore.getState().commandError).toBeNull();
});
