// 把 engine 编译成 Tauri externalBin 要求的单文件,文件名带 rustc host-tuple 后缀。
// 不内嵌 218MB CLI(那个走 stage-cli.ts + ROGUENT_CLI_PATH)。
import { mkdir } from "node:fs/promises";
import { $ } from "bun";

const triple = (await $`rustc --print host-tuple`.text()).trim();
if (!triple) throw new Error("无法获取 rustc host-tuple");

const outDir = "src-tauri/binaries";
await mkdir(outDir, { recursive: true });
const outfile = `${outDir}/roguent-engine-${triple}`;

console.log(`[build-sidecar] compiling engine → ${outfile}`);
await $`bun build --compile ./src/engine/server.ts --outfile ${outfile}`;
console.log("[build-sidecar] done");
