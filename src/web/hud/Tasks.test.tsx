import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Tasks } from "./Tasks";

afterEach(() => {
  cleanup();
  useUiStore.setState({ activePanel: null });
  useRoomStore.setState({ currentSessionId: null, sessions: {} });
});

test("Tasks 邮箱区:渲染 agent 间信件 + 显著 mock 标注", () => {
  useUiStore.setState({ activePanel: "tasks" });
  render(<Tasks />);
  // 真假分明:信件区必须带 mock 标注(默认中文),写明引擎无 inter-agent 信箱。
  expect(
    screen.getByText(/示例信件|引擎无.*信箱|inter-agent.*示例/),
  ).toBeTruthy();
});
