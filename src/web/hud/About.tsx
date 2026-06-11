import { useT } from "../i18n";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";

/** 关于面板 —— 首个真实 Modal 消费者(静态内容,build-once)。
 *  对标设计原型 About(panels2.jsx):天赋蓝氛围、紫色 accent、居中内容。 */
export function About() {
  const t = useT();
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  if (activePanel !== "about") return null;
  return (
    <Modal
      title="ABOUT"
      sub="关于 Roguent"
      icon="spellbook"
      accent="#a06cd5"
      width={680}
      vibe="talent"
      onClose={closePanel}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 14,
          padding: "12px 0",
        }}
      >
        <div className="px" style={{ fontSize: 24, color: "#f2c84b" }}>
          ROGUENT
        </div>
        <div className="faint px" style={{ fontSize: 9 }}>
          v0.1 · dev
        </div>
        <div className="dim" style={{ maxWidth: 480, lineHeight: 1.7 }}>
          {t(
            "本地 Claude Code agent 活动的游戏化实时可视化平台,把订阅模式驱动的真实 subagent 活动渲染成像素地牢。",
          )}
        </div>
        <div className="faint" style={{ maxWidth: 480, lineHeight: 1.7 }}>
          {t(
            "像素美术 0x72 DungeonTilesetII (CC0) · 像素字体 Fusion Pixel 12px (OFL-1.1, TakWolf) · Press Start 2P (OFL) · 致敬《元气骑士》",
          )}
        </div>
      </div>
    </Modal>
  );
}
