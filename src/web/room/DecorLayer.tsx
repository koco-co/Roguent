import type { Graphics } from "pixi.js";
import { useCallback } from "react";
import { tex, useAtlas } from "./atlas";
import { COLS, ROWS, TILE } from "./config";

const PROPS: { key: string; name: string; x: number; y: number }[] = [
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

export function DecorLayer() {
  const sheet = useAtlas();
  const drawFloorAccents = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x120d17, alpha: 0.22 });
    g.rect(3 * TILE, 4 * TILE, 18 * TILE, 1);
    g.rect(3 * TILE, (ROWS - 3) * TILE - 1, 18 * TILE, 1);
    g.rect(5 * TILE, 6 * TILE, 14 * TILE, 2);
    g.fill();

    g.setFillStyle({ color: 0x5fd3d8, alpha: 0.08 });
    g.rect(7 * TILE, 4 * TILE, 10 * TILE, 1);
    g.rect(8 * TILE, 5 * TILE, 8 * TILE, 1);
    g.fill();
  }, []);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawFloorAccents} />
      {PROPS.map((p) => (
        <pixiSprite key={p.key} texture={tex(sheet, p.name)} x={p.x} y={p.y} />
      ))}
    </pixiContainer>
  );
}
