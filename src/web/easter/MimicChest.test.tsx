import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MimicChest } from "./MimicChest";

beforeEach(() => {
  try {
    localStorage.removeItem("roguent_mimic");
  } catch {
    /* test env may lack localStorage */
  }
});
afterEach(cleanup);

test("clicking the chest snaps it (mimic reveal + ?! pop + localStorage flag)", () => {
  const { container } = render(<MimicChest />);
  const mimic = container.querySelector(".mimic");
  expect(mimic).toBeTruthy();
  // 初始:无 snap、无 pop。
  expect(container.querySelector(".mimic.snap")).toBeNull();
  expect(container.querySelector(".mimic-pop")).toBeNull();

  if (mimic) fireEvent.click(mimic);

  // 点击后:snap 类 + 「?!」气泡。
  expect(container.querySelector(".mimic.snap")).toBeTruthy();
  const pop = container.querySelector(".mimic-pop");
  expect(pop).toBeTruthy();
  expect(pop?.textContent).toBe("?!");
  // 彩蛋状态落 localStorage(仅记被发现过)。
  expect(localStorage.getItem("roguent_mimic")).toBe("1");
});
