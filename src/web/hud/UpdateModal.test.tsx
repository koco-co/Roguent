import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useUiStore } from "../ui-store";
import { UpdateModal } from "./UpdateModal";

afterEach(() => {
  cleanup();
  useUiStore.setState({ activePanel: null });
});

test("UpdateModal 关闭时不渲染(activePanel gate)", () => {
  useUiStore.setState({ activePanel: null });
  const { container } = render(<UpdateModal />);
  expect(container.firstChild).toBeNull();
});

test("UpdateModal 打开时渲染更新日志 + 显著 mock 标注", () => {
  useUiStore.setState({ activePanel: "update" });
  render(<UpdateModal />);
  // 真假分明:必须出现 mock 标注文本(默认中文),防止漏标。banner + footer 都含
  //「不会真的改动 runtime」措辞,故用 getAllByText 断言至少一处。
  expect(
    screen.getAllByText(/示例更新日志|更新流程为模拟|不会真的改动/).length,
  ).toBeGreaterThan(0);
  // 版本号 / 更新条目可见(产品术语不强译;v1.0 在 banner 与日志条目都出现)。
  expect(screen.getAllByText(/v1\.0/).length).toBeGreaterThan(0);
});
