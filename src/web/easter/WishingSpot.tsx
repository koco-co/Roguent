import { useRef, useState } from "react";
import { useT } from "../i18n";
import { PixelSprite } from "../lobby/PixelSprite";

// 许愿池彩蛋(移植自原型 hud.jsx:101-121):点击 → 抛硬币 + 涟漪环 + 「+1 福气」浮字;
// 第 7n 次许愿变金色幸运(★ 福气 +N)。localStorage `roguent_wish` 仅累计许愿次数这一
// 彩蛋状态,不是业务数据;读写失败回落组件内自增,不阻断交互。

interface WishFx {
  id: number;
  lucky: boolean;
  n: number;
}

export interface WishingSpotProps {
  style?: React.CSSProperties;
}

/** 许愿池热点:点击抛币许愿,第 7n 次幸运。 */
export function WishingSpot({ style }: WishingSpotProps) {
  const t = useT();
  const [fx, setFx] = useState<WishFx[]>([]);
  const idRef = useRef(0);

  const wish = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = idRef.current++;
    let n = id + 1;
    try {
      n =
        (Number.parseInt(localStorage.getItem("roguent_wish") ?? "0", 10) ||
          0) + 1;
      localStorage.setItem("roguent_wish", String(n));
    } catch {
      /* 私有模式 / 禁存:回落组件内计数,彩蛋照常 */
    }
    const lucky = n % 7 === 0;
    setFx((f) => [...f, { id, lucky, n }]);
    setTimeout(() => setFx((f) => f.filter((x) => x.id !== id)), 1300);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 纯交互装饰彩蛋,无键盘语义
    <div className="wish-spot" style={style} onClick={wish} title={t("许愿")}>
      {fx.map((w) => (
        <div key={w.id} className={`wish-fx${w.lucky ? " lucky" : ""}`}>
          <div className="wish-ring" />
          <div className="wish-coin">
            <PixelSprite name="coin_anim_f0" scale={4} />
          </div>
          <div className="wish-txt px">
            {w.lucky ? `★ ${t("福气")} +${w.n}` : `+1 ${t("福气")}`}
          </div>
        </div>
      ))}
    </div>
  );
}
