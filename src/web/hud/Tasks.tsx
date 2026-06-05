import { useState } from "react";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import {
  MOCK_MAILBOX,
  MOCK_OWNERS,
  MOCK_TASKS,
  type MockTask,
  type MockTaskState,
  STATE_META,
} from "./mock-data";

// 三组渲染顺序(原型 panels1.jsx 一致):待领 → 进行中 → 完成。
const GROUP_ORDER: MockTaskState[] = ["pending", "in-progress", "completed"];

// owner id → 展示名(无 owner 或未知 id 回落原 id)。
function ownerName(id: string | null | undefined): string {
  if (!id) return "—";
  return MOCK_OWNERS[id]?.name ?? id;
}

// 阻塞判定:pending 且有未完成的前置依赖(非 blockedByUser,那是「等用户」单独标)。
function isDepBlocked(t: MockTask): boolean {
  return (
    t.state === "pending" &&
    t.deps.some(
      (d) => MOCK_TASKS.find((x) => x.id === d)?.state !== "completed",
    )
  );
}

/**
 * 共享任务面板 Tasks(对标设计原型 panels1.jsx 的 Tasks,§6 共享任务清单):
 * 左列按状态分三组的任务清单 + 右列选中任务详情 + 底部 inter-agent 信箱。
 *
 * **整面板为 mock 占位**:引擎暂无共享任务清单 / 依赖图 / 归属 / inter-agent 信箱概念
 * (见 mock-data.ts 顶部说明),故顶部一条显眼 .task-mock-banner 显式标注示例数据,绝不
 * 冒充真实数据。activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则);
 * selector 只取 activePanel(基元)/ closePanel(稳定函数引用),守 zustand selector 铁律。
 */
