import type React from "react";
import { useEffect, useRef } from "react";
import { InteriorEasterLayer } from "./easter/InteriorEasterLayer";
import { KonamiListener } from "./easter/KonamiListener";
import { resolveEngineUrl } from "./engine-url";
import { Hud } from "./hud/Hud";
import { NpcCard } from "./hud/NpcCard";
import { AnnouncementPopup } from "./hud/mailbox/AnnouncementPopup";
import { useT } from "./i18n";
import { LobbyView } from "./lobby/HubPlaza";
import { LoginGate } from "./lobby/LoginGate";
import { PortalTransition } from "./overworld/PortalTransition";
import { Room } from "./room/Room";
import {
  settingsRootClass,
  settingsRootStyle,
  useSettingsStore,
} from "./settings-store";
import { stageScale } from "./stage-scale";
import { useRoomStore } from "./store";
import { useUiStore } from "./ui-store";
import { type RoomConnection, connectRoom } from "./ws-client";

// 把固定 1920×1080 舞台等比缩放到当前窗口(对齐原型 useStageScale)。把缩放因子写进
// #viewport 的 --stage-scale CSS 变量(命令式,避免 resize 每帧触发 React 重渲染)。
function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const scale = stageScale(window.innerWidth, window.innerHeight);
      el.style.setProperty("--stage-scale", String(scale));
      el.style.setProperty("--stage-inverse-scale", String(1 / scale));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref]);
}

export function App() {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const beginExit = useUiStore((s) => s.beginExit);
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const selectedNpcId = useUiStore((s) => s.selectedNpcId);
  const selectNpc = useUiStore((s) => s.selectNpc);
  const selectedAgentId = useUiStore((s) => s.selectedAgentId);
  const selectAgent = useUiStore((s) => s.select);
  const avatarHero = useSettingsStore((s) => s.avatarHero);
  const inInterior = view !== "overworld";
  const loginGateActive = avatarHero === null;
  const interiorId = typeof view === "object" ? view.interior : null;
  // 内景会话是否已不可见(被软归档或硬删除)。缺失 → 视作已离场。
  const interiorGone = useRoomStore((s) =>
    interiorId ? (s.sessions[interiorId]?.archived ?? true) : false,
  );

  // 用户 UI 偏好驱动根节点的主题 class 与 CSS 变量(T1.1)。
  const settings = useSettingsStore();

  const viewportRef = useRef<HTMLDivElement>(null);
  useStageScale(viewportRef);

  // 进入内景后该会话被 LRU 归档 / 删除 → 自动回落大厅,避免困在幽灵内景
  // (spec §架构: 双层缩放;§生命周期: ≤10/LRU 软归档)。
  useEffect(() => {
    if (interiorId && interiorGone) exitOverworld();
  }, [interiorId, interiorGone, exitOverworld]);

  useEffect(() => {
    let conn: RoomConnection | null = null;
    let cancelled = false;
    resolveEngineUrl()
      .then((url) => {
        if (!cancelled) conn = connectRoom(url);
      })
      .catch(() => {
        // engine 不可达(如 Tauri 重试耗尽)→ 置 closed,触发 ErrorOverlay 离线错误层。
        useRoomStore.getState().setConnection("closed");
      });
    return () => {
      cancelled = true;
      conn?.close();
    };
  }, []);

  // Esc 集中处理:先关打开的模态面板(优先);否则从内景 zoom-out 回大厅
  // (spec §架构: Esc/门 zoom-out)。两者互斥,避免一次 Esc 同时关面板又退内景。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // NpcCard 改成 Modal 后由这里集中处理 Esc 关闭(Modal 本身不监听 Esc,T1.2 约定)。
      if (selectedAgentId) {
        selectAgent(null);
        return;
      }
      if (selectedNpcId) {
        selectNpc(null);
        return;
      }
      if (activePanel !== null) {
        closePanel();
        return;
      }
      if (inInterior && interiorId) beginExit(interiorId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    inInterior,
    interiorId,
    beginExit,
    activePanel,
    closePanel,
    selectedAgentId,
    selectAgent,
    selectedNpcId,
    selectNpc,
  ]);

  return (
    <div id="viewport" ref={viewportRef} className="viewport">
      {/* Always-mounted global listeners and overlays (outside live layer so they
          survive LoginGate's inert attribute). */}
      <KonamiListener />
      <AnnouncementPopup />
      <div
        id="stage"
        className={`stage ${settingsRootClass(settings)}`}
        style={settingsRootStyle(settings) as React.CSSProperties}
      >
        <div
          className="app-live-layer"
          aria-hidden={loginGateActive}
          inert={loginGateActive || undefined}
        >
          {/* 双层缩放:总览大厅(暖色 DOM 广场)↔ 进入的会话内景(Pixi Room)。*/}
          {inInterior ? <Room /> : <LobbyView />}
          {/* 内景彩蛋覆盖层:盖在 Pixi canvas 上(pointer-events 穿透),HUD 之下。*/}
          {inInterior ? <InteriorEasterLayer /> : null}
          <Hud />
          {inInterior ? (
            <button
              type="button"
              className="px-btn pf"
              style={{
                position: "absolute",
                top: 14,
                left: 70,
                padding: "8px 12px",
                fontSize: 10,
                color: "var(--cyan)",
              }}
              onClick={() => interiorId && beginExit(interiorId)}
            >
              ← {t("大厅")}
            </button>
          ) : (
            <NpcCard />
          )}
          <PortalTransition />
        </div>
        {/* 首次进入的 start gate + 角色选择门(avatarHero === null 时覆盖 overworld + HUD)。*/}
        <LoginGate />
      </div>
    </div>
  );
}
