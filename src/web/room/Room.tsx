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
import { DungeonRoom } from "./DungeonRoom";
import { AtlasProvider, loadAtlas } from "./atlas";
import { VH, VW } from "./config";
import { roomLayout } from "./layout";

// Register PixiJS classes → <pixiContainer>, <pixiSprite>, etc. (module scope).
extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

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
      <DungeonRoom />
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
