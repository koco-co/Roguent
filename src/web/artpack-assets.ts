import { ART_PACKS, DEFAULT_ARTPACK, loadArtPack } from "./hud/artpack";

export const DEFAULT_ATLAS_JSON_URL = "/assets/0x72/dungeon.json";
export const DEFAULT_ATLAS_IMAGE_URL = "/assets/0x72/dungeon.png";

export interface ArtPackAtlasUrls {
  packId: string;
  json: string;
  image: string;
}

const readyPackIds = new Set(
  ART_PACKS.filter((pack) => pack.ready).map((pack) => pack.id),
);
const LEGACY_ATLAS_ARTPACK = "pixel-fantasy";

export function resolveArtPackAtlasUrls(id: string): ArtPackAtlasUrls {
  const packId = readyPackIds.has(id) ? id : DEFAULT_ARTPACK;

  if (packId === LEGACY_ATLAS_ARTPACK) {
    return {
      packId,
      json: DEFAULT_ATLAS_JSON_URL,
      image: DEFAULT_ATLAS_IMAGE_URL,
    };
  }

  return {
    packId,
    json: `/assets/artpacks/${packId}/atlas/dungeon.json`,
    image: `/assets/artpacks/${packId}/atlas/dungeon.png`,
  };
}

export function resolveCurrentArtPackAtlasUrls(): ArtPackAtlasUrls {
  return resolveArtPackAtlasUrls(loadArtPack());
}
