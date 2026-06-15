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

test("resolveArtPackAtlasUrls returns built-in 0x72 atlas for default and unknown packs", () => {
  expect(resolveArtPackAtlasUrls("pixel-fantasy")).toEqual({
    json: DEFAULT_ATLAS_JSON_URL,
    image: DEFAULT_ATLAS_IMAGE_URL,
    packId: "pixel-fantasy",
  });
  expect(resolveArtPackAtlasUrls("missing-pack")).toEqual({
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
  localStorage.setItem(ARTPACK_KEY, "deep-space");
  expect(resolveCurrentArtPackAtlasUrls()).toEqual({
    json: "/assets/artpacks/deep-space/atlas/dungeon.json",
    image: "/assets/artpacks/deep-space/atlas/dungeon.png",
    packId: "deep-space",
  });
});
