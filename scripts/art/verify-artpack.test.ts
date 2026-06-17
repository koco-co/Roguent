import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  REQUIRED_ARTPACK_FILES,
  parseAtlasFrameSizes,
  verifyArtPackFiles,
  verifyArtPackOnDisk,
  verifyAtlasFrameSizes,
} from "./verify-artpack";

interface PngRgbaStats {
  semiAlphaPixels: number;
  nonTransparentColorCount: number;
}

interface PngRgbaImage {
  width: number;
  height: number;
  pixels: Buffer;
}

interface AtlasFrameForTest {
  frame?: {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
  };
}

interface AtlasForTest {
  frames?: Record<string, AtlasFrameForTest>;
}

interface OverrideForTest {
  category?: unknown;
  cleanup?: unknown;
  frame?: unknown;
}

interface OverrideReportForTest {
  coveredFrames?: unknown;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parsePngRgba(buffer: Buffer): PngRgbaImage {
  const signature = buffer.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  expect(bitDepth).toBe(8);
  expect(colorType).toBe(6);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  let cursor = 0;
  let previous = Buffer.alloc(stride);
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor] ?? 0;
    cursor += 1;
    const scanline = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    if (filter < 0 || filter > 4) {
      throw new Error(`Unsupported PNG filter type ${filter}`);
    }

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? (scanline[x - bytesPerPixel] ?? 0) : 0;
      const up = previous[x] ?? 0;
      const upLeft =
        x >= bytesPerPixel ? (previous[x - bytesPerPixel] ?? 0) : 0;
      const value = scanline[x] ?? 0;
      if (filter === 1) scanline[x] = (value + left) & 0xff;
      else if (filter === 2) scanline[x] = (value + up) & 0xff;
      else if (filter === 3) scanline[x] = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        scanline[x] = (value + paethPredictor(left, up, upLeft)) & 0xff;
      }
    }

    scanline.copy(pixels, y * stride);
    previous = scanline;
  }

  return { width, height, pixels };
}

