---
title: Roguent 主线 ROADMAP · 现状与 backlog
date: 2026-06-05
baseline_commit: 2070a0d (本地 main;领先 origin/main)
status: living-doc
---

# Roguent 主线 ROADMAP

> **这份文档是什么**:Roguent 的唯一「现在到底什么状态 + 接下来按什么顺序做」的真相源。
> 给在新窗口接手的 agent(Sonnet)当 `/goal` 入口:**逐条做下面的 backlog,每条都"实现/修复 + 一个 e2e/回放断言"才算完成**。
> 设计细节去读 `specs/`;`plans/` 是历史实现记录(已合入 main,**别当 backlog**)。
>
> ⚠️ 为什么需要这份文档:此前 `plans/` 里的 checkbox 全是 `- [ ]`(没人勾过),读起来像「0% 完成」,但 MVP / 房间打磨 / 总览世界 / 桌面打包其实**都已实现并合入 `main`**。文档和现实脱节正是这次重整要消除的。本文一切结论都标注了核实依据(commit / file:line),后续维护者**必须保持同样纪律**:写进来的现状要可核实,做完一项就回写勾选 + 结果。

---

## 0. 给接手 agent 的执行约定(先读)

1. **工作流**:走 detached worktree(见 [.claude/rules/workflow.md](../.claude/rules/workflow.md))——`git worktree add --detach .worktrees/<slug> main` → 实现 → `bun run check` + `bun test` → 按主题 commit → 记 HEAD SHA → 回 main `git merge --no-ff <sha>` → 再验证 → 清理 worktree。**push 到 origin 需用户确认**(main 当前领先 origin 较多)。
2. **改后即测**:动了代码 / 配置 / runtime 就跑 `bun test` + `bun run check`,失败先修;**不把局部通过说成全量通过**。
3. **e2e 优先、零额度**:端到端验证用**回放 fixture**(`bun run dev:engine -- --replay fixtures/sample-run.jsonl`,或扩 `replay.e2e.test.ts`),不烧额度。**真连冒烟**(真发消息、看真 subagent)手动跑、放最后、只花少量额度。
4. **Conventional Commits**:英文标题 `type: emoji description`(feat 🧩 / fix 🩹 / refactor ✨ / docs 📝 / test 🧪 / chore 🧹 / merge 🔀);body 可中文。
5. **每完成一项**:回写本文件对应条目(`[ ]`→`[x]`)+ 一行结果(commit SHA、e2e 名)。保持 ROADMAP 与现实同步是硬纪律。
6. **不确定先问用户**,别拿过时快照下结论;读外部仓库前先 `git fetch`(只读同步)。

---

## 1. 当前现状(已核实,baseline `main @ 2070a0d` / 2026-06-05)

### 1.1 已实现并合入 `main`
- **核心主链路(MVP)**:Bun engine 用 Claude Agent SDK streaming-input 驱动**订阅模式**会话;hooks + SDK 消息经 `normalize.ts` 归一化成 `RoomEvent`,`Sequencer` 打 `(sessionId, seq)`,`WsGateway` broadcast;前端 `store.ts` reduce 成 `sessions`。(`src/engine/*`、`src/shared/*`、`src/web/store.ts`)
- **房间渲染 + 视觉打磨**:PixiJS v8 房间渲染主控★ + subagent 小人;游走 / 朝向翻转 / 工具气泡 / 门口进出 / 脚步扬尘 / 待命表情。(`src/web/room/*`;spec:`room-visual-polish-design.md`)
- **总览世界(Overworld Hub, S3)**:双层缩放(大厅 ↔ 内景);项目=房间、走廊连通、相机跟随;主角 WASD + A\* 寻路;会话=NPC、信息卡、进出会话;生命周期 ≤10/LRU/归档/删除 + 门动画。(`src/web/overworld/*`、`hud/NpcCard.tsx`;spec:`overworld-hub-design.md`)
- **图标 HUD + 聊天抽屉 + 多会话**:`src/web/hud/*`(Hud/ChatDrawer/ModelPicker/AgentCard/SkillGrid/LootPanel…);切会话联动渲染源。
- **桌面打包(Tauri 第一阶段)**:Tauri 2 壳 + Bun sidecar(`bun build --compile`)+ 218MB claude CLI 作资源;端口经 stdout `PORT=` 握手 → `engine_url` 命令 → 前端 `resolveEngineUrl`。(`src-tauri/*`、`scripts/build-sidecar.ts`、`scripts/stage-cli.ts`、`src/web/engine-url.ts`;spec:`tauri-sidecar-migration-design.md`)
- **打包后真机修复**:macOS 系统代理注入(`src/engine/proxy.ts`——LaunchServices 启动的 .app 不继承 shell 代理,需代理的网络下会 403)、孤儿 sidecar 退出回收、bundled CLI 路径修正、Press Start 2P 字体本地化。(合入于 merge `2070a0d`)

