// 把 SDK 平台包里的 claude 原生 CLI 拷进 src-tauri/resources/,供 Tauri 作资源打包,
// 运行时 host 经 resource_dir() 找到它、用 ROGUENT_CLI_PATH 传给 sidecar。
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";

// 仅 Apple Silicon(第一阶段范围)。
const src = "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude";
const outDir = "src-tauri/resources";
const dest = `${outDir}/claude`;

const info = await stat(src).catch(() => null);
if (!info) {
  throw new Error(
    `找不到 CLI:${src}。请确认未用 --omit=optional 安装 claude-agent-sdk。`,
  );
}
await mkdir(outDir, { recursive: true });
await copyFile(src, dest);
await chmod(dest, 0o755);
console.log(`[stage-cli] copied ${(info.size / 1e6).toFixed(0)}MB → ${dest}`);
