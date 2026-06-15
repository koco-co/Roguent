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

export function resolveArtPackAtlasUrls(id: string): ArtPackAtlasUrls {
  if (id === DEFAULT_ARTPACK || !readyPackIds.has(id)) {
    return {
      packId: DEFAULT_ARTPACK,
      json: DEFAULT_ATLAS_JSON_URL,
      image: DEFAULT_ATLAS_IMAGE_URL,
    };
  }

  return {
    packId: id,
    json: `/assets/artpacks/${id}/atlas/dungeon.json`,
    image: `/assets/artpacks/${id}/atlas/dungeon.png`,
  };
}

export function resolveCurrentArtPackAtlasUrls(): ArtPackAtlasUrls {
  return resolveArtPackAtlasUrls(loadArtPack());
}
