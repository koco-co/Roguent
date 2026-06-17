import { useCallback, useEffect, useRef, useState } from "react";
import { ARTPACK_CHANGE_EVENT } from "../hud/artpack";
import { useT } from "../i18n";
import { atlasErrorText } from "../room/atlas";
import { loadAtlasDom } from "./atlas-dom";
import { loadAtlasImage } from "./atlas-image";
import { paintHub } from "./hub-paint";

// 大厅地面:一整张 1920×1120 canvas(原型 room.jsx HubCanvas)。比 1080 高出的 40px
// 溢出由 .hub overflow:hidden 裁掉,照原型。绘制是一次性的(确定性 hash,无动画帧)。
//
// 加载失败不静默:保底铺草色当背景(结构/小人 DOM 层仍可见),同时叠一层可见错误层
// (失败原因 + 重试),对齐 Room.tsx 的 atlas 错误层。绝不只 console.error + 绿屏。

export function HubCanvas() {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);

  const repaint = useCallback(() => {
    setAtlasError(null);
    return Promise.all([loadAtlasImage(), loadAtlasDom()])
      .then(([, atlas]) => {
        const ctx = ref.current?.getContext("2d");
        if (ctx) paintHub(ctx, atlas);
      })
      .catch((err: unknown) => {
        // 加载失败:保底铺草色(背景不黑屏),并把原因抛到可见错误层让用户能重试。
        console.error("HubCanvas: atlas 加载失败,回落纯色地面", err);
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.fillStyle = "#2c4d24";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        setAtlasError(atlasErrorText(err));
      });
  }, []);

  useEffect(() => {
    const run = () => void repaint();
    run();
    window.addEventListener(ARTPACK_CHANGE_EVENT, run);
    return () => {
      window.removeEventListener(ARTPACK_CHANGE_EVENT, run);
    };
  }, [repaint]);

  return (
    <>
      <canvas ref={ref} width={1920} height={1120} className="hub-canvas" />
      {atlasError ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: 仅吞掉点击冒泡,防触发 .hub 背景寻路;键盘交互在内部按钮
        <div
          className="hub-atlas-error"
          role="alert"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hub-atlas-error-title">{t("大厅贴图加载失败")}</div>
          <div className="hub-atlas-error-reason">{atlasError}</div>
          <button type="button" className="px-btn cjk" onClick={repaint}>
            {t("重试")}
          </button>
        </div>
      ) : null}
    </>
  );
}
