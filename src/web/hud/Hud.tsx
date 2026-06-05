import type { Session } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { AgentCard } from "./AgentCard";
import { ChatDrawer } from "./ChatDrawer";
import { ImportPanel } from "./ImportPanel";
import { LimitBars } from "./LimitBars";
import { LootPanel } from "./LootPanel";
import { ModelPicker } from "./ModelPicker";
import { SkillGrid } from "./SkillGrid";
import { IconButton, StatRow, shortModel } from "./widgets";

function InfoPopover({ session }: { session: Session | undefined }) {
  const open = useUiStore((s) => s.infoOpen);
  if (!open || !session) return null;
  return (
    <div
      className="px-panel px-pop"
      style={{
        position: "absolute",
        top: 70,
        left: 12,
        width: 224,
        padding: 12,
      }}
    >
      <div className="px-title">⚙ 会话信息</div>
      <StatRow k="模型" v={shortModel(session.model)} />
      <StatRow k="模式" v={session.permissionMode} />
      <StatRow k="状态" v={session.status} />
      <StatRow k="Token" v={session.usage.tokens.toLocaleString()} />
      <StatRow k="花费" v={`$${session.usage.cost.toFixed(4)}`} />
    </div>
  );
}

export function Hud() {
  const toggle = useUiStore((s) => s.toggle);
  // Subscribe only to the per-panel open flags this HUD renders, so the dock /
  // hotbar don't re-render on unrelated ui-store changes (transition, selection…).
  const infoOpen = useUiStore((s) => s.infoOpen);
  const skillsOpen = useUiStore((s) => s.skillsOpen);
  const lootOpen = useUiStore((s) => s.lootOpen);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const modelOpen = useUiStore((s) => s.modelOpen);
  const importOpen = useUiStore((s) => s.importOpen);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const agentCount = Object.keys(session?.agents ?? {}).length;
  const tokens = session?.usage.tokens ?? 0;

  return (
    <>
      <LimitBars />
      {/* top status banner */}
      <div
        className="px-panel px-topbar pf"
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <span style={{ color: "var(--pink)" }}>⚔</span>
        <span>{session?.title ?? "no session"}</span>
        <span className="sep">·</span>
        <span className="px-stat">{shortModel(session?.model)}</span>
        <span className="sep">·</span>
        <span className="px-stat cy">{agentCount}P</span>
        <span className="sep">·</span>
        <span className="px-stat">🪙{tokens.toLocaleString()}</span>
      </div>

      {/* left-top settings dock */}
      <div className="px-dock">
        <IconButton
          icon="⚙"
          title="会话信息"
          lit={infoOpen}
          onClick={() => toggle("infoOpen")}
        />
      </div>

      {/* bottom-center action hotbar */}
      <div className="px-hotbar">
        <IconButton
          icon="📜"
          title="技能"
          lit={skillsOpen}
          onClick={() => toggle("skillsOpen")}
        />
        <IconButton
          icon="🎒"
          title="背包"
          lit={lootOpen}
          onClick={() => toggle("lootOpen")}
        />
        <IconButton
          icon="💬"
          title="聊天"
          lit={drawerOpen}
          onClick={() => toggle("drawerOpen")}
        />
        <IconButton
          icon="💎"
          title="模型"
          lit={modelOpen}
          onClick={() => toggle("modelOpen")}
        />
        <IconButton
          icon="📂"
          title="导入会话"
          lit={importOpen}
          onClick={() => toggle("importOpen")}
        />
      </div>

      <InfoPopover session={session} />
      <AgentCard />
      <LootPanel />
      <ChatDrawer />
      <ModelPicker />
      <SkillGrid />
      <ImportPanel />
    </>
  );
}
