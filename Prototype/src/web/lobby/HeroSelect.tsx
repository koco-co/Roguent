import type React from "react";
import { HeroPortrait } from "../hud/HeroPortrait";
import { Icon } from "../hud/icons";
import { useSettingsStore } from "../settings-store";

export const HERO_SELECT_OPTIONS = [
  { hero: "orc_warrior", name: "Orc", accent: "#5fd35f" },
  { hero: "knight_m", name: "骑士", accent: "#f2c84b" },
  { hero: "wizzard_m", name: "法师", accent: "#36c5e0" },
  { hero: "elf_f", name: "精灵", accent: "#5fd35f" },
  { hero: "lizard_m", name: "蜥蜴人", accent: "#5fd35f" },
  { hero: "knight_f", name: "女骑士", accent: "#ff4d6d" },
  { hero: "dwarf_m", name: "矮人", accent: "#a06cd5" },
  { hero: "wizzard_f", name: "女法师", accent: "#a06cd5" },
  { hero: "elf_m", name: "游侠", accent: "#36c5e0" },
];

export interface HeroSelectProps {
  onSelect?: (hero: string) => void;
}

export function HeroSelect({ onSelect }: HeroSelectProps) {
  const setSetting = useSettingsStore((s) => s.setSetting);
  const choose = onSelect ?? ((hero: string) => setSetting("avatarHero", hero));

  return (
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
          {HERO_SELECT_OPTIONS.map(({ hero, name, accent }) => (
            <button
              type="button"
              key={hero}
              className="charsel-cell"
              style={{ "--ac": accent } as React.CSSProperties}
              onClick={() => choose(hero)}
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
            </button>
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
  );
}
