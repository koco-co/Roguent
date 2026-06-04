import type { AnimatedSprite, Texture } from "pixi.js";
import { useEffect, useMemo, useRef } from "react";
import { anim, tex, useAtlas } from "./atlas";
import { COLS, DOOR_COL, FOUNTAIN_COLS, ROWS, TILE } from "./config";

// Deterministic per-tile floor variant: mostly plain, a few cracks/grates so
// the floor has texture without looking noisy or shimmering between renders.
function floorName(c: number, r: number): string {
  const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
  if (h % 100 < 86) return "floor_1";
  const variants = [
    "floor_2",
    "floor_3",
    "floor_4",
    "floor_5",
    "floor_6",
    "floor_7",
    "floor_8",
  ];
  return variants[h % variants.length] as string;
}

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
  return floorName(c, r);
}

function AnimatedDecor({
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

export function DungeonRoom() {
  const sheet = useAtlas();

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

  // Static floor props, placed in the periphery so they never sit under the
  // central agent ring.
  const props: { key: string; name: string; x: number; y: number }[] = [
    { key: "crate1", name: "crate", x: 3 * TILE, y: (ROWS - 3) * TILE },
    { key: "crate2", name: "crate", x: 4 * TILE, y: (ROWS - 3) * TILE },
    {
      key: "flaskA",
      name: "flask_big_blue",
      x: 3 * TILE,
      y: (ROWS - 4) * TILE,
    },
    { key: "flaskB", name: "flask_red", x: (COLS - 3) * TILE, y: 3 * TILE },
    { key: "skull", name: "skull", x: (COLS - 5) * TILE, y: (ROWS - 3) * TILE },
  ];

  return (
    <pixiContainer>
      {/* floor + brick border */}
      {tiles.map((t) => (
        <pixiSprite key={t.key} texture={tex(sheet, t.name)} x={t.x} y={t.y} />
      ))}

      {/* banners on the back-wall face */}
      {bannerCols.map((c, i) => (
        <pixiSprite
          key={`banner_${c}`}
          texture={tex(sheet, i === 0 ? "wall_banner_red" : "wall_banner_blue")}
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
            textures={anim(sheet, "wall_fountain_mid_blue_anim")}
            x={c * TILE}
            y={TILE}
            speed={0.12}
          />
          <AnimatedDecor
            textures={anim(sheet, "wall_fountain_basin_blue_anim")}
            x={c * TILE}
            y={2 * TILE}
            speed={0.12}
          />
        </pixiContainer>
      ))}

      {/* open archway doorway in the back wall — the spawn portal */}
      <pixiSprite
        texture={tex(sheet, "doors_leaf_open")}
        x={(DOOR_COL - 1) * TILE}
        y={0}
      />

      {/* stone columns framing the sides of the room */}
      <pixiSprite
        texture={tex(sheet, "column_wall")}
        x={1 * TILE}
        y={(ROWS - 5) * TILE}
      />
      <pixiSprite
        texture={tex(sheet, "column_wall")}
        x={(COLS - 2) * TILE}
        y={(ROWS - 5) * TILE}
      />

      {/* a treasure chest tucked in the corner */}
      <AnimatedDecor
        textures={anim(sheet, "chest_full_open_anim")}
        x={2 * TILE}
        y={3 * TILE}
        speed={0.06}
      />

      {/* scattered floor props */}
      {props.map((p) => (
        <pixiSprite key={p.key} texture={tex(sheet, p.name)} x={p.x} y={p.y} />
      ))}
    </pixiContainer>
  );
}
