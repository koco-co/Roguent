import { useState } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon } from "./icons";
import {
  TODO_META,
  sessionTodos,
  todoCounts,
  todoProgress,
} from "./todos-view";

/**
 * 内景左栈底部「实时任务窗」TaskWindow(对标设计原型 hud.jsx 的 TaskWindow):
 * 展示**当前会话**各 agent 的真实 TodoWrite 待办(进行中/待办/完成),可折叠;
 * 点击某条跳「任务」面板。**真数据**:来自 store 的 Session.todos(引擎在 agent 调
 * TodoWrite 时捕获);不造假、无 mock 标注。仅内景显示(view !== overworld);
 * gate 的 return null 放在所有 hooks 之后(React hooks 规则)。selector 只取稳定的
 * 函数引用 / 基元,绝不在 selector 里构造新值(zustand 铁律)。
 */
export function TaskWindow() {
  const t = useT();
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const openPanel = useUiStore((s) => s.openPanel);
  // 取当前会话对象引用(稳定:同一会话对象同一引用),todos 展平在渲染期算,不进 selector。
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const [open, setOpen] = useState(true);

  if (!inInterior) return null;

  const rows = sessionTodos(session);
  const c = todoCounts(rows);

  return (
    <div className={`taskwin glass${open ? "" : " collapsed"}`}>
      <button
        type="button"
        className="tw-head"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="quest" size={18} />
        <span className="tw-title px">LIVE TASKS</span>
        <span className="tw-count">
          {c.in_progress}/{c.total}
        </span>
        <span className="tw-chev">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="tw-body scroll">
          {rows.length === 0 ? (
            <div className="roster-empty">
              {t("暂无任务(agent 调 TodoWrite 后同步)")}
            </div>
          ) : (
            rows.map((tk, i) => {
              const [color] = TODO_META[tk.status];
              const p = todoProgress(tk.status);
              const live = tk.status === "in_progress";
              return (
                <button
                  // todos 表会整体覆盖、可能重复 content,index + agentId 组合作 key。
                  key={`${tk.agentId}:${i}`}
                  type="button"
                  className="tw-item"
                  onClick={() => openPanel("tasks")}
                >
                  <div className="tw-row">
                    <span
                      className="tw-dot"
                      style={{
                        background: color,
                        boxShadow: live
                          ? `0 0 0 1px rgba(0,0,0,.5), 0 0 6px ${color}`
                          : undefined,
                      }}
                    />
                    <span className="tw-name">{tk.content}</span>
                  </div>
                  <div className="tw-bar">
                    <div
                      className={`tw-fill${live ? " live" : ""}`}
                      style={{ width: `${p}%`, background: color }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {open && (
        <div className="tw-foot">
          <span className="cyan">
            {c.in_progress} {t("进行中")}
          </span>
          <span className="faint">
            {c.pending} {t("待办")}
          </span>
          <span className="greenc">
            {c.completed} {t("完成")}
          </span>
        </div>
      )}
    </div>
  );
}
