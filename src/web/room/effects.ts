import { Texture } from "pixi.js";

// Soft radial light textures generated from a 2D canvas (smooth/linear, unlike
// the nearest-scaled pixel atlas). Built lazily once and cached.

let glow: Texture | null = null;
let vignette: Texture | null = null;

/** White radial glow (opaque centre → transparent edge). Tint + add-blend it. */
export function glowTexture(): Texture {
  if (glow) return glow;
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  glow = Texture.from(cv);
  return glow;
}

/**
 * Vignette: transparent centre → dark edges. Stretch over the whole canvas.
 *
 * 对齐原型 layout.css 的 `.vignette`(`radial-gradient(125% 95% at 50% 40%,
 * transparent 38%, ….5 70%, ….92 100%)`):大片中心保持全透明、只在「最外圈/角落」
 * 压暗。此前 inner 0.22 / outer 0.62 会让外圈 ~38% 直接吃满 0.92 死黑、整间发暗。
 * 这里把渐变铺到角落(outer ≈ 0.71·size,即纹理对角距),中心透明区扩到 ~0.45,
 * 暗只集中在四角,房间整体回亮——更贴原型暖亮观感。
 */
export function vignetteTexture(): Texture {
  if (vignette) return vignette;
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const c = size / 2;
    // outer 半径 = 中心到角落距离(√2/2 = Math.SQRT1_2),使 1.0 落在画面角而非
    // 提前吃满死黑。
    const g = ctx.createRadialGradient(c, c, 0, c, c, size * Math.SQRT1_2);
    g.addColorStop(0, "rgba(7,9,16,0)");
    g.addColorStop(0.45, "rgba(7,9,16,0)");
    g.addColorStop(0.78, "rgba(7,8,15,0.34)");
    g.addColorStop(1, "rgba(5,4,12,0.88)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  vignette = Texture.from(cv);
  return vignette;
}
