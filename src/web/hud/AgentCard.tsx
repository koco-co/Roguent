import type { AgentStatus } from "../../shared/domain";
import { toolNameToIcon } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";
import { StatRow } from "./widgets";

const STATUS_LABEL: Record<AgentStatus, string> = {
  spawning: "召唤中",
  thinking: "思考中",
  working: "工作中",
  idle: "待命",
  done: "完成",
};

/** Detail card for the character the user clicked in the room. */
export function AgentCard() {
  const t = useT();
  const id = useUiStore((s) => s.selectedAgentId);
  const select = useUiStore((s) => s.select);
  const agent = useRoomStore((s) => {
    const sess = s.currentSessionId
      ? s.sessions[s.currentSessionId]
      : undefined;
    return id && sess ? sess.agents[id] : undefined;
  });
  if (!id || !agent) return null;

  const isLead = agent.kind === "orchestrator";
  return (
    <div
      className="px-panel px-pop"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 78,
        transform: "translateX(-50%)",
        width: 300,
        padding: "14px 16px",
      }}
    >
      <button
        type="button"
        title={t("关闭")}
        className="px-btn"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 26,
          height: 26,
          fontSize: 12,
        }}
        onClick={() => select(null)}
      >
        ✕
      </button>
      <div
        className="pf"
        style={{
          fontSize: 11,
          color: isLead ? "var(--gold)" : "var(--cyan)",
          marginBottom: 12,
          paddingRight: 24,
        }}
      >
        {isLead ? "★ " : ""}
        {agent.role}
      </div>
      <StatRow k={t("类型")} v={isLead ? t("指挥官") : t("子智能体")} />
      <StatRow
        k={t("状态")}
        v={t(STATUS_LABEL[agent.status] ?? agent.status)}
      />
      <StatRow
        k={t("工具")}
        v={
          agent.currentTool ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Icon
                name={toolNameToIcon(agent.currentTool) as IconName}
                size={14}
              />
              {agent.currentTool}
            </span>
          ) : (
            "—"
          )
        }
      />
      {agent.parentId ? <StatRow k={t("上级")} v={agent.parentId} /> : null}
    </div>
  );
}
