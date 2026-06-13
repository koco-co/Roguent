import { expect, test } from "bun:test";
import type { AchievementProgress } from "../../../shared/economy";
import { filterAchievements } from "./achievement-filter";

function ach(overrides: Partial<AchievementProgress>): AchievementProgress {
  return {
    id: "a",
    title: "A",
    progress: 1,
    target: 1,
    completed: false,
    updatedAt: 0,
    ...overrides,
  };
}

const done = ach({ id: "done", completed: true });
const wip = ach({ id: "wip", completed: false, progress: 1, target: 3 });
const list = [done, wip];

test("all tab returns every achievement (new array, not the same ref)", () => {
  const out = filterAchievements(list, "all");
  expect(out).toEqual(list);
  expect(out).not.toBe(list);
});

test("unlocked tab keeps only completed", () => {
  expect(filterAchievements(list, "unlocked")).toEqual([done]);
});

test("progress tab keeps only not-completed", () => {
  expect(filterAchievements(list, "progress")).toEqual([wip]);
});

test("empty list stays empty for every tab", () => {
  expect(filterAchievements([], "all")).toEqual([]);
  expect(filterAchievements([], "unlocked")).toEqual([]);
  expect(filterAchievements([], "progress")).toEqual([]);
});
