import { useEffect, useRef } from "react";
import { loadAtlasDom } from "./atlas-dom";
import { loadAtlasImage } from "./atlas-image";
import { paintHub } from "./hub-paint";

// 大厅地面:一整张 1920×1120 canvas(原型 room.jsx HubCanvas)。比 1080 高出的 40px
// 溢出由 .hub overflow:hidden 裁掉,照原型。绘制是一次性的(确定性 hash,无动画帧)。

export function HubCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    Promise.all([loadAtlasImage(), loadAtlasDom()])
      .then(([, atlas]) => {
        if (dead) return;
        const ctx = ref.current?.getContext("2d");
        if (ctx) paintHub(ctx, atlas);
      })
      .catch((err) => {
        // 加载失败不许静默黑屏:保底铺草色,结构/小人(DOM 层)仍可见。
        console.error("HubCanvas: atlas 加载失败,回落纯色地面", err);
        if (dead) return;
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.fillStyle = "#2c4d24";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      });
    return () => {
      dead = true;
    };
  }, []);
  return <canvas ref={ref} width={1920} height={1120} className="hub-canvas" />;
}
