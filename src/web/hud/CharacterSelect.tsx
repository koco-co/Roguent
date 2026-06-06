import type React from "react";
import { useSettingsStore } from "../settings-store";
import { HeroPortrait } from "./HeroPortrait";
import { Icon } from "./icons";

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

// 展示用 roster:照搬原型 data.js heroPool 的 8 个英雄(hero base + 中文名 + 强调色);
// 非引擎数据(引擎的英雄池见 src/shared/mapping.ts 的 HERO_POOL)。
const CHARSEL_HEROES = [
  { hero: "knight_m", name: "骑士", accent: "#f2c84b" },
  { hero: "wizzard_m", name: "法师", accent: "#36c5e0" },
  { hero: "elf_f", name: "精灵", accent: "#5fd35f" },
  { hero: "lizard_m", name: "蜥蜴人", accent: "#5fd35f" },
  { hero: "knight_f", name: "女骑士", accent: "#ff4d6d" },
  { hero: "dwarf_m", name: "矮人", accent: "#a06cd5" },
  { hero: "wizzard_f", name: "女法师", accent: "#a06cd5" },
  { hero: "elf_m", name: "游侠", accent: "#36c5e0" },
];

export function CharacterSelect() {
  const avatarHero = useSettingsStore((s) => s.avatarHero);
  const setSetting = useSettingsStore((s) => s.setSetting);

  // gate:已选过则不再显示(一次性)。放在所有 selector 之后;本组件无其它 hooks。
  if (avatarHero !== null) return null;

  return (
    // 强制门:scrim 不绑 onClick(点空白处不关闭),无 closex(必须选一个)。
    <div className="scrim charsel">
      <div
        className="panel rivets modal-pop"
        style={{
          width: "min(780px, 94vw)",
          maxHeight: "min(90vh, 960px)",
        }}
      >
        <div className="panel-titlebar">
          <Icon name="account" size={22} glow="#f2c84b" />
          <span className="title" style={{ color: "#f2c84b" }}>
            CHOOSE HERO
          </span>
          <span className="sub cjk">选择像素角色进入大厅</span>
        </div>
        <div className="panel-body scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="charsel-grid">
            {CHARSEL_HEROES.map(({ hero, name, accent }) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: 像素卡片,键盘 a11y 由 App 集中处理
              <div
                key={hero}
                className="charsel-cell"
                style={{ "--ac": accent } as React.CSSProperties}
                onClick={() => setSetting("avatarHero", hero)}
              >
                <div className="charsel-portrait">
                  <HeroPortrait
                    sessionId={hero}
                    hero={hero}
                    size={64}
                    className=""
                  />
                </div>
                <div className="charsel-name">{name}</div>
              </div>
            ))}
          </div>
          <div
            className="faint"
            style={{ textAlign: "center", marginTop: 14, fontSize: 12 }}
          >
            进入后用 WASD 或点击移动 · 走到中央任务台按 E 打开会话
          </div>
        </div>
      </div>
    </div>
  );
}
