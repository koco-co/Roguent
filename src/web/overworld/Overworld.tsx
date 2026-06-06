import { Application, extend, useTick } from "@pixi/react";
import {
  AnimatedSprite,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  type Spritesheet,
  Text,
  type TextStyle,
} from "pixi.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmptyState } from "../hud/EmptyState";
import { AnimatedDecor } from "../room/DungeonRoom";
import { Vignette } from "../room/Lights";
import {
  AtlasProvider,
  anim,
  atlasErrorText,
  loadAtlas,
  resetAtlas,
  tex,
  useAtlas,
} from "../room/atlas";
import { TILE } from "../room/config";
import type { Pos } from "../room/layout";
import type { Bounds } from "../room/motion";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { LobbyLights } from "./LobbyLights";
import { Player } from "./Player";
import { type NpcMotionMap, SessionNpc } from "./SessionNpc";
import { WorldTilemap } from "./WorldTilemap";
import { type Tile, findPath } from "./pathfind";
import { sessionHero } from "./skins";
import { type ProjectInput, type WorldModel, generateWorld } from "./worldgen";

extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

const PROX = 26; // px: how close the player must be for the NPC interaction hint
const ALTAR_PROX = 40; // px: 任务台(3 格喷泉)半径比 NPC 大些

type NpcDesc = { hero: string; home: Pos; bounds: Bounds; door: Pos };

// Spread same-room sessions around the room anchor so several NPCs in one
// project don't stack on the exact same tile.
function spreadHome(anchor: Pos, bounds: Bounds, k: number, n: number): Pos {
  if (n <= 1) return { ...anchor };
  const spread = Math.min(
    (bounds.maxX - bounds.minX) / 2.4,
    (bounds.maxY - bounds.minY) / 2.4,
  );
  const angle = (k / n) * Math.PI * 2;
  return {
    x: Math.max(
      bounds.minX,
      Math.min(bounds.maxX, anchor.x + Math.cos(angle) * spread),
    ),
    y: Math.max(
      bounds.minY,
      Math.min(bounds.maxY, anchor.y + Math.sin(angle) * spread),
    ),
  };
}

interface NpcActor {
  id: string;
  hero: string;
  home: Pos;
  bounds: Bounds;
  door: Pos;
  leaving: boolean;
}

/**
 * Animated fountain landmark marking the Hub centre. A 3-tile vertical stack
 * (static top + animated mid + animated basin) anchored on hub.anchorPx, so the
 * player spawns next to a recognisable, living plaza feature. Reuses the room's
 * AnimatedDecor; frame arrays are memoized so the loops never reset on re-render.
 */
function HubFountain({ anchor }: { anchor: Pos }) {
  const sheet = useAtlas();
  const mid = useMemo(
    () => anim(sheet, "wall_fountain_mid_blue_anim"),
    [sheet],
  );
  const basin = useMemo(
    () => anim(sheet, "wall_fountain_basin_blue_anim"),
    [sheet],
  );
  // anchor is the interior-centre px; stack the 3 tiles so the basin sits at it.
  const cx = anchor.x - TILE / 2; // sprites draw from top-left
  const cy = anchor.y - TILE / 2;
  return (
    <pixiContainer>
      <pixiSprite
        texture={tex(sheet, "wall_fountain_top_2")}
        x={cx}
        y={cy - 2 * TILE}
      />
      <AnimatedDecor textures={mid} x={cx} y={cy - TILE} speed={0.12} />
      <AnimatedDecor textures={basin} x={cx} y={cy} speed={0.12} />
    </pixiContainer>
  );
}

/**
 * 任务台铭牌:在中央喷泉(HubFountain)顶上方挂「任务台」标签,玩家靠近时补一行
 * 「[E] 打开会话」提示(near 由 OverworldScene 的低频邻近检测驱动,变化才 setState)。
 * 中文走 canvas 默认字体,与 SessionNpc 铭牌同源,合理(不强求像素中文字体)。
 */
function HubAltarLabel({ anchor, near }: { anchor: Pos; near: boolean }) {
  const titleStyle = useMemo(
    () => ({ fontSize: 8, fill: 0xffd166 }) as Partial<TextStyle>,
    [],
  );
  const hintStyle = useMemo(
    () => ({ fontSize: 7, fill: 0x4fe0ff }) as Partial<TextStyle>,
    [],
  );
  return (
    <pixiContainer x={anchor.x} y={anchor.y - TILE / 2 - 2 * TILE - 12}>
      <pixiText text="任务台" anchor={0.5} resolution={4} style={titleStyle} />
      {near ? (
        <pixiText
          text="[E] 打开会话"
          anchor={0.5}
          y={14}
          resolution={4}
          style={hintStyle}
        />
      ) : null}
    </pixiContainer>
  );
}

