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

/** Vignette: transparent centre → dark edges. Stretch over the whole canvas. */
export function vignetteTexture(): Texture {
  if (vignette) return vignette;
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, size * 0.22, c, c, size * 0.62);
    g.addColorStop(0, "rgba(7,5,14,0)");
    g.addColorStop(0.7, "rgba(7,5,14,0.45)");
    g.addColorStop(1, "rgba(5,3,11,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  vignette = Texture.from(cv);
  return vignette;
}
