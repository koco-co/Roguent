import type React from "react";
import { useMemo, useState } from "react";
import type { SessionStatus } from "../../shared/domain";
import type { RuntimeKind } from "../../shared/runtime";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SchedulerPanel } from "./scheduler/SchedulerPanel";
import {
  type SessionFilters,
  agoLabel,
  applySessionFilters,
  hasAnyFilter,
  sortSessions,
} from "./session-grid-view";
import { shortModel } from "./widgets";

/**
 * 全会话总览面板 SessionGrid(T8,设计 v2 多级过滤,对标 lobby.jsx 的 SessionGrid):
 * 像素栅格列出所有未归档会话,点卡进入对应会话内景,左上角导入卡进导入面板。
 * 由大厅中央「任务台」(HubFountain)+ E 键触发(openPanel('sessiongrid'))。
 *
 * **真假边界(全部接真)**:
 * - **真**:会话列表(`store.sessions` 未归档)、进入会话(beginEnter → 传送门漩涡)、
 *   导入卡(openPanel('import') 真导入流程)、error 角标(`s.status==='error'` 真状态)。
 * - **真**:多级过滤(runtime / 项目多选 / 模型多选 / 仅活跃,均按真实 session 字段)、
 *   按状态排序 + 相对时间(`lastActiveAt`)、Scheduled Tasks 页签复用真实 scheduler。
 * - **不做**:会话级 askuser 角标(无该项真数据,故只做 error 角标,绝不造 askuser)。
 *
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(React hooks 规则)。
 * **zustand 铁律**:selector 只取稳定的 sessions map 引用 / activePanel 基元 / 稳定函数;
 * `Object.values(sessions)`、filter/sort/new Set 等派生全在 render 体的 useMemo 里做,
 * 绝不在 selector 内构造新值。
 */

// 我们的 SessionStatus → [状态点/文字颜色, 中文标签(走 t() 翻译)]。
const STATUS_META: Record<SessionStatus, [string, string]> = {
  busy: ["#36c5e0", "活跃"],
  idle: ["#8a8170", "待命"],
  done: ["#5fd35f", "完成"],
  error: ["#ff4d6d", "出错"],
};

/** 单个过滤标签 chip(runtime / 项目 / 模型 共用)。 */
function FChip({
  on,
  label,
  count,
  onClick,
  ac,
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  ac?: string;
}) {
  return (
    <button
      type="button"
      className={`fchip${on ? " on" : ""}`}
      style={ac ? ({ "--ac": ac } as React.CSSProperties) : undefined}
      onClick={onClick}
    >
      <span className="cjk">{label}</span>
      {count != null && <span className="fc-n px">{count}</span>}
    </button>
  );
}

