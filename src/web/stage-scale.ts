// 固定逻辑舞台尺寸 + 等比贴屏缩放因子。对齐设计原型 app.jsx 的 useStageScale:
// 整个 UI 在 1920×1080 设计像素里布局,#stage 按 stageScale 缩放,使房间/人物/HUD/
// 模态在任意屏幕保持恒定比例(letterbox 居中,不裁切);不 clamp —— >1920 屏幕上
// 等比放大。极窄 retina 视口会把像素画压到非整数物理像素上,所以允许很小的
// overscan 把比例吸附到 DPR 对齐值,优先保住像素边缘。
export const STAGE_W = 1920;
export const STAGE_H = 1080;
const MAX_PIXEL_SHARP_OVERSCAN = 1.08;

export function stageScale(
  winW: number,
  winH: number,
  devicePixelRatio = 1,
): number {
  const fit = Math.min(winW / STAGE_W, winH / STAGE_H);
  return pixelSharpStageScale(fit, devicePixelRatio);
}

export function pixelSharpStageScale(
  fit: number,
  devicePixelRatio: number,
): number {
  if (!Number.isFinite(fit) || fit <= 0) return fit;
  const dpr = Math.max(1, Math.round(devicePixelRatio));
  if (dpr < 2) return fit;
  const step = 1 / dpr;
  const snappedUp = Math.ceil(fit / step) * step;
  if (snappedUp > fit && snappedUp / fit <= MAX_PIXEL_SHARP_OVERSCAN) {
    return snappedUp;
  }
  return fit;
}
