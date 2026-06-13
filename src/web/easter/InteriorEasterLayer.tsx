import { PetActor } from "./PetActor";
import { QuipOverlay } from "./QuipOverlay";
import { WishingSpot } from "./WishingSpot";

// 内景彩蛋覆盖层:盖在 Pixi canvas 之上的纯 DOM 层(容器 pointer-events:none 穿透,
// 彩蛋元素自身 pointer-events:auto),挂点见 App.tsx 的 inInterior 分支。
//   · 许愿池 @ left:15%/top:14%(对齐原型 hud.jsx:262 的 World 挂点)
//   · 撸猫 @ 固定右下角(.interior-pet)
//   · QuipOverlay 取在场 agent 的 home anchor 弹台词气泡

/** 内景三件套彩蛋(许愿池 / 撸猫 / 台词气泡)的统一挂载层。 */
export function InteriorEasterLayer() {
  return (
    <div className="interior-easter">
      <WishingSpot style={{ left: "15%", top: "14%" }} />
      <div className="interior-pet">
        <PetActor scale={4} />
      </div>
      <QuipOverlay />
    </div>
  );
}
