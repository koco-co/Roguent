import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../settings-store";
import { HeroSelect } from "./HeroSelect";

export function LoginGate() {
  const avatarHero = useSettingsStore((s) => s.avatarHero);
  const [started, setStarted] = useState(false);
  const startRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (avatarHero === null && !started) startRef.current?.focus();
  }, [avatarHero, started]);

  if (avatarHero !== null) return null;

  return (
    <dialog
      open
      className="scrim charsel login-gate"
      aria-modal="true"
      aria-labelledby="login-gate-title"
    >
      {started ? (
        <HeroSelect />
      ) : (
        <div
          className="panel rivets modal-pop login-gate-panel"
          style={{ width: "min(620px, 92vw)" }}
        >
          <div className="login-gate-mark px">ROGUENT</div>
          <div id="login-gate-title" className="login-gate-title cjk">
            远程开发地下城
          </div>
          <div className="login-gate-sub cjk">
            选择一个像素英雄进入大厅。底层引擎连接会继续初始化。
          </div>
          <button
            ref={startRef}
            type="button"
            className="pxbtn primary cjk login-gate-start"
            onClick={() => setStarted(true)}
          >
            Start
          </button>
        </div>
      )}
    </dialog>
  );
}
