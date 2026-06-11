import type { AnimatedSprite, Graphics, Texture } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettingsStore } from "../settings-store";
import { DecorLayer } from "./DecorLayer";
import { anim, tex, useAtlas } from "./atlas";
import { COLS, DOOR_COL, FOUNTAIN_COLS, ROWS, TILE } from "./config";
import { holoNodes } from "./holo";

// 原型 room.jsx 刻意只用单一干净 floor_1(注释明写 "single clean tile"):0x72 的
// floor_2..8 是裂纹/血迹/格栅 decal,散布会让地板发暗、发脏、跳花——设计稿的交互记录
// 里专门把它们清掉了。这里对齐原型,全室一张干净暖调地砖。
const FLOOR_TILE = "floor_1"; // 0x72 干净暖调地砖(单砖)

// A wall/floor tile name for the brick border + interior floor. Top wall is two
// rows tall (cap + face) for a pseudo-3D look; the other sides are one tile.
function structureName(c: number, r: number): string {
  const last = COLS - 1;
  if (r === 0) {
    if (c === 0) return "wall_top_left";
    if (c === last) return "wall_top_right";
    return "wall_top_mid";
  }
  if (r === 1 || r === ROWS - 1) {
    if (c === 0) return "wall_left";
    if (c === last) return "wall_right";
    return "wall_mid";
  }
  if (c === 0) return "wall_left";
  if (c === last) return "wall_right";
  return FLOOR_TILE;
}

/**
 * An animated sprite pinned at (x,y). Memoize the `textures` array by the caller
 * — @pixi/react diffs it by reference, and a fresh array each render reassigns
 * `.textures` (gotoAndStop(0)), freezing the animation. Shared by DungeonRoom
 * and the overworld Hub fountain.
 */
export function AnimatedDecor({
  textures,
  x,
  y,
  speed = 0.1,
}: {
  textures: Texture[];
  x: number;
  y: number;
  speed?: number;
}) {
  const ref = useRef<AnimatedSprite | null>(null);
  useEffect(() => {
    const s = ref.current;
    if (s) {
      s.animationSpeed = speed;
      s.play();
    }
  }, [speed]);
  return <pixiAnimatedSprite ref={ref} textures={textures} x={x} y={y} />;
}

// holo 皮肤的地板:全息蓝甲板 + 发光网格 + 稀疏节点 + 顶部能量墙带。
// 对标设计 room.jsx 的 holo canvas 分支(navy deck + glowing grid + nodes)。
// 适配差异:真实内景是单张 Pixi canvas(地板+小人同画布),整体 CSS 滤镜会二次染色
// 这层 graphics,故 holo 地板直接用目标青色绘制,Pixi 端不加 CSS 滤镜。
function HoloFloor() {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const W = COLS * TILE;
    const H = ROWS * TILE;
    // navy deck base + 顶部更深一档的能量墙底
    g.rect(0, 0, W, H).fill(0x091628);
    g.rect(0, 0, W, 2 * TILE).fill(0x0a1c2e);
    // 能量墙带:亮青边沿 + 半透青晕
    g.rect(0, 2 * TILE - 3, W, 3).fill({ color: 0x36c5e0, alpha: 0.5 });
    g.rect(0, 2 * TILE, W, 16).fill({ color: 0x36c5e0, alpha: 0.14 });
    // 纵向网格线(列):微微随列号摆动的青色
    for (let c = 0; c <= COLS; c++) {
      const a = 0.1 + 0.05 + 0.05 * Math.sin(c * 0.7);
      g.moveTo(c * TILE, 2 * TILE)
        .lineTo(c * TILE, H)
        .stroke({ color: 0x36c5e0, alpha: a, width: 1 });
    }
    // 横向网格线(行):越往后(深)越亮,营造透视景深
    for (let r = 2; r <= ROWS; r++) {
      const dep = (r - 2) / (ROWS - 2);
      g.moveTo(0, r * TILE)
        .lineTo(W, r * TILE)
        .stroke({ color: 0x36c5e0, alpha: 0.06 + dep * 0.16, width: 1 });
    }
    // 稀疏发光交点(确定性 hash,可回放一致)
    for (const n of holoNodes(COLS, ROWS)) {
      g.rect(n.c * TILE - 2, n.r * TILE - 2, 4, 4).fill({
        color: 0x5fe0ff,
        alpha: n.a,
      });
    }
  }, []);
  return <pixiGraphics draw={draw} />;
}

