import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useUiStore } from "../../ui-store";
import { LoginEvents } from "./LoginEvents";

afterEach(() => {
  cleanup();
  useUiStore.setState({ activePanel: null });
});

test("LoginEvents 关闭时不渲染(activePanel gate)", () => {
  useUiStore.setState({ activePanel: null });
  const { container } = render(<LoginEvents />);
  expect(container.firstChild).toBeNull();
});

test("LoginEvents 打开时渲染签到/活动内容 + 显著 mock 标注", () => {
  useUiStore.setState({ activePanel: "loginEvents" });
  render(<LoginEvents />);
  // 真假分明:必须出现 mock 标注(默认中文),防止漏标。
  expect(screen.getByText(/示例活动|引擎无登录活动源|演示用途/)).toBeTruthy();
  // 签到日历至少渲染一天。
  expect(screen.getByText(/第\s*1\s*天|Day 1/)).toBeTruthy();
});
