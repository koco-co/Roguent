import { useState } from "react";
import { useUiStore } from "../ui-store";
import { Icon } from "./icons";
import { MOCK_TASKS, STATE_META, taskProgress } from "./mock-data";

// ── mock 数据(占位待接入)──────────────────────────────────────────────────
// 任务数据来自共享单一源 mock-data.ts(TaskWindow / Tasks 两处共用)。引擎暂无
// 「共享任务清单 / TodoWrite 聚合」概念,整窗是固定示例占位。三重防伪标注:① 本注释
// ② .tw-head 里的可见「示例」角标 ③ 根 .taskwin 的 title。这里只取它需要的最小视图
// (id/title/state/blockedByUser + 颜色 + 进度),owner/model/deps/desc 由 Tasks 用。

/**
 * 内景左栈底部「实时任务窗」TaskWindow(对标设计原型 hud.jsx 的 TaskWindow):
 * 内景左玻璃栈展示当前会话进行中/待领/完成的任务清单,可折叠;点击某条跳「任务」面板。
 *
 * **整窗为 mock 占位**:引擎暂无共享任务清单聚合(见 MOCK_TASKS 注释),故带三重防伪
 * 标注,绝不冒充真实数据。仅内景显示(view !== overworld);gate 的 return null 放在
 * 所有 hooks 之后(React hooks 规则)。selector 只取稳定的 openPanel 函数引用(铁律)。
 */
export function TaskWindow() {
  // 仅内景 HUD 显示;总览大厅没有「任务窗」概念。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  // 只取稳定的 action 函数引用,绝不返回新建值 → 守 zustand selector 铁律。
  const openPanel = useUiStore((s) => s.openPanel);
  const [open, setOpen] = useState(true);

  if (!inInterior) return null;

  const tasks = MOCK_TASKS;
  const ip = tasks.filter((t) => t.state === "in-progress").length;
  const pd = tasks.filter((t) => t.state === "pending").length;
  const dn = tasks.filter((t) => t.state === "completed").length;

  return (
    <div
      // 原型为纯 `taskwin glass`(青色玻璃方角),不挂 .panel:.panel 的 clip-path
      // 会裁掉 .glass 的辉光 box-shadow、斜角又破坏玻璃方角,与原型冲突。
      className={`taskwin glass${open ? "" : " collapsed"}`}
      // mock 三重标注之三:根 title 显式声明为示例数据。
      title="示例数据(引擎暂未提供共享任务清单)"
    >
      <button
        type="button"
        className="tw-head"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="quest" size={18} />
        <span className="tw-title px">LIVE TASKS</span>
        <span className="tw-count">
          {ip}/{tasks.length}
        </span>
        {/* mock 三重标注之二:可见「示例」角标 */}
        <span className="tw-mock px">示例</span>
        <span className="tw-chev">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="tw-body scroll">
          {tasks.map((tk) => {
            const [color] = STATE_META[tk.state];
            const p = taskProgress(tk);
            const live = tk.state === "in-progress";
            return (
              <button
                key={tk.id}
                type="button"
                className="tw-item"
                onClick={() => openPanel("tasks")}
              >
                <div className="tw-row">
                  <span
                    className="tw-dot"
                    style={{
                      background: color,
                      // 进行中加辉光,与原型一致。
                      boxShadow: live
                        ? `0 0 0 1px rgba(0,0,0,.5), 0 0 6px ${color}`
                        : undefined,
                    }}
                  />
                  <span className="tw-name">{tk.title}</span>
                  {tk.blockedByUser && (
                    <Icon
                      name="ask"
                      size={12}
                      glow="#36c5e0"
                      className="askpulse"
                    />
                  )}
                </div>
                <div className="tw-bar">
                  <div
                    className={`tw-fill${live ? " live" : ""}`}
                    style={{ width: `${p}%`, background: color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="tw-foot">
          <span className="cyan">{ip} 进行中</span>
          <span className="faint">{pd} 待领</span>
          <span className="greenc">{dn} 完成</span>
        </div>
      )}
    </div>
  );
}
