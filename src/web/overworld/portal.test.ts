import { expect, test } from "bun:test";
import { portalFrame } from "./portal";

const D = 400;

test("起点:遮罩 0、未到中点切换、未结束", () => {
  expect(portalFrame(0, D)).toEqual({ cover: 0, swapped: false, done: false });
});

test("中点:遮罩满 1、触发 view 切换", () => {
  const f = portalFrame(D / 2, D);
  expect(f.cover).toBeCloseTo(1, 5);
  expect(f.swapped).toBe(true);
  expect(f.done).toBe(false);
});

test("终点及之后:遮罩 0、已切换、已结束", () => {
  expect(portalFrame(D, D)).toEqual({ cover: 0, swapped: true, done: true });
  expect(portalFrame(D + 50, D)).toEqual({
    cover: 0,
    swapped: true,
    done: true,
  });
});

test("遮罩前半升 0→1、后半降 1→0", () => {
  expect(portalFrame(D * 0.25, D).cover).toBeCloseTo(0.5, 5);
  expect(portalFrame(D * 0.75, D).cover).toBeCloseTo(0.5, 5);
});
