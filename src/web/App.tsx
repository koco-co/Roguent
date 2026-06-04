import { useEffect } from "react";
import { Hud } from "./hud/Hud";
import { NpcCard } from "./hud/NpcCard";
import { Overworld } from "./overworld/Overworld";
import { Room } from "./room/Room";
import { useRoomStore } from "./store";
import { useUiStore } from "./ui-store";
import { connectRoom } from "./ws-client";

export function App() {
  const view = useUiStore((s) => s.view);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const inInterior = view !== "overworld";
  const interiorId = typeof view === "object" ? view.interior : null;
  // 内景会话是否已不可见(被软归档或硬删除)。缺失 → 视作已离场。
  const interiorGone = useRoomStore((s) =>
    interiorId ? (s.sessions[interiorId]?.archived ?? true) : false,
  );

  // 进入内景后该会话被 LRU 归档 / 删除 → 自动回落大厅,避免困在幽灵内景
  // (spec §架构: 双层缩放;§生命周期: ≤10/LRU 软归档)。
  useEffect(() => {
    if (interiorId && interiorGone) exitOverworld();
  }, [interiorId, interiorGone, exitOverworld]);

  useEffect(() => {
    const conn = connectRoom();
    return () => conn.close();
  }, []);

  // Esc returns from an interior to the overworld lobby (spec §架构: Esc/门 zoom-out).
  useEffect(() => {
    if (!inInterior) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitOverworld();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inInterior, exitOverworld]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* 双层缩放:总览大厅 ↔ 进入的会话内景(Room 读 currentSessionId,进入时已切)。*/}
      {inInterior ? <Room /> : <Overworld />}
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
          onClick={exitOverworld}
        >
          ← 大厅
        </button>
      ) : (
        <NpcCard />
      )}
    </div>
  );
}
