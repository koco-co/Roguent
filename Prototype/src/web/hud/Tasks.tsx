import { useState } from "react";
import {
  ORCHESTRATOR_ID,
  type Session,
  type TodoStatus,
} from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
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
                当前会话暂无待办(agent 调 TodoWrite 后实时同步)
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
                      {label} ({group.length})
                    </div>
                    {group.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`task-item${selected?.key === t.key ? " sel" : ""}`}
                        onClick={() => setSelKey(t.key)}
                      >
                        <div className="task-title">{t.content}</div>
                        <div className="task-sub">
                          <span className="task-owner">
                            <HeroPortrait
                              sessionId=""
                              hero={ownerHero(t.agentId, session)}
                              size={20}
                              className=""
                            />
                            {ownerLabel(t.agentId, session)}
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
                  {TODO_META[selected.status][1]}
                </span>
                {selected.activeForm ? (
                  <div className="task-d-desc">{selected.activeForm}</div>
                ) : null}
                <div className="task-d-meta">
                  <div className="statrow">
                    <span className="sr-label">归属</span>
                    <span className="sr-val">
                      {ownerLabel(selected.agentId, session)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="faint">选择一个待办</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
