import type { Graphics, TextStyle } from "pixi.js";
import { useCallback } from "react";

export function Character({
  x,
  y,
  color,
  icon,
  isLead,
  onSelect,
}: {
  x: number;
  y: number;
  color: number;
  icon: string;
  isLead: boolean;
  onSelect?: () => void;
}) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.setFillStyle({ color: 0x000000, alpha: 0.4 });
      g.ellipse(0, 16, 14, 4);
      g.fill();
      g.setFillStyle({ color });
      g.roundRect(-9, -2, 18, 16, 4);
      g.fill();
      g.setFillStyle({ color: 0xffe0b8 });
      g.roundRect(-8, -18, 16, 14, 5);
      g.fill();
      if (isLead) {
        g.setStrokeStyle({ width: 2, color: 0xffffff });
        g.roundRect(-8, -18, 16, 14, 5);
        g.stroke();
      }
    },
    [color, isLead],
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: PixiJS canvas element — keyboard a11y not applicable
    <pixiContainer
      x={x}
      y={y}
      eventMode="static"
      cursor="pointer"
      onClick={onSelect}
    >
      <pixiGraphics draw={draw} />
      {icon ? (
        <pixiText
          text={icon}
          anchor={0.5}
          y={-32}
          style={{ fontSize: 14 } as Partial<TextStyle>}
        />
      ) : null}
    </pixiContainer>
  );
}
