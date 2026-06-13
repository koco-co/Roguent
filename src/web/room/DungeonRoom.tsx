import type { AnimatedSprite, Graphics, Texture } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettingsStore } from "../settings-store";
import { DecorLayer } from "./DecorLayer";
import { anim, tex, useAtlas } from "./atlas";
import { COLS, DOOR_COL, FOUNTAIN_COLS, ROWS, TILE } from "./config";
import { holoNodes } from "./holo";
import { CARPET, DAIS, RUNE, floorTileAt } from "./room-props";

// A wall tile name for the brick border. Top wall is two rows tall (cap + face)
// for a pseudo-3D look; the other sides are one tile. Interior cells return null
// so the caller can paint a hash-varied floor (floor_1 主 + 少量 floor_2/3)。
// 对标原型 room.jsx:38-42(确定性 hash 选 floor_1/2/3),不再是单一干净 floor_1。
function wallName(c: number, r: number): string | null {
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
  return null; // 内景地板 → 交给 floorTileAt 的确定性 hash
}

/**
 * An animated sprite pinned at (x,y). Memoize the `textures` array by the caller
 * — @pixi/react diffs it by reference, and a fresh array each render reassigns
 * `.textures` (gotoAndStop(0)), freezing the animation. Shared by DungeonRoom,
 * DecorLayer, and the overworld Hub fountain.
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

/**
 * 地毯径 + 中央指挥台 + 符文圈(原型 room.jsx:59-84)。一层 Graphics 全画完,层级在
 * 地板之上、道具/小人之下。**纯装饰,不承载数据。** 颜色照原型 hex;符文圈静态描线
 * (Pixi 下不强求旋转,reduced-motion 友好)。
 */
