import { DOOR_COL, FOUNTAIN_COLS, TILE } from "./config";
import { glowTexture, vignetteTexture } from "./effects";

interface Light {
  key: string;
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
}

function Glow({ x, y, radius, color, alpha }: Omit<Light, "key">) {
  return (
    <pixiSprite
      texture={glowTexture()}
      anchor={0.5}
      x={x}
      y={y}
      scale={radius / 64}
      tint={color}
      alpha={alpha}
      blendMode="add"
    />
  );
}

/**
 * Static additive light pools (room space): doorway + fountains. Each
 * character's warm glow now lives inside Character so it follows along as the
 * character moves (spec §5).
 */
export function GlowLayer({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;
  const statics: Light[] = [
    {
      key: "door",
      x: DOOR_COL * TILE,
      y: 1.4 * TILE,
      radius: 36,
      color: 0x6fd8ff,
      alpha: 0.45,
    },
    ...FOUNTAIN_COLS.map((c) => ({
      key: `fountain_${c}`,
      x: c * TILE + 8,
      y: 2.4 * TILE,
      radius: 22,
      color: 0x4fd6ff,
      alpha: 0.5,
    })),
  ];
  return (
    <pixiContainer>
      {statics.map((l) => (
        <Glow
          key={l.key}
          x={l.x}
          y={l.y}
          radius={l.radius}
          color={l.color}
          alpha={l.alpha}
        />
      ))}
    </pixiContainer>
  );
}

/** Screen-space vignette stretched over the whole canvas. */
export function Vignette({ w, h }: { w: number; h: number }) {
  return (
    <pixiSprite texture={vignetteTexture()} x={0} y={0} width={w} height={h} />
  );
}
