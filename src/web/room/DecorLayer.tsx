import { useMemo } from "react";
import { useSettingsStore } from "../settings-store";
import { AnimatedDecor } from "./DungeonRoom";
import { anim, tex, useAtlas } from "./atlas";
import { TILE } from "./config";
import { ROOM_PROPS } from "./room-props";

// 落地道具层,逐项对照设计原型 room.jsx:93-106(坐标见 room-props.ts 的 ROOM_PROPS)。
// 纯装饰,不映射任何真实数据。holo 皮肤只画全息地板(原型 holo 分支不画道具),故本层
// 在 holo 下整体跳过——与原型保持一致。

export function DecorLayer() {
  const sheet = useAtlas();
  const skin = useSettingsStore((s) => s.skin);

  // 动画帧集按引用记忆:@pixi/react 用引用 diff `textures`,每帧新数组会重置到第 0 帧。
  const coinFrames = useMemo(() => anim(sheet, "coin_anim"), [sheet]);
  const chestEmptyFrames = useMemo(
    () => anim(sheet, "chest_empty_open_anim"),
    [sheet],
  );

  // holo 下不画道具(对齐原型 holo 分支:只全息地板)。
  if (skin === "holo") return null;

  return (
    <pixiContainer>
      {ROOM_PROPS.map((p, i) => {
        const x = p.col * TILE + p.ox;
        const y = p.row * TILE + p.oy;
        const key = `${p.name}_${p.col}_${p.row}_${i}`;
        if (p.animated) {
          const frames = p.name === "coin_anim" ? coinFrames : chestEmptyFrames;
          // 金币转得快、空宝箱开合慢,沿用原型节奏感(纯观感,无数据)。
          const speed = p.name === "coin_anim" ? 0.12 : 0.06;
          return (
            <AnimatedDecor
              key={key}
              textures={frames}
              x={x}
              y={y}
              speed={speed}
            />
          );
        }
        return (
          <pixiSprite key={key} texture={tex(sheet, p.name)} x={x} y={y} />
        );
      })}
    </pixiContainer>
  );
}