function DaisLayer() {
  const draw = useCallback((g: Graphics) => {
    g.clear();

    // ---- 地毯径:南门 → 指挥台,深青底 + 金边 + 青纹理条 ----
    const rugX = CARPET.x * TILE;
    const rugY = CARPET.y * TILE;
    const rugW = CARPET.w * TILE;
    const rugH = CARPET.h * TILE;
    g.rect(rugX, rugY, rugW, rugH).fill({ color: CARPET.base, alpha: 0.6 });
    // 金边:上沿一条 + 左右各一条立柱(原型 6px@80 → ~1.2px@16,用 1.2 描细边)
    const trim = 1.2;
    g.rect(rugX, rugY, rugW, trim).fill({ color: CARPET.trim, alpha: 0.55 });
    g.rect(rugX, rugY, trim, rugH).fill({ color: CARPET.trim, alpha: 0.55 });
    g.rect(rugX + rugW - trim, rugY, trim, rugH).fill({
      color: CARPET.trim,
      alpha: 0.55,
    });
    // 6 条青色纹理条(横向,等距下排)
    for (let i = 0; i < CARPET.stripes; i++) {
      g.rect(rugX + 2, (CARPET.y + 0.5 + i) * TILE, rugW - 4, 0.8).fill({
        color: CARPET.weave,
        alpha: 0.18,
      });
    }

    // ---- 中央指挥台:抬起的石板内嵌 + 亮青描边 + 金内框 ----
    const dcx = DAIS.cx * TILE;
    const dcy = DAIS.cy * TILE;
    const dw = DAIS.halfW * 2 * TILE;
    const dh = DAIS.halfH * 2 * TILE;
    const dx = dcx - DAIS.halfW * TILE;
    const dy = dcy - DAIS.halfH * TILE;
    // 深色石板内部
    g.rect(dx, dy, dw, dh).fill({ color: 0x0a1c22, alpha: 0.55 });
    // 亮青外描边(原型 lineWidth 4@80 → 0.8@16)
    g.rect(dx + 0.4, dy + 0.4, dw - 0.8, dh - 0.8).stroke({
      color: RUNE.color,
      alpha: 0.5,
      width: 0.8,
    });
    // 金内框(原型 内缩 10@80 → 2@16,lineWidth 2@80 → 0.4@16)
    g.rect(dx + 2, dy + 2, dw - 4, dh - 4).stroke({
      color: CARPET.trim,
      alpha: 0.35,
      width: 0.4,
    });

    // ---- 符文圈:双同心圆 + 12 辐条 + 十字轴(以指挥台中心为圆心)----
    const outer = RUNE.outer;
    const inner = RUNE.inner;
    // 外圈 + 内圈(原型 lineWidth 3@80 → 0.6@16)
    g.circle(dcx, dcy, outer).stroke({
      color: RUNE.color,
      alpha: 0.6,
      width: 0.6,
    });
    g.circle(dcx, dcy, inner).stroke({
      color: RUNE.color,
      alpha: 0.6,
      width: 0.6,
    });
    // 12 辐条:内圈 → 外圈(原型 lineWidth 2@80 → 0.4@16)
    for (let i = 0; i < RUNE.spokes; i++) {
      const a = (i / RUNE.spokes) * Math.PI * 2;
      g.moveTo(dcx + Math.cos(a) * inner, dcy + Math.sin(a) * inner)
        .lineTo(dcx + Math.cos(a) * outer, dcy + Math.sin(a) * outer)
        .stroke({ color: RUNE.color, alpha: 0.6, width: 0.4 });
    }
    // 十字轴(更暗一档)
    g.moveTo(dcx - outer, dcy)
      .lineTo(dcx + outer, dcy)
      .stroke({ color: RUNE.color, alpha: 0.3, width: 0.4 });
    g.moveTo(dcx, dcy - outer)
      .lineTo(dcx, dcy + outer)
      .stroke({ color: RUNE.color, alpha: 0.3, width: 0.4 });
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

  // 地板/墙 tile 表:墙用 wallName,内景地板用确定性 hash 选 floor_1/2/3。
  const tiles = useMemo(() => {
    const out: { key: string; name: string; x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        out.push({
          key: `${c}_${r}`,
          name: wallName(c, r) ?? floorTileAt(c, r),
          x: c * TILE,
          y: r * TILE,
        });
      }
    }
    return out;
  }, []);

  // 横幅回到原型 col 4 与 col 19,均 wall_banner_blue(原 col9/14 红+蓝 已还原)。
  const bannerCols = [4, COLS - 5];

  // holo 皮肤:暖木地砖/砖墙边框/横幅/壁泉/地毯/指挥台/符文/道具全部换成全息蓝甲板
  // (HoloFloor);只保留门(布局锚点)。对齐原型 holo 分支(只画全息地板)。
  const dungeon = skin !== "holo";

  return (
    <pixiContainer>
      {dungeon ? (
        <>
          {/* floor (hash 变化) + brick border */}
          {tiles.map((t) => (
            <pixiSprite
              key={t.key}
              texture={tex(sheet, t.name)}
              x={t.x}
              y={t.y}
            />
          ))}

          {/* banners on the back-wall face — both blue, cols 4 & 19 */}
          {bannerCols.map((c) => (
            <pixiSprite
              key={`banner_${c}`}
              texture={tex(sheet, "wall_banner_blue")}
              x={c * TILE}
              y={TILE}
            />
          ))}

          {/* 北墙中央壁泉(单个,col 11):top_1 + 动画 mid/basin */}
          {FOUNTAIN_COLS.map((c) => (
            <pixiContainer key={`fountain_${c}`}>
              <pixiSprite
                texture={tex(sheet, "wall_fountain_top_1")}
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

          {/* 地毯径 + 指挥台 + 符文圈(地板之上、道具/小人之下) */}
          <DaisLayer />
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

      {/* 角落宝箱已并入 DecorLayer 的 ROOM_PROPS(chest_empty_open_anim @6,12)。 */}

      <DecorLayer />
    </pixiContainer>
  );
}
