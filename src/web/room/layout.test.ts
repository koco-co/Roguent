import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../../shared/domain";
import {
  HOTBAR_RECT,
  MINIMAP_RECT,
  ROOM_STAGE,
  ROSTER_RECT,
  TASK_WINDOW_RECT,
  clampRoomStage,
  rectsOverlap,
  roomLayout,
} from "./layout";

test("orchestrator is centered; subagents get distinct positions", () => {
  const p = roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560);
  expect(p[ORCHESTRATOR_ID]).toEqual({ x: 450, y: Math.round(560 * 0.42) });
  expect(p.a).not.toEqual(p.b);
  expect(p.a).toEqual(roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560).a); // deterministic
});

test("ROOM_STAGE stays inside the fixed 1920x1080 stage", () => {
  expect(ROOM_STAGE.x).toBeGreaterThanOrEqual(0);
  expect(ROOM_STAGE.y).toBeGreaterThanOrEqual(0);
  expect(ROOM_STAGE.x + ROOM_STAGE.w).toBeLessThanOrEqual(1920);
  expect(ROOM_STAGE.y + ROOM_STAGE.h).toBeLessThanOrEqual(1080);
});

test("ROOM_STAGE does not overlap fixed HUD reservations", () => {
  for (const rect of [
    ROSTER_RECT,
    TASK_WINDOW_RECT,
    MINIMAP_RECT,
    HOTBAR_RECT,
  ]) {
    expect(rectsOverlap(ROOM_STAGE, rect)).toBe(false);
  }
});

test("HOTBAR_RECT is centered and clear of the minimap", () => {
  expect(HOTBAR_RECT.x + HOTBAR_RECT.w / 2).toBe(960);
  expect(rectsOverlap(HOTBAR_RECT, MINIMAP_RECT)).toBe(false);
});

test("clampRoomStage returns the visible stage intersection", () => {
  expect(clampRoomStage({ x: -100, y: -20, w: 200, h: 80 })).toEqual({
    x: 0,
    y: 0,
    w: 100,
    h: 60,
  });
  expect(clampRoomStage({ x: 1880, y: 1040, w: 100, h: 100 })).toEqual({
    x: 1880,
    y: 1040,
    w: 40,
    h: 40,
  });
  expect(clampRoomStage({ x: 2000, y: 1200, w: 100, h: 100 })).toEqual({
    x: 1920,
    y: 1080,
    w: 0,
    h: 0,
  });
});
