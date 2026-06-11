import { useEffect, useRef, useState } from "react";
import { useT, useTL } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { portalFrame } from "./portal";

const DURATION_MS = 900;

/**
 * 全屏传送门过场。transition 非空时跑一次 rAF:前半淡入到不透明,中点真正切 view
 * (enter→进内景 / exit→回大厅),后半淡出,结束清 transition。解耦 Pixi 生命周期。
 *
 * T3.13:视觉层由「DOM 径向渐变」升级为原型的蓝色粒子漩涡(对标 panels2.jsx Transition
 * + layout.css 286–295)。portalFrame / 中点切 view 时机 / swappedRef / endTransition
 * 逻辑原样保留;仅把 DURATION 由 420→900,让漩涡转动可被感知(420ms 太短读不出粒子)。
 * 省略原型的 save 图标与「点击任意处继续」hint —— 本过场是自动定时、无点击关闭交互,
 * 显示「点击继续」会误导。文案取真实会话数据(标题 / agent 数 / model),不抄原型 mock 台词。
 */
export function PortalTransition() {
  const t = useT();
  const tl = useTL();
  const transition = useUiStore((s) => s.transition);
  const enterInterior = useUiStore((s) => s.enterInterior);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const endTransition = useUiStore((s) => s.endTransition);
  const switchSession = useRoomStore((s) => s.switchSession);
  // 取稳定 map 引用;具体会话在 render 体里派生(取已有对象引用,非构造新值,合规)。
  const sessions = useRoomStore((s) => s.sessions);
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

  const session = transition ? sessions[transition.sessionId] : undefined;
  const isEnter = transition?.kind === "enter";
  const agentCount = session ? Object.keys(session.agents).length : 0;
  const topText = isEnter
    ? t(`进入 ${session?.title ?? tl("会话", "session")}`)
    : t("返回大厅");
  const bottomText = isEnter
    ? `${agentCount}P · ${session?.model ?? ""}`
    : (session?.title ?? "");

  return (
    <div
      className="portal-vortex"
      style={{
        opacity: cover,
        pointerEvents: cover > 0.05 ? "auto" : "none",
      }}
    >
      <div className="vortex-top cjk">{topText}</div>
      <div className="vortex">
        <div className="vortex-glow" />
        <div className="vortex-spin" />
        <div className="vortex-core" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="vortex-particle"
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
      </div>
      {bottomText ? <div className="vortex-bot cjk">{bottomText}</div> : null}
    </div>
  );
}
