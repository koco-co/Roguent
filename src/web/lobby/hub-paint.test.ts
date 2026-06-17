import { describe, expect, test } from "bun:test";
import type { AtlasDom, AtlasFrame } from "./atlas-dom";
import { COLS, ROWS, buildStoneMap, hubDrawScale } from "./hub-paint";

// stone map 是 paintHub 的几何骨架(广场/车道/建筑 pad),逐格钉死防止 port 走样。
describe("buildStoneMap", () => {
  const stone = buildStoneMap();

  test("尺寸 14 行 × 24 列", () => {
    expect(stone.length).toBe(ROWS);
    expect(ROWS).toBe(14);
    expect(COLS).toBe(24);
    for (const row of stone) expect(row.length).toBe(COLS);
  });

  test("中央八角广场:广场心是石板", () => {
    expect(stone[6]?.[12]).toBe(true);
  });

  test("八角切角:四角抠掉(stone[4][9] 为草)", () => {
    expect(stone[4]?.[9]).toBe(false);
    expect(stone[9]?.[9]).toBe(false);
    expect(stone[9]?.[15]).toBe(false);
    // [4][15] 例外:原型里北支道 rect(15,2,16,4) 在切角之后铺过,盖回石板
    expect(stone[4]?.[15]).toBe(true);
  });

  test("切角内一格补回石板(八角斜边)", () => {
    expect(stone[5]?.[9]).toBe(true);
    expect(stone[8]?.[15]).toBe(true);
  });

  test("claude 门 pad(3,11) 覆盖 stone[11][3]", () => {
    expect(stone[11]?.[3]).toBe(true);
  });

  test("北墙带(行 0-1)不铺石板", () => {
    expect(stone[0]?.every((v) => v === false)).toBe(true);
  });
});

// hubDrawScale 自适应高清帧:物理瓦片 80px 恒定 → 帧px * S == 80。
describe("hubDrawScale", () => {
  const atlasWith = (grassW: number): AtlasDom => {
    const fr: AtlasFrame = { x: 0, y: 0, w: grassW, h: grassW };
    return { frames: { grass: fr }, imageUrl: "/x.png", w: 128, h: 1178 };
  };

  test("16px 帧(pixel-fantasy)→ S=5(旧值不变)", () => {
    expect(hubDrawScale(atlasWith(16))).toBe(5);
  });

  test("40px HD 帧(neon/synthwave)→ S=2", () => {
    expect(hubDrawScale(atlasWith(40))).toBe(2);
  });

  test("帧px * S == 80(物理瓦片步进恒定)", () => {
    for (const px of [16, 40]) {
      expect(px * hubDrawScale(atlasWith(px))).toBeCloseTo(80, 10);
    }
  });

  test("缺 grass 帧时退回 16px 基准(S=5)", () => {
    const atlas: AtlasDom = { frames: {}, imageUrl: "/x.png", w: 128, h: 1178 };
    expect(hubDrawScale(atlas)).toBe(5);
  });
});
