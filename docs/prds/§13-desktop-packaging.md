---
id: "§13"
title: 桌面打包(Tauri sidecar)
status: partial
layer: tauri
updated: 2026-06-06
depends_on: ["§1", "§12"]
related: ["§9"]
code_refs:
  - src-tauri/tauri.conf.json
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/main.rs
  - src-tauri/build.rs
  - scripts/build-sidecar.ts
  - scripts/stage-cli.ts
  - src/engine/port.ts
  - src/engine/proxy.ts
  - src/web/engine-url.ts
specs:
  - docs/superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md
---

# §13 桌面打包(Tauri sidecar)

## 1. 定位

把三层架构(engine / web / shared)包成可分发的原生 macOS `.app`:Tauri 2 充当宿主壳(WKWebView 装前端),engine 作 `externalBin` sidecar(`bun build --compile` 单文件),218 MB 的 claude CLI 不内嵌进 sidecar 而作 `bundle.resources` 分发、运行时经 `ROGUENT_CLI_PATH` 注入 SDK。本节描述这三层在 macOS 桌面包里的装配方式、端口握手协议、孤儿回收机制,以及当前已实现与尚待解决的边界。

## 2. 为什么

不加 Tauri 壳时,Roguent 需要用户手动在终端起 engine(`bun run dev:engine`)并在浏览器打开前端,既不可分发也无法向普通用户交付。Tauri 2 提供:

- **一键分发**:产出签名 `.app`(规划中 `.dmg`),双击即用,无需预装 Bun/Node。
- **进程托管**:宿主自动 spawn / kill sidecar,端口协商对用户透明。
- **资源隔离**:218 MB CLI 走 `bundle.resources` 而非内嵌进二进制,保持 sidecar 体积可控(Bun 编译产物 ~60 MB),同时让 CLI 路径在打包环境下可解析。
- **系统集成**:WKWebView 沙盒 + macOS 代理注入 + 窗口生命周期管理,这些在纯浏览器开发模式下均无法验证。

## 3. 功能点

- **Tauri 2 宿主壳**:WKWebView 装载前端(`frontendDist: ../dist`);`withGlobalTauri: true` 把 `__TAURI__` 暴露给 webview;CSP 设为 `null`(开发阶段);invoke handler 仅注册 `engine_url` 命令。
- **engine sidecar 编译**:`scripts/build-sidecar.ts` 调用 `bun build --compile ./src/engine/server.ts`,输出文件名带 `rustc --print host-tuple` 后缀(`src-tauri/binaries/roguent-engine-<triple>`),满足 Tauri `externalBin` 命名约定。
- **claude CLI 作 bundle.resources**:`scripts/stage-cli.ts` 从 `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` 复制到 `src-tauri/resources/claude`(赋 0o755)。`tauri.conf.json` 的 `bundle.resources: ["resources/claude"]` 使其落在 `<resource_dir>/resources/claude`;宿主 `lib.rs` 在 `app.path().resource_dir()` 加 `resources/claude` 拼路径,文件存在则以 `ROGUENT_CLI_PATH` env 传给 sidecar,SDK 据此定位 CLI(`pathToClaudeCodeExecutable`)。
- **临时端口握手**:sidecar(`src/engine/server.ts`)无 `ROGUENT_PORT` 时调用 `resolvePort({})` 返回 0,OS 分配临时端口;engine 启动后向 stdout 打印 `PORT=<n>`;宿主异步读 `CommandEvent::Stdout`、调用 `parse_port_line` 解析并存入 `EnginePort(Mutex<Option<u16>>)`。
- **`engine_url` Tauri 命令**:webview 通过 `invoke("engine_url")` 拿端口;端口未就绪时 Rust 侧返回 `Err("engine not ready")`；前端 `resolveEngineUrl`(最多 50 次、间隔 200 ms 退避重试)直到拿到有效 URL 或抛出。纯浏览器无 `__TAURI__` 时直接回落 `ws://localhost:8787`。
- **孤儿 sidecar 回收**:`EngineChild(Mutex<Option<CommandChild>>)` 持有子进程句柄;`RunEvent::Exit` 时显式 `child.kill()`——`tauri-plugin-shell` 的 `CommandChild` drop 不杀进程,不处理则宿主退出后 sidecar 变孤儿持续占用资源(已实测复现)。
- **macOS 系统代理注入**:`.app` 由 LaunchServices 启动,进程不继承 shell 环境,bundled CLI 拿不到 `HTTP(S)_PROXY`。`src/engine/proxy.ts` 在 sidecar 侧构造 SDK env 时兜底:已有代理变量则尊重,否则读 `scutil --proxy` 解析系统代理(Enable=1 且 host/port 齐备)注入大小写两套 `*_PROXY + NO_PROXY`(见 §9 / §1 proxy 注入路径)。
- **字体本地化**:Press Start 2P 等像素字体自托管于 `public/fonts/`,不走 CDN,避免 `.app` 沙盒下外网字体请求失败(见 §12)。
- **回放透传**:宿主检测到环境变量 `ROGUENT_REPLAY` 时将其转给 sidecar,支持零额度 fixture 回放验证打包包。
- **(planned) DMG 打包**:当前 `bundle.targets: "all"` 导致 `bundle_dmg.sh` 失败、留有 `rw.*.dmg` 残留;待 P1-6 修复(短期可收成 `["app"]`)。
- **(planned) 代码签名 / 公证 / 通用二进制**:第一阶段不含；Apple 公证、Intel+ARM 通用二进制、自动更新等留后续里程碑。

