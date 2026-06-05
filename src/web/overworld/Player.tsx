import { useTick } from "@pixi/react";
import type { AnimatedSprite, Container } from "pixi.js";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { anim, useAtlas } from "../room/atlas";
import { TILE } from "../room/config";
import type { Pos } from "../room/layout";
import { type Facing, faceDir } from "../room/motion";
import { cameraOffset } from "./camera";
import type { Tile } from "./pathfind";
import { PLAYER_HERO } from "./skins";
import type { WorldModel } from "./worldgen";
import { lobbyZoom } from "./zoom";

const SPEED = 1.15; // px per frame (a touch quicker than wandering NPCs)
const ARRIVE = 1.5;

function walkableAt(world: WorldModel, x: number, y: number): boolean {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (c < 0 || r < 0 || c >= world.cols || r >= world.rows) return false;
  return world.walkable[r * world.cols + c] === true;
}

/**
 * The user's avatar. Free movement via WASD/arrows (blocked by walls — checks
 * the walkable grid per-axis so you slide along walls) plus A* click-to-walk:
 * the parent fills pathRef with tile waypoints and the player follows them until
 * a movement key overrides. Drives its own sprite AND the camera (so the world
 * container follows it with no React state), and publishes its position to
 * playerPosRef for the proximity check (spec §不变量: imperative useTick only).
 */
export function Player({
  world,
  spawn,
  playerPosRef,
  keysRef,
  pathRef,
  worldRootRef,
  viewRef,
}: {
  world: WorldModel;
  spawn: Pos;
  playerPosRef: RefObject<Pos>;
  keysRef: RefObject<Set<string>>;
  pathRef: RefObject<Tile[] | null>;
  worldRootRef: RefObject<Container | null>;
  viewRef: RefObject<{ w: number; h: number }>;
}) {
  const sheet = useAtlas();
  const idleFrames = useMemo(
    () => anim(sheet, `${PLAYER_HERO}_idle_anim`),
    [sheet],
  );
  const runFrames = useMemo(
    () => anim(sheet, `${PLAYER_HERO}_run_anim`),
    [sheet],
  );

  const rootRef = useRef<Container | null>(null);
  const flipRef = useRef<Container | null>(null);
  const spriteRef = useRef<AnimatedSprite | null>(null);

  const pos = useRef<Pos>({ ...spawn });
  const facing = useRef<Facing>(1);
  const moving = useRef(false);
  const worldRef = useRef(world);
  worldRef.current = world;

  // Seed at spawn once, before first paint (mirrors room/Character.tsx:120).
  // Remounted via key on the 0->1 project transition so spawn lands on floor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once seed
  useLayoutEffect(() => {
    pos.current = { ...spawn };
    const root = rootRef.current;
    if (root) root.position.set(pos.current.x, pos.current.y);
    if (playerPosRef.current) {
      playerPosRef.current.x = pos.current.x;
      playerPosRef.current.y = pos.current.y;
    }
  }, []);

  useEffect(() => {
    const s = spriteRef.current;
    if (!s) return;
    s.anchor.set(0.5, 1);
    s.play();
  }, []);

  const tick = useCallback(
    (ticker: { deltaTime: number }) => {
      const root = rootRef.current;
      const flip = flipRef.current;
      const sprite = spriteRef.current;
      if (!root || !flip || !sprite) return;
      const dt = Math.min(ticker.deltaTime, 2);
      const w = worldRef.current;
      const keys = keysRef.current ?? new Set<string>();

      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      const up = keys.has("w") || keys.has("arrowup");
      const down = keys.has("s") || keys.has("arrowdown");
      const keyDx = (right ? 1 : 0) - (left ? 1 : 0);
      const keyDy = (down ? 1 : 0) - (up ? 1 : 0);

      let vx = 0;
      let vy = 0;
      if (keyDx !== 0 || keyDy !== 0) {
        // Manual control overrides any active auto-path.
        if (pathRef.current) pathRef.current = null;
        const len = Math.hypot(keyDx, keyDy) || 1;
        vx = (keyDx / len) * SPEED * dt;
        vy = (keyDy / len) * SPEED * dt;
      } else if (pathRef.current && pathRef.current.length > 0) {
        // Follow the A* waypoint queue toward each tile centre.
        const next = pathRef.current[0];
        if (next) {
          const tx = next.c * TILE + TILE / 2;
          const ty = next.r * TILE + TILE / 2;
          const dx = tx - pos.current.x;
          const dy = ty - pos.current.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= ARRIVE) {
            pathRef.current = pathRef.current.slice(1);
          } else {
            const step = Math.min(SPEED * dt, dist);
            vx = (dx / dist) * step;
            vy = (dy / dist) * step;
          }
        }
      }

      // Per-axis collision: move on an axis only if the destination tile is
      // walkable, so the player slides along walls instead of sticking.
      if (vx !== 0 && walkableAt(w, pos.current.x + vx, pos.current.y))
        pos.current.x += vx;
      if (vy !== 0 && walkableAt(w, pos.current.x, pos.current.y + vy))
        pos.current.y += vy;

      facing.current = faceDir(vx, facing.current);
      const nowMoving = vx !== 0 || vy !== 0;

      root.position.set(pos.current.x, pos.current.y);
      flip.scale.x = facing.current;
      if (playerPosRef.current) {
        playerPosRef.current.x = pos.current.x;
        playerPosRef.current.y = pos.current.y;
      }

      if (nowMoving !== moving.current) {
        moving.current = nowMoving;
        sprite.textures = nowMoving ? runFrames : idleFrames;
        sprite.play();
      }
      sprite.animationSpeed = nowMoving ? 0.22 : 0.12;

      // Camera follows the player at an integer zoom, clamped to world edges.
      const wr = worldRootRef.current;
      const view = viewRef.current;
      if (wr && view) {
        const z = lobbyZoom(view);
        wr.scale.set(z);
        const off = cameraOffset(
          pos.current,
          view,
          {
            w: w.widthPx,
            h: w.heightPx,
          },
          z,
        );
        wr.position.set(off.x, off.y);
      }
    },
    [
      keysRef,
      pathRef,
      playerPosRef,
      worldRootRef,
      viewRef,
      idleFrames,
      runFrames,
    ],
  );
  useTick(tick);

  return (
    <pixiContainer ref={rootRef}>
      <pixiContainer ref={flipRef}>
        <pixiAnimatedSprite ref={spriteRef} textures={idleFrames} />
      </pixiContainer>
    </pixiContainer>
  );
}
