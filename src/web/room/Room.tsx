import { Application, extend, useTick } from "@pixi/react";
import { AnimatedSprite, Container, Graphics, Sprite, Text } from "pixi.js";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Agent } from "../../shared/domain";
import { toolNameToIcon } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { Character } from "./Character";
import { Portal } from "./Portal";
import { roomLayout } from "./layout";

// Register PixiJS classes → <pixiContainer>, <pixiGraphics>, <pixiText> (module scope — Appendix A).
extend({ Container, Graphics, Sprite, AnimatedSprite, Text });

const W = 900;
const H = 560;
const SKIN_COLORS: Record<string, number> = {
  lead: 0xffd166,
  cyan: 0x00ffe7,
  mag: 0xff3ea5,
  grn: 0x5cff9d,
  gold: 0xffd166,
  purple: 0x9b5de5,
};

function Floor() {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.setFillStyle({ color: 0x13243b });
    g.rect(0, 0, W, H);
    g.fill();
    g.setStrokeStyle({ width: 1, color: 0x1c3350 });
    for (let x = 0; x <= W; x += 30) {
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let y = 0; y <= H; y += 30) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
  }, []);
  return <pixiGraphics draw={draw} />;
}

function Scene() {
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
        W,
        H,
      ),
    [agents],
  );
  const [t, setT] = useState(0);
  // Memoized so the ticker callback isn't re-registered every frame (Appendix A gotcha).
  const tick = useCallback(
    (ticker: { deltaTime: number }) => setT((v) => v + ticker.deltaTime),
    [],
  );
  useTick(tick);

  return (
    <pixiContainer>
      <Floor />
      <Portal x={70} y={H - 70} />
      {agents.map((a) => {
        const pos = layout[a.id] ?? { x: W / 2, y: H / 2 };
        const bob = a.status === "working" ? Math.sin(t * 0.15 + pos.x) * 3 : 0;
        const icon = a.currentTool
          ? toolNameToIcon(a.currentTool)
          : a.kind === "orchestrator"
            ? "★"
            : "";
        return (
          <Character
            key={a.id}
            x={pos.x}
            y={pos.y + bob}
            color={SKIN_COLORS[a.skin] ?? 0xffffff}
            icon={icon}
            isLead={a.kind === "orchestrator"}
          />
        );
      })}
    </pixiContainer>
  );
}

export function Room() {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0c1422} antialias>
        <Scene />
      </Application>
    </div>
  );
}