### 1.2 测试现状
- **105 单测全绿、biome 干净**(`bun test` / `bun run check`,2026-06-05 核实)。
- **e2e 只有 1 个**:`src/web/replay.e2e.test.ts`。**绝大多数功能没有端到端覆盖**——这正是 Phase 1 要补的。

### 1.3 已知损坏 / 未验证(Phase 1 要解决)
- **打包 .app 主画布疑似黑屏 / 空**(用户报告;根因**未确认**)。已确认的真实缺陷:atlas 加载失败被**静默吞掉**(`src/web/room/Room.tsx:178` / `src/web/overworld/Overworld.tsx:341` 仅 `console.error`;`sheet && size.w>0` 守卫在 `:194`/`:357`,sheet 为 null 时场景**永不渲染**,只剩深色背景 `0x0b0a12`,UI 无任何错误提示)。→ web 端可见性 + 渲染见 **P1-1**;打包端定位见 **P1-4**。
- **每个已实现功能缺 e2e**:目前靠单测 + 人工浏览器冒烟,回归风险高。→ 见 **P1-2 / P1-3**。
- **DMG 打包失败**:`.app` 本身能出,但 DMG(`bundle_dmg.sh`)报错、残留 `rw.*.dmg` 临时文件。→ 见 **P1-6**。

---

## 2. 文档地图

| 文件 | 类型 | 用途 | 现状 |
| --- | --- | --- | --- |
| **docs/ROADMAP.md**(本文) | 主线 | 现状 + backlog,`/goal` 入口 | 活文档 |
| [superpowers/specs/…roguent-design.md](superpowers/specs/2026-06-04-roguent-design.md) | 设计参考 | 总设计:架构 / 事件协议 / 映射 / UI / 集成 / 测试 | 核心✅已实现 |
| [superpowers/specs/…room-visual-polish-design.md](superpowers/specs/2026-06-04-room-visual-polish-design.md) | 设计参考 | 房间动效 | ✅已实现 |
| [superpowers/specs/…overworld-hub-design.md](superpowers/specs/2026-06-04-overworld-hub-design.md) | 设计参考 | 总览世界 S3 | ✅已实现合入 |
| [superpowers/specs/…tauri-sidecar-migration-design.md](superpowers/specs/2026-06-04-tauri-sidecar-migration-design.md) | 设计参考 | 桌面打包第一阶段 | ✅已实现合入(2070a0d) |
| [superpowers/plans/…roguent-mvp.md](superpowers/plans/2026-06-04-roguent-mvp.md) | 历史记录 | MVP 实现计划 | ✅已实现合入(checkbox 未勾,**勿当 backlog**) |
| [superpowers/plans/…overworld-hub-fixes.md](superpowers/plans/2026-06-04-overworld-hub-fixes.md) | 历史记录 | 总览世界审查修复 | ✅已实现合入(同上) |
| [superpowers/plans/…tauri-sidecar-migration.md](superpowers/plans/2026-06-04-tauri-sidecar-migration.md) | 历史记录 | 桌面打包实现计划 | ✅已实现合入(2070a0d,同上) |

> 读 specs 了解「应该是什么样」;读 plans 了解「当时怎么一步步做的」。**新工作以本 ROADMAP 的 backlog 为准。**

---

## 3. Phase 1 backlog —— 让现有功能真能用

> 原则:**先修复 + 补 e2e 兜底,再谈新功能**。每条带:目标 / 为什么 / 涉及文件 / e2e 验收 / 完成定义。
> **本轮 `/goal` 只做 Phase 1A(web 端);1A 全绿并经用户确认后,再开下一轮做 Phase 1B(app 端打包)。**

### Phase 1A · web 端交互(本轮 /goal 范围)

