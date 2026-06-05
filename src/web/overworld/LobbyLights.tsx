import { glowTexture } from "../room/effects";
import type { WorldModel } from "./worldgen";

/** 大厅环境光:Hub 地标暖光 + 每个 project 房门口冷光。world 空间,挂在相机容器内。 */
export function LobbyLights({ world }: { world: WorldModel }) {
  const gTex = glowTexture();
  const lights = [
    {
      key: "hub",
      x: world.hub.anchorPx.x,
      y: world.hub.anchorPx.y,
      r: 48,
      tint: 0xffd166,
      a: 0.4,
    },
    ...world.rooms.map((rm) => ({
      key: `door_${rm.projectId}`,
      x: rm.doorPx.x,
      y: rm.doorPx.y,
      r: 30,
      tint: 0x6fd8ff,
      a: 0.32,
    })),
  ];
  return (
    <pixiContainer>
      {lights.map((l) => (
        <pixiSprite
          key={l.key}
          texture={gTex}
          anchor={0.5}
          x={l.x}
          y={l.y}
          scale={l.r / 64}
          tint={l.tint}
          alpha={l.a}
          blendMode="add"
        />
      ))}
    </pixiContainer>
  );
}