## 4. 交互边界★

### 上游依赖

| 依赖 | 契约 |
|------|------|
| **§1 核心 Driver / engine server** | sidecar 运行的就是 engine `src/engine/server.ts`；`ROGUENT_CLI_PATH` env 注入由宿主 `lib.rs` setup 完成，sidecar 直接消费；`ROGUENT_PORT=0`(或不设)→ OS 临时端口 → stdout `PORT=<n>` 回报 |
| **§12 视觉主题(字体)** | Press Start 2P / Fusion Pixel 等字体作为静态资源(`public/fonts/`)打入前端 dist，`.app` 内通过 `tauri://localhost` 协议访问，不依赖外网 CDN |

### 下游消费

| 消费方 | 契约 |
|--------|------|
| **前端 `resolveEngineUrl`** | 调用 `invoke("engine_url")` 拿 WS URL；端口未就绪时宿主返回 `Err`，前端自行退避重试最多 50 次；无 `__TAURI__` 则直接返回 `ws://localhost:8787` |
| **SDK(`pathToClaudeCodeExecutable`)** | sidecar 收到 `ROGUENT_CLI_PATH` env 后传给 SDK；SDK 用该路径定位 claude 原生 CLI；路径不存在时 SDK 回落默认解析逻辑 |

### Related

- **§9 用量限额**：`src/engine/proxy.ts` 的代理注入影响 SDK 网络出口，与 §9 OAuth poll / rate_limit_event 的网络可达性共享同一机制；系统代理状态需在 P1-5 验收时明确记录。

## 5. 数据流与关键约定

```
用户双击 .app
  └─ Tauri host (lib.rs setup)
       ├─ resource_dir() → join("resources/claude") → 存在则 env ROGUENT_CLI_PATH=<path>
       ├─ 检测 ROGUENT_REPLAY → 透传给 sidecar
       └─ shell().sidecar("roguent-engine").spawn()
            └─ sidecar (engine/server.ts)
                 ├─ resolvePort({}) → 0 → OS 分配临时端口
                 ├─ server 监听 → stdout: "PORT=<n>"
                 └─ proxy.ts 注入系统代理 env(LaunchServices 无 shell 代理时兜底)

host 异步 rx.recv()
  └─ CommandEvent::Stdout → parse_port_line("PORT=<n>") → EnginePort.lock() = Some(port)

webview (engine-url.ts resolveEngineUrl)
  └─ __TAURI__ 存在 → invoke("engine_url")
       ├─ EnginePort = Some(port) → Ok("ws://127.0.0.1:<n>") → 连接成功
       └─ EnginePort = None → Err → sleep 200ms → 重试(最多 50 次)

退出
  └─ RunEvent::Exit → EngineChild.lock().take() → child.kill() [孤儿回收]
```

**关键约定**：

- `externalBin` 文件名格式固定为 `roguent-engine-<rustc-host-triple>`，与 `tauri.conf.json` 的 `bundle.externalBin: ["binaries/roguent-engine"]` 匹配；`build-sidecar.ts` 自动查询 triple，不需手填。
- `bundle.resources: ["resources/claude"]` 保留 `resources/` 这层目录，故运行时 CLI 实际路径是 `<resource_dir>/resources/claude`，`lib.rs` 已按此拼接（`dir.join("resources").join("claude")`）。
- `parse_port_line` 是纯函数，在 `lib.rs` 的 `#[cfg(test)]` 中有单测（`parses_valid_port_line` / `rejects_non_port_lines`）。
- `resolvePort` 在 `src/engine/port.ts` 同样是纯函数；`ROGUENT_PORT` 有效时用固定端口（纯浏览器 dev 模式），无效/缺省返回 0（sidecar 模式）。

## 6. 现状与边界

