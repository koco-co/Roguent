// scripts/art/verify-artpack-cli.ts
// 一键自检 public/assets/artpacks/ 下所有生成美术包:逐包跑 verifyArtPackOnDisk
// (必需文件齐全 / atlas 帧与 0x72 参照逐帧尺寸匹配 / gpt-image-overrides 引用可解析),
// 任一包有问题即非零退出。重新生成 / 重切 atlas 后跑 `bun run verify:artpack`。
//
// 默认扫描 public/assets/artpacks/*;可传包目录显式指定,如:
//   bun run verify:artpack public/assets/artpacks/synthwave

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { type ArtPackIssue, verifyArtPackOnDisk } from "./verify-artpack";

const ARTPACKS_ROOT = "public/assets/artpacks";

// HD bake: re-baked survivor packs carry atlas frames at HD_SCALE(=2.5)× the
// 0x72 16px reference; legacy 16px packs (to be deleted) verify at scale 1.
const HD_SCALE = 2.5;
const HD_PACKS = new Set(["neon-terminal", "synthwave"]);

function scaleForPackRoot(packRoot: string): number {
  const name = packRoot.replace(/\/+$/, "").split("/").pop() ?? "";
  return HD_PACKS.has(name) ? HD_SCALE : 1;
}

/** 列出待校验的包目录:无参时扫描 ARTPACKS_ROOT 下的子目录,有参时按传入路径。 */
async function resolvePackRoots(argv: string[]): Promise<string[]> {
  if (argv.length > 0) return argv;
  const entries = await readdir(ARTPACKS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(ARTPACKS_ROOT, e.name))
    .sort();
}

/** 把同类 issue 聚合成 "kind: n" 行,附前几条样例,便于一眼定位。 */
function summarizeIssues(issues: readonly ArtPackIssue[]): string[] {
  const byKind = new Map<string, number>();
  for (const issue of issues) {
    byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
  }
  const lines: string[] = [];
  for (const [kind, count] of byKind) lines.push(`    ${kind}: ${count}`);
  for (const issue of issues.slice(0, 5)) {
    lines.push(`      e.g. ${JSON.stringify(issue)}`);
  }
  if (issues.length > 5) lines.push(`      … +${issues.length - 5} more`);
  return lines;
}

async function main(): Promise<void> {
  const packRoots = await resolvePackRoots(process.argv.slice(2));
  if (packRoots.length === 0) {
    console.error(`No art-pack directories found under ${ARTPACKS_ROOT}`);
    process.exit(1);
  }

  let failed = 0;
  for (const packRoot of packRoots) {
    const result = await verifyArtPackOnDisk({
      packRoot,
      scale: scaleForPackRoot(packRoot),
    });
    if (result.ok) {
      console.log(`✓ ${packRoot}`);
    } else {
      failed += 1;
      console.log(`✗ ${packRoot} — ${result.issues.length} issue(s)`);
      for (const line of summarizeIssues(result.issues)) console.log(line);
    }
  }

  const total = packRoots.length;
  if (failed > 0) {
    console.error(`\n${failed}/${total} art pack(s) failed verification`);
    process.exit(1);
  }
  console.log(`\nAll ${total} art pack(s) verified`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
