import { afterEach, expect, test } from "bun:test";
import {
  DEFAULT_ATLAS_IMAGE_URL,
  DEFAULT_ATLAS_JSON_URL,
  resolveArtPackAtlasUrls,
  resolveCurrentArtPackAtlasUrls,
} from "./artpack-assets";
import { ARTPACK_KEY } from "./hud/artpack";

afterEach(() => {
  localStorage.clear();
});

test("resolveArtPackAtlasUrls returns generated atlas for the default pack", () => {
  expect(resolveArtPackAtlasUrls("neon-terminal")).toEqual({
    json: "/assets/artpacks/neon-terminal/atlas/dungeon.json",
    image: "/assets/artpacks/neon-terminal/atlas/dungeon.png",
    packId: "neon-terminal",
  });
  expect(resolveArtPackAtlasUrls("missing-pack")).toEqual({
    json: "/assets/artpacks/neon-terminal/atlas/dungeon.json",
    image: "/assets/artpacks/neon-terminal/atlas/dungeon.png",
    packId: "neon-terminal",
  });
});

test("resolveArtPackAtlasUrls keeps the original 0x72 atlas as a manual legacy option", () => {
  expect(resolveArtPackAtlasUrls("pixel-fantasy")).toEqual({
    json: DEFAULT_ATLAS_JSON_URL,
    image: DEFAULT_ATLAS_IMAGE_URL,
    packId: "pixel-fantasy",
  });
});

test("resolveArtPackAtlasUrls returns runtime artpack atlas for generated packs", () => {
  expect(resolveArtPackAtlasUrls("synthwave")).toEqual({
    json: "/assets/artpacks/synthwave/atlas/dungeon.json",
    image: "/assets/artpacks/synthwave/atlas/dungeon.png",
    packId: "synthwave",
  });
});

test("resolveCurrentArtPackAtlasUrls reads persisted artpack selection", () => {
  expect(resolveCurrentArtPackAtlasUrls()).toEqual({
    json: "/assets/artpacks/neon-terminal/atlas/dungeon.json",
    image: "/assets/artpacks/neon-terminal/atlas/dungeon.png",
    packId: "neon-terminal",
  });

  localStorage.setItem(ARTPACK_KEY, "synthwave");
  expect(resolveCurrentArtPackAtlasUrls()).toEqual({
    json: "/assets/artpacks/synthwave/atlas/dungeon.json",
    image: "/assets/artpacks/synthwave/atlas/dungeon.png",
    packId: "synthwave",
  });
});
