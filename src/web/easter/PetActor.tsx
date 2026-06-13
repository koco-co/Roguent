import { useRef, useState } from "react";
import { Icon } from "../hud/icons";
import { useT } from "../i18n";
import { CatPet } from "../lobby/CatPet";

// 撸猫彩蛋(移植自原型 hud.jsx:29-49):点击 → 黑猫 hop + 心形粒子上浮;每第 10 次点击
// 出一颗彩虹心(huecycle)。纯交互装饰,无业务副作用;计数只活在组件内,不落库、不发命令。
// 心形随机横向偏移(--hx)用 Math.random:仅装饰层、不进渲染快照,组件签名留 rng 供测试注入。

interface Heart {
  id: number;
  x: number;
  rainbow: boolean;
}

export interface PetActorProps {
  scale?: number;
  /** 注入确定性 rng(测试用);默认 Math.random。仅影响心形横向漂移,不影响交互语义。 */
  rng?: () => number;
}

/** 可撸的黑猫:点击触发 hop 动画 + 浮心粒子,第 10n 次彩虹心。 */
export function PetActor({ scale = 4, rng = Math.random }: PetActorProps) {
  const t = useT();
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [hop, setHop] = useState(false);
  const idRef = useRef(0);
  const cnt = useRef(0);

  const pet = (e: React.MouseEvent) => {
    e.stopPropagation();
    cnt.current += 1;
    const id = idRef.current++;
    const rainbow = cnt.current % 10 === 0;
    const x = Math.trunc(rng() * 34 - 17);
    setHearts((hs) => [...hs, { id, x, rainbow }]);
    setHop(true);
    setTimeout(() => setHop(false), 360);
    setTimeout(() => setHearts((hs) => hs.filter((h) => h.id !== id)), 1100);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 纯交互装饰彩蛋,无键盘语义;不抢全局焦点
    <div
      className={`petactor${hop ? " hop" : ""}`}
      onClick={pet}
      title={t("撸一下")}
    >
      <CatPet scale={scale} />
      {hearts.map((h) => (
        <div
          key={h.id}
          className={`pet-heart${h.rainbow ? " rainbow" : ""}`}
          style={{ "--hx": `${h.x}px` } as React.CSSProperties}
        >
          <Icon
            name="heart"
            size={14}
            glow={h.rainbow ? "#a06cd5" : "#ff4d6d"}
          />
        </div>
      ))}
    </div>
  );
}
