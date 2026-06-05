import { useTick } from "@pixi/react";
import type { AnimatedSprite, Container, Graphics } from "pixi.js";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentStatus } from "../../shared/domain";
import { toolNameToIcon } from "../../shared/mapping";
import type { IconName } from "../hud/icons";
import { Emote } from "./Emote";
import { ToolBubble } from "./ToolBubble";
import { anim, useAtlas } from "./atlas";
import { DOOR_COL, TILE } from "./config";
import { glowTexture } from "./effects";
import type { Pos } from "./layout";
import {
  type Facing,
  type MotionMap,
  faceDir,
  floorBounds,
  pickWanderTarget,
  stepToward,
} from "./motion";

// Wander tuning (spec §7); nudge in-browser without touching the architecture.
const WANDER_R_SUB = 24;
const WANDER_R_LEAD = 6; // commander stays roughly centred
const SPEED = 0.4; // px per frame
const FADE_PER_FRAME = 0.06; // leaving fade-out

type Phase = "entering" | "living" | "leaving";

const isWorking = (s: AgentStatus | "leaving") =>
  s === "working" || s === "thinking";

// Pause between wanders, in frames (~60fps): short while working (more active),
// long while idle (pacing). Decorative randomness only — never touches replay.
function randPauseFrames(status: AgentStatus | "leaving"): number {
  const [lo, hi] = isWorking(status) ? [0.6, 1.2] : [1.2, 2.4];
  return (lo + Math.random() * (hi - lo)) * 60;
}

/**
 * A self-moving character: enters from the door, wanders around its home anchor,
 * and walks out when leaving. Its root container position is driven imperatively
 * (useLayoutEffect to seed, useTick to advance) and is NEVER bound to React
 * x/y props — a store re-render would otherwise reset container.position and
 * cause a jump (spec §8). Each frame it publishes {x,y,facing,moving,status} to
 * the shared motionRef for the particle layer.
 */