### 已实现（合入 `main @ 2070a0d`，2026-06-05）

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 2 宿主壳 + WKWebView | ✅ | `src-tauri/src/lib.rs` + `tauri.conf.json` |
| engine sidecar 编译脚本 | ✅ | `scripts/build-sidecar.ts`，`bun build --compile` |
| claude CLI bundle.resources + ROGUENT_CLI_PATH | ✅ | `scripts/stage-cli.ts` + `lib.rs` setup |
| PORT= stdout 握手 → engine_url 命令 | ✅ | `parse_port_line` + `EnginePort` state |
| 前端 resolveEngineUrl 退避重试 | ✅ | `src/web/engine-url.ts` |
| 孤儿 sidecar 回收（RunEvent::Exit） | ✅ | `lib.rs` + `EngineChild` |
| macOS 系统代理注入（proxy.ts） | ✅ | `src/engine/proxy.ts`，`scutil --proxy` |
| 字体本地化（public/fonts/） | ✅ | 见 §12 |
| 回放透传（ROGUENT_REPLAY） | ✅ | `lib.rs` setup |

### 未验证 / 待解决（planned）

> 详细 DoD 见 [docs/ROADMAP.md](../ROADMAP.md)

| 问题 | 优先级 | ROADMAP 锚点 |
|------|--------|--------------|
| **打包 `.app` 主画布黑屏未确认**（atlas 资源路径在 `tauri://localhost` 协议下是否可达）| P1（High） | **P1-4** |
| **打包 `.app` 端到端验证清单未固化**（回放模式 + LIVE spawn 未完整跑通）| P1 | **P1-5** |
| **DMG 打包失败**（`bundle_dmg.sh` 报错，`rw.*.dmg` 残留）| P1（次要）| **P1-6** |
| 代码签名 / Apple 公证 | 后续 | 桌面产品化里程碑 |
| Intel+ARM 通用二进制 | 后续 | 桌面产品化里程碑 |

### 范围约束

**第一阶段仅 Apple Silicon（darwin-arm64）**：`stage-cli.ts` 硬编码 `claude-agent-sdk-darwin-arm64`；sidecar triple 由 `rustc --print host-tuple` 自动获取，但 Intel Mac 未测试、未列入 DoD。

## 7. 代码锚点

| 文件 | 说明 |
|------|------|
| `src-tauri/src/lib.rs` | Rust 宿主核心：spawn sidecar、`parse_port_line`、`engine_url` command、孤儿回收；内含 `#[cfg(test)]` 单测 |
| `src-tauri/src/main.rs` | 入口，仅调 `app_lib::run()` |
| `src-tauri/tauri.conf.json` | `bundle.externalBin`、`bundle.resources`、`app.withGlobalTauri`、`devUrl`/`frontendDist` |
| `src-tauri/Cargo.toml` | 依赖：`tauri 2.11.2`、`tauri-plugin-shell 2`、`tauri-build 2.6.2` |
| `src-tauri/build.rs` | `tauri_build::build()` |
| `scripts/build-sidecar.ts` | `bun build --compile` engine → `src-tauri/binaries/roguent-engine-<triple>` |
| `scripts/stage-cli.ts` | 复制 `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` → `src-tauri/resources/claude` |
| `src/engine/port.ts` | `resolvePort(env)`：`ROGUENT_PORT` 有效则用，否则返回 0 |
| `src/engine/proxy.ts` | macOS 系统代理读取（`scutil --proxy`）+ SDK env 注入 |
| `src/web/engine-url.ts` | `resolveEngineUrl()`：`invoke("engine_url")` + 退避重试 50×200ms；无 `__TAURI__` 回落 `ws://localhost:8787` |

## 8. 验收

### 自动化单测（已有）

| 测试文件 | 覆盖点 |
|----------|--------|
| `src/engine/port.test.ts` | `resolvePort` 纯函数：有效端口、空值、越界、非整数 |
| `src/web/engine-url.test.ts` | `resolveEngineUrl`：无 `__TAURI__` 回落、invoke 成功、invoke 重试收敛、重试耗尽抛出 |
| `src-tauri/src/lib.rs` `#[cfg(test)]` | `parse_port_line`：正常解析、边界拒绝（空、非数字、超 u16） |

### 手动验收清单（planned，见 ROADMAP P1-5）

> 以下清单尚未完整跑通，状态为 planned，完成后在 ROADMAP P1-5 记录环境前提。

- [ ] `bun run build:app` 干净产出 `.app`，无残留 `rw.*.dmg`（或 P1-6 修复后产出 DMG）
- [ ] 回放模式：双击 `.app` + `ROGUENT_REPLAY=<fixture>` 启动 → WKWebView 窗口正常显示地板瓦片 + 动画（定位 P1-4 黑屏根因）
- [ ] LIVE 模式：订阅 `/login` 已登录 → 起真会话 → SDK 经 `ROGUENT_CLI_PATH` 找到 bundled CLI，`spawn` 正常、无 403
- [ ] 系统代理开启时：proxy.ts 注入生效，Anthropic API 可达
- [ ] 多次启动/退出：无孤儿 `roguent-engine` 进程（`pgrep roguent-engine` 空）
- [ ] 纯浏览器 dev 模式（`bun run dev:web`）：`resolveEngineUrl` 回落 `ws://localhost:8787`，无回归
