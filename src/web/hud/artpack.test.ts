import { afterEach, expect, test } from "bun:test";
import {
  ARTPACK_CHANGE_EVENT,
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

const GENERATED_ARTPACK_IDS = [
  "neon-terminal",
  "holo-blueprint",
  "deep-space",
  "synthwave",
];

test("五个美术包均 ready;默认使用生成的霓虹终端资源", () => {
  const ready = ART_PACKS.filter((p) => p.ready);
  expect(ready.map((p) => p.id)).toEqual([
    "pixel-fantasy",
    "neon-terminal",
    "holo-blueprint",
    "deep-space",
    "synthwave",
  ]);
  expect(DEFAULT_ARTPACK).toBe("neon-terminal");
});

test("生成美术包暴露真实 lobby/interior 预览图", () => {
  for (const p of ART_PACKS.filter((pack) =>
    GENERATED_ARTPACK_IDS.includes(pack.id),
  )) {
    expect(p.previews).toEqual({
      lobby: `/assets/artpacks/${p.id}/previews/lobby.png`,
      interior: `/assets/artpacks/${p.id}/previews/interior.png`,
    });
  }
});

test("生成美术包暴露真实 UI/button kit 源图", () => {
  for (const p of ART_PACKS.filter((pack) =>
    GENERATED_ARTPACK_IDS.includes(pack.id),
  )) {
    expect(p.ui).toEqual({
      buttons: `/assets/artpacks/${p.id}/ui/buttons.png`,
    });
  }
});

test("生成美术包暴露 NPC、地块、道具、结构件、HUD、彩蛋与 UI sheet 资源", () => {
  for (const p of ART_PACKS.filter((pack) =>
    GENERATED_ARTPACK_IDS.includes(pack.id),
  )) {
    expect(p.sourceSheets).toEqual({
      characters: `/assets/artpacks/${p.id}/characters/npcs.png`,
      environment: `/assets/artpacks/${p.id}/tiles/environment.png`,
      props: `/assets/artpacks/${p.id}/items/props.png`,
      structures: `/assets/artpacks/${p.id}/structures/source-sheet.png`,
      hud: `/assets/artpacks/${p.id}/hud/icons.png`,
      easter: `/assets/artpacks/${p.id}/easter/sprites.png`,
      ui: `/assets/artpacks/${p.id}/ui/buttons.png`,
    });
  }
});

test("loadArtPack:空→默认;读已存值", () => {
  expect(loadArtPack()).toBe("neon-terminal");
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

test("applyArtPack:派发素材包切换事件", () => {
  let detail: unknown;
  window.addEventListener(
    ARTPACK_CHANGE_EVENT,
    (event) => {
      detail = (event as CustomEvent).detail;
    },
    { once: true },
  );

  applyArtPack("deep-space");

  expect(detail).toEqual({ id: "deep-space" });
});