export function Tasks() {
  const active = useUiStore((s) => s.activePanel === "tasks");
  const closePanel = useUiStore((s) => s.closePanel);
  // 当前选中任务,本地态(纯 UI),默认 t3 与原型一致。
  const [sel, setSel] = useState("t3");

  if (!active) return null;

  const selected = MOCK_TASKS.find((t) => t.id === sel) ?? null;
  // askbar:由 blockedByUser 的任务派生「待你回应」的 askers(owner 维度)。
  const askers = MOCK_TASKS.filter((t) => t.blockedByUser);

  return (
    <Modal
      title="TASKS"
      sub="共享任务清单 · agent teams"
      icon="quest"
      width={1180}
      onClose={closePanel}
    >
      <div className="tasks-wrap">
        {/* mock 标注:整面板示例数据,显眼 banner。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          示例数据 · 引擎暂未提供共享任务清单 / 依赖 / 信箱
        </div>

        {/* askbar:有任务 blockedByUser 时才渲染;每个 owner 一个 chip。 */}
        {askers.length > 0 && (
          <div className="task-askbar">
            <Icon name="ask" size={20} glow="#36c5e0" />
            <span className="cyan px" style={{ fontSize: 11 }}>
              待你回应 ({askers.length})
            </span>
            {askers.map((t) => (
              <span key={t.id} className="chip">
                {ownerName(t.owner)}
              </span>
            ))}
          </div>
        )}

        <div className="tasks-cols">
          {/* 左列:按状态分三组的任务清单。 */}
          <div className="tasks-list scroll">
            {GROUP_ORDER.map((st) => {
              const group = MOCK_TASKS.filter((t) => t.state === st);
              if (group.length === 0) return null;
              const [color, label] = STATE_META[st];
              return (
                <div key={st} className="task-group">
                  <div className="task-group-h px">
                    <span className="dot" style={{ background: color }} />
                    {label} ({group.length})
                  </div>
                  {group.map((t) => {
                    const blocked = isDepBlocked(t);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`task-item${sel === t.id ? " sel" : ""}`}
                        onClick={() => setSel(t.id)}
                      >
                        <div className="task-title">
                          {blocked && (
                            <Icon
                              name="error"
                              size={13}
                              glow="#ff8197"
                              style={{ marginRight: 6 }}
                            />
                          )}
                          {t.title}
                        </div>
                        <div className="task-sub">
                          {t.owner ? (
                            <span className="task-owner">
                              <HeroPortrait
                                sessionId=""
                                hero={MOCK_OWNERS[t.owner]?.hero}
                                size={20}
                                className=""
                              />
                              {ownerName(t.owner)}
                            </span>
                          ) : (
                            <span className="faint">待认领</span>
                          )}
                          {blocked && (
                            <span
                              className="chip"
                              style={{
                                color: "#ff8197",
                                boxShadow: "inset 0 0 0 1px #ff8197",
                              }}
                            >
                              阻塞中
                            </span>
                          )}
                          {t.blockedByUser && (
                            <span
                              className="chip askpulse"
                              style={{
                                color: "var(--cyan)",
                                boxShadow: "inset 0 0 0 1px var(--cyan)",
                              }}
                            >
                              等用户
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* 右列:选中任务详情。 */}
          <div className="task-detail">
            {selected ? (
              <>
                <div className="task-d-title">{selected.title}</div>
                <span
                  className="chip"
                  style={{
                    color: STATE_META[selected.state][0],
                    boxShadow: `inset 0 0 0 1px ${STATE_META[selected.state][0]}`,
                  }}
                >
                  {STATE_META[selected.state][1]}
                </span>
                <div className="task-d-desc">{selected.desc}</div>
                <div className="task-d-meta">
                  <div className="statrow">
                    <span className="sr-label">归属</span>
                    <span className="sr-val">
                      {selected.owner ? ownerName(selected.owner) : "待认领"}
                    </span>
                  </div>
                  <div className="statrow">
                    <span className="sr-label">模型</span>
                    <span className="sr-val gold">{selected.model}</span>
                  </div>
                  <div className="statrow">
                    <span className="sr-label">依赖</span>
                    <span className="sr-val">
                      {selected.deps.length === 0
                        ? "无"
                        : selected.deps
                            .map((d) => {
                              const dep = MOCK_TASKS.find((x) => x.id === d);
                              const tick =
                                dep?.state === "completed" ? " ✓" : " ⧖";
                              return `${dep?.title ?? d}${tick}`;
                            })
                            .join("，")}
                    </span>
                  </div>
                </div>

                {/* 状态时间线(固定 mock 步骤,与原型一致)。 */}
                <div className="task-timeline">
                  <div className="px" style={{ fontSize: 9, marginBottom: 8 }}>
                    状态时间线
                  </div>
                  <div className="tl-step done">创建 · 19:02</div>
                  {selected.state !== "pending" && (
                    <div className="tl-step done">认领 · 19:05</div>
                  )}
                  {selected.state === "completed" ? (
                    <div className="tl-step done">完成 · 19:41</div>
                  ) : (
                    <div className="tl-step now">进行中…</div>
                  )}
                </div>

                {/* 认领按钮:mock,不绑真实逻辑(别假装真认领)。仅 pending 且非等用户时显示。 */}
                {selected.state === "pending" && !selected.blockedByUser && (
                  <button
                    type="button"
                    className="pxbtn primary cjk"
                    style={{ marginTop: 14 }}
                  >
                    认领任务
                  </button>
                )}
              </>
            ) : (
              <div className="faint">选择一个任务</div>
            )}
          </div>
        </div>

        {/* 信箱:inter-agent 消息(占位)。 */}
        <div className="mailbox">
          <div
            className="px gold"
            style={{
              fontSize: 9,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="chat" size={16} glow="#f2c84b" />
            信箱 · inter-agent
          </div>
          <div className="mb-list">
            {MOCK_MAILBOX.map((m, i) => (
              <div
                // 信箱是固定 mock 列表,顺序不变,index key 可接受。
                // biome-ignore lint/suspicious/noArrayIndexKey: 静态 mock 列表,无重排
                key={i}
                className="mb-msg"
              >
                <span className="cyan">{ownerName(m.from)}</span>
                <span className="faint"> → </span>
                <span className="gold">{ownerName(m.to)}</span>
                <span className="dim">：{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
