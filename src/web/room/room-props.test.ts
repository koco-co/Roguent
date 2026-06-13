import { expect, test } from "bun:test";
import {
  CARPET,
  DAIS,
  FOUNTAIN_COL,
  ROOM_PROPS,
  RUNE,
  floorTileAt,
} from "./room-props";

// 对照设计原型 room.jsx:33-110 的逐项坐标。ROOM_PROPS 是纯装饰布局,断言它没漂。

test("ROOM_PROPS 含原型 room.jsx:93-106 的全量道具且总数对上", () => {
  // 原型一共 16 件落地道具(2+1+1+2 左仓库 + 2+3 右工作台 + 2+1 右远端 + 1+1 角落)。
  expect(ROOM_PROPS.length).toBe(16);
});

test("ROOM_PROPS 含左仓库关键条目", () => {
  const has = (name: string, col: number, row: number) =>
    ROOM_PROPS.some((p) => p.name === name && p.col === col && p.row === row);
  expect(has("crate", 2, 9)).toBe(true);
  expect(has("crate", 3, 9)).toBe(true);
  expect(has("crate", 2, 8)).toBe(true);
  expect(has("skull", 3, 8)).toBe(true);
  expect(has("flask_big_green", 1, 11)).toBe(true);
  expect(has("flask_big_blue", 2, 11)).toBe(true);
});

test("ROOM_PROPS 含右工作台三只烧瓶(row 8,green/blue 在 col16、red 在 col17)", () => {
  // 原型 bx=16,by=9:green(16,8)/red(17,8)/blue(16,8,+40px 横移)。
  const flasks = ROOM_PROPS.filter(
    (p) => p.row === 8 && p.name.startsWith("flask_big"),
  );
  expect(flasks.map((f) => f.name).sort()).toEqual([
    "flask_big_blue",
    "flask_big_green",
    "flask_big_red",
  ]);
  expect(flasks.find((f) => f.name === "flask_big_red")?.col).toBe(17);
  expect(flasks.find((f) => f.name === "flask_big_green")?.col).toBe(16);
  expect(flasks.find((f) => f.name === "flask_big_blue")?.col).toBe(16);
});

test("角落 chest 是 chest_empty_open_anim 帧前缀且在 (6,12)、标记动画", () => {
  const chest = ROOM_PROPS.find((p) => p.col === 6 && p.row === 12);
  expect(chest).toBeDefined();
  expect(chest?.name).toBe("chest_empty_open_anim");
  expect(chest?.name.startsWith("chest_empty_open_anim")).toBe(true);
  expect(chest?.animated).toBe(true);
});

test("coin 是动画帧且在右远端 (20,11)", () => {
  const coin = ROOM_PROPS.find((p) => p.name === "coin_anim");
  expect(coin).toBeDefined();
  expect(coin?.col).toBe(20);
  expect(coin?.row).toBe(11);
  expect(coin?.animated).toBe(true);
});

test("壁泉回到北墙中央 col 11(原型 fx=11*T)", () => {
  expect(FOUNTAIN_COL).toBe(11);
});

test("指挥台中心约 (12, 6.4),平台 6.4×4.8 tile", () => {
  expect(DAIS.cx).toBe(12);
  expect(DAIS.cy).toBeCloseTo(6.4, 5);
  expect(DAIS.halfW * 2).toBeCloseTo(6.4, 5);
  expect(DAIS.halfH * 2).toBeCloseTo(4.8, 5);
});

test("符文圈双同心圆 + 12 辐条,色 #36c5e0", () => {
  expect(RUNE.spokes).toBe(12);
  expect(RUNE.color).toBe(0x36c5e0);
  expect(RUNE.outer).toBeGreaterThan(RUNE.inner);
});

test("地毯径从南门列起、6 条纹理", () => {
  expect(CARPET.x).toBeCloseTo(10.6, 5);
  expect(CARPET.w).toBeCloseTo(2.8, 5);
  expect(CARPET.stripes).toBe(6);
});

test("floorTileAt 确定性且只产出 floor_1/2/3", () => {
  const seen = new Set<string>();
  for (let r = 2; r < 14; r++) {
    for (let c = 0; c < 24; c++) {
      const t = floorTileAt(c, r);
      expect(t).toBe(floorTileAt(c, r)); // 同输入同输出
      expect(["floor_1", "floor_2", "floor_3"]).toContain(t);
      seen.add(t);
    }
  }
  // floor_1 必占多数;floor_2/floor_3 至少各出现一次(否则等于没变化)。
  expect(seen.has("floor_1")).toBe(true);
  expect(seen.has("floor_2")).toBe(true);
  expect(seen.has("floor_3")).toBe(true);
});