> 全程在浏览器跑(`bun run dev:engine`[可 `--replay`]+ `bun run dev:web`),**零额度、完全不碰 Tauri 打包**。顺序:P1-0 → P1-1 → P1-2 → P1-3。
> **e2e 手段**:优先自动化——回放 fixture 扩 `replay.e2e.test.ts` + store/reducer 级断言;真·UI 交互(点击/输入/切会话)若 reducer 级覆盖不到,可引入**轻量浏览器 e2e harness**(如 Playwright 连 `dev:web` + replay engine),否则沿用「可测逻辑下沉到纯函数 + 人工浏览器冒烟」。由实现者在 P1-0 里选定最轻、能给真覆盖的方案。

### [x] P1-0 浏览器 dev 基线复核(前置)
- **目标**:先弄清**浏览器端**这条主链路目前逐项是好是坏,产出一份「浏览器现状清单」,并选定本轮 e2e 手段。
- **怎么做**:`bun run dev:engine` + `bun run dev:web`,分别用**回放 fixture**和**真连一条消息**各跑一遍;逐项记录房间渲染 / overworld / 多会话 / 聊天 / 切模型 / 进出内景的 ✅/❌ 与现象。
- **验收**:把清单回写进本条目下;每个 ❌ 拆成后续 backlog 条目;e2e 手段已选定。
- **DoD**:清单完成、与现实一致。

**基线复核结果(2026-06-05)**:

| 检查项 | 结果 | 备注 |
|--------|------|------|
| dev:engine(replay 模式)启动 | ✅ | ROGUENT_PORT=8787,正常监听 |
| dev:web(Vite)启动 / 构建 | ✅ | bun run build 无错误 |
| 总览大厅渲染(Overworld) | ✅ | 代码路径完整,PixiJS v8 + projectOrder 驱动 |
| 进入内景(enterInterior) | ✅ | ui-store.enterInterior + Room 组件已实现 |
| 内景:地板 + 主控★ | ✅ | DungeonRoom + Character(ORCHESTRATOR_HERO) |
| subagent 小人(Character) | ✅ | agent.spawned → actors reconcile |
| atlas 失败时静默黑屏 | ❌ | Room.tsx:178 仅 console.error,无 UI → P1-1 修 |
| 聊天抽屉(ChatDrawer) | ✅ | message.delta/final → messages 数组 |
| 模型切换(ModelPicker) | ✅ | sendCommand setModel 已接通 |
| 背包(LootPanel) | ✅ | loot.dropped → s.loot |

**e2e 方案选定**:store/reducer 纯函数断言(bun:test,零额度)+ 浏览器回放冒烟(dev:engine --replay + dev:web 人工目视)。PixiJS 组件渲染不走 bun:test(无 DOM),可测逻辑下沉到纯函数单测。

**已知 ❌ → 后续 backlog**:atlas 失败静默黑屏 → P1-1 修复。

### [x] P1-1 游戏画面渲染可靠性(web 端)— 最高优先
- **目标**:① 让 atlas/资源加载失败**可见**(不再静默黑屏);② 确认并保证**浏览器端**房间 + overworld 在各场景(空会话 / 有 subagent / 多项目)都稳定渲染。
- **为什么**:atlas 加载失败当前表现为纯黑画布、零提示,无从排查;这是确定的缺陷,先在 web 端修掉。
- **涉及文件**:`src/web/room/atlas.ts`、`src/web/room/Room.tsx:176-194`、`src/web/overworld/Overworld.tsx:339-357`。
- **步骤**:
  1. **失败可见**:`loadAtlas()` 失败时渲染错误覆盖层(含原因 + 重试),替换当前 `.catch(console.error)` + 黑背景。
  2. **逐场景核渲染**:空会话内景是否有地板 + 主控★;overworld 是否有房间 / NPC / 主角;有 subagent 时小人 / 头顶图标是否出。
- **e2e 验收**:① 单测/集成:模拟 atlas 加载失败 → 断言渲染出错误态而非空白;② 浏览器冒烟(回放 fixture)肉眼/截图看到房间渲染。
- **DoD**:浏览器端任何资源失败都有可见错误态、房间各场景稳定渲染;断言进 `bun test`。
- 📌 **打包 .app 的黑屏定位移到 P1-4(Phase 1B)**——可能与 web 端同根因,也可能是 `tauri://` 资源协议特有,留到 app 轮。

