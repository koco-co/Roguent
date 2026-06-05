import { expect, test } from "bun:test";
import { cameraOffset } from "./camera";

const view = { w: 800, h: 600 };
const world = { w: 2000, h: 1500 };

test("focus at world centre keeps the focus centred", () => {
  const focus = { x: world.w / 2, y: world.h / 2 };
  const off = cameraOffset(focus, view, world);
  expect(off.x).toBe(view.w / 2 - focus.x);
  expect(off.y).toBe(view.h / 2 - focus.y);
  // The focus point lands at the viewport centre: off + focus === view/2.
  expect(off.x + focus.x).toBe(view.w / 2);
  expect(off.y + focus.y).toBe(view.h / 2);
});

test("focus near the left/top edge clamps offset to 0 (no gap)", () => {
  const off = cameraOffset({ x: 0, y: 0 }, view, world);
  expect(off.x).toBe(0);
  expect(off.y).toBe(0);
});

test("focus just inside the left/top edge still clamps to 0", () => {
  const off = cameraOffset({ x: 50, y: 50 }, view, world);
  expect(off.x).toBe(0);
  expect(off.y).toBe(0);
});

test("focus near the right/bottom edge clamps to view - world", () => {
  const off = cameraOffset({ x: world.w, y: world.h }, view, world);
  expect(off.x).toBe(view.w - world.w);
  expect(off.y).toBe(view.h - world.h);
});

test("a world smaller than the view on an axis centres that axis", () => {
  const smallWorld = { w: 300, h: 4000 };
  // x: world (300) < view (800) → centred. y: world (4000) > view → clamped.
  const off = cameraOffset({ x: 150, y: 2000 }, view, smallWorld);
  expect(off.x).toBe((view.w - smallWorld.w) / 2);
  expect(off.x).toBeGreaterThanOrEqual(0);
  expect(off.y).toBe(view.h / 2 - 2000);
});

test("both axes centred when the whole world fits inside the view", () => {
  const tiny = { w: 100, h: 80 };
  const off = cameraOffset({ x: 50, y: 40 }, view, tiny);
  expect(off).toEqual({
    x: (view.w - tiny.w) / 2,
    y: (view.h - tiny.h) / 2,
  });
});

test("offset never reveals past the world edges for an interior focus", () => {
  const focus = { x: 1200, y: 900 };
  const off = cameraOffset(focus, view, world);
  // Right/bottom world edge stays at or past the viewport edge.
  expect(off.x).toBeLessThanOrEqual(0);
  expect(off.x).toBeGreaterThanOrEqual(view.w - world.w);
  expect(off.y).toBeLessThanOrEqual(0);
  expect(off.y).toBeGreaterThanOrEqual(view.h - world.h);
  // And it tracks the focus exactly while unclamped.
  expect(off.x).toBe(view.w / 2 - focus.x);
  expect(off.y).toBe(view.h / 2 - focus.y);
});

test("scale 把世界放大后仍居中聚焦点", () => {
  // world 100×80,scale 2 → 缩放后 200×160,均小于 view(800×600) → 两轴居中。
  const tiny = { w: 100, h: 80 };
  const off = cameraOffset({ x: 50, y: 40 }, view, tiny, 2);
  expect(off.x).toBe((view.w - tiny.w * 2) / 2);
  expect(off.y).toBe((view.h - tiny.h * 2) / 2);
});

test("scale 让世界超出视口时跟随并夹边", () => {
  // world 500×400,scale 3 → 1500×1200 > view → 跟随。focus 在缩放世界中点。
  const w = { w: 500, h: 400 };
  const focus = { x: 250, y: 200 };
  const off = cameraOffset(focus, view, w, 3);
  // 缩放后聚焦点落屏幕中央:off + scale*focus === view/2。
  expect(off.x + focus.x * 3).toBe(view.w / 2);
  expect(off.y + focus.y * 3).toBe(view.h / 2);
});

test("scale 下夹到 view - scale*world(右/下边不露白)", () => {
  const w = { w: 500, h: 400 };
  const off = cameraOffset({ x: w.w, y: w.h }, view, w, 3);
  expect(off.x).toBe(view.w - w.w * 3);
  expect(off.y).toBe(view.h - w.h * 3);
});

test("默认 scale=1 与旧行为一致(回归保护)", () => {
  const focus = { x: world.w / 2, y: world.h / 2 };
  expect(cameraOffset(focus, view, world)).toEqual(
    cameraOffset(focus, view, world, 1),
  );
});
