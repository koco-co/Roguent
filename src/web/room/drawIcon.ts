import type { Graphics } from "pixi.js";
import { ICON_ART, type IconName } from "../hud/icons";

/** Convert a "#rrggbb" hex string to a numeric color for Pixi. */
function hexToNum(c: string): number {
  return Number.parseInt(c.slice(1), 16);
}

/**
 * Draw a pixel icon into a PixiJS Graphics object.
 * @param g     The Graphics instance (caller should call g.clear() first).
 * @param name  Icon name from the registry.
 * @param cell  Pixel size per grid unit (icon is drawn on a 16-grid).
 * @param ox    X offset for the icon origin (top-left of the 16×16 grid).
 * @param oy    Y offset for the icon origin (top-left of the 16×16 grid).
 */
export function drawIcon(
  g: Graphics,
  name: IconName,
  cell: number,
  ox: number,
  oy: number,
): void {
  const rects = ICON_ART[name];
  if (!rects) return;
  for (const rect of rects) {
    g.rect(
      ox + rect.x * cell,
      oy + rect.y * cell,
      rect.w * cell,
      rect.h * cell,
    ).fill(hexToNum(rect.c));
  }
}
