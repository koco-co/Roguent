import type React from "react";
import { useMemo, useState } from "react";
import type { SessionStatus } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";

/**
 * 全会话总览面板 SessionGrid(T4.1,对标设计原型 lobby.jsx 的 SessionGrid):
 * 像素栅格列出所有未归档会话,点卡进入对应会话内景,左上角导入卡进导入面板。
 * 由大厅中央「任务台」(HubFountain)+ E 键触发(openPanel('sessiongrid'))。
 *
 * **真假边界**:
 * - **真**:会话列表(`store.sessions` 未归档)、进入会话(beginEnter → 传送门漩涡)、
 *   导入卡(openPanel('import') 真导入流程)、error 角标(`s.status==='error'` 真状态)。
 * - **占位**:runtime 页签的 Codex 是禁用占位(引擎只跑 Claude,无第二 runtime);
 *   选「全部」/「Claude」均显示全部会话(我们所有会话都是 Claude)。
 * - **不做**:会话级 askuser 角标(无该项真数据,故只做 error 角标,绝不造 askuser)。
 *
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(React hooks 规则)。
 * selector 守 zustand 铁律:只取稳定的 sessions map 引用 / activePanel 基元 / 稳定函数;
 * `Object.values(sessions)` 之类在 render 体的 useMemo 里做,绝不在 selector 内构造新值。
 */

// 我们的 SessionStatus → [状态点/文字颜色, 中文标签]。
const STATUS_META: Record<SessionStatus, [string, string]> = {
  busy: ["#36c5e0", "活跃"],
  idle: ["#8a8170", "待命"],
  done: ["#5fd35f", "完成"],
  error: ["#ff4d6d", "出错"],
};

export function SessionGrid() {
  const active = useUiStore((s) => s.activePanel === "sessiongrid");
  const closePanel = useUiStore((s) => s.closePanel);
  const openPanel = useUiStore((s) => s.openPanel);
  const beginEnter = useUiStore((s) => s.beginEnter);
  const sessions = useRoomStore((s) => s.sessions);
  // runtime 页签:本地态(引擎只跑 Claude,无全局筛选)。Codex 为禁用占位。
  const [runtime, setRuntime] = useState<"all" | "claude" | "codex">("all");
  // 只显示未归档会话(与大厅一致);Codex 不可选,故「全部」/「Claude」都显示全部。
  // useMemo 必须在 early return 之前(hooks 规则:gate 之后不能再调 hook)。
  const list = useMemo(
    () => Object.values(sessions).filter((s) => !s.archived),
    [sessions],
  );

  if (!active) return null;

  return (
    <Modal
      title="SESSIONS"
      sub="任务台 · 选择会话进入"
      icon="quest"
      width={1240}
      onClose={closePanel}
    >
      <div className="sg-wrap">
        {/* runtime 页签:全部 / Claude / Codex(Codex 禁用占位) */}
        <div className="tabs">
          <button
            type="button"
            className={`tab${runtime === "all" ? " on" : ""}`}
            onClick={() => setRuntime("all")}
          >
            全部
          </button>
          <button
            type="button"
            className={`tab${runtime === "claude" ? " on" : ""}`}
            onClick={() => setRuntime("claude")}
          >
            Claude
          </button>
          <button
            type="button"
            className="tab"
            disabled
            title="引擎暂未接入 Codex runtime"
          >
            Codex
          </button>
        </div>

        {list.length === 0 && (
          <div className="sg-empty faint">
            还没有会话——按「＋ 新会话」或到聊天抽屉新建第一个
          </div>
        )}

        <div className="sg-grid scroll">
          {/* 导入卡(左上第一个):进真导入流程 */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: 像素卡片,键盘 a11y 由 App 集中处理 */}
          <div
            className="sg-card sg-import"
            onClick={() => openPanel("import")}
          >
            <Icon name="import" size={40} glow="#f2c84b" />
            <div className="sg-import-t">导入历史会话</div>
            <div className="faint" style={{ fontSize: 11 }}>
              + 从本地扫描
            </div>
          </div>

          {/* 会话卡:点击 → 关面板 + 触发进入漩涡 */}
          {list.map((s) => {
            const [stColor, stLabel] = STATUS_META[s.status];
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: 像素卡片,键盘 a11y 由 App 集中处理
              <div
                key={s.id}
                className="sg-card"
                style={{ "--st": stColor } as React.CSSProperties}
                onClick={() => {
                  closePanel();
                  beginEnter(s.id);
                }}
              >
                <div className="sg-top">
                  <div className="sg-portrait">
                    <HeroPortrait sessionId={s.id} size={48} className="" />
                  </div>
                  {s.status === "error" ? (
                    <div className="sg-alert">
                      <Icon name="error" size={14} />
                    </div>
                  ) : null}
                </div>
                <div className="sg-proj">{s.project ?? ""}</div>
                <div className="sg-title">{s.title}</div>
                <div className="sg-meta">
                  <span className="sg-status" style={{ color: stColor }}>
                    <span className="sg-dot" style={{ background: stColor }} />
                    {stLabel}
                  </span>
                  <span className="chip px tag-claude" style={{ fontSize: 8 }}>
                    Claude
                  </span>
                </div>
                <div className="sg-tok px">
                  {(s.usage.tokens / 1000).toFixed(0)}k tok ·{" "}
                  {Object.keys(s.agents).length}P
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
