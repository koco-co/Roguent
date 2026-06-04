# Tauri + sidecar 迁移实现计划(第一阶段:能跑的原生 macOS .app)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 "Bun WS engine + Vite React/Pixi 前端" 套进一个原生 macOS `.app`:Tauri 壳 + Bun sidecar + 保留 WS(端口由 Tauri 随机分配),engine 编译成独立二进制、218MB claude CLI 作 .app 资源经 `pathToClaudeCodeExecutable` 指过去。

**Architecture:** Tauri host(Rust,极薄)spawn 编译后的 engine sidecar,从其 stdout 读 `PORT=<n>`、存进 state、经 `engine_url` 命令告诉 webview;前端用该端口连 WS,协议/reducer/渲染全不动。CLI 二进制作 Tauri 资源,经 env `ROGUENT_CLI_PATH` 传给 sidecar。

**Tech Stack:** Tauri 2(Rust + `tauri-plugin-shell`)、Bun(`bun build --compile`)、现有 React19/PixiJS v8/Zustand 前端、`ws`、`bun:test`、`cargo test`。

**基线:** 本地 `main @ b2ce68c`(2026-06-04)。spec:[docs/superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md](../specs/2026-06-04-tauri-sidecar-migration-design.md)。

**前置约定:**
- 在隔离 worktree 内执行(由 `superpowers:using-git-worktrees` 在执行期创建)。
- dev 机已具备 Rust 工具链(`rustc`/`cargo` 1.95,host-tuple = `aarch64-apple-darwin`)与 bun 1.3.8。Tauri CLI 在 Task 6 加为 devDep。
- 每个 Task 末尾提交一次(Conventional Commits);全部完成、`bun test` + `bun run check` 全绿后回主树 `git merge --no-ff`。
- **不变量:** `src/engine`、`src/web`、`src/shared` 的业务逻辑不动;纯浏览器 dev(`dev:engine` + `dev:web`)始终可用。

---

## Task 1: Engine — 临时端口 + `PORT=` stdout + 回放可由 env 触发

**Files:**
- Create: `src/engine/port.ts`
- Create: `src/engine/port.test.ts`
- Modify: `src/engine/ws-gateway.ts`(`WsGateway` 构造器加可选 `onListening` 回调)
- Modify: `src/engine/server.ts`(用 `resolvePort`、listen 后打印 `PORT=`、回放兼容 `ROGUENT_REPLAY` env)

- [ ] **Step 1: 写失败测试 `port.test.ts`**

```ts
import { expect, test } from "bun:test";
import { resolvePort } from "./port";

test("resolvePort: 未设 ROGUENT_PORT → 0(临时端口)", () => {
  expect(resolvePort({})).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "   " })).toBe(0);
});

test("resolvePort: 合法端口原样返回", () => {
  expect(resolvePort({ ROGUENT_PORT: "8787" })).toBe(8787);
  expect(resolvePort({ ROGUENT_PORT: "0" })).toBe(0);
});

test("resolvePort: 非法值回落 0", () => {
  expect(resolvePort({ ROGUENT_PORT: "abc" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "-5" })).toBe(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/port.test.ts`
Expected: FAIL —— `Cannot find module './port'`。

- [ ] **Step 3: 写 `src/engine/port.ts`**

