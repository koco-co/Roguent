import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const REQUIRED_ARTPACK_FILES = [
  "manifest.json",
  "atlas/dungeon.png",
  "atlas/dungeon.json",
  "atlas/gpt-image-overrides.json",
  "previews/lobby.png",
  "previews/interior.png",
  "characters/npcs.png",
  "enemies/enemies-16x16.png",
  "enemies/enemies-16x23.png",
  "enemies/bosses-32x36.png",
  "items/props.png",
  "tiles/environment.png",
  "structures/source-sheet.png",
  "hud/icons.png",
  "easter/sprites.png",
  "ui/buttons.png",
] as const;

export interface Size {
  w: number;
  h: number;
}

export type ArtPackIssue =
  | {
      kind: "missing-file";
      path: string;
      message: "Missing required art-pack file";
    }
  | {
      kind: "missing-frame";
      frame: string;
      expected: Size;
      message: "Missing atlas frame";
    }
  | {
      kind: "frame-size-mismatch";
      frame: string;
      expected: Size;
      actual: Size;
      message: "Atlas frame size differs from reference atlas";
    }
  | {
      kind: "missing-gpt-image-override-frame";
      frame: string;
      message: "GPT-image override references a missing atlas frame";
    }
  | {
      kind: "missing-gpt-image-override-source";
      path: string;
      message: "GPT-image override references a missing source sheet";
    };

export interface VerifyResult {
  ok: boolean;
  issues: ArtPackIssue[];
}

interface VerifyArtPackFilesInput {
  packRoot: string;
  files: ReadonlySet<string>;
}

export function verifyArtPackFiles({
  packRoot,
  files,
}: VerifyArtPackFilesInput): VerifyResult {
  const root = packRoot.replace(/\/+$/, "");
  const issues: ArtPackIssue[] = [];

  for (const required of REQUIRED_ARTPACK_FILES) {
    const path = `${root}/${required}`;
    if (!files.has(path)) {
      issues.push({
        kind: "missing-file",
        path,
        message: "Missing required art-pack file",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

interface TexturePackerFrame {
  frame?: {
    [key: string]: unknown;
    w?: unknown;
    h?: unknown;
  };
}

interface TexturePackerAtlas {
  frames?: Record<string, TexturePackerFrame>;
}

interface GptImageOverrideEntry {
  frame?: unknown;
  sourceSheet?: unknown;
}

interface GptImageOverrideReport {
  coveredFrames?: unknown;
}

export function parseAtlasFrameSizes(
  atlas: TexturePackerAtlas,
): Map<string, Size> {
  const sizes = new Map<string, Size>();

  for (const [rawName, entry] of Object.entries(atlas.frames ?? {})) {
    const width = entry.frame?.w;
    const height = entry.frame?.h;
    if (typeof width !== "number" || typeof height !== "number") continue;
    const name = rawName.endsWith(".png") ? rawName.slice(0, -4) : rawName;
    sizes.set(name, { w: width, h: height });
  }

  return sizes;
}

interface VerifyAtlasFrameSizesInput {
  reference: ReadonlyMap<string, Size>;
  candidate: ReadonlyMap<string, Size>;
  // HD bake: candidate frames are baked at `scale`× the 16px reference
  // contract. Default 1 keeps the original strict 1:1 matching (e.g. 0x72).
  scale?: number;
}

export function verifyAtlasFrameSizes({
  reference,
  candidate,
  scale = 1,
}: VerifyAtlasFrameSizesInput): VerifyResult {
  const issues: ArtPackIssue[] = [];

  for (const [frame, ref] of reference.entries()) {
    const expected: Size = {
      w: Math.round(ref.w * scale),
      h: Math.round(ref.h * scale),
    };
    const actual = candidate.get(frame);
    if (!actual) {
      issues.push({
        kind: "missing-frame",
        frame,
        expected,
        message: "Missing atlas frame",
      });
      continue;
    }
    if (actual.w !== expected.w || actual.h !== expected.h) {
      issues.push({
        kind: "frame-size-mismatch",
        frame,
        expected,
        actual,
        message: "Atlas frame size differs from reference atlas",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

interface VerifyGptImageOverridesInput {
  packRoot: string;
  files: ReadonlySet<string>;
  candidate: ReadonlyMap<string, Size>;
  report: GptImageOverrideReport;
}

export function verifyGptImageOverrides({
  packRoot,
  files,
  candidate,
  report,
}: VerifyGptImageOverridesInput): VerifyResult {
  const issues: ArtPackIssue[] = [];
  const root = packRoot.replace(/\/+$/, "");
  const coveredFrames = Array.isArray(report.coveredFrames)
    ? (report.coveredFrames as GptImageOverrideEntry[])
    : [];

  for (const entry of coveredFrames) {
    if (typeof entry.frame === "string" && !candidate.has(entry.frame)) {
      issues.push({
        kind: "missing-gpt-image-override-frame",
        frame: entry.frame,
        message: "GPT-image override references a missing atlas frame",
      });
    }
    if (typeof entry.sourceSheet === "string") {
      const sourcePath = join(root, entry.sourceSheet);
      if (!files.has(sourcePath)) {
        issues.push({
          kind: "missing-gpt-image-override-source",
          path: sourcePath,
          message: "GPT-image override references a missing source sheet",
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

interface VerifyArtPackOnDiskInput {
  packRoot: string;
  referenceAtlasPath?: string;
  // HD bake: atlas frames are `scale`× the 0x72 16px reference. Default 1
  // keeps strict 1:1 (e.g. native-16px fallback packs).
  scale?: number;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

async function readAtlas(path: string): Promise<TexturePackerAtlas> {
  return JSON.parse(await readFile(path, "utf8")) as TexturePackerAtlas;
}

async function readGptImageOverrideReport(
  path: string,
): Promise<GptImageOverrideReport> {
  return JSON.parse(await readFile(path, "utf8")) as GptImageOverrideReport;
}

export async function verifyArtPackOnDisk({
  packRoot,
  referenceAtlasPath = "public/assets/0x72/dungeon.json",
  scale = 1,
}: VerifyArtPackOnDiskInput): Promise<VerifyResult> {
  const files = new Set(await listFilesRecursive(packRoot));
  const fileResult = verifyArtPackFiles({ packRoot, files });
  const candidateAtlasPath = join(packRoot, "atlas", "dungeon.json");
  if (!files.has(candidateAtlasPath)) return fileResult;

  const reference = parseAtlasFrameSizes(await readAtlas(referenceAtlasPath));
  const candidate = parseAtlasFrameSizes(await readAtlas(candidateAtlasPath));
  const atlasResult = verifyAtlasFrameSizes({ reference, candidate, scale });
  const reportPath = join(packRoot, "atlas", "gpt-image-overrides.json");
  const reportResult = files.has(reportPath)
    ? verifyGptImageOverrides({
        packRoot,
        files,
        candidate,
        report: await readGptImageOverrideReport(reportPath),
      })
    : { ok: true, issues: [] };
  const issues = [
    ...fileResult.issues,
    ...atlasResult.issues,
    ...reportResult.issues,
  ];

  return { ok: issues.length === 0, issues };
}
