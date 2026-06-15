import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const REQUIRED_ARTPACK_FILES = [
  "manifest.json",
  "atlas/dungeon.png",
  "atlas/dungeon.json",
  "previews/lobby.png",
  "previews/interior.png",
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
}

export function verifyAtlasFrameSizes({
  reference,
  candidate,
}: VerifyAtlasFrameSizesInput): VerifyResult {
  const issues: ArtPackIssue[] = [];

  for (const [frame, expected] of reference.entries()) {
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

interface VerifyArtPackOnDiskInput {
  packRoot: string;
  referenceAtlasPath?: string;
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

export async function verifyArtPackOnDisk({
  packRoot,
  referenceAtlasPath = "public/assets/0x72/dungeon.json",
}: VerifyArtPackOnDiskInput): Promise<VerifyResult> {
  const files = new Set(await listFilesRecursive(packRoot));
  const fileResult = verifyArtPackFiles({ packRoot, files });
  const candidateAtlasPath = join(packRoot, "atlas", "dungeon.json");
  if (!files.has(candidateAtlasPath)) return fileResult;

  const reference = parseAtlasFrameSizes(await readAtlas(referenceAtlasPath));
  const candidate = parseAtlasFrameSizes(await readAtlas(candidateAtlasPath));
  const atlasResult = verifyAtlasFrameSizes({ reference, candidate });
  const issues = [...fileResult.issues, ...atlasResult.issues];

  return { ok: issues.length === 0, issues };
}
