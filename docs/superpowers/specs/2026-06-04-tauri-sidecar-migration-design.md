---
title: Roguent — Tauri + sidecar 迁移(第一阶段:能跑的原生 macOS .app)
date: 2026-06-04
status: design-approved
authors: [koco-co]
supersedes_note: 不替换主设计文档,只把其中"后续桌面壳(Tauri 优先)"展开为可执行的第一阶段。
base_commit: ff658d6 (本地 main,领先 origin/main 19 commit;2026-06-04)
---

# Roguent · Tauri + sidecar 迁移设计

> 目标:把现有"Bun WS engine + Vite React/Pixi 前端"套进一个原生 macOS `.app`,为后续作为产品售卖打地基。**本阶段只求"能跑的原生 .app"**:Tauri 壳 + Bun sidecar + 保留 WS 传输,在 Apple Silicon 上跑通现有全部功能,并验证打包后 SDK/CLI 能正常 spawn。签名、公证、付费、授权全部后置为独立子项目。

---

## 1. 背景与既定方向

主设计文档([2026-06-04-roguent-design.md](2026-06-04-roguent-design.md))第 43、277 行早已把"桌面壳(Tauri 优先)"列为后续阶段,故本次是**执行既定下一阶段**,非临时改向。

> ⚠️ 主设计参考的 opcode/winfunc 是 **AGPL**。要卖闭源产品,只能借鉴其进程注册/会话 resume 的**思路**,**不得把其代码拷入**本仓库。

### 1.1 关键事实(已核实,基于本地 `main @ ff658d6`)

- `@anthropic-ai/claude-agent-sdk@0.3.161` 默认 **spawn 一个独立的 `claude` 原生 CLI 二进制**作为子进程(`pathToClaudeCodeExecutable` 可覆盖默认解析)。该二进制走 optional 平台依赖,darwin-arm64 一份约 **218MB**(见 SDK `manifest.json`,本地已装于 `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`)。
- SDK 自带 `extractFromBunfs.js`,专为"`bun build --compile` 把 CLI 内嵌进单文件、运行时解压到 /tmp 再 spawn"设计 —— 说明 **Bun-sidecar 路线是 SDK 预期支持的**。本阶段**不采用内嵌**(见 §决策),故运行时用不到 `extractFromBunfs`。
- 每个买家用**自己的 Claude 订阅**在本机登录(OAuth 态在本机),是现有"抹掉 API key、回落订阅"设计(`driver.ts` 的 `stripSubscriptionEnv` / `usesApiKey`)的自然延伸 —— BYO-订阅 的桌面产品形态。

### 1.2 已核实的 Tauri 2 机制(context7,`/websites/v2_tauri_app`)

- `externalBin`:在 `tauri.conf.json` 的 `bundle.externalBin` 列出路径;实际文件须放 `src-tauri/binaries/` 且命名带 target triple 后缀(如 `roguent-engine-aarch64-apple-darwin`,triple 由 `rustc --print host-tuple` 得到)。
- spawn:`app.shell().sidecar("roguent-engine")` → `(rx, child)`;从 `CommandEvent::Stdout(line_bytes)` 逐行读 —— **正是端口握手要用的通道**。
- 授权:capability 里 `shell:allow-execute` + `{ name: "binaries/roguent-engine", sidecar: true, args: true }`。
- 资源:`bundle.resources` 列出文件,打包进 `.app` 的 `Resources/`,运行时经 `resource_dir()` 解析路径。

---

## 2. 关键决策(brainstorm 结论)

| 决策点 | 选定 | 理由 |
| --- | --- | --- |
| 本阶段范围 | **能跑的原生 .app(地基)** | 最小可验证、风险先暴露;签名/付费后置。 |
| 传输层 | **保留 WS,端口由 Tauri 随机分配** | engine/前端几乎不动,改动量最小;避开固定 8787 冲突、不暴露固定端口。仍为 localhost 监听。 |
| sidecar 打包 | **engine `bun build --compile` 成独立二进制 + CLI 单独作资源** | 两个二进制各自独立、可分别签名;无运行时 /tmp 解压;避免 218MB+ 巨型单文件;最利于后续公证。 |
| 目标架构 | **仅 Apple Silicon(darwin-arm64),未签名 dev 构建** | 通用二进制(Intel)与签名属后续阶段。 |

---

## 3. 架构:四块 + 一条 stdout 握手

```
┌─ macOS .app ─────────────────────────────────────────────┐
│  Tauri host (Rust, 极薄)                                   │
│   · 启动时 spawn sidecar,从其 stdout 读 "PORT=<n>"          │
│   · 把端口存进 managed state,暴露 engine_url 命令给 webview │
│   · 把 CLI 资源路径经 env(ROGUENT_CLI_PATH)传给 sidecar     │
│                                                            │
│  ├─ WKWebView ── dist/(Vite 构建的 React19+Pixi 前端)       │
│  │     连 ws://127.0.0.1:<随机端口>                          │
│  │                ▲ WS(事件协议、reducer、渲染全不变)        │
│  ├─ sidecar ──── roguent-engine(bun build --compile 的二进制)│
│  │     绑 127.0.0.1:0(临时端口)→ 打印 PORT=<n> → 现有 engine │
│  │                │ spawn 子进程                             │
│  └─ resource ─── claude(218MB CLI,SDK 经 pathToClaudeCode-  │
│                   Executable 指过来)                         │
└────────────────────────────────────────────────────────────┘
```

