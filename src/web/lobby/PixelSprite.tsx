import type React from "react";
import { type AtlasDom, useAtlasDom } from "./atlas-dom";
import { useSpriteTick } from "./sprite-tick";

// DOM 像素精灵,移植自原型 sprites.jsx 的 PixelSprite:用 CSS background-position 从
// dungeon.png 切片缩放(nearest-neighbor 保脆),几十个共用一个低频 ticker。
// 大厅 avatar / 漫步小人 / 门 / 喷泉用它;内景仍走 Pixi。
//
// 帧像素随选中 artpack 变(大厅走 `resolveCurrentArtPackAtlasUrls`):pixel-fantasy
// 16px,neon/synthwave 是 HD(16*HD_SCALE=40px)。`scale` 是相对 16px 契约的 CSS 放大
// 倍数,call site 都按 16px 帧传(如 scale=4 → 64px)。所以这里按实际帧的 HD 因子
// 归一:effectiveScale = scale / (帧px/16),让物理视觉大小不随 artpack 改变。

// 16px 契约里 knight/floor 帧宽都是 16;HD 烤出来宽 40。HD 因子 = 实际帧宽 / 16。
const CONTRACT_TILE_PX = 16;

/** atlas 的 HD 因子(帧px / 16):用稳定参照帧 knight_m_idle_anim_f0 估;缺失退回 1。 */
function atlasHdFactor(atlas: AtlasDom): number {
  const ref = atlas.frames.knight_m_idle_anim_f0 ?? atlas.frames.floor_1;
  if (!ref) return 1;
  return ref.w / CONTRACT_TILE_PX;
}

/** 解析角色 base + 动作(idle/run/hit)对应的帧名列表(已去 .png),按数字排序。 */
function framesFor(
  frames: Record<string, unknown>,
  base: string,
  kind: string,
): string[] {
  const keys = Object.keys(frames);
  const byNum = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true });
  let list = keys
    .filter((k) => k.startsWith(`${base}_${kind}_anim_f`))
    .sort(byNum);
  if (list.length) return list;
  list = keys
    .filter((k) => k.startsWith(`${base}_${kind}_f`) && /_f\d+$/.test(k))
    .sort(byNum);
  if (list.length) return list;
  if (frames[`${base}_${kind}`]) return [`${base}_${kind}`];
  if (frames[base]) return [base];
  list = keys.filter((k) => k.startsWith(`${base}_idle`)).sort(byNum);
  return list.length
    ? list
    : [keys.find((k) => k.startsWith(base)) ?? "knight_m_idle_anim_f0"];
}

interface PixelSpriteProps {
  /** 直接指定单帧名(优先于 base/anim),如 "doors_leaf_closed"。 */
  name?: string;
  /** 角色 base,如 "knight_m";配 anim 取动画帧。 */
  base?: string;
  anim?: string;
  scale?: number;
  fps?: number;
  flip?: boolean;
  animated?: boolean;
  filter?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** DOM 像素精灵:CSS 切片 0x72 atlas,支持动画/翻转/滤镜(金色主控等)。 */
export function PixelSprite({
  name,
  base,
  anim = "idle",
  scale = 4,
  fps = 6,
  flip = false,
  animated = true,
  filter,
  className = "",
  style,
}: PixelSpriteProps) {
  const atlas = useAtlasDom();
  const t = useSpriteTick();
  if (!atlas) return null;
  const list = name
    ? [name]
    : framesFor(atlas.frames, base ?? "knight_m", anim);
  let idx = 0;
  if (animated && list.length > 1) {
    const step = Math.max(1, Math.round(6 / fps));
    idx = Math.floor(t / step) % list.length;
  }
  const key = list[idx] ?? list[0];
  const fr = key ? atlas.frames[key] : undefined;
  if (!fr) return null;
  // 按帧的 HD 因子归一:call site 的 scale 是相对 16px 帧的放大;HD 帧(40px)下
  // 除以 2.5 抵消,物理视觉大小不随 artpack 改变。
  const eScale = scale / atlasHdFactor(atlas);
  return (
    <div
      className={`pxsprite${className ? ` ${className}` : ""}`}
      style={{
        width: fr.w * eScale,
        height: fr.h * eScale,
        backgroundImage: `url(${atlas.imageUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `${-fr.x * eScale}px ${-fr.y * eScale}px`,
        backgroundSize: `${atlas.w * eScale}px ${atlas.h * eScale}px`,
        imageRendering: "pixelated",
        transform: flip ? "scaleX(-1)" : undefined,
        filter,
        ...style,
      }}
    />
  );
}
