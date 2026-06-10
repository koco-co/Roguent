import { useTick } from "@pixi/react";
import type { Graphics } from "pixi.js";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { VH, VW } from "./config";
import type { MotionMap } from "./motion";

type Kind = "dust" | "spark" | "coin" | "rain";

interface P {
  kind: Kind;
  loop: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  fade: number;
  size: number;
  color: number;
  alpha: number;
  gravity: number;
  floorY: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// A slow ambient mote drifting somewhere in the room; loops forever.
function makeDust(): P {
  return {
    kind: "dust",
    loop: true,
    x: rand(10, VW - 10),
    y: rand(18, VH - 14),
    vx: rand(-0.05, 0.05),
    vy: rand(-0.12, -0.03),
    life: rand(120, 320),
    fade: 70,
    size: rand(1, 2),
    color: 0xcdbfa0,
    alpha: rand(0.1, 0.22),
    gravity: 0,
    floorY: VH,
  };
}

function makeRain(): P {
  return {
    kind: "rain",
    loop: true,
    x: rand(12, VW - 12),
    y: rand(4, VH - 42),
    vx: rand(-0.16, -0.04),
    vy: rand(0.7, 1.2),
    life: rand(40, 90),
    fade: 18,
    size: rand(5, 9),
    color: 0x6fd8ff,
    alpha: rand(0.1, 0.24),
    gravity: 0,
    floorY: VH,
  };
}

/**
 * Imperative particle layer: ambient dust, sparks over working agents, footstep
 * dust under moving agents, a coin burst on loot, and a dust poof at the door
 * when an agent spawns. Live agent positions are read each frame from the shared
 * motionRef. Everything is drawn into one Graphics inside useTick so there are
 * no per-frame React re-renders.
 */
export function Particles({
  motionRef,
  doorPos,
  lootCount,
  agentCount,
  particlesEnabled = true,
  rainEnabled = true,
}: {
  motionRef: RefObject<MotionMap>;
  doorPos: { x: number; y: number };
  lootCount: number;
  agentCount: number;
  particlesEnabled?: boolean;
  rainEnabled?: boolean;
}) {
  const gfxRef = useRef<Graphics | null>(null);
  const list = useRef<P[]>([]);
  const accum = useRef(0);
  const dustAccum = useRef(0);
  const doorRef = useRef(doorPos);
  doorRef.current = doorPos;
  const prevLoot = useRef(lootCount);
  const prevAgents = useRef(agentCount);

  const push = useCallback((p: P) => {
    if (list.current.length < 500) list.current.push(p);
  }, []);

  // seed ambient dust/rain from settings-controlled sources
  useEffect(() => {
    if (!particlesEnabled) {
      list.current = list.current.filter((p) => p.kind === "rain");
      return;
    }
    const dustCount = list.current.filter((p) => p.kind === "dust").length;
    for (let i = dustCount; i < 18; i++) push(makeDust());
  }, [particlesEnabled, push]);

  useEffect(() => {
    if (!rainEnabled) {
      list.current = list.current.filter((p) => p.kind !== "rain");
      return;
    }
    const rainCount = list.current.filter((p) => p.kind === "rain").length;
    for (let i = rainCount; i < 26; i++) push(makeRain());
  }, [rainEnabled, push]);

  // coin + sparkle burst when loot drops
  useEffect(() => {
    if (particlesEnabled && lootCount > prevLoot.current) {
      const cx = VW / 2;
      const cy = VH * 0.5;
      for (let i = 0; i < 16; i++) {
        push({
          kind: "coin",
          loop: false,
          x: cx,
          y: cy,
          vx: rand(-1.4, 1.4),
          vy: rand(-3.2, -1.6),
          life: rand(70, 110),
          fade: 26,
          size: 2,
          color: 0xffd24a,
          alpha: 1,
          gravity: 0.14,
          floorY: cy + rand(10, 44),
        });
      }
      for (let i = 0; i < 10; i++) {
        push({
          kind: "spark",
          loop: false,
          x: cx,
          y: cy,
          vx: rand(-1.6, 1.6),
          vy: rand(-1.6, 0.4),
          life: rand(24, 44),
          fade: 18,
          size: rand(1, 2),
          color: 0xfff3b0,
          alpha: 1,
          gravity: 0.02,
          floorY: VH,
        });
      }
    }
    prevLoot.current = lootCount;
  }, [lootCount, particlesEnabled, push]);

  // dust poof at the doorway when a new agent enters
  useEffect(() => {
    if (particlesEnabled && agentCount > prevAgents.current) {
      const { x, y } = doorRef.current;
      for (let i = 0; i < 12; i++) {
        push({
          kind: "dust",
          loop: false,
          x: x + rand(-6, 6),
          y: y + rand(-2, 6),
          vx: rand(-0.6, 0.6),
          vy: rand(-0.8, -0.1),
          life: rand(28, 52),
          fade: 22,
          size: rand(1, 2),
          color: 0xbfe6ff,
          alpha: 0.6,
          gravity: 0.01,
          floorY: VH,
        });
      }
    }
    prevAgents.current = agentCount;
  }, [agentCount, particlesEnabled, push]);

  const tick = useCallback(
    (ticker: { deltaTime: number }) => {
      const dt = Math.min(ticker.deltaTime, 2);
      const g = gfxRef.current;
      if (!g) return;

      accum.current += dt;
      dustAccum.current += dt;
      const sparkTick = accum.current >= 7;
      const dustTick = dustAccum.current >= 8;
      if (sparkTick) accum.current = 0;
      if (dustTick) dustAccum.current = 0;
      if (particlesEnabled && (sparkTick || dustTick)) {
        for (const w of Object.values(motionRef.current ?? {})) {
          // a spark rising off each working agent
          if (sparkTick && w.status === "working") {
            push({
              kind: "spark",
              loop: false,
              x: w.x + rand(-4, 4),
              y: w.y - 18 + rand(-2, 2),
              vx: rand(-0.3, 0.3),
              vy: rand(-0.5, -0.15),
              life: rand(26, 46),
              fade: 20,
              size: rand(1, 2),
              color: 0xfff0a0,
              alpha: 0.9,
              gravity: 0,
              floorY: VH,
            });
          }
          // a small puff of dust kicked up under a moving agent's feet
          if (dustTick && w.moving) {
            push({
              kind: "dust",
              loop: false,
              x: w.x + rand(-2, 2),
              y: w.y - 1,
              vx: rand(-0.15, 0.15),
              vy: rand(-0.25, -0.05),
              life: rand(14, 24),
              fade: 12,
              size: 1,
              color: 0xcdbfa0,
              alpha: 0.5,
              gravity: 0,
              floorY: VH,
            });
          }
        }
      }

      const arr = list.current;
      g.clear();
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        if (!p) continue;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.kind === "coin" && p.vy > 0 && p.y >= p.floorY) {
          p.y = p.floorY;
          p.vy *= -0.45;
          p.vx *= 0.7;
          if (Math.abs(p.vy) < 0.4) p.vy = 0;
        }
        if (p.life <= 0) {
          if (p.loop) {
            Object.assign(p, p.kind === "rain" ? makeRain() : makeDust());
          } else {
            arr.splice(i, 1);
            continue;
          }
        }
        const a = p.alpha * Math.max(0, Math.min(1, p.life / p.fade));
        if (a <= 0) continue;
        g.setFillStyle({ color: p.color, alpha: a });
        if (p.kind === "coin") {
          g.circle(p.x, p.y, p.size);
        } else if (p.kind === "rain") {
          g.rect(p.x, p.y, 1, p.size);
        } else {
          g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        g.fill();
      }
    },
    [push, motionRef, particlesEnabled],
  );
  useTick(tick);

  // Drawing happens imperatively in the ticker above; the draw prop is a
  // required no-op (pixiGraphics demands one).
  const noop = useCallback(() => {}, []);
  return <pixiGraphics ref={gfxRef} draw={noop} />;
}
