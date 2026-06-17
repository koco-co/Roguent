import { useTick } from "@pixi/react";
import type { Container, Graphics } from "pixi.js";
import { useCallback, useRef } from "react";
import type { IconName } from "../hud/icons";
import { HD_SCALE } from "./config";
import { drawIcon } from "./drawIcon";

// cell size: 0.75px per grid unit → 16-grid icon ≈ 12px wide。整体 ×HD_SCALE
// 让泡泡 / 图标随房间放大保持相对头部位置(裁决 9 同源)。
const CELL = 0.75 * HD_SCALE;
// The icon's top-left offset so it centres around (0, -2) inside the bubble.
// Icon grid is 16 wide → 16*CELL = 12px; centre x → -(12/2) = -6
// Icon grid is 16 tall → 16*CELL = 12px; centre y at -2 → -2 - 12/2 = -8
const ICON_OX = -6 * HD_SCALE;
const ICON_OY = -8 * HD_SCALE;

/**
 * A speech bubble over a character's head showing the current tool icon. Pops
 * in (scale 0→1) over ~6 frames with a faint bob, and rides along as a child of
 * the moving Character. Unmounts plainly when the tool ends (spec §6.2).
 */
export function ToolBubble({ icon }: { icon: IconName }) {
  const rootRef = useRef<Container | null>(null);
  const t = useRef(0);

  const bubble = useCallback((g: Graphics) => {
    g.clear();
    // rounded body — slightly taller than original to fit the icon cleanly
    g.setFillStyle({ color: 0x20202e, alpha: 0.92 });
    g.roundRect(
      -9 * HD_SCALE,
      -9 * HD_SCALE,
      18 * HD_SCALE,
      16 * HD_SCALE,
      4 * HD_SCALE,
    );
    g.fill();
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.85 });
    g.roundRect(
      -9 * HD_SCALE,
      -9 * HD_SCALE,
      18 * HD_SCALE,
      16 * HD_SCALE,
      4 * HD_SCALE,
    );
    g.stroke();
    // little downward tail anchoring the bubble to the head
    g.setFillStyle({ color: 0x20202e, alpha: 0.92 });
    g.poly([-3, 6, 3, 6, 0, 11].map((v) => v * HD_SCALE));
    g.fill();
  }, []);

  const iconDraw = useCallback(
    (g: Graphics) => {
      g.clear();
      drawIcon(g, icon, CELL, ICON_OX, ICON_OY);
    },
    [icon],
  );

  useTick((ticker: { deltaTime: number }) => {
    const c = rootRef.current;
    if (!c) return;
    t.current += ticker.deltaTime;
    // pop-in over ~6 frames with a soft ease-out overshoot
    const s = Math.min(1, t.current / 6);
    c.scale.set(1 - (1 - s) ** 3);
    c.y = -26 * HD_SCALE + Math.sin(t.current * 0.08) * 1.2 * HD_SCALE; // faint bob
  });

  return (
    <pixiContainer ref={rootRef} y={-26 * HD_SCALE} scale={0}>
      <pixiGraphics draw={bubble} />
      <pixiGraphics draw={iconDraw} />
    </pixiContainer>
  );
}
