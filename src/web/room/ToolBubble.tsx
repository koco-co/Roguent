import { useTick } from "@pixi/react";
import type { Container, Graphics, TextStyle } from "pixi.js";
import { useCallback, useRef } from "react";

/**
 * A speech bubble over a character's head showing the current tool emoji. Pops
 * in (scale 0→1) over ~6 frames with a faint bob, and rides along as a child of
 * the moving Character. Unmounts plainly when the tool ends (spec §6.2).
 */
export function ToolBubble({ icon }: { icon: string }) {
  const rootRef = useRef<Container | null>(null);
  const t = useRef(0);

  const bubble = useCallback((g: Graphics) => {
    g.clear();
    // rounded body
    g.setFillStyle({ color: 0x20202e, alpha: 0.92 });
    g.roundRect(-9, -9, 18, 14, 4);
    g.fill();
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.85 });
    g.roundRect(-9, -9, 18, 14, 4);
    g.stroke();
    // little downward tail anchoring the bubble to the head
    g.setFillStyle({ color: 0x20202e, alpha: 0.92 });
    g.poly([-3, 4, 3, 4, 0, 9]);
    g.fill();
  }, []);

  useTick((ticker: { deltaTime: number }) => {
    const c = rootRef.current;
    if (!c) return;
    t.current += ticker.deltaTime;
    // pop-in over ~6 frames with a soft ease-out overshoot
    const s = Math.min(1, t.current / 6);
    c.scale.set(1 - (1 - s) ** 3);
    c.y = -26 + Math.sin(t.current * 0.08) * 1.2; // faint bob
  });

  return (
    <pixiContainer ref={rootRef} y={-26} scale={0}>
      <pixiGraphics draw={bubble} />
      <pixiText
        text={icon}
        anchor={0.5}
        y={-2}
        resolution={4}
        style={{ fontSize: 9 } as Partial<TextStyle>}
      />
    </pixiContainer>
  );
}