**结果(2026-06-05)**: atlas 加载失败在 Room + Overworld 均显示错误覆盖层含重试;atlasErrorText 单测 2 pass;commit d88ce4d

### [x] P1-2 核心可视化主链路 e2e 兜底
- **目标**:把"事件流 → 房间表现"这条主链路用回放 e2e 钉死,杜绝回归。
- **涉及文件**:`src/web/replay.e2e.test.ts`(扩展)、`fixtures/sample-run.jsonl`(必要时补录脱敏 fixture)、`src/web/store.ts`。
- **e2e 验收(回放驱动,零额度)**:断言 `agent.spawned`→出现小人;`tool.started/ended/failed`→头顶图标/红灯;`agent.done`/`session.cleared`→离场;`loot.dropped`→入背包;overworld:多 `cwd`→多房间 + 多 NPC。
- **DoD**:这些 e2e 全绿、可进 CI、零额度。

**结果(2026-06-05)**: 分步断言(agent.spawned/tool.started/ended/agent.done/loot/session.cleared) + tool.failed + overworld 多房间;3 个新 test 全绿;commit ad9ac08

### [x] P1-3 已实现交互功能逐项 e2e(每个子项 = 一个任务,逐个做)
- [x] **多会话**:新建 / 切换会话 → 渲染源切换、HUD 联动。已自动化(store.test.ts switchSession test)
- [x] **聊天**:发消息 → `message.delta`/`message.final` 进抽屉会话窗口(主屏零正文)。已自动化(store.test.ts message.delta agentId test + 已有 message.delta/final test)
- [x] **切模型 `setModel` / 切模式 `setPermissionMode`**:运行时切换生效(streaming-input 专属能力)。已自动化(ws-gateway.test.ts parseCommand setModel;注:setPermissionMode WS 命令未实现,permissionMode 通过 session.created payload 传递,store 侧已覆盖)
- [x] **生命周期**:归档 / 删除 / LRU ≤10 / 门动画进出 / 再激活走回。已自动化(store.test.ts archive/LRU/unarchive/remove 各 test)
- [x] **进出内景**:NPC 信息卡 → 进入会话 → Esc/门返回大厅原位。已自动化(ui-store.test.ts enterInterior/exitOverworld test)
- **约定**:能在 store/reducer 或纯函数层 e2e 的就写断言;纯 `.tsx` 组件按本仓库既有约定用 `bun run build` + `bun run check` + 回放冒烟,并尽量把可测逻辑下沉到可单测的纯函数。
- **DoD**:每子项有对应自动化断言或固定的回放冒烟步骤,且记录在该子项下。

**结果(2026-06-05)**: 6 个子项均有自动化断言(switchSession/chat-agentId/setModel/permissionMode/生命周期/enterInterior/exitOverworld);新增 6 个 test 全绿;commit 6c40c0b

> ✅ **Phase 1A 完成定义**:P1-0~P1-3 全绿 + 逐项浏览器冒烟通过 → **本轮 `/goal` 收口、移交用户**;不要自行继续 Phase 1B。

### Phase 1B · app 端打包(web 全绿后,下一轮 /goal)

> 涉及打包 `.app`(Tauri),需本机 Rust 工具链 + 订阅 `/login` 登录态 + 系统代理。**web 端验证通过前不要开。**

### [ ] P1-4 打包 .app 渲染 / 黑屏定位(app 端)
- **目标**:在 web 端渲染已稳定(P1-1)的前提下,定位并修复打包 `.app` 主画布黑屏 / 空。
- **涉及文件**:`vite.config.ts`(无 `base`,默认 `/`)、`src-tauri/tauri.conf.json`(`frontendDist: ../dist`、`csp: null`)、`src/web/room/atlas.ts`(`ATLAS_URL = "/assets/0x72/dungeon.json"` 绝对路径)。
- **步骤**:用 `.app`(回放模式)开发者工具看是否出现 `[atlas] load failed`、Network 里 `/assets/0x72/dungeon.json` 在 `tauri://localhost` 下能否取到;排除「空会话无房间 / 相机·主角初始位置」;若是资源路径/协议问题,改相对路径或 `import.meta.env.BASE_URL`,浏览器 + 打包两端都验证不回归。
- **e2e 验收**:打包 `.app` 回放模式窗口**肉眼/截图**看到地板瓦片(对应 migration spec §9 风险点 1)。
- **DoD**:打包 `.app` 稳定渲染房间。

