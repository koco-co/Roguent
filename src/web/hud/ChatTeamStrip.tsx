import { useMemo } from "react";
import type { Agent } from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { HeroPortrait } from "./HeroPortrait";

// Stable empty ref: a zustand selector must NOT build a fresh value each call
// (Object.values / [] / {}), or useSyncExternalStore sees a new snapshot every
// render → "getSnapshot should be cached" infinite loop. Select the stable
// agents map (or this constant) and derive the array in useMemo. See RosterCard.
const EMPTY_AGENTS: Record<string, Agent> = {};

/** Single team-presence avatar: pixel hero + a status dot tinted by AgentStatus. */
function TeamAvatar({ agent }: { agent: Agent }) {
  const isLead = agent.kind === "orchestrator";
  const hero = isLead ? ORCHESTRATOR_HERO : roleToHero(agent.role);
  const ended = agent.status === "done";
  return (
    <div
      className={`cdrawer-team-av${isLead ? " lead" : ""}${ended ? " ended" : ""}`}
      title={`${agent.role}`}
    >
      <HeroPortrait sessionId="" hero={hero} size={28} className="" />
      <span className={`cdrawer-team-dot st-${agent.status}`} />
    </div>
  );
}

/**
 * 聊天抽屉里的「小队」(team-presence)头像行(对标设计原型 panels2.jsx 的
 * cdrawer-team 块):配置条下方一排队员像素头像 + 状态点。指挥官金标(lead)排首位。
 * 数据源 = 当前会话 s.sessions[sessionId].agents(真数据,非 mock)。
 *
 * zustand 铁律:selector 只取稳定的 agents map 引用,排序/派生放 useMemo,绝不在
 * selector 里构造新值。hooks 全在 early return 之前;空 agents → return null。
 */
export function ChatTeamStrip({ sessionId }: { sessionId: string }) {
  const t = useT();
  const agentsMap = useRoomStore(
    (s) => s.sessions[sessionId]?.agents ?? EMPTY_AGENTS,
  );
  // orchestrator 排首位,其余原序跟随。
  const agents = useMemo(() => {
    const list = Object.values(agentsMap);
    return list
      .slice()
      .sort(
        (a, b) =>
          (a.kind === "orchestrator" ? 0 : 1) -
          (b.kind === "orchestrator" ? 0 : 1),
      );
  }, [agentsMap]);

  if (agents.length === 0) return null;

  return (
    <div className="cdrawer-team">
      <span className="cdrawer-team-l px">{t("小队")}</span>
      {agents.map((a) => (
        <TeamAvatar key={a.id} agent={a} />
      ))}
    </div>
  );
}
