import { expect, test } from "bun:test";
import {
  LUCKY_PITY_THRESHOLD,
  LUCKY_WINDOW_MS,
  consumeLucky,
  createLuckyState,
  registerLuckyClick,
} from "./gacha-pity";

test("does not charge before the 5th consecutive click", () => {
  let s = createLuckyState();
  for (let i = 0; i < LUCKY_PITY_THRESHOLD - 1; i++) {
    s = registerLuckyClick(s, 1000 + i * 100);
    expect(s.charged).toBe(false);
  }
  expect(s.clicks.length).toBe(LUCKY_PITY_THRESHOLD - 1);
});

test("charges exactly on the 5th rapid click and clears the counter", () => {
  let s = createLuckyState();
  for (let i = 0; i < LUCKY_PITY_THRESHOLD; i++) {
    s = registerLuckyClick(s, 1000 + i * 100);
  }
  expect(s.charged).toBe(true);
  expect(s.clicks.length).toBe(0);
});

test("stale clicks outside the window do not accumulate toward pity", () => {
  let s = createLuckyState();
  // 4 clicks spaced beyond the window each → never two in-window together
  for (let i = 0; i < 10; i++) {
    s = registerLuckyClick(s, i * (LUCKY_WINDOW_MS + 1));
    expect(s.charged).toBe(false);
    expect(s.clicks.length).toBe(1);
  }
});

test("consume returns lucky=true when charged and resets state", () => {
  let s = createLuckyState();
  for (let i = 0; i < LUCKY_PITY_THRESHOLD; i++) {
    s = registerLuckyClick(s, 1000 + i * 100);
  }
  const { lucky, state } = consumeLucky(s);
  expect(lucky).toBe(true);
  expect(state.charged).toBe(false);
  expect(state.clicks.length).toBe(0);
});

test("consume returns lucky=false when not charged", () => {
  const { lucky } = consumeLucky(createLuckyState());
  expect(lucky).toBe(false);
});

test("clicking while already charged keeps it charged (no reset)", () => {
  let s = createLuckyState();
  for (let i = 0; i < LUCKY_PITY_THRESHOLD; i++) {
    s = registerLuckyClick(s, 1000 + i * 100);
  }
  expect(s.charged).toBe(true);
  s = registerLuckyClick(s, 2000);
  expect(s.charged).toBe(true);
});
