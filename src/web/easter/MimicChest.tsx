import { useState } from "react";
import { useT } from "../i18n";
import { PixelSprite } from "../lobby/PixelSprite";

// 宝箱怪彩蛋(移植自原型 hud.jsx:83-98):平时是一只敞口宝箱(chest_full_open_anim_f0),
// 点击后「咬一口」抖动 + 露出 mimic 帧(chest_mimic_open_anim_f1)与「?!」气泡,950ms 后复原。
// localStorage `roguent_mimic` 仅记「被发现过」这一彩蛋状态,不是业务数据;读写失败静默忽略。

export interface MimicChestProps {
  scale?: number;
}

/** 隐藏在草坪宝物里的宝箱怪:点击触发咬合动画。 */
export function MimicChest({ scale = 4 }: MimicChestProps) {
  const t = useT();
  const [snap, setSnap] = useState(false);

  const bite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (snap) return;
    setSnap(true);
    try {
      localStorage.setItem("roguent_mimic", "1");
    } catch {
      /* 私有模式 / 禁存:彩蛋不依赖持久化,静默忽略 */
    }
    setTimeout(() => setSnap(false), 950);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 纯交互装饰彩蛋,无键盘语义
    <div
      className={`mimic${snap ? " snap" : ""}`}
      onClick={bite}
      title={t("宝箱")}
    >
      <PixelSprite
        name={snap ? "chest_mimic_open_anim_f1" : "chest_full_open_anim_f0"}
        scale={scale}
        animated={false}
      />
      {snap ? <div className="mimic-pop px">?!</div> : null}
    </div>
  );
}