function OverworldScene({ view }: { view: { w: number; h: number } }) {
  const sessions = useRoomStore((s) => s.sessions);
  const projectOrder = useRoomStore((s) => s.projectOrder);
  const selectNpc = useUiStore((s) => s.selectNpc);
  const selectedNpcId = useUiStore((s) => s.selectedNpcId);
  const openPanel = useUiStore((s) => s.openPanel);

  // Active (non-archived) sessions are the lobby population.
  const active = useMemo(
    () => Object.values(sessions).filter((s) => !s.archived),
    [sessions],
  );
  const activeKey = useMemo(
    () =>
      active
        .map((s) => s.id)
        .sort()
        .join(","),
    [active],
  );

  // Rooms = projects, placed in stable first-seen order. sessionCount drives
  // room size; every ever-seen project keeps its slot so rooms never relocate.
  const projects: ProjectInput[] = useMemo(
    () =>
      projectOrder.map((id) => ({
        id,
        sessionCount: active.filter((s) => s.project === id).length,
      })),
    [projectOrder, active],
  );
  const worldKey = projects.map((p) => `${p.id}:${p.sessionCount}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: worldKey is the projects signature
  const world: WorldModel = useMemo(() => generateWorld(projects), [worldKey]);

  const roomByProject = useMemo(() => {
    const m = new Map<string, WorldModel["rooms"][number]>();
    for (const r of world.rooms) m.set(r.projectId, r);
    return m;
  }, [world]);

  // Spawn at the central Hub plaza — always present, so the player never spawns
  // into empty void even with zero projects.
  const spawn: Pos = useMemo(() => ({ ...world.hub.anchorPx }), [world]);

  // Desired NPC descriptor (hero/home/bounds) per active session id.
  const desired = useMemo(() => {
    const m = new Map<string, NpcDesc>();
    const perProject = new Map<string, string[]>();
    for (const s of active) {
      if (!s.project) continue;
      const arr = perProject.get(s.project) ?? [];
      arr.push(s.id);
      perProject.set(s.project, arr);
    }
    for (const [project, ids] of perProject) {
      const room = roomByProject.get(project);
      if (!room) continue;
      ids.sort();
      ids.forEach((id, k) => {
        m.set(id, {
          hero: sessionHero(id),
          home: spreadHome(room.anchorPx, room.boundsPx, k, ids.length),
          bounds: room.boundsPx,
          door: room.doorPx,
        });
      });
    }
    return m;
  }, [active, roomByProject]);
  const desiredRef = useRef(desired);
  desiredRef.current = desired;

  // Reconcile NPC actors against the desired set: new sessions fade in, departed
  // ones linger (leaving) until their fade-out completes (mirrors room/Room).
  const [actors, setActors] = useState<NpcActor[]>([]);
  const reconcileKey = `${activeKey}|${worldKey}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconcile keys on membership + world
  useEffect(() => {
    const d = desiredRef.current;
    setActors((prev) => {
      let changed = false;
      const next: NpcActor[] = prev.map((a) => {
        const want = d.get(a.id);
        if (!want) {
          if (a.leaving) return a;
          changed = true;
          return { ...a, leaving: true };
        }
        if (
          a.leaving ||
          a.home.x !== want.home.x ||
          a.home.y !== want.home.y ||
          a.bounds !== want.bounds ||
          a.door.x !== want.door.x ||
          a.door.y !== want.door.y
        ) {
          changed = true;
          return { ...a, leaving: false, ...want };
        }
        return a;
      });
      const prevIds = new Set(prev.map((p) => p.id));
      for (const [id, want] of d) {
        if (prevIds.has(id)) continue;
        changed = true;
        next.push({ id, leaving: false, ...want });
      }
      return changed ? next : prev;
    });
  }, [reconcileKey]);

  const handleExited = useCallback((id: string) => {
    setActors((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── shared imperative refs (never React state) ──
  const worldRootRef = useRef<Container | null>(null);
  const playerPosRef = useRef<Pos>({ ...spawn });
  const keysRef = useRef<Set<string>>(new Set());
  const pathRef = useRef<Tile[] | null>(null);
  const npcMotionRef = useRef<NpcMotionMap>({});
  const viewRef = useRef(view);
  viewRef.current = view;
  const worldRef = useRef(world);
  worldRef.current = world;

  // ── proximity: which NPC / 任务台 is the player standing next to (low-freq) ──
  // 任务台与 NPC 互斥提示:谁更近就提示谁(站任务台旁时 nearbyId=null,反之亦然),
  // 避免两个 [E] 提示同时出现、E 键归属不明。
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const nearbyRef = useRef<string | null>(null);
  const [nearAltar, setNearAltar] = useState(false);
  const nearAltarRef = useRef(false);
  useTick(() => {
    const pp = playerPosRef.current;
    if (!pp) return;
    // 最近 NPC(命中半径内)。
    let best: string | null = null;
    let bestD = PROX * PROX;
    for (const [id, p] of Object.entries(npcMotionRef.current ?? {})) {
      const dx = p.x - pp.x;
      const dy = p.y - pp.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    // 玩家到任务台(hub 中心)的距离平方。
    const hub = worldRef.current.hub.anchorPx;
    const adx = hub.x - pp.x;
    const ady = hub.y - pp.y;
    const aD = adx * adx + ady * ady;
    const altarHit = aD < ALTAR_PROX * ALTAR_PROX;

    // 谁更近定目标:NPC 与任务台都命中时取更近者;否则取唯一命中者。
    let nextNearby: string | null = null;
    let nextAltar = false;
    if (best != null && altarHit) {
      if (bestD <= aD) nextNearby = best;
      else nextAltar = true;
    } else if (best != null) {
      nextNearby = best;
    } else if (altarHit) {
      nextAltar = true;
    }

    if (nextNearby !== nearbyRef.current) {
      nearbyRef.current = nextNearby;
      setNearbyId(nextNearby);
    }
    if (nextAltar !== nearAltarRef.current) {
      nearAltarRef.current = nextAltar;
      setNearAltar(nextAltar);
    }
  });

  // Keyboard: WASD/arrows feed the movement key set; E/Enter opens the nearby
  // NPC's card. Ignore keys while typing in the chat input.
  useEffect(() => {
    const typing = () => {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    };
    const move = new Set([
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ]);
    const down = (e: KeyboardEvent) => {
      if (typing()) {
        keysRef.current.clear();
        return;
      }
      const k = e.key.toLowerCase();
      if (move.has(k)) keysRef.current.add(k);
      else if (k === "e" || k === "enter") {
        // 任务台优先:靠近任务台 → 打开全会话总览;否则靠近 NPC → 选中其信息卡。
        if (nearAltarRef.current) openPanel("sessiongrid");
        else if (nearbyRef.current) selectNpc(nearbyRef.current);
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    // 焦点离开画布(进输入框 / 切窗口)时清空按键,否则已按住的方向键会让主角持续滑动。
    const blur = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [selectNpc, openPanel]);

  // Click-to-walk: A* from the player's tile to the clicked tile.
  const onTap = useCallback((e: FederatedPointerEvent) => {
    const wr = worldRootRef.current;
    const w = worldRef.current;
    if (!wr) return;
    const lp = wr.toLocal(e.global);
    const goal = { c: Math.floor(lp.x / TILE), r: Math.floor(lp.y / TILE) };
    const pp = playerPosRef.current;
    const start = { c: Math.floor(pp.x / TILE), r: Math.floor(pp.y / TILE) };
    const path = findPath(w.walkable, w.cols, w.rows, start, goal);
    if (path && path.length > 1) pathRef.current = path.slice(1);
  }, []);

  const hitArea = useMemo(
    () => new Rectangle(0, 0, world.widthPx, world.heightPx),
    [world],
  );

  return (
    <pixiContainer>
      <pixiContainer
        ref={worldRootRef}
        eventMode="static"
        hitArea={hitArea}
        onPointerTap={onTap}
      >
        <WorldTilemap world={world} />
        <HubFountain anchor={world.hub.anchorPx} />
        <HubAltarLabel anchor={world.hub.anchorPx} near={nearAltar} />
        {actors.map((a) => {
          const s = sessions[a.id];
          return (
            <SessionNpc
              key={a.id}
              id={a.id}
              title={s?.title ?? a.id}
              status={s?.status ?? "done"}
              hero={a.hero}
              home={a.home}
              bounds={a.bounds}
              door={a.door}
              selected={selectedNpcId === a.id}
              near={nearbyId === a.id}
              leaving={a.leaving || !s || s.archived}
              onSelect={() => selectNpc(a.id)}
              onExited={handleExited}
              motionRef={npcMotionRef}
              utilization={s?.context?.utilization}
            />
          );
        })}
        <LobbyLights world={world} />
        <Player
          key="player"
          world={world}
          spawn={spawn}
          playerPosRef={playerPosRef}
          keysRef={keysRef}
          pathRef={pathRef}
          worldRootRef={worldRootRef}
          viewRef={viewRef}
        />
      </pixiContainer>
      <Vignette w={view.w} h={view.h} />
    </pixiContainer>
  );
}

/** Overworld host: loads the atlas, measures the canvas, mounts the Pixi app. */
export function Overworld() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const projectCount = useRoomStore((s) => s.projectOrder.length);

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
            <OverworldScene view={size} />
          </AtlasProvider>
        ) : null}
      </Application>
      {projectCount === 0 && !atlasError ? <EmptyState /> : null}
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
          <div>⚠ atlas load failed</div>
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
