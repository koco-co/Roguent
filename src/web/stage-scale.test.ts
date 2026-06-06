import { expect, test } from "bun:test";
import { STAGE_H, STAGE_W, stageScale } from "./stage-scale";

test("design size constants are 1920×1080", () => {
  expect(STAGE_W).toBe(1920);
  expect(STAGE_H).toBe(1080);
});

test("exact design size → scale 1", () => {
  expect(stageScale(1920, 1080)).toBe(1);
});

test("half on both axes → 0.5", () => {
  expect(stageScale(960, 540)).toBe(0.5);
});

test("picks the smaller axis ratio (letterbox, never crop)", () => {
  // 宽够高不够 → 受高度约束
  expect(stageScale(3840, 1080)).toBe(1);
  // 1440×900 笔记本:min(0.75, 0.8333…) = 0.75
  expect(stageScale(1440, 900)).toBe(0.75);
});

test("upscales above 1 on larger-than-design screens (no clamp)", () => {
  expect(stageScale(3840, 2160)).toBe(2);
});
