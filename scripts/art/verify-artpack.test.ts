import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("requires runtime art sheets for structures, HUD icons, and easter eggs", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("structures/source-sheet.png");
    expect(REQUIRED_ARTPACK_FILES).toContain("hud/icons.png");
    expect(REQUIRED_ARTPACK_FILES).toContain("easter/sprites.png");
  });

  it("requires generated NPC character sheet art", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("characters/npcs.png");
  });

  it("requires generated item props and environment tile sheets", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("items/props.png");
    expect(REQUIRED_ARTPACK_FILES).toContain("tiles/environment.png");
  });

  it("requires generated enemy and boss source sheets", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("enemies/enemies-16x16.png");
    expect(REQUIRED_ARTPACK_FILES).toContain("enemies/enemies-16x23.png");
    expect(REQUIRED_ARTPACK_FILES).toContain("enemies/bosses-32x36.png");
  });

  it("requires a GPT-image runtime override report", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("atlas/gpt-image-overrides.json");
  });

  it("requires generated UI button kit art", () => {
    expect(REQUIRED_ARTPACK_FILES).toContain("ui/buttons.png");
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
    await mkdir(join(packRoot, "characters"), { recursive: true });
    await mkdir(join(packRoot, "enemies"), { recursive: true });
    await mkdir(join(packRoot, "items"), { recursive: true });
    await mkdir(join(packRoot, "tiles"), { recursive: true });
    await mkdir(join(packRoot, "structures"), { recursive: true });
    await mkdir(join(packRoot, "hud"), { recursive: true });
    await mkdir(join(packRoot, "easter"), { recursive: true });
    await mkdir(join(packRoot, "ui"), { recursive: true });
    await writeFile(join(packRoot, "manifest.json"), "{}");
    await writeFile(join(packRoot, "atlas", "dungeon.png"), "");
    await writeFile(
      join(packRoot, "atlas", "gpt-image-overrides.json"),
      JSON.stringify({
        schemaVersion: 1,
        coveredFrames: [],
      }),
    );
    await writeFile(join(packRoot, "previews", "lobby.png"), "");
    await writeFile(join(packRoot, "previews", "interior.png"), "");
    await writeFile(join(packRoot, "characters", "npcs.png"), "");
    await writeFile(join(packRoot, "enemies", "enemies-16x16.png"), "");
    await writeFile(join(packRoot, "enemies", "enemies-16x23.png"), "");
    await writeFile(join(packRoot, "enemies", "bosses-32x36.png"), "");
    await writeFile(join(packRoot, "items", "props.png"), "");
    await writeFile(join(packRoot, "tiles", "environment.png"), "");
    await writeFile(join(packRoot, "structures", "source-sheet.png"), "");
    await writeFile(join(packRoot, "hud", "icons.png"), "");
    await writeFile(join(packRoot, "easter", "sprites.png"), "");
    await writeFile(join(packRoot, "ui", "buttons.png"), "");
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

  it("verifyArtPackOnDisk validates GPT-image override frames and source sheets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "roguent-artpack-"));
    const packRoot = join(dir, "neon");
    await mkdir(join(packRoot, "atlas"), { recursive: true });
    await mkdir(join(packRoot, "previews"), { recursive: true });
    await mkdir(join(packRoot, "characters"), { recursive: true });
    await mkdir(join(packRoot, "enemies"), { recursive: true });
    await mkdir(join(packRoot, "items"), { recursive: true });
    await mkdir(join(packRoot, "tiles"), { recursive: true });
    await mkdir(join(packRoot, "structures"), { recursive: true });
    await mkdir(join(packRoot, "hud"), { recursive: true });
    await mkdir(join(packRoot, "easter"), { recursive: true });
    await mkdir(join(packRoot, "ui"), { recursive: true });
    await writeFile(join(packRoot, "manifest.json"), "{}");
    await writeFile(join(packRoot, "atlas", "dungeon.png"), "");
    await writeFile(join(packRoot, "previews", "lobby.png"), "");
    await writeFile(join(packRoot, "previews", "interior.png"), "");
    await writeFile(join(packRoot, "characters", "npcs.png"), "");
    await writeFile(join(packRoot, "enemies", "enemies-16x16.png"), "");
    await writeFile(join(packRoot, "enemies", "enemies-16x23.png"), "");
    await writeFile(join(packRoot, "enemies", "bosses-32x36.png"), "");
    await writeFile(join(packRoot, "items", "props.png"), "");
    await writeFile(join(packRoot, "tiles", "environment.png"), "");
    await writeFile(join(packRoot, "structures", "source-sheet.png"), "");
    await writeFile(join(packRoot, "hud", "icons.png"), "");
    await writeFile(join(packRoot, "easter", "sprites.png"), "");
    await writeFile(join(packRoot, "ui", "buttons.png"), "");
    await writeFile(
      join(packRoot, "atlas", "dungeon.json"),
      JSON.stringify({
        frames: {
          "floor_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        },
      }),
    );
    await writeFile(
      join(packRoot, "atlas", "gpt-image-overrides.json"),
      JSON.stringify({
        schemaVersion: 1,
        coveredFrames: [
          {
            frame: "missing_frame",
            sourceSheet: "items/props.png",
            sourceCell: 0,
            method: "source-sheet-cell-fit",
          },
          {
            frame: "floor_1",
            sourceSheet: "items/missing.png",
            sourceCell: 1,
            method: "source-sheet-cell-fit",
          },
        ],
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

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        kind: "missing-gpt-image-override-frame",
        frame: "missing_frame",
        message: "GPT-image override references a missing atlas frame",
      },
      {
        kind: "missing-gpt-image-override-source",
        path: join(packRoot, "items", "missing.png"),
        message: "GPT-image override references a missing source sheet",
      },
    ]);
  });

  it("generated artpacks report GPT-image runtime frame coverage", async () => {
    for (const pack of [
      "neon-terminal",
      "holo-blueprint",
      "deep-space",
      "synthwave",
    ]) {
      const report = JSON.parse(
        await readFile(
          `public/assets/artpacks/${pack}/atlas/gpt-image-overrides.json`,
          "utf8",
        ),
      ) as {
        coveredFrameCount?: number;
        atlasFrameCount?: number;
        coveredFramesByCategory?: Record<string, number>;
        sourceSheets?: string[];
      };

      expect(report.atlasFrameCount).toBe(381);
      expect(report.coveredFrameCount).toBe(381);
      expect(report.coveredFramesByCategory).toEqual({
        characters: 106,
        enemies: 108,
        bosses: 24,
        props: 52,
        environment: 81,
        easter: 3,
        hud: 3,
        ui: 4,
      });
      expect(report.sourceSheets).toEqual(
        expect.arrayContaining([
          "easter/sprites.png",
          "hud/icons.png",
          "ui/buttons.png",
        ]),
      );
    }
  });
});
