import type { AtlasDom } from "./atlas-dom";
import { drawFrame } from "./atlas-image";

// 大厅地面绘制 — 逐段 port 原型 Prototype/roguent/project/roguent/room.jsx paintHub:
// 草坪打底 + 中央八角石板广场/车道 + 北城墙挂旗 + 落地道具 + 程序化花草。
// 常量/坐标与原型一字不改;所有随机用确定性 hash,禁 Math.random(重绘必须可复现)。

export const COLS = 24;
export const ROWS = 14;
const TILE = 16;
const S = 5;
const T = TILE * S; // 80px 瓦片

/** 原型同款逐格伪随机(room.jsx 顶部 hash):确定性,值域 [0,1)。 */
export function hash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h < 0 ? -h : h) % 997;
  return h / 997;
}

/** 石板布尔图:中央八角广场 + 9 个建筑 pad + 宽 2 车道(room.jsx:121-141)。 */
export function buildStoneMap(): boolean[][] {
  const stone: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) stone.push(new Array(COLS).fill(false));
  const set = (c: number, r: number, v: boolean) => {
    const row = stone[r];
    if (row && c >= 0 && c < COLS) row[c] = v;
  };
  const rect = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++)
        set(c, r, true);
  };
  // 中央八角广场(塔在 ~12,6)
  rect(9, 4, 15, 9);
  // 四角抠掉 → 八角;切角内一格补回斜边
  set(9, 4, false);
  set(15, 4, false);
  set(9, 9, false);
  set(15, 9, false);
  set(9, 5, true);
  set(15, 5, true);
  set(9, 8, true);
  set(15, 8, true);
  // 建筑 pad(3 宽 × 2 高,居中在每座建筑脚下)
  const pad = (cx: number, ry: number) => rect(cx - 1, ry, cx + 1, ry + 1);
  pad(8, 2);
  pad(12, 1);
  pad(16, 2); // achievements · altar · mailbox(北)
  pad(4, 5);
  pad(19, 5); // ranking · shop(中侧)
  pad(4, 9);
  pad(20, 9); // announce · gacha(下侧)
  pad(3, 11);
  pad(21, 11); // claude · codex 门(底)
  // 连接车道(宽 2)
  rect(7, 2, 8, 4);
  rect(11, 2, 12, 4);
  rect(15, 2, 16, 4); // 北支道 → 广场
  rect(4, 5, 9, 6);
  rect(15, 5, 19, 6); // 中大道(rank · 广场 · shop)
  rect(4, 6, 5, 9);
  rect(19, 6, 20, 9); // 两侧下行
  rect(4, 9, 5, 11);
  rect(20, 9, 21, 11); // 下排 → 门 pad
  rect(11, 9, 12, 11); // 广场 → 南门
  // 广场大南阶
  rect(10, 9, 13, 10);
  return stone;
}

