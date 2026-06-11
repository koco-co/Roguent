import { useTL } from "../i18n";
import { useSettingsStore } from "../settings-store";

/** 场景皮肤切换(地牢/全息,对标设计 app.jsx skin-switch)。两视图都显示,落 LangToggle 下方。 */
export function SkinSwitch() {
  const skin = useSettingsStore((s) => s.skin);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const tl = useTL();
  return (
    <div className="skin-switch">
      <div className="skin-lab px">{tl("场景", "SCENE")}</div>
      <button
        type="button"
        className={`skin-opt${skin === "dungeon" ? " on" : ""}`}
        onClick={() => setSetting("skin", "dungeon")}
      >
        <span className="skin-dot dungeon" />
        {tl("地牢", "Dungeon")}
      </button>
      <button
        type="button"
        className={`skin-opt${skin === "holo" ? " on" : ""}`}
        onClick={() => setSetting("skin", "holo")}
      >
        <span className="skin-dot holo" />
        {tl("全息", "Holo")}
      </button>
    </div>
  );
}