```ts
// 决定 engine 的监听端口:显式 ROGUENT_PORT 优先,否则返回 0 让内核分配临时端口
// (Tauri sidecar 模式下端口由 stdout 的 "PORT=<n>" 回报给 host)。
export function resolvePort(env: Record<string, string | undefined>): number {
  const raw = env.ROGUENT_PORT;
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/engine/port.test.ts`
Expected: PASS(3 tests）。

- [ ] **Step 5: 改 `ws-gateway.ts` 构造器,listen 后回报绑定端口**

把构造器改成(其余方法不动):

```ts
  constructor(
    port: number,
    private mgr: SessionManager,
    onListening?: (port: number) => void,
  ) {
    this.wss = new WebSocketServer({ port });
    if (onListening) {
      this.wss.on("listening", () => {
        const addr = this.wss.address();
        if (addr && typeof addr === "object") onListening(addr.port);
      });
    }
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("message", (data) => this.onCommand(String(data)));
      ws.on("close", () => this.clients.delete(ws));
    });
    mgr.subscribe((e) => this.broadcast(e));
  }
```

- [ ] **Step 6: 重写 `server.ts`(用 resolvePort、打印 PORT=、回放兼容 env)**

整文件替换为:

```ts
import { WebSocketServer } from "ws";
import { resolvePort } from "./port";
import { loadFixture, replayTimed } from "./record";
import { SessionManager } from "./session";
import { WsGateway } from "./ws-gateway";

const port = resolvePort(process.env);
const replayArg = process.argv.indexOf("--replay");
// 回放 fixture 既可走 `--replay <path>`,也可走 env ROGUENT_REPLAY(便于 Tauri host 透传)。
const replayFixture =
  replayArg !== -1 ? process.argv[replayArg + 1] : process.env.ROGUENT_REPLAY;

if (replayFixture) {
  // Cost-free demo: replay a fixture to every client, ignore commands.
  const wss = new WebSocketServer({ port });
  wss.on("listening", () => {
    const addr = wss.address();
    if (addr && typeof addr === "object") console.log(`PORT=${addr.port}`);
  });
  console.log(`[server] REPLAY ${replayFixture}`);
  wss.on("connection", async (ws) => {
    const events = await loadFixture(replayFixture);
    await replayTimed(
      events,
      (e) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
      },
      1,
    );
  });
} else {
  const mgr = new SessionManager();
  new WsGateway(port, mgr, (p) => console.log(`PORT=${p}`));
  console.log("[server] LIVE");
}
```

- [ ] **Step 7: 验证全套单测 + 回放仍可启动(零额度)**

Run: `bun test && bun run check`
Expected: 全 PASS。

Run(单独验证 stdout 回报端口,后台起再杀):
```bash
ROGUENT_REPLAY=fixtures/sample-run.jsonl timeout 3 bun run src/engine/server.ts 2>&1 | head -3
```
Expected: 输出包含一行 `PORT=<某随机端口>` 和 `[server] REPLAY fixtures/sample-run.jsonl`。

- [ ] **Step 8: 提交**

```bash
git add src/engine/port.ts src/engine/port.test.ts src/engine/ws-gateway.ts src/engine/server.ts
git commit -m "feat: 🧩 engine binds an ephemeral port and reports it on stdout"
```

---

## Task 2: Engine — `pathToClaudeCodeExecutable` 由 env 注入

**Files:**
- Modify: `src/engine/driver.ts`(新增 `cliPathFromEnv` + 接入 `options`)
- Modify: `src/engine/driver.test.ts`(补 `cliPathFromEnv` 单测)

- [ ] **Step 1: 在 `driver.test.ts` 末尾追加失败测试**

```ts
import { cliPathFromEnv } from "./driver";

test("cliPathFromEnv: 有 ROGUENT_CLI_PATH 用之,否则 undefined", () => {
  expect(cliPathFromEnv({ ROGUENT_CLI_PATH: "/Applications/Roguent.app/.../claude" }))
    .toBe("/Applications/Roguent.app/.../claude");
  expect(cliPathFromEnv({})).toBeUndefined();
  expect(cliPathFromEnv({ ROGUENT_CLI_PATH: "" })).toBeUndefined();
  expect(cliPathFromEnv({ ROGUENT_CLI_PATH: "   " })).toBeUndefined();
});
```

记得把顶部 import 改为 `import { buildHooks, cliPathFromEnv, stripSubscriptionEnv, usesApiKey } from "./driver";`。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/driver.test.ts`
Expected: FAIL —— `cliPathFromEnv is not a function` / 导出不存在。

- [ ] **Step 3: 在 `driver.ts` 加 `cliPathFromEnv` 并接入 options**

在 `stripSubscriptionEnv` 之后加:

```ts
// Tauri 打包后,host 把 .app 内的 claude CLI 资源路径经 env 传进来;dev(未设)
// 则回落 SDK 默认解析(node_modules 平台包)。返回 undefined 即"不覆盖默认"。
export function cliPathFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  const p = env.ROGUENT_CLI_PATH;
  return p && p.trim() !== "" ? p : undefined;
}
```

在 `start()` 的 `options` 对象里加一行(放 `env:` 之后):

```ts
      env: stripSubscriptionEnv({ ...process.env }),
      pathToClaudeCodeExecutable: cliPathFromEnv(process.env),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/engine/driver.test.ts && bun run check`
Expected: 全 PASS(含新 `cliPathFromEnv` 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/engine/driver.ts src/engine/driver.test.ts
git commit -m "feat: 🧩 let the engine take claude CLI path from ROGUENT_CLI_PATH"
```

