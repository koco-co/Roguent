import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PetActor } from "./PetActor";

afterEach(cleanup);

test("clicking the cat hops it and spawns a heart particle", () => {
  // 注入确定性 rng → 横向偏移可预测,断言不抖。
  const { container } = render(<PetActor rng={() => 0.5} />);
  const actor = container.querySelector(".petactor");
  expect(actor).toBeTruthy();
  // 初始无浮心。
  expect(container.querySelectorAll(".pet-heart").length).toBe(0);

  if (actor) fireEvent.click(actor);

  // 点击后:hop 类 + 一颗心。
  expect(container.querySelector(".petactor.hop")).toBeTruthy();
  expect(container.querySelectorAll(".pet-heart").length).toBe(1);
  // 非第 10 次 → 普通心(无 rainbow)。
  expect(container.querySelector(".pet-heart.rainbow")).toBeNull();
});

test("the 10th pet produces a rainbow heart", () => {
  const { container } = render(<PetActor rng={() => 0.5} />);
  const actor = container.querySelector(".petactor");
  expect(actor).toBeTruthy();
  if (actor) {
    for (let i = 0; i < 10; i++) fireEvent.click(actor);
  }
  // 第 10 次出彩虹心。
  expect(container.querySelector(".pet-heart.rainbow")).toBeTruthy();
});