/** 把大厅地面整张画到 ctx(canvas 1920×1120);atlas img 须已 loadAtlasImage 就绪。 */
export function paintHub(ctx: CanvasRenderingContext2D, atlas: AtlasDom): void {
  const den = 1; // 花草密度固定 1(原型 density 入参,本项目不开 tweaks)
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#2c4d24"; // 深草底
  ctx.fillRect(0, 0, w, h);

  const df = (name: string, dx: number, dy: number) =>
    drawFrame(ctx, atlas.frames, name, dx, dy, S);

  const stone = buildStoneMap();
  const isS = (c: number, r: number) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS && (stone[r]?.[c] ?? false);

  // ---- 草地层:全图 grass + 确定性斑驳(别铺 grass2 土块,读作垃圾)----
  for (let r = 2; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      df("grass", c * T, r * T);
      const shade = hash(c * 13 + 2, r * 7 + 5);
      if (shade < 0.26) {
        ctx.fillStyle = `rgba(22,48,18,${(0.07 + shade * 0.2).toFixed(3)})`;
        ctx.fillRect(c * T, r * T, T, T);
      } else if (shade > 0.94) {
        ctx.fillStyle = "rgba(160,205,115,.10)";
        ctx.fillRect(c * T, r * T, T, T);
      }
    }
  }

  // ---- 石板层:edge-* 自动接边 + floor_1/2/3 变化 + 暖色 wash ----
  for (let r = 2; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isS(c, r)) continue;
      const N = !isS(c, r - 1);
      const So = !isS(c, r + 1);
      const W = !isS(c - 1, r);
      const E = !isS(c + 1, r);
      let tile: string;
      if (N && W) tile = "edge-tl";
      else if (N && E) tile = "edge-tr";
      else if (So && W) tile = "edge-bl";
      else if (So && E) tile = "edge-br";
      else if (N) tile = "edge-top";
      else if (So) tile = "edge-bottom";
      else if (W) tile = "edge-left";
      else if (E) tile = "edge-right";
      else {
        const hv = hash(c * 3 + 1, r * 7 + 2);
        tile = hv < 0.84 ? "floor_1" : hv < 0.93 ? "floor_2" : "floor_3";
      }
      df(tile, c * T, r * T);
      // 暖石板 wash:让广场读作夯土而不是黑坑
      const wm = hash(c * 7 + 3, r * 5 + 1);
      ctx.fillStyle = `rgba(178,134,84,${(0.42 + wm * 0.12).toFixed(3)})`;
      ctx.fillRect(c * T, r * T, T, T);
      if (wm > 0.86) {
        ctx.fillStyle = "rgba(208,176,128,.22)";
        ctx.fillRect(c * T + 6, r * T + 6, T - 12, T - 12); // 浅色铺面斑点
      }
    }
  }
  // 石板南缘在草地上的软投影(纵深感)
  ctx.fillStyle = "rgba(16,30,12,.30)";
  for (let r = 2; r < ROWS - 1; r++)
    for (let c = 0; c < COLS; c++)
      if (isS(c, r) && !isS(c, r + 1)) ctx.fillRect(c * T, (r + 1) * T, T, 12);

  // ---- 北城墙 + 顶帽 + 挂旗 ----
  for (let c = 0; c < COLS; c++) {
    df("wall_mid", c * T, 0);
    df("wall_mid", c * T, T);
    df("wall_top_mid", c * T, -6);
  }
  ctx.fillStyle = "rgba(0,0,0,.30)";
  ctx.fillRect(0, 2 * T, w, 12);
  df("wall_banner_yellow", 4 * T, T * 0.55);
  df("wall_banner_blue", 11.5 * T, T * 0.55);
  df("wall_banner_green", 19 * T, T * 0.55);

  // ---- 草缘落地道具(避开建筑与小人活动区)----
  const at = (name: string, c: number, r: number, ox = 0, oy = 0) =>
    df(name, c * T + ox, r * T + oy);
  // 左上储物堆
  at("crate", 2, 3);
  at("crate", 3, 3);
  at("crate", 2, 2, 0, 6);
  at("skull", 3, 4, 18, 30);
  // 商店旁的炼金杂物
  at("flask_big_green", 22, 4, 8, 10);
  at("flask_big_red", 22, 5, 2, 0);
  at("flask_big_blue", 23, 4, 2, 34);
  // 建筑间隙的木箱
  at("crate", 7, 9, 10, 0);
  at("crate", 16, 9, 4, 0);
  // 扭蛋旁的宝物闪光
  at("chest_full_open_anim_f0", 22, 8, 6, 10);
  at("coin_anim_f0", 21, 8, 30, 40);
  at("coin_anim_f0", 22, 9, 12, 2);
  // 南院的孤箱
  at("chest_empty_open_anim_f0", 8, 12, 20, 8);
  at("coin_anim_f0", 15, 12, 30, 18);

  // ---- 程序化花园:花簇与岩石填空草坪(sites 避让建筑/塔)----
  const FLOR = ["#ff5a6a", "#f2c84b", "#7fd0ff", "#c98bff", "#ff9ed2"];
  const flower = (px: number, py: number, color: string) => {
    ctx.fillStyle = "#2f5e22";
    ctx.fillRect(px + 3, py + 6, 2, 6); // 茎
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, 6, 6);
    ctx.fillRect(px, py + 2, 8, 4);
    ctx.fillRect(px + 2, py, 4, 8); // 花瓣
    ctx.fillStyle = "#fff3c8";
    ctx.fillRect(px + 3, py + 3, 2, 2); // 花心
  };
  const rock = (px: number, py: number) => {
    ctx.fillStyle = "#6b6b73";
    ctx.fillRect(px, py + 3, 16, 7);
    ctx.fillRect(px + 3, py, 11, 5);
    ctx.fillStyle = "#8c8c95";
    ctx.fillRect(px + 3, py + 2, 7, 3); // 高光
    ctx.fillStyle = "#3f3f47";
    ctx.fillRect(px, py + 9, 16, 2); // 底影
  };
  // 每座建筑周边留净空,装饰永不压结构/标签
  const sites: Array<[number, number]> = [
    [8, 2],
    [12, 1],
    [16, 2],
    [4, 5],
    [19, 5],
    [4, 9],
    [20, 9],
    [3, 11],
    [21, 11],
    [12, 6],
  ];
  const clearOf = (c: number, r: number) =>
    sites.some(([sc, sr]) => Math.abs(c - sc) <= 1 && Math.abs(r - sr) <= 2);
  for (let r = 3; r < ROWS; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (isS(c, r) || clearOf(c, r)) continue;
      const hf = hash(c * 17 + 5, r * 23 + 7);
      if (hf > 1 - 0.1 * den) {
        // 花簇
        const n = 2 + Math.floor(hash(c * 4, r * 9) * 2);
        for (let k = 0; k < n; k++) {
          const ox = 8 + Math.floor(hash(c * 7 + k * 3, r * 5 + k) * 52);
          const oy = 14 + Math.floor(hash(c * 11 + k, r * 13 + k * 2) * 46);
          flower(
            c * T + ox,
            r * T + oy,
            FLOR[Math.floor(hash(c + k * 5, r + k * 7) * FLOR.length)] ??
              "#ff5a6a",
          );
        }
      } else if (hf > 1 - 0.14 * den) {
        // 岩石
        rock(
          c * T + 18 + Math.floor(hash(c * 3, r * 8) * 40),
          r * T + 30 + Math.floor(hash(c * 9, r * 4) * 34),
        );
      }
    }
  }
}
