import type { CSSProperties } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { ChatDrawer } from "./ChatDrawer";
import { ModelPicker } from "./ModelPicker";
import { SkillGrid } from "./SkillGrid";

const btn: CSSProperties = {
  position: "absolute",
  width: 48,
  height: 48,
  borderRadius: 13,
  background: "#16263d",
  border: "2px solid #2a4a5e",
  color: "#cffcf7",
  fontSize: 21,
  cursor: "pointer",
};

export function Hud() {
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const agentCount = Object.keys(session?.agents ?? {}).length;
  return (
    <>
      <button type="button" title="设置" style={{ ...btn, top: 12, left: 12 }}>
        ⚙
      </button>
      <button
        type="button"
        title="模型"
        style={{ ...btn, top: 12, right: 70 }}
        onClick={() => toggle("modelOpen")}
      >
        💎
      </button>
      <button type="button" title="模式" style={{ ...btn, top: 12, right: 12 }}>
        🛡
      </button>
      <button
        type="button"
        title="技能"
        style={{ ...btn, bottom: 74, left: 12 }}
        onClick={() => toggle("skillsOpen")}
      >
        📜
      </button>
      <button
        type="button"
        title="背包"
        style={{ ...btn, bottom: 12, left: 12 }}
      >
        🎒
      </button>
      <button
        type="button"
        title="聊天"
        style={{ ...btn, bottom: 12, right: 12 }}
        onClick={() => toggle("drawerOpen")}
      >
        💬
      </button>
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#cffcf7",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        ⚔ {session?.title ?? "no session"} · {agentCount} agents
      </div>
      <ChatDrawer />
      <ModelPicker />
      <SkillGrid />
    </>
  );
}
