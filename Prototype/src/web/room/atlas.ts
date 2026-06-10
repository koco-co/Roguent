import { Assets, type Spritesheet, type Texture } from "pixi.js";
import { createContext, useContext } from "react";

// 0x72 "16x16 DungeonTileset II" (CC0). Served from public/ — see CREDITS.md.
const ATLAS_URL = "/assets/0x72/dungeon.json";

let sheetPromise: Promise<Spritesheet> | null = null;

/** Load the dungeon atlas once. Pixels are kept crisp (nearest-neighbour). */
export function loadAtlas(): Promise<Spritesheet> {
  if (!sheetPromise) {
    sheetPromise = Assets.load<Spritesheet>(ATLAS_URL).then((sheet) => {
      // Every frame shares one source — flip it to nearest so scaled-up
      // pixel art stays sharp instead of bilinear-blurred.
      const first = Object.values(sheet.textures)[0];
      if (first) first.source.scaleMode = "nearest";
      return sheet;
    });
  }
  return sheetPromise;
}

/** A single static frame by name, with or without the `.png` suffix. */
export function tex(sheet: Spritesheet, name: string): Texture {
  const t = sheet.textures[name.endsWith(".png") ? name : `${name}.png`];
  if (!t) throw new Error(`atlas: missing frame "${name}"`);
  return t;
}

/** Optional static frame — returns undefined instead of throwing when absent. */
export function tryTex(sheet: Spritesheet, name: string): Texture | undefined {
  return sheet.textures[name.endsWith(".png") ? name : `${name}.png`];
}

/** Ordered frames of an `_anim` sequence (`base_f0`, `base_f1`, …). */
export function anim(sheet: Spritesheet, base: string): Texture[] {
  const frames: Texture[] = [];
  for (let i = 0; ; i++) {
    const t = sheet.textures[`${base}_f${i}.png`];
    if (!t) break;
    frames.push(t);
  }
  if (frames.length === 0) {
    throw new Error(`atlas: no anim frames for "${base}"`);
  }
  return frames;
}

const AtlasContext = createContext<Spritesheet | null>(null);
export const AtlasProvider = AtlasContext.Provider;

/** Access the loaded atlas. Must be rendered under <AtlasProvider>. */
export function useAtlas(): Spritesheet {
  const sheet = useContext(AtlasContext);
  if (!sheet) {
    throw new Error("useAtlas must be used within <AtlasProvider>");
  }
  return sheet;
}

/** Format an atlas load error for the error overlay. Extracted for testability. */
export function atlasErrorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Reset the singleton promise so the next loadAtlas() call re-fetches.
 * Call before retry in the error overlay.
 */
export function resetAtlas(): void {
  sheetPromise = null;
}
