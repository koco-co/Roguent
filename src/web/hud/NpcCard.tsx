import { useState } from "react";
import type { SessionStatus } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { HeroPortrait } from "./HeroPortrait";
import { StatRow, shortModel } from "./widgets";

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "待命",
  busy: "工作中",
  done: "完成",
  error: "出错",
};
const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: "var(--muted)",
  busy: "var(--green)",
  done: "var(--gold)",
  error: "var(--pink)",
};

/**
 * Detail card for the NPC (session) the user selected in the overworld. Mirrors
 * AgentCard's pixel-panel style but operates on a whole session: project, model,
 * mode, status, subagent task summary, usage — with enter / chat / archive /
 * delete actions. Archive/enter are pure client state; delete also sends the
 * deleteSession command to stop the driver server-side (spec §生命周期).
 */
export function NpcCard() {
  const id = useUiStore((s) => s.selectedNpcId);
  const selectNpc = useUiStore((s) => s.selectNpc);
  const beginEnter = useUiStore((s) => s.beginEnter);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) => (id ? s.sessions[id] : undefined));
  const switchSession = useRoomStore((s) => s.switchSession);
  const archiveSession = useRoomStore((s) => s.archiveSession);
  const removeSession = useRoomStore((s) => s.removeSession);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!id || !session) return null;

  const subagents = Object.values(session.agents).filter(
    (a) => a.kind === "subagent",
  );
  // 各状态分桶(spec §生命周期/信息卡: task 摘要 = subagent 数 + 各状态),只显示非零桶。
  const STATUS_TALLY: Record<string, string> = {
    working: "工作",
    thinking: "思考",
    idle: "待命",
    spawning: "启动",
    done: "完成",
  };
  const tally = subagents.reduce<Record<string, number>>((m, a) => {
    m[a.status] = (m[a.status] ?? 0) + 1;
    return m;
  }, {});
  const breakdown = Object.entries(STATUS_TALLY)
    .filter(([k]) => (tally[k] ?? 0) > 0)
    .map(([k, label]) => `${tally[k] ?? 0} ${label}`)
    .join(" · ");

  const enter = () => {
    beginEnter(id);
    selectNpc(null);
  };
  const chat = () => {
    switchSession(id);
    if (!drawerOpen) toggle("drawerOpen");
    selectNpc(null);
  };
  const archive = () => {
    archiveSession(id);
    selectNpc(null);
  };
  const del = () => {
    sendCommand({ cmd: "deleteSession", sessionId: id });
    removeSession(id);
    selectNpc(null);
  };

  return (
    <div
      className="px-window px-pop"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 78,
        transform: "translateX(-50%)",
        width: 320,
        padding: 0,
      }}
    >
      <div className="px-titlebar">
        <HeroPortrait sessionId={id} />
        <div
          className="pf grow"
          style={{ color: STATUS_COLOR[session.status], fontSize: 11 }}
        >
          ⚔ {session.title}
        </div>
        <button
          type="button"
          title="关闭"
          className="px-btn"
          style={{ width: 26, height: 26, fontSize: 12 }}
          onClick={() => selectNpc(null)}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "12px 16px" }}>
        <StatRow k="项目" v={session.project ?? "—"} />
        <StatRow k="模型" v={shortModel(session.model)} />
        <StatRow k="模式" v={session.permissionMode} />
        <StatRow k="状态" v={STATUS_LABEL[session.status] ?? session.status} />
        <StatRow
          k="子智能体"
          v={`${subagents.length} 个${breakdown ? ` · ${breakdown}` : ""}`}
        />
        <StatRow k="Token" v={session.usage.tokens.toLocaleString()} />
        <StatRow k="花费" v={`$${session.usage.cost.toFixed(4)}`} />

        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button
            type="button"
            className="px-btn"
            style={{ flex: 1, padding: 8, fontSize: 10, color: "var(--cyan)" }}
            onClick={enter}
          >
            进入
          </button>
          <button
            type="button"
            className="px-btn"
            style={{ flex: 1, padding: 8, fontSize: 10 }}
            onClick={chat}
          >
            聊天
          </button>
          <button
            type="button"
            className="px-btn"
            style={{ flex: 1, padding: 8, fontSize: 10 }}
            onClick={archive}
          >
            归档
          </button>
          {confirmDel ? (
            <button
              type="button"
              className="px-btn"
              style={{
                flex: 1.2,
                padding: 8,
                fontSize: 10,
                color: "var(--pink)",
              }}
              onClick={del}
            >
              确认删除
            </button>
          ) : (
            <button
              type="button"
              className="px-btn"
              style={{
                flex: 1,
                padding: 8,
                fontSize: 10,
                color: "var(--pink)",
              }}
              onClick={() => setConfirmDel(true)}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
