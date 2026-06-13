import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useUiStore } from "../ui-store";
import { Hotbar } from "./Hotbar";

afterEach(() => {
  cleanup();
  useUiStore.setState({ activePanel: null, view: "overworld" });
});

// hotbar 仅内景显示;切到 interior 才渲染槽位(view 为 { interior: id })。
function showInterior() {
  useUiStore.setState({ view: { interior: "s1" }, activePanel: null });
}

test("hotbar renders per-slot key glyphs (CN single chars from prototype)", () => {
  showInterior();
  render(<Hotbar />);

  // g1 + g2 每槽右下角单字键位字(以原型 hud.jsx:445-446 为准)。
  for (const glyph of [
    "务",
    "话",
    "技",
    "插",
    "智",
    "入",
    "物",
    "市",
    "榜",
    "成",
  ]) {
    expect(screen.getByText(glyph)).toBeTruthy();
  }
});

test("hotbar key glyphs use the .hb-key class", () => {
  showInterior();
  const { container } = render(<Hotbar />);
  // 10 槽 → 10 个键位角标。
  expect(container.querySelectorAll(".hb-key")).toHaveLength(10);
});
