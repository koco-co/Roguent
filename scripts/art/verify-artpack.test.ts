import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_ARTPACK_FILES,
  parseAtlasFrameSizes,
  verifyArtPackFiles,
  verifyArtPackOnDisk,
  verifyAtlasFrameSizes,
} from "./verify-artpack";

describe("verify-artpack", () => {
  it("verifyArtPackFiles passes when every required path exists", () => {
    const files = new Set(
      REQUIRED_ARTPACK_FILES.map(
        (path) => `public/assets/artpacks/neon/${path}`,
      ),
    );

    const result = verifyArtPackFiles({
      packRoot: "public/assets/artpacks/neon",
      files,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("verifyArtPackFiles reports missing required paths", () => {
    const files = new Set(
      REQUIRED_ARTPACK_FILES.filter((path) => path !== "manifest.json").map(
        (path) => `public/assets/artpacks/neon/${path}`,
      ),
    );

    const result = verifyArtPackFiles({
      packRoot: "public/assets/artpacks/neon",
      files,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        kind: "missing-file",
        path: "public/assets/artpacks/neon/manifest.json",
        message: "Missing required art-pack file",
      },
    ]);
  });

  it("parseAtlasFrameSizes extracts frame dimensions by png-stripped name", () => {
    const sizes = parseAtlasFrameSizes({
      frames: {
        "floor_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        "knight_m_idle_anim_f0.png": {
          frame: { x: 16, y: 0, w: 16, h: 28 },
        },
      },
    });

    expect(sizes.get("floor_1")).toEqual({ w: 16, h: 16 });
    expect(sizes.get("knight_m_idle_anim_f0")).toEqual({ w: 16, h: 28 });
  });

  it("verifyAtlasFrameSizes reports missing and mismatched atlas frames", () => {
    const reference = new Map([
      ["floor_1", { w: 16, h: 16 }],
      ["knight_m_idle_anim_f0", { w: 16, h: 28 }],
    ]);
    const candidate = new Map([["floor_1", { w: 32, h: 16 }]]);

    const result = verifyAtlasFrameSizes({ reference, candidate });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        kind: "frame-size-mismatch",
        frame: "floor_1",
        expected: { w: 16, h: 16 },
        actual: { w: 32, h: 16 },
        message: "Atlas frame size differs from reference atlas",
      },
      {
        kind: "missing-frame",
        frame: "knight_m_idle_anim_f0",
        expected: { w: 16, h: 28 },
        message: "Missing atlas frame",
      },
    ]);
  });

  it("verifyArtPackOnDisk reads required files and compares atlas dimensions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "roguent-artpack-"));
    const packRoot = join(dir, "neon");
    await mkdir(join(packRoot, "atlas"), { recursive: true });
    await mkdir(join(packRoot, "previews"), { recursive: true });
    await writeFile(join(packRoot, "manifest.json"), "{}");
    await writeFile(join(packRoot, "atlas", "dungeon.png"), "");
    await writeFile(join(packRoot, "previews", "lobby.png"), "");
    await writeFile(join(packRoot, "previews", "interior.png"), "");
    await writeFile(
      join(packRoot, "atlas", "dungeon.json"),
      JSON.stringify({
        frames: {
          "floor_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        },
      }),
    );
    const referenceAtlasPath = join(dir, "reference.json");
    await writeFile(
      referenceAtlasPath,
      JSON.stringify({
        frames: {
          "floor_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        },
      }),
    );

    const result = await verifyArtPackOnDisk({
      packRoot,
      referenceAtlasPath,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
