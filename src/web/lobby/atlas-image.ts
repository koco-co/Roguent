import type { AtlasFrame } from "./atlas-dom";

// canvas 绘制(HubCanvas/paintHub)需要 HTMLImageElement 做 drawImage 源;atlas-dom 只有
// URL/帧坐标(CSS 切片路径),这里补 img 单例 + drawFrame(对照原型 sprites.jsx:73-88)。

const ATLAS_IMAGE_URL = "/assets/0x72/dungeon.png";

let atlasImg: HTMLImageElement | null = null;
let promise: Promise<HTMLImageElement> | null = null;

/** 模块级单例加载 atlas 整图;失败不缓存 rejected promise,后续 mount 可重试。 */
export function loadAtlasImage(): Promise<HTMLImageElement> {
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        atlasImg = im;
        resolve(im);
      };
      im.onerror = () => {
        promise = null;
        reject(new Error(`atlas image load failed: ${ATLAS_IMAGE_URL}`));
      };
      im.src = ATLAS_IMAGE_URL;
    });
  }
  return promise;
}

/** 把命名帧以 nearest-neighbor 画到 ctx;img 未就绪或帧名不存在则静默跳过(同原型)。 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frames: Record<string, AtlasFrame>,
  name: string,
  dx: number,
  dy: number,
  scale: number,
): void {
  const f = frames[name];
  if (!f || !atlasImg) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasImg, f.x, f.y, f.w, f.h, dx, dy, f.w * scale, f.h * scale);
}