export function SessionGrid() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "sessiongrid");
  const closePanel = useUiStore((s) => s.closePanel);
  const openPanel = useUiStore((s) => s.openPanel);
  const beginEnter = useUiStore((s) => s.beginEnter);
  const sessions = useRoomStore((s) => s.sessions);

  const [mode, setMode] = useState<"sessions" | "scheduled">("sessions");
  const [rt, setRt] = useState<"all" | RuntimeKind>("all");
  const [projSel, setProjSel] = useState<string[]>([]);
  const [modelSel, setModelSel] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);

  // 未归档会话(与大厅一致)。Session 满足 GridSession(id/project?/model/runtime/
  // status/lastActiveAt 字段齐全),可直接喂给 Task 7 纯函数,无需适配 map。
  const all = useMemo(
    () => Object.values(sessions).filter((s) => !s.archived),
    [sessions],
  );
  // 仅按 runtime 过滤后的列表 → 用于派生「当前 runtime 下可选的项目 / 模型」。
  const rtList = useMemo(
    () =>
      applySessionFilters(all, {
        rt,
        projects: [],
        models: [],
        activeOnly: false,
      }),
    [all, rt],
  );
  const projects = useMemo(
    () => [...new Set(rtList.map((s) => s.project ?? ""))].filter(Boolean),
    [rtList],
  );
  const models = useMemo(
    () => [...new Set(rtList.map((s) => s.model))],
    [rtList],
  );

  const now = Date.now();
  const filters: SessionFilters = {
    rt,
    projects: projSel,
    models: modelSel,
    activeOnly,
  };
  // 在 useMemo 内部用基元重建 filter 对象,依赖列即可全为基元(别依赖 render
  // 体每次新建的 filters 对象,否则记忆失效)。
  const list = useMemo(
    () =>
      sortSessions(
        applySessionFilters(all, {
          rt,
          projects: projSel,
          models: modelSel,
          activeOnly,
        }),
        now,
      ),
    [all, rt, projSel, modelSel, activeOnly, now],
  );

  // 切 runtime 时,清掉在新 runtime 下已不存在的项目 / 模型选择。
  const switchRt = (next: "all" | RuntimeKind) => {
    setRt(next);
    const nl = applySessionFilters(all, {
      rt: next,
      projects: [],
      models: [],
      activeOnly: false,
    });
    const np = new Set(nl.map((s) => s.project ?? ""));
    const nm = new Set(nl.map((s) => s.model));
    setProjSel((ps) => ps.filter((p) => np.has(p)));
    setModelSel((ms) => ms.filter((m) => nm.has(m)));
  };
  const togProj = (p: string) =>
    setProjSel((ps) =>
      ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p],
    );
  const togModel = (m: string) =>
    setModelSel((ms) =>
      ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m],
    );
  const clearAll = () => {
    setRt("all");
    setProjSel([]);
    setModelSel([]);
    setActiveOnly(false);
  };

  if (!active) return null;

  const showFilters = hasAnyFilter(filters);
  // runtime 行计数:基于 all(全量未归档),与设计一致。
  const claudeN = all.filter(
    (s) => (s.runtime ?? "claude") === "claude",
  ).length;
  const codexN = all.filter((s) => s.runtime === "codex").length;
  const activeN = all.filter(
    (s) => s.status === "busy" || s.status === "error",
  ).length;
  // 项目 / 模型计数基于 rtList(当前 runtime 下),与设计 cnt() 一致。
  const projN = (p: string) =>
    rtList.filter((s) => (s.project ?? "") === p).length;
  const modelN = (m: string) => rtList.filter((s) => s.model === m).length;

  const sub =
    mode === "scheduled"
      ? "Scheduled Tasks"
      : `${t("任务台")} · ${list.length} / ${all.length} ${t("会话")}`;

  return (
    <Modal
      title="SESSIONS"
      sub={sub}
      icon="quest"
      width={1240}
      onClose={closePanel}
    >
      <div className="sg-wrap">
        {/* 模式条:会话 / Scheduled Tasks(后者真实 scheduler 页签)。 */}
        <div className="tabs">
          <button
            type="button"
            className={`tab${mode === "sessions" ? " on" : ""}`}
            onClick={() => setMode("sessions")}
          >
            {t("会话")}
          </button>
          <button
            type="button"
            className={`tab${mode === "scheduled" ? " on" : ""}`}
            onClick={() => setMode("scheduled")}
          >
            Scheduled Tasks
          </button>
        </div>

        {mode === "scheduled" ? (
          <SchedulerPanel />
        ) : (
          <>
            {/* 多级过滤:runtime / 项目多选 / 模型多选 同级,可叠加。 */}
            <div className="sg-filters">
              <div className="sg-frow">
                <span className="sg-flab px">RUNTIME</span>
                <FChip
                  on={rt === "all"}
                  label={t("全部")}
                  count={all.length}
                  onClick={() => switchRt("all")}
                />
                <FChip
                  on={rt === "claude"}
                  label="Claude"
                  count={claudeN}
                  onClick={() => switchRt("claude")}
                  ac="var(--cyan)"
                />
                <FChip
                  on={rt === "codex"}
                  label="Codex"
                  count={codexN}
                  onClick={() => switchRt("codex")}
                  ac="#5fd35f"
                />
                <span className="sg-fsp" />
                <FChip
                  on={activeOnly}
                  label={t("仅活跃")}
                  count={activeN}
                  onClick={() => setActiveOnly((v) => !v)}
                  ac="var(--cyan)"
                />
                {showFilters && (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: 像素 chip,a11y 由 App 集中处理
                  <div className="sg-clear px" onClick={clearAll}>
                    ✕ {t("清除筛选")}
                  </div>
                )}
              </div>

              {projects.length > 0 && (
                <div className="sg-frow">
                  <span className="sg-flab px">{t("项目")}</span>
                  {projects.map((p) => (
                    <FChip
                      key={p}
                      on={projSel.includes(p)}
                      label={p}
                      count={projN(p)}
                      onClick={() => togProj(p)}
                      ac="var(--cyan)"
                    />
                  ))}
                </div>
              )}

              {models.length > 0 && (
                <div className="sg-frow">
                  <span className="sg-flab px">{t("模型")}</span>
                  {models.map((m) => (
                    <FChip
                      key={m}
                      on={modelSel.includes(m)}
                      label={shortModel(m)}
                      count={modelN(m)}
                      onClick={() => togModel(m)}
                      ac="var(--gold)"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="sg-grid scroll">
              {/* 导入卡(左上第一个,仅无过滤时显):进真导入流程 */}
              {!showFilters && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: 像素卡片,键盘 a11y 由 App 集中处理
                <div
                  className="sg-card sg-import"
                  onClick={() => openPanel("import")}
                >
                  <Icon name="import" size={40} glow="#f2c84b" />
                  <div className="sg-import-t">{t("导入历史会话")}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {t("+ 从本地扫描")}
                  </div>
                </div>
              )}

              {/* 会话卡:点击 → 关面板 + 触发进入漩涡 */}
              {list.map((s) => {
                const [stColor, stLabel] = STATUS_META[s.status];
                const inactive = s.status === "idle" || s.status === "done";
                const proj = s.project ?? "";
                const isCodex = s.runtime === "codex";
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: 像素卡片,键盘 a11y 由 App 集中处理
                  <div
                    key={s.id}
                    className={`sg-card${inactive ? " inactive" : ""}`}
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
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: 像素 chip,a11y 由 App 集中处理 */}
                    <div
                      className={`sg-proj${projSel.includes(proj) ? " on" : ""}`}
                      title={`${t("项目")} ${proj}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (proj) togProj(proj);
                      }}
                    >
                      # {proj}
                    </div>
                    <div className="sg-title">{s.title}</div>
                    <div className="sg-meta">
                      <span className="sg-status" style={{ color: stColor }}>
                        <span
                          className="sg-dot"
                          style={{ background: stColor }}
                        />
                        {t(stLabel)}
                      </span>
                      <span className="sg-chips">
                        <span
                          className={`chip px ${isCodex ? "tag-codex" : "tag-claude"}`}
                          style={{ fontSize: 8 }}
                        >
                          {isCodex ? "Codex" : "Claude"}
                        </span>
                        <span className="chip px" style={{ fontSize: 8 }}>
                          {shortModel(s.model)}
                        </span>
                      </span>
                    </div>
                    <div className="sg-foot">
                      <span className="sg-tok px">
                        {(s.usage.tokens / 1000).toFixed(0)}k tok ·{" "}
                        {Object.keys(s.agents).length}P
                      </span>
                      <span
                        className={`sg-time px${s.status === "busy" ? " live" : ""}`}
                      >
                        {agoLabel((now - s.lastActiveAt) / 60000)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {list.length === 0 && (
                <div className="sg-empty">
                  <Icon name="search" size={36} glow="#8a8170" />
                  <div className="cjk" style={{ marginTop: 10 }}>
                    {t("没有匹配的会话")}
                  </div>
                  <button
                    type="button"
                    className="pxbtn cjk sm"
                    style={{ marginTop: 12 }}
                    onClick={clearAll}
                  >
                    {t("清除筛选")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
