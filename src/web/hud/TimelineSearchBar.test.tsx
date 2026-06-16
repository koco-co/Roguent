import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type TimelineMessageItem, createSession } from "../../shared/domain";
import { usePinnedStore } from "../pinned-store";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { ChatDrawer } from "./ChatDrawer";

function msg(
  id: string,
  text: string,
  role: TimelineMessageItem["role"] = "assistant",
): TimelineMessageItem {
  return {
    kind: "message",
    id,
    role,
    text,
    ts: Number(id),
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };
}

afterEach(() => {
  cleanup();
  usePinnedStore.setState({ pinnedBySession: {} });
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    limits: null,
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
    transition: null,
  });
});

function seedChat(timeline: TimelineMessageItem[]) {
  const session = createSession({ id: "s1", title: "Chat", model: "m" });
  session.timeline = timeline;
  useRoomStore.setState({ sessions: { s1: session }, currentSessionId: "s1" });
  useUiStore.setState({ activePanel: "chat" });
}

test("typing a query filters the timeline to matching message bubbles", async () => {
  seedChat([
    msg("1", "Run the test suite", "user"),
    msg("2", "Tests are passing now"),
    msg("3", "Deploy is unrelated"),
  ]);

  render(<ChatDrawer />);

  // before searching: all three bubbles render
  expect(screen.getByText("Run the test suite")).toBeTruthy();
  expect(screen.getByText("Tests are passing now")).toBeTruthy();
  expect(screen.getByText("Deploy is unrelated")).toBeTruthy();

  const input = screen.getByPlaceholderText("搜索消息");
  await userEvent.type(input, "test");

  // only the two "test"-matching bubbles remain; the deploy one is gone
  expect(screen.getByText("Run the test suite")).toBeTruthy();
  expect(screen.getByText("Tests are passing now")).toBeTruthy();
  expect(screen.queryByText("Deploy is unrelated")).toBeNull();
});

test("a non-matching query shows the empty hint and no bubbles", async () => {
  seedChat([msg("1", "hello world"), msg("2", "goodbye")]);

  render(<ChatDrawer />);

  await userEvent.type(screen.getByPlaceholderText("搜索消息"), "zzz-nope");

  expect(screen.queryByText("hello world")).toBeNull();
  expect(screen.queryByText("goodbye")).toBeNull();
  expect(screen.getByText("没有匹配的消息")).toBeTruthy();
});

test("clearing the query restores the full timeline", async () => {
  seedChat([msg("1", "alpha message"), msg("2", "beta message")]);

  render(<ChatDrawer />);

  const input = screen.getByPlaceholderText("搜索消息");
  await userEvent.type(input, "alpha");
  expect(screen.queryByText("beta message")).toBeNull();

  // the clear (✕) button appears once a query is active
  await userEvent.click(screen.getByRole("button", { name: "清除搜索" }));

  expect(screen.getByText("alpha message")).toBeTruthy();
  expect(screen.getByText("beta message")).toBeTruthy();
});

test("「仅看置顶」 filters the timeline to pinned messages and toggles back", async () => {
  seedChat([
    msg("1", "pin this one", "user"),
    msg("2", "ordinary chatter"),
    msg("3", "another ordinary line"),
  ]);
  // pre-pin message id "1" for this session
  usePinnedStore.setState({ pinnedBySession: { s1: ["1"] } });

  render(<ChatDrawer />);

  // before filtering: all three bubbles render
  expect(screen.getByText("pin this one")).toBeTruthy();
  expect(screen.getByText("ordinary chatter")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "仅看置顶" }));

  // only the pinned bubble remains
  expect(screen.getByText("pin this one")).toBeTruthy();
  expect(screen.queryByText("ordinary chatter")).toBeNull();
  expect(screen.queryByText("another ordinary line")).toBeNull();

  // toggling off restores the full timeline
  await userEvent.click(screen.getByRole("button", { name: "仅看置顶" }));
  expect(screen.getByText("ordinary chatter")).toBeTruthy();
});

test("「仅看置顶」 with nothing pinned shows the empty pinned hint", async () => {
  seedChat([msg("1", "nothing pinned here"), msg("2", "still nothing")]);

  render(<ChatDrawer />);

  await userEvent.click(screen.getByRole("button", { name: "仅看置顶" }));

  expect(screen.queryByText("nothing pinned here")).toBeNull();
  expect(screen.getByText("暂无置顶消息")).toBeTruthy();
});