---

## Task 3: Web — `resolveEngineUrl()`(Tauri 要端口 / 浏览器回落)

**Files:**
- Create: `src/web/engine-url.ts`
- Create: `src/web/engine-url.test.ts`

- [ ] **Step 1: 写失败测试 `engine-url.test.ts`**

```ts
import { expect, test } from "bun:test";
import { resolveEngineUrl } from "./engine-url";

test("纯浏览器(无 __TAURI__)回落固定 8787", async () => {
  expect(await resolveEngineUrl({ win: {} })).toBe("ws://localhost:8787");
});

test("Tauri 环境用 engine_url 命令返回的 url", async () => {
  const win = {
    __TAURI__: {
      core: {
        invoke: async (c: string) =>
          c === "engine_url" ? "ws://127.0.0.1:54321" : "",
      },
    },
  };
  expect(await resolveEngineUrl({ win })).toBe("ws://127.0.0.1:54321");
});

test("端口未就绪时退避重试,直到拿到 url", async () => {
  let calls = 0;
  const win = {
    __TAURI__: {
      core: {
        invoke: async () => {
          calls++;
          if (calls < 3) throw new Error("engine not ready");
          return "ws://127.0.0.1:60000";
        },
      },
    },
  };
  expect(await resolveEngineUrl({ win, retries: 5, delayMs: 0 })).toBe(
    "ws://127.0.0.1:60000",
  );
  expect(calls).toBe(3);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/engine-url.test.ts`
Expected: FAIL —— `Cannot find module './engine-url'`。

- [ ] **Step 3: 写 `src/web/engine-url.ts`**

```ts
// WS 连接地址的来源:Tauri 桌面壳里向 Rust host 要 engine 的随机端口(端口可能
// 还没从 sidecar stdout 解析到,故退避重试);纯浏览器 dev 回落固定 8787。
const FALLBACK = "ws://localhost:8787";

type Invoke = (cmd: string) => Promise<unknown>;
interface MaybeTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
}

export async function resolveEngineUrl(
  opts: { win?: MaybeTauri; retries?: number; delayMs?: number } = {},
): Promise<string> {
  const win = opts.win ?? (globalThis as unknown as MaybeTauri);
  const invoke = win.__TAURI__?.core?.invoke;
  if (!invoke) return FALLBACK; // 纯浏览器 dev
  const retries = opts.retries ?? 50;
  const delayMs = opts.delayMs ?? 200;
  for (let i = 0; i < retries; i++) {
    try {
      const url = await invoke("engine_url");
      if (typeof url === "string" && url.length > 0) return url;
    } catch {
      /* engine 端口未就绪,退避重试 */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("engine_url unavailable after retries");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/engine-url.test.ts && bun run check`
