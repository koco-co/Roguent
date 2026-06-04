import { useMemo } from "react";
import { tex, useAtlas } from "../room/atlas";
import { TILE } from "../room/config";
import type { WorldModel } from "./worldgen";

// Deterministic per-tile floor variant (same scheme as the interior DungeonRoom):
// mostly plain, a few cracks/grates so the floor has texture without shimmering.
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
  return variants[h % variants.length] ?? "floor_1";
}

/**
 * Pick a 0x72 wall frame for a wall tile by looking at its 4 orthogonal floor
 * neighbours: a wall with floor to its right is a left-side wall, floor to its
 * left a right-side wall, and everything else (top/bottom/corner/corridor wall)
 * uses the brick face. A 1-tile wall shell + this autotiling reads as a coherent
 * top-down dungeon; exact relief is tuned in-browser (spec §架构).
 */
function wallName(
  isFloor: (c: number, r: number) => boolean,
  c: number,
  r: number,
): string {
  const e = isFloor(c + 1, r);
  const w = isFloor(c - 1, r);
  if (e && !w) return "wall_left";
  if (w && !e) return "wall_right";
  return "wall_mid";
}

interface TileSprite {
  key: string;
  name: string;
  x: number;
  y: number;
}

/**
 * Renders the generated tile grid (floor + brick walls) for the overworld. Pure
 * presentational: the sprite list is memoized off the world model so it only
 * rebuilds when the world geometry changes, never per camera/store tick. Sits
 * inside the camera-driven world container, so its coordinates are world px.
 */
export function WorldTilemap({ world }: { world: WorldModel }) {
  const sheet = useAtlas();
  const { cols, rows, tiles } = world;

  const sprites = useMemo<TileSprite[]>(() => {
    const isFloor = (c: number, r: number) =>
      c >= 0 &&
      c < cols &&
      r >= 0 &&
      r < rows &&
      tiles[r * cols + c] === "floor";
    const out: TileSprite[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = tiles[r * cols + c];
        if (kind === "void" || kind === undefined) continue; // dark background shows through
        const name =
          kind === "floor" ? floorName(c, r) : wallName(isFloor, c, r);
        out.push({ key: `${c}_${r}`, name, x: c * TILE, y: r * TILE });
      }
    }
    return out;
  }, [cols, rows, tiles]);

  return (
    <pixiContainer>
      {sprites.map((t) => (
        <pixiSprite key={t.key} texture={tex(sheet, t.name)} x={t.x} y={t.y} />
      ))}
    </pixiContainer>
  );
}
