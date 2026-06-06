import { Application, extend } from "@pixi/react";
import {
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  type Spritesheet,
  Text,
} from "pixi.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Agent } from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Character } from "./Character";
import { DungeonRoom } from "./DungeonRoom";
import { GlowLayer, Vignette } from "./Lights";
import { Particles } from "./Particles";
import { AtlasProvider, atlasErrorText, loadAtlas, resetAtlas } from "./atlas";
import { DOOR_COL, TILE, VH, VW } from "./config";
import { type Pos, roomLayout } from "./layout";
import type { MotionMap } from "./motion";

// Register PixiJS classes → <pixiContainer>, <pixiSprite>, etc. (module scope).
extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

// A character present in the room. The store drives which actors exist; a
// leaving ghost lingers (walking out the door) until its exit animation ends.
interface Actor {
  id: string;
  hero: string;
  isLead: boolean;
  home: Pos;
  bornAtDoor: boolean;
  leaving: boolean;
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
  const selectedId = useUiStore((s) => s.selectedAgentId);
  const select = useUiStore((s) => s.select);
  const agents: Agent[] = useMemo(
    () => (session ? Object.values(session.agents) : []),
    [session],
  );
  // Home anchors are deterministic from the live agent id set; the reconcile
  // only needs to re-run when that set changes (not on every status tick), so
  // key on it and read the latest agents through a ref.
  const agentKey = useMemo(
    () =>
      agents
        .map((a) => a.id)
        .sort()
        .join(","),
    [agents],
  );
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const motionRef = useRef<MotionMap>({});
  const [actors, setActors] = useState<Actor[]>([]);

  // Reconcile the actor list against the store: new agents enter from the door,
  // departed agents start leaving (kept as ghosts until they walk out), and
  // surviving actors get refreshed home anchors. Positions never enter state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: agents read via ref; reconcile keys on the id set
  useEffect(() => {
    const live = agentsRef.current;
    const lay = roomLayout(
      live.map((a) => a.id),
      VW,
      VH,
    );
    const storeById = new Map(live.map((a) => [a.id, a]));
    setActors((prev) => {
      const prevIds = new Set(prev.map((p) => p.id));
      let changed = false;
      const next: Actor[] = prev.map((p) => {
        const a = storeById.get(p.id);
        if (!a) {
          if (p.leaving) return p;
          changed = true;
          return { ...p, leaving: true };
        }
        const home = lay[p.id] ?? p.home;
        if (p.leaving || home.x !== p.home.x || home.y !== p.home.y) {
          changed = true;
          return { ...p, leaving: false, home };
        }
        return p;
      });
      for (const a of live) {
        if (prevIds.has(a.id)) continue;
        changed = true;
        const isLead = a.kind === "orchestrator";
        next.push({
          id: a.id,
          isLead,
          hero: isLead ? ORCHESTRATOR_HERO : roleToHero(a.role),
          home: lay[a.id] ?? { x: VW / 2, y: VH / 2 },
          bornAtDoor: true,
          leaving: false,
        });
      }
      return changed ? next : prev;
    });
  }, [agentKey]);

  const handleExited = useCallback((id: string) => {
    setActors((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Integer scale so pixels stay crisp; centre the room in the canvas.
  const scale = Math.max(1, Math.floor(Math.min(canvasW / VW, canvasH / VH)));
  const offX = Math.floor((canvasW - VW * scale) / 2);
  const offY = Math.floor((canvasH - VH * scale) / 2);

  return (
    <pixiContainer>
      <pixiContainer x={offX} y={offY} scale={scale}>
        <DungeonRoom />
        <GlowLayer />
        {actors.map((act) => {
          const agent = session?.agents[act.id];
          return (
            <Character
              key={act.id}
              id={act.id}
              heroBase={act.hero}
              isLead={act.isLead}
              selected={act.id === selectedId && !act.leaving}
              status={agent?.status ?? "idle"}
              currentTool={agent?.currentTool}
              home={act.home}
              bornAtDoor={act.bornAtDoor}
              leaving={act.leaving || !agent}
              onSelect={() => select(act.id === selectedId ? null : act.id)}
              onExited={handleExited}
              motionRef={motionRef}
            />
          );
        })}
        <Particles
          motionRef={motionRef}
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
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const retryAtlas = () => {
    setAtlasError(null);
    setSheet(null);
    resetAtlas();
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  };

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    // 量 clientWidth/Height(layout 尺寸,不受外层 #stage 的 CSS transform:scale 影响):
    // Pixi 始终按舞台逻辑尺寸渲染,屏幕缩放由 #stage 统一负责,故此处不能用 getBoundingClientRect。
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
      {atlasError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(11,10,18,0.92)",
            color: "#ff6b6b",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 24,
            gap: 12,
          }}
        >
          <div>atlas load failed</div>
          <div
            style={{
              color: "#aaa",
              fontSize: 10,
              wordBreak: "break-all",
              maxWidth: 360,
            }}
          >
            {atlasError}
          </div>
          <button type="button" className="px-btn" onClick={retryAtlas}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
