import { useEffect, useRef, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { portalFrame } from "./portal";

const DURATION_MS = 420;

/**
 * 全屏传送门遮罩。transition 非空时跑一次 rAF:前半淡入到不透明,中点真正切 view
 * (enter→进内景 / exit→回大厅),后半淡出,结束清 transition。解耦 Pixi 生命周期。
 */
export function PortalTransition() {
  const transition = useUiStore((s) => s.transition);
  const enterInterior = useUiStore((s) => s.enterInterior);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const endTransition = useUiStore((s) => s.endTransition);
  const switchSession = useRoomStore((s) => s.switchSession);
  const [cover, setCover] = useState(0);

  // 用 ref 装最新 action/transition,避免 rAF 闭包过期。
  const swappedRef = useRef(false);

  useEffect(() => {
    if (!transition) {
      setCover(0);
      return;
    }
    swappedRef.current = false;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const f = portalFrame(now - start, DURATION_MS);
      setCover(f.cover);
      if (f.swapped && !swappedRef.current) {
        swappedRef.current = true;
        if (transition.kind === "enter") {
          switchSession(transition.sessionId);
          enterInterior(transition.sessionId);
        } else {
          exitOverworld();
        }
      }
      if (f.done) {
        endTransition();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [transition, enterInterior, exitOverworld, endTransition, switchSession]);

  if (!transition && cover === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: cover > 0.05 ? "auto" : "none",
        background:
          "radial-gradient(circle at 50% 50%, #4fe0ff 0%, #1a0f3a 55%, #05030b 100%)",
        opacity: cover,
        transition: "none",
        zIndex: 50,
      }}
    />
  );
}