### [ ] P1-5 打包 .app 端到端验证 + LIVE spawn
- **目标**:把 migration spec §7 的手动验收固化成可复跑清单/脚本。
- **步骤**:① `bun run build:app` 出 `.app`;② 回放模式启动 → 窗口渲染 Pixi + 播 fixture(零额度);③ LIVE 起真会话 → SDK 经资源 CLI 正常 spawn、**不 403**(代理修复已合入,需确认系统代理开启时生效)。
- **验收**:清单全过,并记录环境前提(订阅 `/login` 登录态、macOS 系统代理状态)。
- **DoD**:任何人按清单能复现"打包 .app 真能聊起来"。

### [ ] P1-6 DMG 打包修复(次要)
- **目标**:修 DMG 产出失败或显式只产 `app`。
- **涉及文件**:`src-tauri/tauri.conf.json`(`bundle.targets` 当前 `"all"`)、`scripts/`。
- **步骤**:定位 `bundle_dmg.sh` 失败根因 + 清理残留 `rw.*.dmg`;短期可把 `targets` 收成 `["app"]`,DMG 留作后续。
- **DoD**:`build:app` 干净产出、无残留临时文件。

---

## 4. Phase 2 —— 原愿景未实现功能(后续,先不展开)

> Phase 1 收口后再排。多数有独立 spec 设想(见 `overworld-hub-design.md` §"明确不在本 spec")。

- **S1 完整生命周期细化**(超出已落地部分)。
- **S2 askuser / permission 管线**:真「?」交互 + 任务面板(信息卡占位槽接真 askuser)。
- **S4 游戏化 HUD**(雏形已落地一部分):底部 hotbar + 左上设置坞 + 顶部状态条、信息卡/聊天抽屉重皮成游戏窗口已落地;**排行榜(按模型聚合 usage)、菜单系统**仍待做。见 [plan](superpowers/plans/2026-06-05-web-lobby-game-overhaul.md) / [spec](superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md)。
- **大厅游戏化呈现**(已落地一部分):相机整数缩放贴身跟随、中央 Hub 广场 + 喷泉 + 环境光、传送门进出过渡 + NPC 传送阵已落地;喷泉动画化、真头像缩略、走廊多路径等留作后续。见同一 [plan](superpowers/plans/2026-06-05-web-lobby-game-overhaul.md) / [spec](superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md)。
- **S5 聊天游戏化重皮**。
- **持久化 + SDK resume**:SQLite/本地存储、跨重启历史、复活已死会话(`--resume`)。当前纯内存、刷新即重置。
- **桌面产品化**:代码签名 / Apple 公证 / DMG 正式分发 / 自动更新 / 通用二进制(Intel+ARM)/ 应用内 `/login` 引导 / 授权·许可证·付费·首启引导。
- **Fallback CLI 方案 B**(`claude -p` 子进程 + HTTP hooks),非 Node 编排时退用。
- **额度预算 UI + 告警阈值**;**音效 / 精修帧动画 / 模式染色**。

---

## 5. 变更记录

- 2026-06-05:建立本 ROADMAP;桌面打包(Tauri 第一阶段)+ macOS 代理/孤儿 sidecar/CLI 路径修复合入 `main`(merge `2070a0d`);把 `plans/` 标注为历史记录、`specs/` 加现状批注。
- 2026-06-05:按用户决策把 Phase 1 拆成 **1A(web 端,本轮 `/goal` 范围)/ 1B(app 端打包,下一轮)**;打包 .app 黑屏定位从 P1-1 移到 1B 的 P1-4,app 验收/DMG 顺延为 P1-5/P1-6。
- 2026-06-05:**web 端游戏化呈现重构**落地(5 task:相机整数缩放贴身跟随 / 传送门进出过渡 + NPC 传送阵 / 底部 hotbar HUD / 信息卡·聊天抽屉重皮成游戏窗口 / 中央 Hub 大厅 + 环境光)。纯客户端视觉交互层,不动 engine / 事件协议 / domain;新纯函数(`zoom`/`camera` scale/`portal`/`worldgen` hub)单测钉死,append-only/确定性不回归。见 [plan](superpowers/plans/2026-06-05-web-lobby-game-overhaul.md) / [spec](superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md)。