function parsePngRgbaStats(buffer: Buffer): PngRgbaStats {
  const image = parsePngRgba(buffer);
  let semiAlphaPixels = 0;
  const colors = new Set<number>();

  for (let i = 0; i < image.pixels.length; i += 4) {
    const r = image.pixels[i] ?? 0;
    const g = image.pixels[i + 1] ?? 0;
    const b = image.pixels[i + 2] ?? 0;
    const a = image.pixels[i + 3] ?? 0;
    if (a > 0 && a < 255) semiAlphaPixels += 1;
    if (a > 0) colors.add(((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
  }

  return {
    semiAlphaPixels,
    nonTransparentColorCount: colors.size,
  };
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function frameKey(frame: string): string {
  return frame.endsWith(".png") ? frame : `${frame}.png`;
}

function pixelOffset(image: PngRgbaImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

function environmentTileNoiseScore(
  image: PngRgbaImage,
  atlas: AtlasForTest,
  report: OverrideReportForTest,
): number {
  const coveredFrames = Array.isArray(report.coveredFrames)
    ? (report.coveredFrames as OverrideForTest[])
    : [];
  let frameCount = 0;
  let totalScore = 0;

  for (const item of coveredFrames) {
    if (item.category !== "environment" || typeof item.frame !== "string") {
      continue;
    }
    const rawFrame = atlas.frames?.[frameKey(item.frame)]?.frame;
    const x = numberField(rawFrame?.x);
    const y = numberField(rawFrame?.y);
    const w = numberField(rawFrame?.w);
    const h = numberField(rawFrame?.h);
    if (
      x === undefined ||
      y === undefined ||
      w === undefined ||
      h === undefined
    ) {
      continue;
    }

    let pairCount = 0;
    let frameScore = 0;
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        const offset = pixelOffset(image, px, py);
        const alpha = image.pixels[offset + 3] ?? 0;
        if (alpha === 0) continue;

        for (const [nx, ny] of [
          [px + 1, py],
          [px, py + 1],
        ] as const) {
          if (nx >= x + w || ny >= y + h) continue;
          const neighbor = pixelOffset(image, nx, ny);
          if ((image.pixels[neighbor + 3] ?? 0) === 0) continue;
          frameScore +=
            Math.abs(
              (image.pixels[offset] ?? 0) - (image.pixels[neighbor] ?? 0),
            ) +
            Math.abs(
              (image.pixels[offset + 1] ?? 0) -
                (image.pixels[neighbor + 1] ?? 0),
            ) +
            Math.abs(
              (image.pixels[offset + 2] ?? 0) -
                (image.pixels[neighbor + 2] ?? 0),
            );
          pairCount += 1;
        }
      }
    }

    if (pairCount > 0) {
      totalScore += frameScore / pairCount;
      frameCount += 1;
    }
  }

  expect(frameCount).toBeGreaterThan(0);
  return totalScore / frameCount;
}

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

  it("verifyAtlasFrameSizes matches HD candidates against a scaled reference", () => {
    const reference = new Map([
      ["floor_1", { w: 16, h: 16 }],
      ["knight_m_idle_anim_f0", { w: 16, h: 28 }],
    ]);
    const candidate = new Map([
      ["floor_1", { w: 40, h: 40 }],
      ["knight_m_idle_anim_f0", { w: 40, h: 70 }],
    ]);
    const result = verifyAtlasFrameSizes({ reference, candidate, scale: 2.5 });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("verifyAtlasFrameSizes flags HD frames off the scaled contract", () => {
    const reference = new Map([["floor_1", { w: 16, h: 16 }]]);
    const candidate = new Map([["floor_1", { w: 40, h: 41 }]]); // h wrong
    const result = verifyAtlasFrameSizes({ reference, candidate, scale: 2.5 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe("frame-size-mismatch");
  });

  it("verifyAtlasFrameSizes rounds exact .5 half-to-even to match the Python bake", () => {
    // weapon_axe 9x21 at 2.5: 22.5/52.5. Python round() is half-to-even -> 22/52
    // (JS Math.round would give 23/53). The candidate is what the bake emits.
    const reference = new Map([["weapon_axe", { w: 9, h: 21 }]]);
    const candidate = new Map([["weapon_axe", { w: 22, h: 52 }]]);
    const result = verifyAtlasFrameSizes({ reference, candidate, scale: 2.5 });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
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
    for (const pack of ["neon-terminal", "synthwave"]) {
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

  it("generated character frames crop to the main source-sheet body for readability", async () => {
    for (const pack of ["neon-terminal", "synthwave"]) {
      const report = JSON.parse(
        await readFile(
          `public/assets/artpacks/${pack}/atlas/gpt-image-overrides.json`,
          "utf8",
        ),
      ) as OverrideReportForTest;
      const coveredFrames = Array.isArray(report.coveredFrames)
        ? (report.coveredFrames as OverrideForTest[])
        : [];
      const characterFrames = coveredFrames.filter(
        (item) => item.category === "characters",
      );

      expect(characterFrames.length).toBe(106);
      expect(
        characterFrames.every((item) => item.cleanup === "largest-alpha"),
      ).toBe(true);
    }
  });

  it("generated runtime atlases keep hard-edged pixel-art pixels", async () => {
    for (const pack of ["neon-terminal", "synthwave"]) {
      const stats = parsePngRgbaStats(
        Buffer.from(
          await readFile(`public/assets/artpacks/${pack}/atlas/dungeon.png`),
        ),
      );

      expect(stats.semiAlphaPixels).toBe(0);
      expect(stats.nonTransparentColorCount).toBeLessThanOrEqual(2048);
    }
  });

  it("generated environment tiles avoid high-frequency visual noise", async () => {
    for (const pack of ["neon-terminal", "synthwave"]) {
      const image = parsePngRgba(
        Buffer.from(
          await readFile(`public/assets/artpacks/${pack}/atlas/dungeon.png`),
        ),
      );
      const atlas = JSON.parse(
        await readFile(
          `public/assets/artpacks/${pack}/atlas/dungeon.json`,
          "utf8",
        ),
      ) as AtlasForTest;
      const report = JSON.parse(
        await readFile(
          `public/assets/artpacks/${pack}/atlas/gpt-image-overrides.json`,
          "utf8",
        ),
      ) as OverrideReportForTest;

      // HD bake re-baseline: de-blurring (drop block_pixel_art + heavy mix)
      // intentionally restores edge energy, so the noise score rises. Observed
      // after HD re-bake: synthwave 59.35 (max), neon-terminal 39.54. Threshold
      // bumped from 45 to ceil(59.35 * 1.1) = 66 to gate genuine noise, not the
      // intended deblur. This is a ceiling on per-frame mean neighbor delta.
      expect(
        environmentTileNoiseScore(image, atlas, report),
      ).toBeLessThanOrEqual(66);
    }
  });
});
