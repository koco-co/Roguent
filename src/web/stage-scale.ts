// 固定逻辑舞台尺寸 + 等比贴屏缩放因子。对齐设计原型 app.jsx 的 useStageScale:
// 整个 UI 在 1920×1080 设计像素里布局,#stage 按 stageScale 缩放,使房间/人物/HUD/
// 模态在任意屏幕保持恒定比例(letterbox 居中,不裁切);不 clamp —— >1920 屏幕上
// 等比放大,像素图靠 CSS image-rendering:pixelated 保持锐利(与原型一致)。
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function stageScale(winW: number, winH: number): number {
  return Math.min(winW / STAGE_W, winH / STAGE_H);
}
