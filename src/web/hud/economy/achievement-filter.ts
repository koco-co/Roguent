import type { AchievementProgress } from "../../../shared/economy";

/**
 * 成就页签 —— 纯展示派生(无副作用、不造数据)。
 *
 * 真源:`AchievementProgress` 由引擎 `economy.ledger.appended` / `achievement.updated`
 * 事件推进(见 store.ts reduce)。此处只对真实列表做过滤,不改 store、不补字段。
 *
 * tab 语义(照 Prototype panels3.jsx:13-21):
 * - all:全部成就
 * - unlocked:已解锁(completed)
 * - progress:进行中(!completed)
 */
export type AchievementTab = "all" | "unlocked" | "progress";

export function filterAchievements(
  list: readonly AchievementProgress[],
  tab: AchievementTab,
): AchievementProgress[] {
  if (tab === "unlocked") return list.filter((a) => a.completed);
  if (tab === "progress") return list.filter((a) => !a.completed);
  return [...list];
}
