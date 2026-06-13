import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DEFAULT_SETTINGS, useSettingsStore } from "../settings-store";
import { WishingSpot } from "./WishingSpot";

beforeEach(() => {
  // 自隔离:settings store 是模块级单例,别的测试文件可能留下 uiLang:"en";
  // 福气文案断言假设 CN,故每例前复位默认设置。
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  try {
    localStorage.removeItem("roguent_wish");
  } catch {
    /* test env may lack localStorage */
  }
});
afterEach(cleanup);

test("clicking the fountain tosses a coin with a ripple and +1 福气 text", () => {
  const { container } = render(<WishingSpot />);
  const spot = container.querySelector(".wish-spot");
  expect(spot).toBeTruthy();
  expect(container.querySelectorAll(".wish-fx").length).toBe(0);

  if (spot) fireEvent.click(spot);

  const fx = container.querySelector(".wish-fx");
  expect(fx).toBeTruthy();
  expect(container.querySelector(".wish-ring")).toBeTruthy();
  expect(container.querySelector(".wish-coin")).toBeTruthy();
  const txt = container.querySelector(".wish-txt");
  expect(txt?.textContent).toBe("+1 福气");
  // 非第 7 次 → 非 lucky。
  expect(container.querySelector(".wish-fx.lucky")).toBeNull();
  expect(localStorage.getItem("roguent_wish")).toBe("1");
});

test("the 7th wish is lucky (gold ★ 福气 +7)", () => {
  // 预置已许愿 6 次,本次为第 7 次 → lucky。
  localStorage.setItem("roguent_wish", "6");
  const { container } = render(<WishingSpot />);
  const spot = container.querySelector(".wish-spot");
  if (spot) fireEvent.click(spot);

  expect(container.querySelector(".wish-fx.lucky")).toBeTruthy();
  const txt = container.querySelector(".wish-txt");
  expect(txt?.textContent).toBe("★ 福气 +7");
  expect(localStorage.getItem("roguent_wish")).toBe("7");
});
