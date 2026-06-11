import { useMemo } from "react";
import type { AchievementProgress } from "../../../shared/economy";
import { useT } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { sendCommand } from "../../ws-client";
import { Modal } from "../Modal";
import { Icon } from "../icons";

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
  const list = useMemo(
    () =>
      Object.values(achievements).toSorted((a, b) => a.id.localeCompare(b.id)),
    [achievements],
  );

  if (!active) return null;

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
        {list.length === 0 ? (
          <div className="empty-center">
            <div className="empty-title">No achievements yet</div>
            <div className="empty-sub">
              {t("创建 Codex 会话后，真实 runtime 事件会推进成就。")}
            </div>
          </div>
        ) : (
          list.map((achievement) => {
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
          })
        )}
      </div>
    </Modal>
  );
}
