import { Assets, type Spritesheet, type Texture } from "pixi.js";
import { createContext, useContext } from "react";
import { resolveCurrentArtPackAtlasUrls } from "../artpack-assets";

// Runtime atlases use the same TexturePacker frame contract. The default is a
// generated sci-fi art pack; 0x72 remains selectable as a legacy pack.
const sheetPromises = new Map<string, Promise<Spritesheet>>();

/** Load the dungeon atlas once. Pixels are kept crisp (nearest-neighbour). */
export function loadAtlas(): Promise<Spritesheet> {
  const { json } = resolveCurrentArtPackAtlasUrls();
  let sheetPromise = sheetPromises.get(json);
  if (!sheetPromise) {
    sheetPromise = Assets.load<Spritesheet>(json).then((sheet) => {
      // Every frame shares one source — flip it to nearest so scaled-up
      // pixel art stays sharp instead of bilinear-blurred.
      const first = Object.values(sheet.textures)[0];
      if (first) first.source.scaleMode = "nearest";
      return sheet;
    });
    sheetPromises.set(json, sheetPromise);
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
  sheetPromises.clear();
}
