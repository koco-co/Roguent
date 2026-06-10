import { HeroSelect } from "../lobby/HeroSelect";
import { useSettingsStore } from "../settings-store";

/**
 * 首次进入(avatarHero === null)显示的强制角色选择门。
 *
 * 点某个英雄 → setSetting('avatarHero', hero) 持久化 → 驱动大厅玩家 Player 的头像皮肤。
 * 无关闭按钮、点空白处不关闭(必须选一个才能进大厅);选完即关(gate 回 null)。
 *
 * roster(CHARSEL_HEROES)照搬原型 data.js 的 heroPool 前 8 个,带中文名 + 强调色,
 * 仅作展示;**这是真功能**(写真实持久化偏好 avatarHero),不是 mock,不加 mock banner。
 *
 * 一次性:选过(avatarHero !== null)后不再出现;如需重选,后续可从设置 / 系统菜单
 * 接入(本任务不做)。
 */

export function CharacterSelect() {
  const avatarHero = useSettingsStore((s) => s.avatarHero);

  // gate:已选过则不再显示(一次性)。放在所有 selector 之后;本组件无其它 hooks。
  if (avatarHero !== null) return null;

  return (
    // 强制门:scrim 不绑 onClick(点空白处不关闭),无 closex(必须选一个)。
    <div className="scrim charsel">
      <HeroSelect />
    </div>
  );
}
