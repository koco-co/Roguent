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
import { useUiStore } from "../ui-store";
import { Character } from "./Character";
import { DungeonRoom } from "./DungeonRoom";
import { GlowLayer, Vignette } from "./Lights";
import { Particles } from "./Particles";
import { AtlasProvider, loadAtlas } from "./atlas";
import { DOOR_COL, TILE, VH, VW } from "./config";
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
  const selectedId = useUiStore((s) => s.selectedAgentId);
  const select = useUiStore((s) => s.select);
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

  const placed = agents.map((a) => {
    const pos = layout[a.id] ?? { x: VW / 2, y: VH / 2 };
    const isLead = a.kind === "orchestrator";
    return {
      id: a.id,
      x: pos.x,
      y: pos.y,
      isLead,
      hero: isLead ? ORCHESTRATOR_HERO : roleToHero(a.role),
      icon: a.currentTool ? toolNameToIcon(a.currentTool) : "",
      working: a.status === "working" || a.status === "thinking",
    };
  });

  return (
    <pixiContainer>
      <pixiContainer x={offX} y={offY} scale={scale}>
        <DungeonRoom />
        <GlowLayer
          characters={placed.map((p) => ({
            key: p.id,
            x: p.x,
            y: p.y,
            isLead: p.isLead,
          }))}
        />
        {placed.map((p) => (
          <Character
            key={p.id}
            x={p.x}
            y={p.y}
            heroBase={p.hero}
            working={p.working}
            isLead={p.isLead}
            selected={p.id === selectedId}
            icon={p.icon}
            onSelect={() => select(p.id === selectedId ? null : p.id)}
          />
        ))}
        <Particles
          workers={placed
            .filter((p) => p.working)
            .map((p) => ({ x: p.x, y: p.y }))}
          doorPos={{ x: DOOR_COL * TILE, y: 2 * TILE }}
          lootCount={session?.loot.length ?? 0}
          agentCount={agents.length}
        />
      </pixiContainer>
      <Vignette w={canvasW} h={canvasH} />
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
