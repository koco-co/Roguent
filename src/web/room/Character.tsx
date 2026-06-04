import type { AnimatedSprite, Graphics, TextStyle } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { anim, useAtlas } from "./atlas";

export function Character({
  x,
  y,
  heroBase,
  working,
  isLead,
  icon,
  onSelect,
}: {
  x: number;
  y: number;
  heroBase: string;
  working: boolean;
  isLead: boolean;
  icon: string;
  onSelect?: () => void;
}) {
  const sheet = useAtlas();
  const frames = useMemo(
    () => anim(sheet, `${heroBase}_idle_anim`),
    [sheet, heroBase],
  );
  const spriteRef = useRef<AnimatedSprite | null>(null);

  useEffect(() => {
    const s = spriteRef.current;
    if (!s) return;
    s.anchor.set(0.5, 1); // feet planted on (x, y)
    s.animationSpeed = working ? 0.18 : 0.1;
    s.play();
  }, [working]);

  const shadow = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x000000, alpha: 0.35 });
    g.ellipse(0, 0, 7, 3);
    g.fill();
  }, []);

  const leadRing = useCallback((g: Graphics) => {
    g.clear();
    g.setStrokeStyle({ width: 1, color: 0xffd166, alpha: 0.9 });
    g.ellipse(0, 0, 9, 4);
    g.stroke();
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: PixiJS canvas element — keyboard a11y not applicable
    <pixiContainer
      x={x}
      y={y}
      eventMode="static"
      cursor="pointer"
      onClick={onSelect}
    >
      <pixiGraphics y={1} draw={shadow} />
      {isLead ? <pixiGraphics draw={leadRing} /> : null}
      <pixiAnimatedSprite ref={spriteRef} textures={frames} />
      {icon ? (
        <pixiText
          text={icon}
          anchor={0.5}
          y={-22}
          resolution={4}
          style={{ fontSize: 9 } as Partial<TextStyle>}
        />
      ) : null}
    </pixiContainer>
  );
}
