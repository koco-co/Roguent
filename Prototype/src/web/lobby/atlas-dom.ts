import { useEffect, useState } from "react";

// HUD/大厅活在 Pixi <AtlasProvider> 之外,拿不到已加载的 Spritesheet。这里自行 fetch
// 一次 atlas JSON(浏览器缓存),把帧表归一成「名(去 .png)→ {x,y,w,h}」+ 图 URL +
// 图尺寸,供 DOM 精灵(PixelSprite)用 CSS background-position 切片。与 HeroPortrait 的
// 画布切片是两条路径(那条要 HTMLImageElement;这条只要 URL + 坐标),各取所需。

const ATLAS_JSON_URL = "/assets/0x72/dungeon.json";
const ATLAS_IMAGE_URL = "/assets/0x72/dungeon.png";

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AtlasDom {
  /** 帧名(已去 .png 后缀)→ 帧矩形。 */
  frames: Record<string, AtlasFrame>;
  imageUrl: string;
  /** atlas 整图尺寸(backgroundSize 用)。 */
  w: number;
  h: number;
}

let cache: AtlasDom | null = null;
let promise: Promise<AtlasDom> | null = null;

function load(): Promise<AtlasDom> {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(ATLAS_JSON_URL);
      const json = (await res.json()) as {
        frames: Record<string, { frame: AtlasFrame }>;
        meta?: { size?: { w: number; h: number } };
      };
      const frames: Record<string, AtlasFrame> = {};
      for (const [k, v] of Object.entries(json.frames)) {
        frames[k.replace(/\.png$/, "")] = v.frame;
      }
      cache = {
        frames,
        imageUrl: ATLAS_IMAGE_URL,
        w: json.meta?.size?.w ?? 128,
        h: json.meta?.size?.h ?? 1178,
      };
      return cache;
    })().catch((e) => {
      // 别缓存失败的 promise——清掉,让后续 mount 能重试,而不是卡在空渲染。
      promise = null;
      throw e;
    });
  }
  return promise;
}

/** 加载并缓存 0x72 atlas 的 DOM 用帧表;加载中返回 null(精灵暂不渲染)。 */
export function useAtlasDom(): AtlasDom | null {
  const [data, setData] = useState<AtlasDom | null>(cache);
  useEffect(() => {
    if (cache) {
      setData(cache);
      return;
    }
    let cancelled = false;
    load()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* 加载失败:精灵留空,结构/图标(SVG/CSS)仍可见,不黑屏 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
