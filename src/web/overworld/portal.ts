export interface PortalFrame {
  /** 全屏遮罩透明度 0..1(前半升、后半降)。 */
  cover: number;
  /** 是否已过中点 —— 中点真正切换 view(进/出内景)。 */
  swapped: boolean;
  /** 过渡是否结束(可清掉 transition 态)。 */
  done: boolean;
}

/** 传送门遮罩的三角时序:0→1(前半)→0(后半)。纯函数,便于单测。 */
export function portalFrame(
  elapsedMs: number,
  durationMs: number,
): PortalFrame {
  if (elapsedMs >= durationMs) return { cover: 0, swapped: true, done: true };
  const half = durationMs / 2;
  const swapped = elapsedMs >= half;
  const cover =
    elapsedMs < half ? elapsedMs / half : 1 - (elapsedMs - half) / half;
  return { cover: Math.max(0, Math.min(1, cover)), swapped, done: false };
}
