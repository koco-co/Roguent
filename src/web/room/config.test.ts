import { describe, expect, it } from "bun:test";
import { COLS, HD_SCALE, ROWS, TILE, VH, VW } from "./config";

describe("room/config HD baseline", () => {
  it("bumps the virtual tile to the high-clarity baseline", () => {
    // 起步值 TILE=40(SCALE=2.5),M4 preview 调定。改这一个常数即整体换挡。
    expect(TILE).toBe(40);
  });
  it("derives HD_SCALE = TILE / 16 so render constants stay tile-relative", () => {
    expect(HD_SCALE).toBeCloseTo(TILE / 16, 10);
    expect(HD_SCALE).toBe(2.5);
  });
  it("keeps VW/VH derived from TILE (geometry auto-adapts)", () => {
    expect(VW).toBe(COLS * TILE); // 24*40 = 960
    expect(VH).toBe(ROWS * TILE); // 14*40 = 560
  });
});
