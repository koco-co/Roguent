import { useTick } from "@pixi/react";
import type { Container, TextStyle } from "pixi.js";
import { useRef } from "react";
import type { AgentStatus } from "../../shared/domain";

/**
 * Tiny head-top emote: an occasional "zzz" when idle, "..." when thinking,
 * nothing otherwise. Blinks at low frequency via useTick (no React state). It
 * never overlaps the tool bubble — that only shows while working with a tool,
 * which renders no emote (spec §6.4).
 */
export function Emote({ status }: { status: AgentStatus }) {
  const rootRef = useRef<Container | null>(null);
  const t = useRef(0);

  const text = status === "idle" ? "zzz" : status === "thinking" ? "..." : "";

  useTick((ticker: { deltaTime: number }) => {
    const c = rootRef.current;
    if (!c) return;
    t.current += ticker.deltaTime;
    if (status === "idle") {
      // slow pulse, visible roughly half the time
      const phase = Math.sin(t.current * 0.03);
      c.alpha = phase > 0 ? phase : 0;
    } else {
      // thinking: a gentle steady blink
      c.alpha = 0.5 + 0.5 * Math.abs(Math.sin(t.current * 0.12));
    }
  });

  if (!text) return null;

  return (
    <pixiContainer ref={rootRef} y={-26} alpha={0}>
      <pixiText
        text={text}
        anchor={0.5}
        resolution={4}
        style={
          {
            fontSize: 8,
            fill: 0xcfd8ff,
            fontStyle: "italic",
          } as Partial<TextStyle>
        }
      />
    </pixiContainer>
  );
}
