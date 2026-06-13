import { useMemo, useState } from "react";
import type { AchievementProgress } from "../../../shared/economy";
import { useT } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { sendCommand } from "../../ws-client";
import { Modal } from "../Modal";
import { Icon } from "../icons";
import { type AchievementTab, filterAchievements } from "./achievement-filter";

const TABS: { id: AchievementTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "unlocked", label: "已解锁" },
  { id: "progress", label: "进行中" },
];

function rewardLabel(achievement: AchievementProgress): string {
  const reward = achievement.reward ?? {};
  const parts = Object.entries(reward).map(([currency, amount]) => {
    return `${amount} ${currency}`;
  });
  return parts.length ? parts.join(" · ") : "No reward";
}

function progressLabel(achievement: AchievementProgress): string {
  return `${achievement.progress} / ${achievement.target}`;
}

export function AchievementsPanel() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "achievements");
  const closePanel = useUiStore((s) => s.closePanel);
  const achievements = useRoomStore((s) => s.achievements);
  const [tab, setTab] = useState<AchievementTab>("all");
  // 真实成就(store.achievements)按 id 排序 —— selector 取稳定引用,派生放 useMemo。
  const sorted = useMemo(
    () =>
      Object.values(achievements).toSorted((a, b) => a.id.localeCompare(b.id)),
    [achievements],
  );
  const unlockedCount = useMemo(
    () => sorted.filter((a) => a.completed).length,
    [sorted],
  );
  // 页签过滤是纯展示派生(filterAchievements),不改 store、不造数据。
  const list = useMemo(() => filterAchievements(sorted, tab), [sorted, tab]);

  if (!active) return null;

  const total = sorted.length;
  const pct = total === 0 ? 0 : Math.round((unlockedCount / total) * 100);

  return (
    <Modal
      title="ACHIEVEMENTS"
      sub="真实里程碑 · event / ledger 驱动"
      icon="trophy"
      accent="#5fd35f"
      width={980}
      onClose={closePanel}
    >
      <div className="achievements-panel">
        {total === 0 ? (
          <div className="empty-center">
            <div className="empty-title">No achievements yet</div>
            <div className="empty-sub">
              {t("创建 Codex 会话后，真实 runtime 事件会推进成就。")}
            </div>
          </div>
        ) : (
          <>
            <div className="ach-summary">
              <div className="ach-sum-l">
                <Icon name="trophy" size={32} glow="#f2c84b" />
                <div>
                  <div className="px ach-sum-big">
                    {unlockedCount} / {total}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                    {t("已解锁成就")}
                  </div>
                </div>
              </div>
              <div
                className="ach-sum-bar"
                aria-label="achievements unlocked percent"
              >
                <div className="ach-sum-fill" style={{ width: `${pct}%` }} />
                <span className="px ach-sum-pct">{pct}%</span>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Achievement tabs">
              {TABS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`tab${tab === it.id ? " on" : ""}`}
                  role="tab"
                  aria-selected={tab === it.id}
                  onClick={() => setTab(it.id)}
                >
                  {t(it.label)}
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <div className="empty-center faint">{t("此分类暂无成就")}</div>
            ) : null}
            {list.map((achievement) => {
              const claimable = achievement.completed && !achievement.claimed;
              return (
                <div key={achievement.id} className="achievement-row">
                  <div className="achievement-icon">
                    <Icon
                      name={achievement.completed ? "trophy" : "quest"}
                      size={28}
                      glow={achievement.completed ? "#5fd35f" : "#36c5e0"}
                    />
                  </div>
                  <div className="achievement-main">
                    <div className="achievement-title">{achievement.title}</div>
                    {achievement.description ? (
                      <div className="achievement-desc">
                        {achievement.description}
                      </div>
                    ) : null}
                    <div
                      className="achievement-meter"
                      aria-label={`${achievement.title} progress`}
                    >
                      <span>{progressLabel(achievement)}</span>
                      <span>{rewardLabel(achievement)}</span>
                    </div>
                  </div>
                  <div className="achievement-actions">
                    {achievement.claimed ? (
                      <span className="connector-pill connected">Claimed</span>
                    ) : (
                      <button
                        type="button"
                        className={`pxbtn${claimable ? "" : " dis"}`}
                        disabled={!claimable}
                        aria-label={`Claim ${achievement.title}`}
                        onClick={() =>
                          sendCommand({
                            cmd: "economy",
                            action: "claimAchievement",
                            achievementId: achievement.id,
                          })
                        }
                      >
                        Claim
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Modal>
  );
}
