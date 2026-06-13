// 内景房间的纯数据布局,对标设计原型 Prototype/roguent/project/roguent/room.jsx:33-110。
//
// 坐标体系换算:原型用 T=80px(=16*S, S=5)的 tile,本仓用 16px 虚拟 tile(由上层
// 容器整数缩放贴屏)。所以原型里 `col*T + ox` 的像素偏移 ox(80px 空间)换到本仓
// 16px 空间是 ox/S。下面所有偏移都已按 S=5 折算,正文只留 16px 空间的最终偏移。
// 这些是**纯装饰**布局,不映射任何真实数据。

import { holoHash } from "./holo";

export const PROP_OFFSET_SCALE = 5; // 原型 S:80px tile / 16px tile

/** 一件落地道具:atlas 帧名 + tile 索引(col,row)+ 16px 空间内的像素微调。 */
export interface RoomProp {
  /** atlas 静态帧名(动画帧用基名,带 _anim 的取首帧或交给 AnimatedDecor)。 */
  name: string;
  /** tile 列索引(原型 at(name,c,r) 的 c)。 */
  col: number;
  /** tile 行索引(原型 at(name,c,r) 的 r)。 */
  row: number;
  /** 16px 空间像素微调 x(原型 ox/S)。 */
  ox: number;
  /** 16px 空间像素微调 y(原型 oy/S)。 */
  oy: number;
  /** true 表示该帧是 _anim 序列(coin / chest_empty_open),需用 AnimatedDecor 播放。 */
  animated?: boolean;
}

// 原型偏移(80px 空间)→ 本仓 16px 空间:除以 S。用小工具保证可读对照。
const px = (v: number): number => v / PROP_OFFSET_SCALE;

/**
 * 全量落地道具表,逐项对照 room.jsx:93-106(实读为准):
 *   - 左仓库:crate(2,9)/crate(3,9)/crate(2,8,+0,+4)/skull(3,8,+16,+28)/
 *             flask_big_green(1,11,+8,0)/flask_big_blue(2,11,+4,0)
 *   - 右工作台(bx=16,by=9):crate(16,9)/crate(17,9)/
 *             flask_big_green(16,8,+6,+2)/flask_big_red(17,8,+6,+2)/flask_big_blue(16,8,+40,+2)
 *   - 右远端:crate(21,11)/crate(21,10,+0,+4)/coin(20,11,+40,+20)
 *   - 角落:chest_empty_open_anim(6,12,+12,+8)/skull(18,12,+20,+18)
 * 偏移列均按 S=5 折算到 16px 空间。
 */
export const ROOM_PROPS: readonly RoomProp[] = [
  // 左仓库:crate 堆 + 炼金杂物
  { name: "crate", col: 2, row: 9, ox: 0, oy: 0 },
  { name: "crate", col: 3, row: 9, ox: 0, oy: 0 },
  { name: "crate", col: 2, row: 8, ox: 0, oy: px(4) },
  { name: "skull", col: 3, row: 8, ox: px(16), oy: px(28) },
  { name: "flask_big_green", col: 1, row: 11, ox: px(8), oy: 0 },
  { name: "flask_big_blue", col: 2, row: 11, ox: px(4), oy: 0 },
  // 右工作台:crate + 烧瓶(bx=16, by=9)
  { name: "crate", col: 16, row: 9, ox: 0, oy: 0 },
  { name: "crate", col: 17, row: 9, ox: 0, oy: 0 },
  { name: "flask_big_green", col: 16, row: 8, ox: px(6), oy: px(2) },
  { name: "flask_big_red", col: 17, row: 8, ox: px(6), oy: px(2) },
  { name: "flask_big_blue", col: 16, row: 8, ox: px(40), oy: px(2) },
  // 右远端:barrel(crate)堆 + 金币
  { name: "crate", col: 21, row: 11, ox: 0, oy: 0 },
  { name: "crate", col: 21, row: 10, ox: 0, oy: px(4) },
  {
    name: "coin_anim",
    col: 20,
    row: 11,
    ox: px(40),
    oy: px(20),
    animated: true,
  },
  // 角落:开盖空宝箱(动画)+ 骷髅
  {
    name: "chest_empty_open_anim",
    col: 6,
    row: 12,
    ox: px(12),
    oy: px(8),
    animated: true,
  },
  { name: "skull", col: 18, row: 12, ox: px(20), oy: px(18) },
] as const;

/**
 * 中央指挥台几何(room.jsx:65-73)。中心约 (col 12, row 6.4),石板平台 6.4×4.8 tile。
 * 原型用 dcx=12*T, dcy=6.4*T;尺寸 ±3.2T(宽 6.4T)、±2.4T(高 4.8T)。本仓直接用
 * tile 单位表达,绘制时乘 TILE。**纯装饰平台,不承载数据。**
 */
export const DAIS = {
  cx: 12,
  cy: 6.4,
  halfW: 3.2,
  halfH: 2.4,
} as const;

/**
 * 符文圈几何(room.jsx:74-84):双同心圆 + 12 辐条 + 十字轴,以指挥台中心为圆心。
 * 原型半径是 80px 空间的 150/108 px → 本仓 16px 空间除以 S。色 #36c5e0。静态描线。
 */
export const RUNE = {
  outer: 150 / PROP_OFFSET_SCALE, // 30
  inner: 108 / PROP_OFFSET_SCALE, // 21.6
  spokes: 12,
  color: 0x36c5e0,
} as const;

/**
 * 地毯径(room.jsx:59-63):南门(col 11.5,原型 rugX=10.6*T)→指挥台,宽 2.8 tile,
 * 深青底 + 金边 + 青色纹理条。原型矩形 (rugX, 7.4T) 宽 2.8T、高 6.2T;6 条青纹理条。
 * 用 tile 单位表达;绘制乘 TILE。**纯装饰。**
 */
export const CARPET = {
  x: 10.6,
  y: 7.4,
  w: 2.8,
  h: 6.2,
  stripes: 6,
  base: 0x14_46_56, // rgba(20,70,86) 深青底
  trim: 0xc8_a2_4a, // rgba(200,162,74) 金边
  weave: 0x36_c5_e0, // rgba(54,197,224) 青纹理条
} as const;

/** 北墙中央壁泉所在列(room.jsx:88-92 的 fx=11*T):回到 col 11 单个。 */
export const FOUNTAIN_COL = 11;

/**
 * 地板帧选择(room.jsx:38-42 的确定性 hash):floor_1 为主,少量 floor_2/floor_3。
 * 复用 holoHash 保证回放/测试一致。原型阈值 <0.84→floor_1, <0.93→floor_2, 否则 floor_3。
 */
export function floorTileAt(c: number, r: number): string {
  const h = holoHash(c * 3 + 1, r * 7 + 2);
  if (h < 0.84) return "floor_1";
  if (h < 0.93) return "floor_2";
  return "floor_3";
}
