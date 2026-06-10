import { useEffect, useRef } from "react";
import { sessionHero } from "../overworld/skins";

// The HUD lives outside the Pixi <AtlasProvider>, so it can't reach the loaded
// Spritesheet. Load the atlas JSON + PNG once on our own (browser-cached) and
// crop hero idle frames into a <canvas> for DOM portraits.
const ATLAS_JSON_URL = "/assets/0x72/dungeon.json";
const ATLAS_IMAGE_URL = "/assets/0x72/dungeon.png";

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface AtlasData {
  frames: Record<string, { frame: FrameRect }>;
  image: HTMLImageElement;
}

let atlasDataPromise: Promise<AtlasData> | null = null;

function loadAtlasData(): Promise<AtlasData> {
  if (!atlasDataPromise) {
    atlasDataPromise = (async () => {
      const res = await fetch(ATLAS_JSON_URL);
      const json = (await res.json()) as {
        frames: Record<string, { frame: FrameRect }>;
      };
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = ATLAS_IMAGE_URL;
      });
      return { frames: json.frames, image };
    })().catch((e) => {
      // Don't cache a rejected promise — clear it so a later mount can retry
      // instead of being stuck on the dark fallback until a full reload.
      atlasDataPromise = null;
      throw e;
    });
  }
  return atlasDataPromise;
}

const SIZE = 40; // matches .px-dossier-portrait box

interface HeroPortraitProps {
  /** Session id; when no explicit `hero` is given, derives the session's
   *  deterministic NPC hero via sessionHero(sessionId). */
  sessionId: string;
  /** Explicit 0x72 hero base (e.g. "knight_m"); overrides sessionHero. Used by
   *  the roster so each on-duty agent draws its own hero, matching the room. */
  hero?: string;
  /** Square canvas edge in px (default 40 = .px-dossier-portrait box). */
  size?: number;
  /** CSS class for the canvas (default the dossier dark box). Pass "" for a
   *  bare transparent portrait (e.g. inside the roster avatar tile). */
  className?: string;
}

/**
 * Pixel hero avatar rendered straight to a <canvas> (no Pixi): crops an idle
 * frame from the 0x72 atlas, contain-fit and centred, kept crisp. Used by the
 * NpcCard titlebar (session hero) and the RosterCard (per-agent hero). Falls
 * back to the canvas class's box if the atlas can't be loaded.
 */
export function HeroPortrait({
  sessionId,
  hero,
  size = SIZE,
  className = "px-dossier-portrait",
}: HeroPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const base = hero ?? sessionHero(sessionId);
  useEffect(() => {
    let cancelled = false;
    loadAtlasData()
      .then(({ frames, image }) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const f = frames[`${base}_idle_anim_f0.png`]?.frame;
        if (!f) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false; // keep pixels crisp
        const scale = Math.min(canvas.width / f.w, canvas.height / f.h);
        const dw = f.w * scale;
        const dh = f.h * scale;
        ctx.drawImage(
          image,
          f.x,
          f.y,
          f.w,
          f.h,
          (canvas.width - dw) / 2,
          (canvas.height - dh) / 2,
          dw,
          dh,
        );
      })
      .catch(() => {
        /* leave the fallback box */
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={size}
      height={size}
      aria-hidden
    />
  );
}
