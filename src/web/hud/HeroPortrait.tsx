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
    })();
  }
  return atlasDataPromise;
}

const SIZE = 40; // matches .px-dossier-portrait box

/**
 * Session avatar for the NpcCard titlebar: the session's deterministic hero
 * (sessionHero) idle frame, contain-fit and centred in a 40×40 pixelated canvas.
 * Self-contained DOM render (no Pixi); falls back to the class's dark box if the
 * atlas can't be loaded.
 */
export function HeroPortrait({ sessionId }: { sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAtlasData()
      .then(({ frames, image }) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const f = frames[`${sessionHero(sessionId)}_idle_anim_f0.png`]?.frame;
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
        /* leave the dark fallback box */
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <canvas
      ref={canvasRef}
      className="px-dossier-portrait"
      width={SIZE}
      height={SIZE}
      aria-hidden
    />
  );
}
