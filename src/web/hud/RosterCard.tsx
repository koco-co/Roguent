import type { Agent, AgentStatus } from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Icon, type IconName } from "./icons";

// Stable empty ref: a zustand selector must NOT build a fresh value each call
// (Object.values / [] / {}), or useSyncExternalStore sees a new snapshot every
// render → "getSnapshot should be cached" infinite loop. Select the stable
// agents map (or this constant) and derive the array in render. See LootPanel.
const EMPTY_AGENTS: Record<string, Agent> = {};

// alert 角标:对标原型 RosterCard 的 status→icon 规则。
// 原型有 'askuser' / 'todo' 两种状态,引擎暂未产出(我们的 AgentStatus 只有
// spawning/thinking/working/idle/done),故仅保留映射占位、待引擎补齐;当前没有
// 任一真实状态命中,角标实际不显示——绝不硬造假数据。
// 引擎暂无:'askuser' → ask、'todo' → todo、'error' → error(SessionStatus 才有 error,
// 单个 Agent 无 error 状态)。后续这些状态接入后此函数即自动生效。
type AlertIcon = "ask" | "error" | "todo";
export function rosterAlert(status: AgentStatus): AlertIcon | null {
  switch (status) {
    // case "askuser": return "ask"; // 引擎暂无,待后续
    // case "error":   return "error"; // 引擎暂无(Agent 无 error 状态),待后续
    // case "todo":    return "todo"; // 引擎暂无,待后续
    default:
      return null;
  }
}

/** RosterCard 的单个在岗头像格(像素英雄 + 选中高亮 + 可选 alert 角标)。 */
function RosterAvatar({
  agent,
  selected,
  onSelect,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const isLead = agent.kind === "orchestrator";
  // 与内景房间一致的 per-agent 取英雄:指挥官用金骑士、子智能体按 role 哈希取池。
  const hero = isLead ? ORCHESTRATOR_HERO : roleToHero(agent.role);
  const alert = rosterAlert(agent.status);
  return (
    <button
      type="button"
      title={agent.role}
      className={`roster-av${selected ? " sel" : ""}${isLead ? " orc" : ""}`}
      onClick={() => onSelect(agent.id)}
    >
      <div className="roster-portrait">
        <HeroPortrait
          sessionId=""
          hero={hero}
          size={46}
          className="roster-portrait-canvas"
        />
      </div>
      {alert && (
        <div className={`roster-alert${alert === "ask" ? " askpulse" : ""}`}>
          <Icon name={alert as IconName} size={12} />
        </div>
      )}
    </button>
  );
}

/**
 * 内景左上「在岗」轮播卡(对标设计原型 RosterCard):当前会话的全部 agents 头像
 * 一字排开,指挥官金染、选中高亮、点击选中该 agent(驱动 AgentCard 详情)。
 * 数据源 = 当前会话 s.sessions[currentSessionId].agents;选中态走 useUiStore。
 */
export function RosterCard() {
  const t = useT();
  // 仅内景 HUD 显示;总览大厅没有「在岗」概念。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const select = useUiStore((s) => s.select);
  const selectedId = useUiStore((s) => s.selectedAgentId);
  // Select the stable agents map (never a fresh array) — see EMPTY_AGENTS note.
  const agentsMap = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.agents ?? EMPTY_AGENTS)
      : EMPTY_AGENTS,
  );

  if (!inInterior) return null;

  const agents = Object.values(agentsMap);

  return (
    <div className="panel roster">
      <div className="roster-body">
        <div className="roster-h px">
          <span>{t("在岗")}</span>
          <span className="gold">
            {agents.length} {t("在岗")}
          </span>
        </div>
        {agents.length === 0 ? (
          <div className="roster-empty px">{t("暂无在岗")}</div>
        ) : (
          <div className="roster-row">
            {agents.map((a) => (
              <RosterAvatar
                key={a.id}
                agent={a}
                selected={selectedId === a.id}
                onSelect={select}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