export function Character({
  id,
  heroBase,
  isLead,
  selected,
  status,
  currentTool,
  home,
  bornAtDoor,
  leaving,
  onSelect,
  onExited,
  motionRef,
}: {
  id: string;
  heroBase: string;
  isLead: boolean;
  selected: boolean;
  status: AgentStatus;
  currentTool?: string;
  home: Pos;
  bornAtDoor: boolean;
  leaving: boolean;
  onSelect?: () => void;
  onExited: (id: string) => void;
  motionRef: RefObject<MotionMap>;
}) {
  const sheet = useAtlas();
  // Stable references for both animation sets — @pixi/react diffs `textures` by
  // reference, so a fresh array would reset playback every render.
  const idleFrames = useMemo(
    () => anim(sheet, `${heroBase}_idle_anim`),
    [sheet, heroBase],
  );
  const runFrames = useMemo(
    () => anim(sheet, `${heroBase}_run_anim`),
    [sheet, heroBase],
  );

  const rootRef = useRef<Container | null>(null);
  const flipRef = useRef<Container | null>(null);
  const spriteRef = useRef<AnimatedSprite | null>(null);
  const [hovered, setHovered] = useState(false);

  const bounds = useMemo(() => floorBounds(), []);
  const radius = isLead ? WANDER_R_LEAD : WANDER_R_SUB;

  // Imperative motion state (refs, never React state).
  const pos = useRef<Pos>({ ...home });
  const target = useRef<Pos>({ ...home });
  const facing = useRef<Facing>(1);
  const moving = useRef(false);
  const pauseLeft = useRef(0);
  const phase = useRef<Phase>("living");
  const exited = useRef(false);
  // Mirror props the ticker reads so the stable callback always sees fresh data.
  const homeRef = useRef(home);
  homeRef.current = home;
  const statusRef = useRef(status);
  statusRef.current = status;
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;

  // Seed position once on mount: enter from the door or appear at home.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once seed (spec §8)
  useLayoutEffect(() => {
    const door: Pos = { x: DOOR_COL * TILE, y: 2 * TILE };
    if (bornAtDoor) {
      pos.current = { ...door };
      target.current = { ...home };
      phase.current = "entering";
    } else {
      pos.current = { ...home };
      target.current = { ...home };
      phase.current = "living";
      pauseLeft.current = randPauseFrames(status);
    }
    facing.current = 1;
    const root = rootRef.current;
    if (root) {
      root.position.set(pos.current.x, pos.current.y);
      root.alpha = 1;
    }
  }, []);

  // anchor + initial playback; idempotent.
  useEffect(() => {
    const s = spriteRef.current;
    if (!s) return;
    s.anchor.set(0.5, 1); // feet planted on the container origin
    s.play();
  }, []);

  // Remove our live entry when unmounted so particles stop tracking us.
  useEffect(() => {
    const map = motionRef.current;
    return () => {
      if (map) delete map[id];
    };
  }, [id, motionRef]);

  const tick = useCallback(
    (ticker: { deltaTime: number }) => {
      const root = rootRef.current;
      const flip = flipRef.current;
      const sprite = spriteRef.current;
      if (!root || !flip || !sprite) return;
      const dt = Math.min(ticker.deltaTime, 2);

      // Leaving overrides any other phase: head for the door.
      if (leavingRef.current && phase.current !== "leaving") {
        phase.current = "leaving";
        target.current = { x: DOOR_COL * TILE, y: 2 * TILE };
        pauseLeft.current = 0;
      }

      let nowMoving = false;
      if (phase.current === "leaving") {
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          root.alpha -= FADE_PER_FRAME * dt;
          if (root.alpha <= 0 && !exited.current) {
            exited.current = true;
            onExited(id);
          }
        }
      } else if (phase.current === "entering") {
        const s = stepToward(pos.current, homeRef.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = true;
        if (s.arrived) {
          phase.current = "living";
          target.current = { ...pos.current };
          pauseLeft.current = randPauseFrames(statusRef.current);
        }
      } else if (pauseLeft.current > 0) {
        pauseLeft.current -= dt;
      } else {
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          pauseLeft.current = randPauseFrames(statusRef.current);
          target.current = pickWanderTarget(homeRef.current, radius, bounds);
        }
      }

      root.position.set(pos.current.x, pos.current.y);
      flip.scale.x = facing.current;

      // Swap idle/run textures only when the moving flag flips; setting
      // `textures` calls gotoAndStop(0), so replay (spec §6.1 gotcha).
      if (nowMoving !== moving.current) {
        moving.current = nowMoving;
        sprite.textures = nowMoving ? runFrames : idleFrames;
        sprite.play();
      }
      sprite.animationSpeed =
        (isWorking(statusRef.current) ? 0.18 : 0.1) * (nowMoving ? 1.4 : 1);

      const map = motionRef.current;
      if (map) {
        map[id] = {
          x: pos.current.x,
          y: pos.current.y,
          facing: facing.current,
          moving: nowMoving,
          status: leavingRef.current ? "leaving" : statusRef.current,
        };
      }
    },
    [id, radius, bounds, onExited, idleFrames, runFrames, motionRef],
  );
  useTick(tick);

  const shadow = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x000000, alpha: 0.35 });
    g.ellipse(0, 0, 7, 3);
    g.fill();
  }, []);

  // Ground ring: cyan when selected, faint white on hover, gold for the lead.
  const ring = useCallback(
    (g: Graphics) => {
      g.clear();
      if (selected) {
        g.setStrokeStyle({ width: 1.5, color: 0x4fe0ff, alpha: 1 });
        g.ellipse(0, 0, 11, 5);
        g.stroke();
      } else if (hovered) {
        g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.7 });
        g.ellipse(0, 0, 10, 4.5);
        g.stroke();
      } else if (isLead) {
        g.setStrokeStyle({ width: 1, color: 0xffd166, alpha: 0.9 });
        g.ellipse(0, 0, 9, 4);
        g.stroke();
      }
    },
    [selected, hovered, isLead],
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: PixiJS canvas element — keyboard a11y not applicable
    <pixiContainer
      ref={rootRef}
      eventMode="static"
      cursor="pointer"
      onClick={onSelect}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* warm glow rides along (additive); symmetric, so no flip needed */}
      <pixiSprite
        texture={glowTexture()}
        anchor={0.5}
        y={-8}
        scale={(isLead ? 30 : 22) / 64}
        tint={isLead ? 0xffd98a : 0xfff0d0}
        alpha={isLead ? 0.55 : 0.4}
        blendMode="add"
      />
      <pixiGraphics y={1} draw={shadow} />
      <pixiGraphics draw={ring} />
      {/* inner container flips with facing so the emoji children don't mirror */}
      <pixiContainer ref={flipRef}>
        <pixiAnimatedSprite ref={spriteRef} textures={idleFrames} />
      </pixiContainer>
      {currentTool && !leaving ? (
        <ToolBubble icon={toolNameToIcon(currentTool) as IconName} />
      ) : null}
      {leaving ? null : <Emote status={status} />}
    </pixiContainer>
  );
}
