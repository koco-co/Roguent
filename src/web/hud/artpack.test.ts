import { afterEach, expect, test } from "bun:test";
import {
  ARTPACK_KEY,
  ART_PACKS,
  DEFAULT_ARTPACK,
  applyArtPack,
  loadArtPack,
} from "./artpack";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-artpack");
});

test("ART_PACKS:5 包、id 唯一、字段齐全", () => {
  expect(ART_PACKS).toHaveLength(5);
  const ids = ART_PACKS.map((p) => p.id);
  expect(new Set(ids).size).toBe(5);
  for (const p of ART_PACKS) {
    expect(p.id.length).toBeGreaterThan(0);
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.en.length).toBeGreaterThan(0);
    expect(p.ac).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.desc.length).toBeGreaterThan(0);
  }
});

test("唯一 ready 包 = 默认 = pixel-fantasy(其余为占位)", () => {
  const ready = ART_PACKS.filter((p) => p.ready);
  expect(ready).toHaveLength(1);
  expect(ready[0]?.id).toBe(DEFAULT_ARTPACK);
  expect(DEFAULT_ARTPACK).toBe("pixel-fantasy");
});

test("loadArtPack:空→默认;读已存值", () => {
  expect(loadArtPack()).toBe("pixel-fantasy");
  localStorage.setItem(ARTPACK_KEY, "synthwave");
  expect(loadArtPack()).toBe("synthwave");
});

test("applyArtPack:写 localStorage + 盖 data-artpack", () => {
  applyArtPack("neon-terminal");
  expect(localStorage.getItem(ARTPACK_KEY)).toBe("neon-terminal");
  expect(document.documentElement.getAttribute("data-artpack")).toBe(
    "neon-terminal",
  );
});