export function DungeonRoom() {
  const sheet = useAtlas();
  const skin = useSettingsStore((s) => s.skin);

  // Memoize the animated frame sets so their array references stay stable.
  // @pixi/react diffs the `textures` prop by reference; a fresh array each
  // render makes PixiJS reassign `.textures`, which calls gotoAndStop(0) and
  // freezes the decor on every store-driven Scene re-render.
  const fountainMid = useMemo(
    () => anim(sheet, "wall_fountain_mid_blue_anim"),
    [sheet],
  );
  const fountainBasin = useMemo(
    () => anim(sheet, "wall_fountain_basin_blue_anim"),
    [sheet],
  );
  const chestFrames = useMemo(
    () => anim(sheet, "chest_full_open_anim"),
    [sheet],
  );

  const tiles = useMemo(() => {
    const out: { key: string; name: string; x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        out.push({
          key: `${c}_${r}`,
          name: structureName(c, r),
          x: c * TILE,
          y: r * TILE,
        });
      }
    }
    return out;
  }, []);

  const bannerCols = [DOOR_COL - 3, DOOR_COL + 2];

  // holo 皮肤:暖木地砖/砖墙边框/横幅/壁泉换成全息蓝甲板(HoloFloor),
  // 但门/宝箱/DecorLayer 保留(它们是布局锚点 + 道具,holo 下仍成立)。
  const dungeonFloor = skin !== "holo";

  return (
    <pixiContainer>
      {dungeonFloor ? (
        <>
          {/* floor + brick border */}
          {tiles.map((t) => (
            <pixiSprite
              key={t.key}
              texture={tex(sheet, t.name)}
              x={t.x}
              y={t.y}
            />
          ))}

          {/* banners on the back-wall face */}
          {bannerCols.map((c, i) => (
            <pixiSprite
              key={`banner_${c}`}
              texture={tex(
                sheet,
                i === 0 ? "wall_banner_red" : "wall_banner_blue",
              )}
              x={c * TILE}
              y={TILE}
            />
          ))}

          {/* animated wall fountains (top + mid + basin) */}
          {FOUNTAIN_COLS.map((c) => (
            <pixiContainer key={`fountain_${c}`}>
              <pixiSprite
                texture={tex(sheet, "wall_fountain_top_2")}
                x={c * TILE}
                y={0}
              />
              <AnimatedDecor
                textures={fountainMid}
                x={c * TILE}
                y={TILE}
                speed={0.12}
              />
              <AnimatedDecor
                textures={fountainBasin}
                x={c * TILE}
                y={2 * TILE}
                speed={0.12}
              />
            </pixiContainer>
          ))}
        </>
      ) : (
        <HoloFloor />
      )}

      {/* open archway doorway in the back wall — the spawn portal */}
      <pixiSprite
        texture={tex(sheet, "doors_leaf_open")}
        x={(DOOR_COL - 1) * TILE}
        y={0}
      />

      {/* 侧柱已移除:原型 room.jsx 注「frame mis-slices in this atlas mirror」专门
          删掉了 column_wall(误切成花),这里对齐原型不再渲染。 */}

      {/* a treasure chest tucked in the corner */}
      <AnimatedDecor
        textures={chestFrames}
        x={2 * TILE}
        y={3 * TILE}
        speed={0.06}
      />

      <DecorLayer />
    </pixiContainer>
  );
}
