import { expect, test } from "bun:test";

test("DOM preload exposes a deterministic Image loader for canvas assets", async () => {
  const image = new Image();
  let loaded = false;
  image.onload = () => {
    loaded = true;
  };

  image.src = "/assets/0x72/dungeon.png";
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loaded).toBe(true);
});

test("DOM preload resolves public asset fetches without a dev server", async () => {
  const response = await fetch("/assets/0x72/dungeon.json");
  const atlas = (await response.json()) as { frames?: unknown };

  expect(response.ok).toBe(true);
  expect(atlas.frames).toBeTruthy();
});
