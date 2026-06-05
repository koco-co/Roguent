import { useTick } from "@pixi/react";
import type {
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  TextStyle,
} from "pixi.js";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SessionStatus } from "../../shared/domain";
import { anim, useAtlas } from "../room/atlas";
import { glowTexture } from "../room/effects";
import type { Pos } from "../room/layout";
import {
  type Bounds,
  type Facing,
  faceDir,
  pickWanderTarget,
  stepToward,
} from "../room/motion";

// Live position each NPC publishes for the overworld's proximity check.
export type NpcMotionMap = Record<string, Pos>;

const SPEED = 0.4;
const FADE_PER_FRAME = 0.05;

const STATUS_RING: Record<SessionStatus, number> = {
  idle: 0x8aa0b4,
  busy: 0x6bf0a0,
  done: 0xffd166,
  error: 0xff5ea0,
};

function randPauseFrames(): number {
  return (1 + Math.random() * 1.6) * 60;
}

type Phase = "entering" | "living" | "leaving";

/**
 * A session NPC standing in its project's room. Wanders around the room anchor
 * (reusing room/motion helpers, clamped to the room interior bounds), shows a
 * nameplate (title + status colour + "?" askuser placeholder slot), highlights
 * when the player is near, and reports its live position to a shared ref for the
 * proximity check. Position/alpha are driven imperatively via useTick and never
 * enter React state — a store re-render must not reset the sprite (spec §不变量).
 */
