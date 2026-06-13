import { useState } from "react";
import {
  ORCHESTRATOR_ID,
  type Session,
  type TodoStatus,
} from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { MOCK_AGENT_LETTERS } from "./tasks-mailbox-mock-data";
import { TODO_META, sessionTodos } from "./todos-view";

// 三组渲染顺序(对标原型):待办 → 进行中 → 完成。
const GROUP_ORDER: TodoStatus[] = ["pending", "in_progress", "completed"];

// owner agentId → 展示名:主控固定「主控」,其余取真 agent 的 role(回落 agentId)。
function ownerLabel(agentId: string, session: Session | undefined): string {
  if (agentId === ORCHESTRATOR_ID) return "主控";
  return session?.agents[agentId]?.role ?? agentId;
}
// owner agentId → 0x72 hero base:主控金骑士,其余按 role 稳定哈希(同房间渲染)。
function ownerHero(agentId: string, session: Session | undefined): string {
  if (agentId === ORCHESTRATOR_ID) return ORCHESTRATOR_HERO;
  const role = session?.agents[agentId]?.role;
  return role ? roleToHero(role) : ORCHESTRATOR_HERO;
}

/**
 * 共享任务面板 Tasks(对标设计原型 panels1.jsx 的 Tasks):左列按状态分组的**当前会话
 * 真实 TodoWrite 待办**(归属 = 真 agent)+ 右列选中详情。**真数据**:来自 store 的
 * Session.todos。activePanel gate 的 return null 放在所有 hooks 之后;selector 只取
 * 基元 / 稳定引用(zustand 铁律)。
 */
export function Tasks() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "tasks");
  const closePanel = useUiStore((s) => s.closePanel);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  // 选中项用「agentId:索引」标识(content 可能重复)。
  const [selKey, setSelKey] = useState<string | null>(null);

  if (!active) return null;

  const rows = sessionTodos(session).map((r, i) => ({
    ...r,
    key: `${r.agentId}:${i}`,
  }));
  const selected =
    rows.find((r) => r.key === selKey) ??
    rows.find((r) => r.status === "in_progress") ??
    rows[0] ??
    null;

  return (
    <Modal
      title="TASKS"
      sub="实时待办 · 当前会话 TodoWrite"
      icon="quest"
      width={1180}
      onClose={closePanel}
    >
      <div className="tasks-wrap">
        <div className="tasks-cols">
          {/* 左列:按状态分三组的真实待办清单。 */}
          <div className="tasks-list scroll">
            {rows.length === 0 ? (
              <div className="faint">
                {t("当前会话暂无待办(agent 调 TodoWrite 后实时同步)")}
              </div>
            ) : (
              GROUP_ORDER.map((st) => {
                const group = rows.filter((t) => t.status === st);
                if (group.length === 0) return null;
                const [color, label] = TODO_META[st];
                return (
                  <div key={st} className="task-group">
                    <div className="task-group-h px">
                      <span className="dot" style={{ background: color }} />
                      {t(label)} ({group.length})
                    </div>
                    {group.map((todo) => (
                      <button
                        key={todo.key}
                        type="button"
                        className={`task-item${selected?.key === todo.key ? " sel" : ""}`}
                        onClick={() => setSelKey(todo.key)}
                      >
                        <div className="task-title">{todo.content}</div>
                        <div className="task-sub">
                          <span className="task-owner">
                            <HeroPortrait
                              sessionId=""
                              hero={ownerHero(todo.agentId, session)}
                              size={20}
                              className=""
                            />
                            {t(ownerLabel(todo.agentId, session))}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* 右列:选中待办详情。 */}
          <div className="task-detail">
            {selected ? (
              <>
                <div className="task-d-title">{selected.content}</div>
                <span
                  className="chip"
                  style={{
                    color: TODO_META[selected.status][0],
                    boxShadow: `inset 0 0 0 1px ${TODO_META[selected.status][0]}`,
                  }}
                >
                  {t(TODO_META[selected.status][1])}
                </span>
                {selected.activeForm ? (
                  <div className="task-d-desc">{selected.activeForm}</div>
                ) : null}
                <div className="task-d-meta">
                  <div className="statrow">
                    <span className="sr-label">{t("归属")}</span>
                    <span className="sr-val">
                      {t(ownerLabel(selected.agentId, session))}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="faint">{t("选择一个待办")}</div>
            )}
          </div>
        </div>

        {/* 信件区(inter-agent 邮箱):**整块 mock**,与上方真实 TodoWrite 待办无关。
            引擎没有 agent 之间的信箱通道(subagent 间不互发信件),这里展示的发件人 /
            标题 / 时间全是演示。三重标注:数据顶注 + MOCK_ 前缀 + 下方 mock banner。 */}
        <div className="mailbox">
          <div className="task-mock-banner" style={{ marginBottom: 10 }}>
            <Icon name="error" size={14} glow="#f2c84b" />
            {t(
              "示例信件 · 引擎无 inter-agent 信箱(演示用途，非真实 agent 通信)",
            )}
          </div>
          <div
            className="px"
            style={{ fontSize: 10, color: "#f2c84b", marginBottom: 8 }}
          >
            <Icon
              name="chat"
              size={16}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {t("信件区 · inter-agent")}
          </div>
          <div className="mb-list">
            {MOCK_AGENT_LETTERS.map((m) => (
              <div key={`${m.from}-${m.time}`} className="mb-msg">
                <span className="cyan">{t(m.from)}</span>
                <span className="faint"> → </span>
                <span className="gold">{t(m.to)}</span>
                <span className="dim">
                  {" · "}
                  {m.time}
                  {"："}
                  {t(m.title)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
