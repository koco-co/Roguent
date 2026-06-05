import type { Session } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { About } from "./About";
import { AgentCard } from "./AgentCard";
import { ChatDrawer } from "./ChatDrawer";
import { ImportPanel } from "./ImportPanel";
import { Leaderboard } from "./Leaderboard";
import { LimitBars } from "./LimitBars";
import { LootPanel } from "./LootPanel";
import { ModelPicker } from "./ModelPicker";
import { RosterCard } from "./RosterCard";
import { SkillGrid } from "./SkillGrid";
import { Icon } from "./icons";
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
      <div
        className="px-title"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <Icon name="gear" size={14} />
        会话信息
      </div>
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
  const leaderboardOpen = useUiStore((s) => s.leaderboardOpen);
  const activePanel = useUiStore((s) => s.activePanel);
  const openPanel = useUiStore((s) => s.openPanel);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const agentCount = Object.keys(session?.agents ?? {}).length;
  const tokens = session?.usage.tokens ?? 0;

  return (
    <>
      <LimitBars />
      {/* 内景左上栈:在岗轮播卡(自带绝对定位,落在 LimitBars 下方)*/}
      <RosterCard />
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
        <span style={{ color: "var(--pink)", display: "flex" }}>
          <Icon name="task" size={14} />
        </span>
        <span>{session?.title ?? "no session"}</span>
        <span className="sep">·</span>
        <span className="px-stat">{shortModel(session?.model)}</span>
        <span className="sep">·</span>
        <span className="px-stat cy">{agentCount}P</span>
        <span className="sep">·</span>
        <span
          className="px-stat"
          style={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          <Icon name="coins" size={14} />
          {tokens.toLocaleString()}
        </span>
      </div>

      {/* right-top settings dock (moved right to make room for LimitBars) */}
      <div className="px-dock">
        <IconButton
          icon={<Icon name="gear" size={28} />}
          title="会话信息"
          lit={infoOpen}
          onClick={() => toggle("infoOpen")}
        />
        {/* 单一面板路由入口(完整 ButtonDock 重建是 T2.4,这里仅证明路由可用)*/}
        <IconButton
          icon={<Icon name="account" size={28} />}
          title="关于"
          lit={activePanel === "about"}
          onClick={() => openPanel("about")}
        />
      </div>

      {/* bottom-center action hotbar */}
      <div className="px-hotbar">
        <IconButton
          icon={<Icon name="spellbook" size={28} />}
          title="技能"
          lit={skillsOpen}
          onClick={() => toggle("skillsOpen")}
        />
        <IconButton
          icon={<Icon name="pouch" size={28} />}
          title="背包"
          lit={lootOpen}
          onClick={() => toggle("lootOpen")}
        />
        <IconButton
          icon={<Icon name="chat" size={28} />}
          title="聊天"
          lit={drawerOpen}
          onClick={() => toggle("drawerOpen")}
        />
        <IconButton
          icon={<Icon name="crystal" size={28} />}
          title="模型"
          lit={modelOpen}
          onClick={() => toggle("modelOpen")}
        />
        <IconButton
          icon={<Icon name="import" size={28} />}
          title="导入会话"
          lit={importOpen}
          onClick={() => toggle("importOpen")}
        />
        <IconButton
          icon={<Icon name="trophy" size={28} />}
          title="排行榜"
          lit={leaderboardOpen}
          onClick={() => toggle("leaderboardOpen")}
        />
      </div>

      <InfoPopover session={session} />
      <AgentCard />
      <LootPanel />
      <ChatDrawer />
      <ModelPicker />
      <SkillGrid />
      <ImportPanel />
      <Leaderboard />
      <About />
    </>
  );
}
