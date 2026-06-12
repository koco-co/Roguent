import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { createAgent, createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { ChatTeamStrip } from "./ChatTeamStrip";

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    limits: null,
  });
});

function seedSession() {
  const session = createSession({ id: "s1", title: "Team task" });
  // createSession already seeds the orchestrator agent; add one subagent.
  session.agents.sub1 = createAgent({
    id: "sub1",
    role: "researcher",
    skin: "scout",
    status: "working",
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });
}

test("ChatTeamStrip renders the squad label and one avatar per agent", () => {
  seedSession();
  const { container, getByText } = render(<ChatTeamStrip sessionId="s1" />);

  expect(getByText("小队")).toBeDefined();
  const avatars = container.querySelectorAll(".cdrawer-team-av");
  expect(avatars.length).toBe(2);
});

test("ChatTeamStrip marks the orchestrator avatar as lead and puts it first", () => {
  seedSession();
  const { container } = render(<ChatTeamStrip sessionId="s1" />);

  const avatars = container.querySelectorAll(".cdrawer-team-av");
  const first = avatars[0];
  if (!first) throw new Error("expected at least one avatar");
  expect(first.classList.contains("lead")).toBe(true);
  // Exactly one lead avatar (the orchestrator).
  expect(container.querySelectorAll(".cdrawer-team-av.lead").length).toBe(1);
});

test("ChatTeamStrip maps agent status to a status-dot class", () => {
  seedSession();
  const { container } = render(<ChatTeamStrip sessionId="s1" />);

  // subagent is "working" → st-working dot present.
  expect(
    container.querySelector(".cdrawer-team-dot.st-working"),
  ).not.toBeNull();
});

test("ChatTeamStrip renders nothing when the session has no agents", () => {
  const session = createSession({ id: "s2", title: "Empty" });
  session.agents = {};
  useRoomStore.setState({
    sessions: { s2: session },
    currentSessionId: "s2",
  });

  const { container } = render(<ChatTeamStrip sessionId="s2" />);
  expect(container.querySelector(".cdrawer-team")).toBeNull();
});