**`src/engine`、`src/web`、`src/shared` 的业务逻辑基本不动**——这是本阶段的核心约束。改动集中在两处接缝(「端口怎么来」「CLI 路径怎么来」)+ 新增 `src-tauri/` 与构建脚本。

### 3.1 各单元职责(可独立理解、独立测试)

- **Tauri host(Rust,薄)**:做什么 = 开窗、spawn sidecar、从 stdout 抓端口、暴露 `engine_url` 命令、解析 CLI 资源路径并经 env 传给 sidecar;依赖 = `tauri`、`tauri-plugin-shell`;接口 = `engine_url() -> String` 命令 + spawn 时注入的 `ROGUENT_CLI_PATH` env。逻辑刻意保持薄,核心仍在 TS 层。
- **sidecar(现有 Bun engine)**:做什么 = 不变(SessionManager / Driver / WsGateway / replay);唯一变化 = 端口来源与 CLI 路径来源(见 §5)。
- **webview(现有前端)**:做什么 = 不变(store / room / overworld / hud);唯一变化 = WS URL 多一个来源(见 §5)。
- **CLI 资源**:做什么 = 被 SDK spawn 的 Claude Code 真身;依赖 = 本机订阅登录态;接口 = 一个可执行文件路径。

---

## 4. 仓库与构建结构(新增,不挪现有)

```
src/                      ← 完全不动(engine / web / shared)
src-tauri/
  tauri.conf.json         externalBin + resources + frontendDist 指向 ../dist
  Cargo.toml
  src/main.rs (+lib.rs)   薄:spawn sidecar、解析 PORT 行、engine_url 命令、解析 CLI 资源路径
  capabilities/default.json   shell:allow-execute { name:"binaries/roguent-engine", sidecar:true, args:true }
  binaries/               构建产物(gitignore):roguent-engine-aarch64-apple-darwin
  resources/              构建产物(gitignore):claude
scripts/
  build-sidecar.ts        bun build --compile src/engine/server.ts → binaries/roguent-engine-<triple>
  stage-cli.ts            拷 node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude → resources/claude
```

### 4.1 `package.json` 脚本

- **新增** `dev:app` = `tauri dev`(`beforeDevCommand` 起 `dev:web`,`devUrl` 指 `http://localhost:5173`;sidecar 由 Rust 启动 —— 见 §4.3 dev 模式说明)。
- **新增** `build:app` = `bun run build`(vite → dist/)→ `bun scripts/build-sidecar.ts` → `bun scripts/stage-cli.ts` → `tauri build`。
- **保留不变**:`dev:engine` / `dev:web` / `build` / `test` / `check` —— 纯浏览器快迭代完全不受影响。

### 4.2 `tauri.conf.json` 要点

- `build.frontendDist: "../dist"`、`build.devUrl: "http://localhost:5173"`、`build.beforeDevCommand: "bun run dev:web"`、`build.beforeBuildCommand: "bun run build"`。
- `bundle.externalBin: ["binaries/roguent-engine"]`、`bundle.resources: ["resources/claude"]`。
- `bundle.targets`: 本阶段 `all`——产出 `.app` 与未签名 `.dmg`(`.dmg` 仅作本地分发雏形;签名 / 公证 / 正式分发见非目标)。

### 4.3 两种 dev 模式(并存)

1. **浏览器快迭代(现有,不变)**:`bun run dev:engine` + `bun run dev:web`,前端连固定 `ws://localhost:8787`。逻辑迭代用这个最快。
2. **原生壳验证**:`bun run dev:app`。注意 `tauri dev` 仍需 sidecar 二进制存在——故 `dev:app` 前需先跑一次 `build-sidecar`(可在文档/脚本里串成 `bun scripts/build-sidecar.ts && tauri dev`)。编译较慢,只在需要验证原生行为(随机端口、Tauri 壳、打包后渲染)时用。

---

## 5. 数据流:两处接缝的精确改动

### 5.1 端口下行(engine → Tauri → webview)

- `src/engine/server.ts`:把 `Number(process.env.ROGUENT_PORT ?? 8787)` 改为——`ROGUENT_PORT` 显式设置时用之;否则绑端口 `0`(临时端口)。`WebSocketServer` listen 后取 `wss.address().port`,`console.log("PORT=" + port)` 到 stdout。LIVE 与 REPLAY 两条路径都打印。
- **Rust host**:spawn sidecar 后异步读 `CommandEvent::Stdout`,正则匹配 `^PORT=(\d+)$`,把端口写进 managed state(`Mutex<Option<u16>>` 或一次性 channel)。
- **前端**:新增 `resolveEngineUrl()`:
  - Tauri 环境(`window.__TAURI__` 存在)→ `await invoke("engine_url")` 得 `ws://127.0.0.1:<port>`;端口未就绪时 Rust 返回错误/pending,前端重试。
  - 纯浏览器(无 Tauri)→ 回落 `ws://localhost:8787`。
  - 结果喂给现有 `connectRoom(url)`。**`ws-client.ts` 仅多一个 URL 来源;WS 连接/重连/命令缓冲逻辑全不动。**

