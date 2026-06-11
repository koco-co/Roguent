import { useSettingsStore } from "../settings-store";
import { Icon } from "./icons";

/**
 * 界面语言切换(分段 中 | EN,对标设计原型 hud.jsx LangToggle + layout.css .lang-toggle)。
 * 真实接线:settings-store.uiLang(持久化);所有 useT()/useTL() 消费端联动重渲。
 * 两视图都显示;落左上控件栈(ViewSwitch 下方,见 styles.css 定位)。
 */
export function LangToggle() {
  const uiLang = useSettingsStore((s) => s.uiLang);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const en = uiLang === "en";
  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={() => setSetting("uiLang", en ? "cn" : "en")}
      title={en ? "Switch to 中文" : "切换到 English"}
    >
      <Icon name="spellbook" size={16} />
      <span className={`lang-opt${en ? "" : " on"}`}>中</span>
      <span className={`lang-opt px${en ? " on" : ""}`}>EN</span>
    </button>
  );
}
