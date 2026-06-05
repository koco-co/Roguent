import { beforeEach, expect, test } from "bun:test";
import type { LocalSessionMeta } from "../shared/local-sessions";
import { useUiStore } from "./ui-store";

beforeEach(() => {
  useUiStore.setState({
    drawerOpen: false,
    modelOpen: false,
    skillsOpen: false,
    lootOpen: false,
    infoOpen: false,
    importOpen: false,
    leaderboardOpen: false,
    activePanel: null,
    localSessions: [],
    importError: null,
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

test("toggle opens and closes a HUD panel", () => {
  expect(useUiStore.getState().drawerOpen).toBe(false);
  useUiStore.getState().toggle("drawerOpen");
  expect(useUiStore.getState().drawerOpen).toBe(true);
  useUiStore.getState().toggle("drawerOpen");
  expect(useUiStore.getState().drawerOpen).toBe(false);
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

test("panel route and legacy boolean flags do not interfere", () => {
  // 打开布尔标志面板不应动 activePanel
  useUiStore.getState().toggle("drawerOpen");
  expect(useUiStore.getState().drawerOpen).toBe(true);
  expect(useUiStore.getState().activePanel).toBeNull();
  // 打开/关闭路由面板不应动布尔标志
  useUiStore.getState().openPanel("about");
  expect(useUiStore.getState().activePanel).toBe("about");
  expect(useUiStore.getState().drawerOpen).toBe(true);
  useUiStore.getState().closePanel();
  expect(useUiStore.getState().activePanel).toBeNull();
  expect(useUiStore.getState().drawerOpen).toBe(true);
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
