import type { Graphics } from "pixi.js";
import { useCallback } from "react";

export function Portal({ x, y }: { x: number; y: number }) {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.setStrokeStyle({ width: 2, color: 0x00ffe7 });
    g.ellipse(0, 0, 26, 11);
    g.stroke();
    g.setFillStyle({ color: 0x00ffe7, alpha: 0.35 });
    g.ellipse(0, 0, 20, 8);
    g.fill();
  }, []);
  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
}
