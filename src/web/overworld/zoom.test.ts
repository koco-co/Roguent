import { expect, test } from "bun:test";
import { lobbyZoom } from "./zoom";

test("典型桌面视口缩放到 3", () => {
  expect(lobbyZoom({ w: 1491, h: 812 })).toBe(3);
});

test("矮视口夹到最小缩放 2", () => {
  expect(lobbyZoom({ w: 800, h: 360 })).toBe(2);
});

test("高视口夹到最大缩放 4", () => {
  expect(lobbyZoom({ w: 2000, h: 1600 })).toBe(4);
});

test("缩放恒为 [2,4] 内整数", () => {
  for (const h of [200, 500, 700, 812, 1000, 1400, 3000]) {
    const z = lobbyZoom({ w: 1000, h });
    expect(Number.isInteger(z)).toBe(true);
    expect(z).toBeGreaterThanOrEqual(2);
    expect(z).toBeLessThanOrEqual(4);
  }
});