Expected: 全 PASS(3 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/web/engine-url.ts src/web/engine-url.test.ts
git commit -m "feat: 🧩 resolve engine WS url from Tauri host or browser fallback"
```

---

## Task 4: Web — `App.tsx` 用 `resolveEngineUrl` 异步连接

**Files:**
- Modify: `src/web/App.tsx:8`(import)与 `:26-29`(连接 effect)

- [ ] **Step 1: 改 import 行**

把 `App.tsx` 第 8 行:
```ts
import { connectRoom } from "./ws-client";
```
改为:
```ts
import { resolveEngineUrl } from "./engine-url";
import { type RoomConnection, connectRoom } from "./ws-client";
```

- [ ] **Step 2: 改连接 effect(原 26-29 行)**

把:
```tsx
  useEffect(() => {
    const conn = connectRoom();
    return () => conn.close();
  }, []);
```
替换为:
```tsx
  useEffect(() => {
    let conn: RoomConnection | null = null;
    let cancelled = false;
    resolveEngineUrl().then((url) => {
      if (!cancelled) conn = connectRoom(url);
    });
    return () => {
      cancelled = true;
      conn?.close();
    };
  }, []);
```

- [ ] **Step 3: 验证类型/构建/全测**

Run: `bun run check && bun run build && bun test`
Expected: check 通过;`build` 成功产出 `dist/`;`bun test` 全 PASS(含现有 `replay.e2e.test.ts`)。

- [ ] **Step 4: 提交**

```bash
git add src/web/App.tsx
git commit -m "feat: 🧩 connect the room via resolveEngineUrl (async port handoff)"
```

---

## Task 5: Web — 字体本地化(去掉 Google Fonts CDN)

打包后离线环境拿不到 CDN 字体;改用打进 bundle 的 `@fontsource/press-start-2p`(family 名与 `styles.css` 的 `--pixel` 一致,无需改 CSS)。

**Files:**
- Modify: `package.json`(新增依赖)
- Modify: `src/web/main.tsx`(import 字体)
- Modify: `index.html`(删 CDN `<link>`/`preconnect`)

- [ ] **Step 1: 装字体包**

Run: `bun add @fontsource/press-start-2p`
Expected: 写入 `package.json` dependencies,`node_modules` 出现该包。

- [ ] **Step 2: 在 `main.tsx` 顶部 import 字体**

把 `main.tsx` 的 import 段改为(加最后一行 `@fontsource`):
```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "@fontsource/press-start-2p";
```

- [ ] **Step 3: 删 `index.html` 的 CDN 字体引用**

删掉 `<head>` 里这三行(preconnect ×2 + stylesheet `<link>`):
```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 4: 验证无 CDN 残留 + 构建**

Run: `grep -ri "googleapis\|gstatic" index.html src/web || echo "no CDN refs"`
Expected: 输出 `no CDN refs`。

Run: `bun run build`
Expected: 构建成功,`dist/` 内含字体 woff2 资源。

- [ ] **Step 5: 提交**

```bash
git add package.json bun.lock src/web/main.tsx index.html
git commit -m "feat: 🧩 bundle Press Start 2P locally instead of the Google Fonts CDN"
```
（注:本任务已把仓库锁文件从 npm 的 `package-lock.json` 迁移到 `bun.lock` 作唯一权威锁文件——后续一律 `bun add`/`bun install`,只提交 `bun.lock`,不要再引入 `package-lock.json`。）

---

## Task 6: Tauri 脚手架(`.gitignore` + Tauri CLI devDep + `tauri init`)

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`(devDep `@tauri-apps/cli`)
- Create(由 CLI 生成): `src-tauri/`(`Cargo.toml`、`build.rs`、`tauri.conf.json`、`src/main.rs`、`src/lib.rs`、`capabilities/default.json`、`icons/`)

- [ ] **Step 1: 追加 `.gitignore` 构建产物条目**

在 `.gitignore` 末尾追加:
```
# Tauri 构建产物 / 大体积本地资源(不入仓库)
src-tauri/target/
src-tauri/gen/
src-tauri/binaries/
src-tauri/resources/
```
（`src-tauri/Cargo.lock` 应提交——别忽略它。）

- [ ] **Step 2: 加 Tauri CLI 为 devDependency**

Run: `bun add -d @tauri-apps/cli@^2`
Expected: `package.json` devDependencies 出现 `@tauri-apps/cli`。

- [ ] **Step 3: 非交互脚手架(CI 模式)**

Run:
```bash
bunx tauri init --ci \
  --app-name roguent \
  --window-title Roguent \
  --frontend-dist ../dist \
  --dev-url http://localhost:5173 \
  --before-dev-command "bun run dev:web" \
  --before-build-command "bun run build"
```
Expected: 生成 `src-tauri/` 目录及上述文件;终端无报错。
（bundle identifier 不在此设,留到 Task 9 编辑 `tauri.conf.json` 时设;若某 flag 被该版本 CLI 拒绝,先 `bunx tauri init --help` 对一下名字,或 `bunx tauri init --ci` 裸跑、相关字段同样在 Task 9 校正。)

- [ ] **Step 4: 验证 Rust 侧能编译(占位窗口)**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 首次会拉取 crates 并编译,最终 `Finished`(无 error)。

- [ ] **Step 5: 提交**

```bash
git add .gitignore package.json bun.lock src-tauri/
git commit -m "chore: 🧹 scaffold the Tauri 2 shell (src-tauri) and ignore build artifacts"
```
（`src-tauri/target/` 已被忽略,不会进暂存;锁文件只有 `bun.lock`。）

---

## Task 7: `scripts/build-sidecar.ts`(编译 engine 成 Tauri externalBin)

**Files:**
- Create: `scripts/build-sidecar.ts`

- [ ] **Step 1: 写脚本**

```ts
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
```

- [ ] **Step 2: 跑脚本编译**

Run: `bun scripts/build-sidecar.ts`
Expected: 产出 `src-tauri/binaries/roguent-engine-aarch64-apple-darwin`(可执行）。验证存在:
```bash
ls -la src-tauri/binaries/
```

- [ ] **Step 3: 验证编译后的 engine 能起回放(关键风险 #2 之"compile + 监听"部分,零额度)**

Run:
```bash
ROGUENT_REPLAY=fixtures/sample-run.jsonl timeout 3 ./src-tauri/binaries/roguent-engine-aarch64-apple-darwin 2>&1 | head -3
```
Expected: 输出含 `PORT=<随机端口>` 与 `[server] REPLAY fixtures/sample-run.jsonl` —— 证明 `bun build --compile` 的 engine 可运行、可监听、可回放。
（若此处失败,即 spec §9 风险 #2 暴露:记录 bun compile 报错,先修编译再继续。）

- [ ] **Step 4: 提交**

```bash
git add scripts/build-sidecar.ts
git commit -m "feat: 🧩 build the engine into a Tauri sidecar binary (bun --compile)"
```

---

## Task 8: `scripts/stage-cli.ts`(把 claude CLI 拷成 .app 资源)

**Files:**
- Create: `scripts/stage-cli.ts`

- [ ] **Step 1: 写脚本**

```ts
// 把 SDK 平台包里的 claude 原生 CLI 拷进 src-tauri/resources/,供 Tauri 作资源打包,
// 运行时 host 经 resource_dir() 找到它、用 ROGUENT_CLI_PATH 传给 sidecar。
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";

// 仅 Apple Silicon(第一阶段范围)。
const src =
  "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude";
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
```

- [ ] **Step 2: 跑脚本**

Run: `bun scripts/stage-cli.ts`
Expected: 打印 `copied ~218MB → src-tauri/resources/claude`。验证:
```bash
ls -la src-tauri/resources/claude && file src-tauri/resources/claude
```
Expected: 文件存在、可执行、为 Mach-O 64-bit executable arm64。

- [ ] **Step 3: 提交**

```bash
git add scripts/stage-cli.ts
git commit -m "feat: 🧩 stage the claude CLI binary into Tauri resources"
```
（`src-tauri/resources/` 已被 .gitignore 忽略——只提交脚本,不提交 218MB 二进制。）

---

## Task 9: Rust host — sidecar spawn + 端口握手 + `engine_url` + CLI env + 回放透传

**Files:**
- Modify: `src-tauri/Cargo.toml`(加 `tauri-plugin-shell`)
- Modify: `src-tauri/src/lib.rs`(整段替换为下方实现,含 `parse_port_line` 单测)
- Modify: `src-tauri/tauri.conf.json`(`externalBin`、`resources`、`app.withGlobalTauri`)
- Modify: `src-tauri/capabilities/default.json`(`shell:allow-execute` sidecar)

- [ ] **Step 1: `Cargo.toml` 加 shell 插件依赖**

在 `[dependencies]` 段(`tauri = { ... }` 之后)加:
```toml
tauri-plugin-shell = "2"
```

- [ ] **Step 2: 整段替换 `src-tauri/src/lib.rs`**

```rust
use std::sync::Mutex;
use tauri::{async_runtime, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// 从 sidecar 的一行 stdout 里解析 "PORT=<n>"。纯函数,便于单测。
fn parse_port_line(line: &str) -> Option<u16> {
    line.trim().strip_prefix("PORT=")?.parse::<u16>().ok()
}

#[derive(Default)]
struct EnginePort(Mutex<Option<u16>>);

// webview 调用以拿到 engine 的 WS 地址;端口尚未从 sidecar stdout 解析到时返回 Err,
// 前端会退避重试(见 web/engine-url.ts)。
#[tauri::command]
fn engine_url(state: State<EnginePort>) -> Result<String, String> {
    match *state.0.lock().map_err(|e| e.to_string())? {
        Some(port) => Ok(format!("ws://127.0.0.1:{port}")),
        None => Err("engine not ready".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(EnginePort::default())
        .invoke_handler(tauri::generate_handler![engine_url])
        .setup(|app| {
            let handle = app.handle().clone();

            let mut cmd = app
                .shell()
                .sidecar("roguent-engine")
                .expect("sidecar 'roguent-engine' 缺失(先跑 build-sidecar)");

            // CLI 资源:.app 内 resources/claude 存在则经 env 传给 sidecar
            //(SDK 用作 pathToClaudeCodeExecutable);dev 无资源则回落 SDK 默认解析。
            if let Ok(dir) = app.path().resource_dir() {
                let cli = dir.join("claude");
                if cli.exists() {
                    cmd = cmd.env("ROGUENT_CLI_PATH", cli.to_string_lossy().to_string());
                }
            }
            // 回放透传:host 环境设了 ROGUENT_REPLAY 就转给 sidecar(零额度验证渲染)。
            if let Ok(replay) = std::env::var("ROGUENT_REPLAY") {
                cmd = cmd.env("ROGUENT_REPLAY", replay);
            }

            let (mut rx, _child) = cmd.spawn().expect("spawn sidecar 失败");

            async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(bytes) = event {
                        let line = String::from_utf8_lossy(&bytes);
                        if let Some(port) = parse_port_line(&line) {
                            *handle.state::<EnginePort>().0.lock().unwrap() = Some(port);
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::parse_port_line;

    #[test]
    fn parses_valid_port_line() {
        assert_eq!(parse_port_line("PORT=54321"), Some(54321));
        assert_eq!(parse_port_line("  PORT=8787\n"), Some(8787));
    }

    #[test]
    fn rejects_non_port_lines() {
        assert_eq!(parse_port_line("[server] LIVE"), None);
        assert_eq!(parse_port_line("PORT="), None);
        assert_eq!(parse_port_line("PORT=notanumber"), None);
        assert_eq!(parse_port_line("PORT=99999999"), None); // 超出 u16
    }
}
```

- [ ] **Step 3: `tauri.conf.json` 加 externalBin / resources / withGlobalTauri,并校正 build 字段**

在 `bundle` 对象里加(与 `active`/`targets` 同级):
```json
    "externalBin": ["binaries/roguent-engine"],
    "resources": ["resources/claude"]
```
在顶层 `app` 对象里加(与 `windows` 同级)——让 `window.__TAURI__` 注入,供前端 raw invoke:
```json
    "withGlobalTauri": true
```
顺带核对/校正这几个字段(init 版本漂移时兜底),确保值如下:
- 顶层 `"identifier": "com.roguent.app"`
- `build.frontendDist`: `"../dist"`
- `build.devUrl`: `"http://localhost:5173"`
- `build.beforeDevCommand`: `"bun run dev:web"`
- `build.beforeBuildCommand`: `"bun run build"`

- [ ] **Step 4: `capabilities/default.json` 授权执行 sidecar**

把 `permissions` 数组改为(保留已有的 `core:default` 等,追加 shell 执行权限):
```json
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "binaries/roguent-engine", "sidecar": true, "args": true }]
    }
  ]
```
（若生成的文件里已有 `opener:default` 等条目,保留它们,仅追加上面的 `shell:allow-execute` 对象。）

- [ ] **Step 5: 跑 Rust 单测 + 编译**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `parse_port_line` 两个测试 PASS。

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: `Finished`(无 error;可能有 unused 警告,可忽略)。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: 🧩 spawn engine sidecar, hand the WS port to the webview, wire CLI path"
```

---

## Task 10: `package.json` — `dev:app` / `build:app` 脚本

**Files:**
- Modify: `package.json`(scripts)

- [ ] **Step 1: 加脚本**

在 `scripts` 里加(保留现有):
```json
    "dev:app": "bun scripts/build-sidecar.ts && bun scripts/stage-cli.ts && tauri dev",
    "build:app": "bun run build && bun scripts/build-sidecar.ts && bun scripts/stage-cli.ts && tauri build"
```
说明:`tauri dev`/`tauri build` 经 `@tauri-apps/cli` 的 bin 解析;`build:app` 顺序 = 前端 dist → 编译 sidecar → 拷 CLI → Tauri 打包。`dev:app` 先备齐 sidecar+CLI 再起 `tauri dev`(其 `beforeDevCommand` 会起 vite)。

- [ ] **Step 2: 校验 JSON 合法**

Run: `bun -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected: 输出 `ok`。

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "chore: 🧹 add dev:app and build:app scripts for the Tauri shell"
```

---

## Task 11: 端到端验证(风险 #1 渲染 / 风险 #2 LIVE spawn)

无新文件;按序跑验证,把结果记进 PR/commit 说明。

- [ ] **Step 1: 全套自动化测试基线**

Run: `bun test && bun run check && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 三者全绿。

- [ ] **Step 2: 风险 #1 —— WKWebView + PixiJS 渲染(回放,零额度)**

Run:
```bash
ROGUENT_REPLAY="$PWD/fixtures/sample-run.jsonl" bun run dev:app
```
人工验证:Tauri 原生窗口打开,WKWebView 内 **Pixi 正常渲染**(地牢/总览画面,非黑屏),且 fixture 事件按时序播放出小人活动。确认后关窗。
（黑屏 = spec §9 风险 #1 暴露:查 console 是否 WebGL 初始化失败,需让 Pixi 显式用 WebGL renderer。)

- [ ] **Step 3: 打包出 .app(零额度)**

Run: `bun run build:app`
Expected: 成功;产物在 `src-tauri/target/release/bundle/macos/roguent.app`(及可能的 `.dmg`)。验证:
```bash
ls -la src-tauri/target/release/bundle/macos/
```

- [ ] **Step 4: 风险 #1 复核 —— 打包后的 .app 回放渲染(零额度)**

Run:
```bash
ROGUENT_REPLAY="$PWD/fixtures/sample-run.jsonl" ./src-tauri/target/release/bundle/macos/roguent.app/Contents/MacOS/app
```
人工验证:.app 启动、窗口渲染、回放播放正常(确认打包后 webview 与 sidecar 接线无误)。
（注:可执行体名为 `app`(= Cargo 包名,非 productName `roguent`),路径 `…/roguent.app/Contents/MacOS/app`。`open` 默认不继承 shell env,故回放验证必须**直跑**该可执行体并带 env;`open src-tauri/target/release/bundle/macos/roguent.app` 仅用于不带 env 的普通启动。）

- [ ] **Step 5: 风险 #2 —— LIVE 真会话 spawn CLI(放最后,烧少量额度)**

前置:本机已 `claude` 订阅登录(`~/.claude` OAuth 态)。
Run: 直接双击或 `open` 启动 `roguent.app`(不带 ROGUENT_REPLAY),在 UI 里新建一个会话、发一条短消息(如"说 hi")。
人工验证:会话创建、消息发出后有真实 agent 事件回流(小人活动 / transcript),证明 .app 内 sidecar 经 `ROGUENT_CLI_PATH` 成功 spawn 了打包的 claude CLI。
（若报 CLI 找不到 / 未登录:核对 `src-tauri/resources/claude` 是否随包、host 是否登录;参 spec §6 错误处理。)

- [ ] **Step 6: 收尾提交(若验证中有微调)**

```bash
git add -A
git commit -m "test: 🧪 validate Tauri .app renders (replay) and spawns CLI (live)"
```
（无改动则跳过此步。)

---

## 完成标准

- `bun test`、`bun run check`、`cargo test`(parse_port_line)全绿。
- `bun run dev:engine` + `bun run dev:web` 纯浏览器路径仍可用(回归)。
- `bun run build:app` 产出 `roguent.app`;回放模式窗口正常渲染(风险 #1 通过);LIVE 模式能 spawn 打包 CLI 起真会话(风险 #2 通过)。
- 全程未把 218MB CLI / 构建产物提交进仓库。

合并:记 worktree HEAD SHA → 回主树 `git merge --no-ff <sha>` 入 `main` → 重新跑 `bun test` + `bun run check` → 清理 worktree。
