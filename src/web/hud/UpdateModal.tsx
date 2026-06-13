import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useT, useTL } from "../i18n";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import {
  MOCK_CHANGELOG,
  MOCK_CURRENT_VERSION,
  type MockChangelogEntry,
} from "./update-mock-data";

/**
 * 版本与更新日志面板 UpdateModal(对标设计原型 panels2.jsx 的 UpdateModal)。
 *
 * **整面板 mock 占位**:Roguent 没有「检查更新 / 升级 runtime」能力,版本号、更新
 * 日志、检查/升级流程全是模拟(`update-mock-data.ts` 三重标注:数据顶注 + `MOCK_`
 * 前缀 + 本组件 `.task-mock-banner`)。检查/升级按钮只跑本地状态机演示动画,**绝不**
 * 触碰真实本机 runtime。
 *
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(React hooks
 * 规则);selector 只取基元(zustand 铁律)。计时器在卸载时清理,避免泄漏。
 */

type CheckStatus = "idle" | "checking" | "found" | "installing" | "done";

export function UpdateModal() {
  const t = useT();
  const tl = useTL();
  const active = useUiStore((s) => s.activePanel === "update");
  const closePanel = useUiStore((s) => s.closePanel);
  const [status, setStatus] = useState<CheckStatus>("idle");
  // setTimeout 句柄;卸载时清理,防止面板关闭后还回调 setState。
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!active) return null;

  // 检查/升级都是 mock 状态机:仅推进本地状态、播放动画,不动真实 runtime。
  const check = () => {
    if (status === "checking" || status === "installing") return;
    setStatus("checking");
    timer.current = setTimeout(() => setStatus("found"), 1100);
  };
  const install = () => {
    setStatus("installing");
    timer.current = setTimeout(() => setStatus("done"), 1000);
  };

  const subline =
    status === "found"
      ? tl("发现新版本 v1.0 可用", "New version v1.0 available")
      : status === "installing"
        ? tl("正在升级 runtime…(演示)", "Upgrading runtime… (demo)")
        : status === "done"
          ? tl("已更新到 v1.0 · 已是最新(演示)", "Updated to v1.0 (demo)")
          : tl("当前版本 · 示例", "Current · demo");

  // 当前版本行右侧的动作按钮(随状态机切换)。
  function actionButton() {
    if (status === "found") {
      return (
        <button
          type="button"
          className="pxbtn primary sm cjk"
          onClick={install}
        >
          {t("立即更新 v1.0")}
        </button>
      );
    }
    if (status === "done") {
      return (
        <div className="upd-done px">
          <Icon
            name="task"
            size={14}
            glow="#5fd35f"
            style={{ marginRight: 6 }}
          />
          {t("已是最新")}
        </div>
      );
    }
    const busy = status === "checking" || status === "installing";
    return (
      <button
        type="button"
        className="pxbtn gold sm cjk"
        onClick={check}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="upd-spin" />
            {status === "installing"
              ? tl("升级中…", "Upgrading…")
              : tl("检查中…", "Checking…")}
          </>
        ) : (
          <>
            <Icon name="import" size={14} style={{ marginRight: 6 }} />
            {t("检查更新")}
          </>
        )}
      </button>
    );
  }

  function changelogTag(entry: MockChangelogEntry, isFirst: boolean) {
    if (!entry.tag) return null;
    return (
      <span className="upd-tag px">
        {status === "done" && isFirst ? t("已安装") : entry.tag}
      </span>
    );
  }

  return (
    <Modal
      title="UPDATE"
      sub="版本与更新日志"
      icon="spellbook"
      accent="#a06cd5"
      width={600}
      onClose={closePanel}
    >
      <div className="upd-wrap">
        {/* 真假分明:整面板 mock,检查/升级为模拟,不动真实 runtime。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          {t("示例更新日志 · 检查/升级为模拟，不会真的改动你的本地 runtime")}
        </div>

        {/* 当前版本卡 + 检查/升级按钮。 */}
        <div className="upd-cur">
          <div className="upd-cur-l">
            <div className="upd-logo px">R</div>
            <div>
              <div className="px" style={{ fontSize: 14, color: "#f2c84b" }}>
                {MOCK_CURRENT_VERSION}
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
                {subline}
              </div>
            </div>
          </div>
          {actionButton()}
        </div>

        {status === "found" && (
          <div className="upd-banner">
            <Icon name="crystal" size={16} glow="#5fd35f" />
            <span className="cjk">
              {t(
                "v1.0 已就绪 · 订阅者可一键升级 runtime，会话进度不丢失（演示）",
              )}
            </span>
          </div>
        )}

        {/* 更新日志条目。 */}
        <div className="upd-log scroll">
          {MOCK_CHANGELOG.map((entry, i) => {
            const isFirst = i === 0;
            return (
              <div key={entry.v} className="upd-entry">
                <div className="upd-entry-h">
                  <span
                    className="upd-ver px"
                    style={{ "--ac": entry.accent } as React.CSSProperties}
                  >
                    {entry.v}
                  </span>
                  {changelogTag(entry, isFirst)}
                  {entry.current && status === "idle" ? (
                    <span
                      className="faint"
                      style={{ fontSize: 10, marginLeft: "auto" }}
                    >
                      {t("当前")}
                    </span>
                  ) : null}
                </div>
                <ul className="upd-notes">
                  {entry.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div
          className="faint"
          style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}
        >
          {t("更新流程为模拟，不会真的改动你的本地 runtime")}
        </div>
      </div>
    </Modal>
  );
}
