import { useMemo } from "react";
import { tex, useAtlas } from "../room/atlas";
import { TILE } from "../room/config";
import type { WorldModel } from "./worldgen";

// 对齐原型:大厅地板也只用单一干净 floor_1(同 DungeonRoom)。0x72 的 floor_2..8 是
// 裂纹/血迹 decal,散布会让地板发暗发脏(原型刻意只用一张干净砖)。
const FLOOR_TILE = "floor_1";

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
        const name = kind === "floor" ? FLOOR_TILE : wallName(isFloor, c, r);
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
