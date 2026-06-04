import { Application, extend } from "@pixi/react";
import {
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  type Spritesheet,
  Text,
} from "pixi.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "../../shared/domain";
import {
  ORCHESTRATOR_HERO,
  roleToHero,
  toolNameToIcon,
} from "../../shared/mapping";
import { useRoomStore } from "../store";
import { Character } from "./Character";
import { AtlasProvider, loadAtlas, tex, useAtlas } from "./atlas";
import { roomLayout } from "./layout";

// Register PixiJS classes → <pixiContainer>, <pixiSprite>, etc. (module scope).
extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

export const TILE = 16;
export const COLS = 24;
export const ROWS = 14;
const VW = COLS * TILE; // 384 virtual px
const VH = ROWS * TILE; // 224 virtual px

// Temporary tiled floor — replaced by the full DungeonRoom (walls + decor) in
// the next step. Already reads as a dungeon instead of a flat colour grid.
function FloorFill() {
  const sheet = useAtlas();
  const tiles = useMemo(() => {
    const out: { c: number; r: number; name: string }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = (c * 7 + r * 13) % 17;
        const name =
          v === 0
            ? "floor_2"
            : v === 5
              ? "floor_4"
              : v === 11
                ? "floor_6"
                : "floor_1";
        out.push({ c, r, name });
      }
    }
    return out;
  }, []);
  return (
    <pixiContainer>
      {tiles.map(({ c, r, name }) => (
        <pixiSprite
          key={`${c}_${r}`}
          texture={tex(sheet, name)}
          x={c * TILE}
          y={r * TILE}
        />
      ))}
    </pixiContainer>
  );
}

function Scene({
  canvasW,
  canvasH,
}: {
  canvasW: number;
  canvasH: number;
}) {
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const agents: Agent[] = useMemo(
    () => (session ? Object.values(session.agents) : []),
    [session],
  );
  const layout = useMemo(
    () =>
      roomLayout(
        agents.map((a) => a.id),
        VW,
        VH,
      ),
    [agents],
  );

  // Integer scale so pixels stay crisp; centre the room in the canvas.
  const scale = Math.max(1, Math.floor(Math.min(canvasW / VW, canvasH / VH)));
  const offX = Math.floor((canvasW - VW * scale) / 2);
  const offY = Math.floor((canvasH - VH * scale) / 2);

  return (
    <pixiContainer x={offX} y={offY} scale={scale}>
      <FloorFill />
      {agents.map((a) => {
        const pos = layout[a.id] ?? { x: VW / 2, y: VH / 2 };
        const hero =
          a.kind === "orchestrator" ? ORCHESTRATOR_HERO : roleToHero(a.role);
        const icon = a.currentTool ? toolNameToIcon(a.currentTool) : "";
        return (
          <Character
            key={a.id}
            x={pos.x}
            y={pos.y}
            heroBase={hero}
            working={a.status === "working" || a.status === "thinking"}
            isLead={a.kind === "orchestrator"}
            icon={icon}
          />
        );
      })}
    </pixiContainer>
  );
}

export function Room() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e) => console.error("[atlas] load failed", e));
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0b0a12} antialias={false}>
        {sheet && size.w > 0 ? (
          <AtlasProvider value={sheet}>
            <Scene canvasW={size.w} canvasH={size.h} />
          </AtlasProvider>
        ) : null}
      </Application>
    </div>
  );
}