### 5.2 CLI 路径(Tauri → engine)

- **Rust host**:用 `app.path().resource_dir()` 解析出 `resources/claude` 的绝对路径,spawn sidecar 时经 env `ROGUENT_CLI_PATH` 注入。
- `src/engine/driver.ts`:`options` 增加 `pathToClaudeCodeExecutable: process.env.ROGUENT_CLI_PATH || undefined`。dev(无此 env)→ `undefined` → SDK 回落 node_modules 默认 CLI。**`stripSubscriptionEnv` / `usesApiKey` 等订阅逻辑不动。**

---

## 6. 错误处理

- **sidecar 崩溃 / 端口绑定失败**:Tauri 捕获非零退出(`CommandEvent::Terminated`),webview 进入"引擎不可用"提示态;现有 `ws-client` 的退避重连兜断连。
- **端口未就绪**:`engine_url` 命令在端口尚未从 stdout 解析到时返回错误,webview 退避重试 invoke。
- **CLI 找不到 / 未登录订阅**:沿用现有链路 —— SDK 抛错 → `normalize` 产 `session.error` → UI 已能显示。**应用内 `/login` 引导属后续阶段**(见 §8)。

---

## 7. 测试策略(零额度)

- **现有 `bun test` 全套单测 + `bun run check` 必须继续全绿**(逻辑没动,主要防接缝回归)。改 `server.ts` 端口逻辑、`driver.ts` 选项后要补/调对应单测。
- **回放打通整个 .app**:sidecar 保留 `--replay`,同样绑临时端口、打印 `PORT=`。于是能用 `build:app` 产出的 `.app` 直接以回放模式启动,**零额度端到端验证打包后窗口能渲染 + 播 fixture**。
- **Rust 单元**:从 stdout 行解析端口的纯函数(`parse_port_line`)单测。Rust 逻辑刻意保持极薄,其余靠现有 TS 测试覆盖。
- **手动验收清单**(打包后):①`build:app` 出 `.app`;②回放模式启动,确认窗口渲染 Pixi 且播放 fixture(对应风险点 1);③LIVE 模式起一个真会话,确认 SDK 经资源 CLI 正常 spawn 并出事件(对应风险点 2,会烧少量额度,放最后)。

---

## 8. 非目标(本阶段明确不做,留作后续独立子项目)

代码签名 / Apple 公证(notarization)/ `.dmg` 正式分发 / 自动更新 / 通用二进制(Intel + ARM)/ 应用内 `/login` 登录引导 / 授权·许可证·付费·首启引导。

本阶段默认只产 **Apple Silicon(darwin-arm64)的未签名 dev `.app`**,在开发者本机跑通即达标。

---

## 9. 风险与必验检查点

1. **WKWebView 跑 PixiJS v8**:macOS webview 支持 WebGL2(Pixi 默认会用),但不支持 WebGPU —— 需确认 Pixi 正常回落 WebGL 渲染、无黑屏。**第一关必验**(回放模式即可验,零额度)。
2. **`bun build --compile` 的 engine 能 spawn 外部 CLI**:本阶段不走 bunfs 内嵌(用不到 `extractFromBunfs`,更简单),但要验证编译后的二进制能正常起子进程且 `pathToClaudeCodeExecutable` 生效。**第二关必验**(LIVE 模式,放验收最后)。
3. **离线字体**:`index.html` 经 CDN 加载 Google 字体(Press Start 2P),打包后离线会失效 → 本阶段顺手把字体本地化(下载字体文件 + `@font-face`,去掉 CDN `<link>`)。
4. **预备条件**:dev 机需 Rust 工具链(rustup/cargo)+ Tauri CLI(`bun add -d @tauri-apps/cli` 或全局)。CLI 资源后续公证时需作为嵌套二进制一并签名(本阶段不涉及)。
5. **CLI 二进制自包含性**:需确认 `claude-agent-sdk-darwin-arm64/claude` 是单文件自包含(若依赖同目录兄弟文件,`stage-cli.ts` 改为整目录拷贝)。
6. **gitignore**:`src-tauri/binaries/`、`src-tauri/resources/`、`src-tauri/target/` 均为构建产物,须加入 `.gitignore`,不提交(尤其 218MB CLI)。

---

## 10. 研究来源

- SDK 运行时行为:本地 `node_modules/@anthropic-ai/claude-agent-sdk@0.3.161` 的 `sdk.mjs` / `extractFromBunfs.js` / `manifest.json`(2026-06-04 实读)。
- Tauri 2 sidecar / externalBin / shell 权限 / 资源:context7 `/websites/v2_tauri_app`(`v2.tauri.app/develop/sidecar`、`/learn/sidecar-nodejs`)。