export function SessionNpc({
  id,
  title,
  status,
  hero,
  home,
  bounds,
  door,
  selected,
  near,
  leaving,
  onSelect,
  onExited,
  motionRef,
  utilization,
}: {
  id: string;
  title: string;
  status: SessionStatus;
  hero: string;
  home: Pos;
  bounds: Bounds;
  door: Pos;
  selected: boolean;
  near: boolean;
  leaving: boolean;
  onSelect: () => void;
  onExited: (id: string) => void;
  motionRef: RefObject<NpcMotionMap>;
  utilization?: number;
}) {
  const sheet = useAtlas();
  const idleFrames = useMemo(
    () => anim(sheet, `${hero}_idle_anim`),
    [sheet, hero],
  );
  const runFrames = useMemo(
    () => anim(sheet, `${hero}_run_anim`),
    [sheet, hero],
  );

  const rootRef = useRef<Container | null>(null);
  const flipRef = useRef<Container | null>(null);
  const spriteRef = useRef<AnimatedSprite | null>(null);
  const [hovered, setHovered] = useState(false);

  const radius = useMemo(
    () =>
      Math.max(
        8,
        Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2.4,
      ),
    [bounds],
  );

  const pos = useRef<Pos>({ ...home });
  const target = useRef<Pos>({ ...home });
  const facing = useRef<Facing>(1);
  const moving = useRef(false);
  const pauseLeft = useRef(0);
  const phase = useRef<Phase>("entering");
  const exited = useRef(false);
  const homeRef = useRef(home);
  homeRef.current = home;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  const doorRef = useRef(door);
  doorRef.current = door;
  const nearRef = useRef(near);
  nearRef.current = near;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const portalGlowRef = useRef<Sprite | null>(null);

  // Seed at the doorway and walk in on mount (NPC enters from its room door,
  // spec §生命周期). useLayoutEffect so position is set before first paint
  // (mirrors room/Character.tsx:120, spec §8).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once seed
  useLayoutEffect(() => {
    pos.current = { ...door };
    target.current = { ...home };
    phase.current = "entering";
    const root = rootRef.current;
    if (root) {
      root.position.set(pos.current.x, pos.current.y);
      root.alpha = 1;
    }
  }, []);

  useEffect(() => {
    const s = spriteRef.current;
    if (!s) return;
    s.anchor.set(0.5, 1);
    s.play();
  }, []);

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

      if (leavingRef.current && phase.current !== "leaving") {
        phase.current = "leaving";
      } else if (!leavingRef.current && phase.current === "leaving") {
        // critical 修复:归档淡出未完成时又被取消归档(再激活竞态)。回到 living,
        // 复原 alpha,清掉 exited —— 否则相位永远卡在 leaving、fade 到 0 后误报退场。
        phase.current = "living";
        exited.current = false;
        root.alpha = 1;
        pauseLeft.current = randPauseFrames();
      }

      let nowMoving = false;
      if (phase.current === "leaving") {
        // 先走到门口,再淡出。
        const s = stepToward(pos.current, doorRef.current, SPEED);
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
        // 从门口走进 home;到了就开始 living。
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          phase.current = "living";
          pauseLeft.current = randPauseFrames();
        }
      } else if (pauseLeft.current > 0) {
        pauseLeft.current -= dt;
      } else {
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          pauseLeft.current = randPauseFrames();
          target.current = pickWanderTarget(
            homeRef.current,
            radius,
            boundsRef.current,
          );
        }
      }

      root.position.set(pos.current.x, pos.current.y);
      flip.scale.x = facing.current;

      if (nowMoving !== moving.current) {
        moving.current = nowMoving;
        sprite.textures = nowMoving ? runFrames : idleFrames;
        sprite.play();
      }
      sprite.animationSpeed =
        (status === "busy" ? 0.16 : 0.1) * (nowMoving ? 1.4 : 1);

      const map = motionRef.current;
      if (map) map[id] = { x: pos.current.x, y: pos.current.y };

      const pg = portalGlowRef.current;
      if (pg) {
        const base = 0.3 + (0.15 * (Math.sin(performance.now() / 380) + 1)) / 2;
        pg.alpha =
          nearRef.current || selectedRef.current
            ? Math.min(0.7, base + 0.25)
            : base;
      }
    },
    [id, radius, onExited, idleFrames, runFrames, motionRef, status],
  );
  useTick(tick);

  const shadow = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x000000, alpha: 0.35 });
    g.ellipse(0, 0, 7, 3);
    g.fill();
  }, []);

  const ringColor = STATUS_RING[status] ?? 0x8aa0b4;
  const ring = useCallback(
    (g: Graphics) => {
      g.clear();
      const lit = selected || near;
      g.setStrokeStyle({
        width: lit ? 1.8 : hovered ? 1.2 : 1,
        color: selected ? 0x4fe0ff : ringColor,
        alpha: lit || hovered ? 1 : 0.8,
      });
      g.ellipse(0, 0, lit ? 11 : 9, lit ? 5 : 4);
      g.stroke();
    },
    [selected, near, hovered, ringColor],
  );

  // Status dot beside the nameplate.
  const dot = useCallback(
    (g: Graphics) => {
      g.clear();
      g.setFillStyle({ color: ringColor, alpha: 1 });
      g.circle(0, 0, 2);
      g.fill();
    },
    [ringColor],
  );

  // Context-window charge bar above the nameplate.
  const BAR_W = 22;
  const bar = useCallback(
    (g: Graphics) => {
      g.clear();
      if (utilization == null) return; // 无数据 → 不画
      const u = Math.max(0, Math.min(100, utilization));
      // 槽
      g.setFillStyle({ color: 0x0e1622, alpha: 0.9 });
      g.rect(-BAR_W / 2, 0, BAR_W, 3);
      g.fill();
      // 填充:<20 绿 / 20-80 琥珀 / >80 红
      const color = u > 80 ? 0xff5ea0 : u >= 20 ? 0xffd166 : 0x6bf0a0;
      g.setFillStyle({ color, alpha: 1 });
      g.rect(-BAR_W / 2, 0, (BAR_W * u) / 100, 3);
      g.fill();
      // 20% 阈值刻度线
      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.6 });
      g.moveTo(-BAR_W / 2 + BAR_W * 0.2, -1);
      g.lineTo(-BAR_W / 2 + BAR_W * 0.2, 4);
      g.stroke();
    },
    [utilization],
  );

  const nameStyle = useMemo(
    () => ({ fontSize: 7, fill: 0xdce8f2 }) as Partial<TextStyle>,
    [],
  );
  const slotStyle = useMemo(
    () => ({ fontSize: 7, fill: 0xffd166 }) as Partial<TextStyle>,
    [],
  );
  const hintStyle = useMemo(
    () => ({ fontSize: 7, fill: 0x4fe0ff }) as Partial<TextStyle>,
    [],
  );

  const shortTitle = title.length > 16 ? `${title.slice(0, 15)}…` : title;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: PixiJS canvas — keyboard a11y N/A
    <pixiContainer
      ref={rootRef}
      eventMode="static"
      cursor="pointer"
      onClick={onSelect}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <pixiGraphics y={1} draw={shadow} />
      <pixiGraphics draw={ring} />
      <pixiSprite
        ref={portalGlowRef}
        texture={glowTexture()}
        anchor={0.5}
        y={1}
        scale={0.28}
        tint={ringColor}
        alpha={0.35}
        blendMode="add"
      />
      <pixiContainer ref={flipRef}>
        <pixiAnimatedSprite ref={spriteRef} textures={idleFrames} />
      </pixiContainer>

      {/* nameplate: status dot · title · "?" askuser placeholder slot */}
      <pixiContainer y={-30}>
        <pixiGraphics x={-26} y={1} draw={dot} />
        <pixiText
          text={shortTitle}
          anchor={{ x: 0, y: 0.5 }}
          x={-21}
          resolution={4}
          style={nameStyle}
        />
        <pixiText
          text="?"
          anchor={0.5}
          x={30}
          resolution={4}
          style={slotStyle}
        />
        <pixiGraphics y={-8} draw={bar} />
      </pixiContainer>

      {near && !leaving ? (
        <pixiText
          text="[E] 查看"
          anchor={0.5}
          y={-20}
          resolution={4}
          style={hintStyle}
        />
      ) : null}
    </pixiContainer>
  );
}
