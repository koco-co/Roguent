---
title: Roguent 主线 ROADMAP · 现状与 backlog
date: 2026-06-12
baseline_commit: 本地 main(领先 origin/main);full-prototype-integration(merge 53816d9,Tasks 0-67)+ 设计稿 v2 增量(§3.6,2026-06-12)均已合入;此前的 Roguent.html T0–T5 / 聊天窗口大改 / 真实数据·缩放 亦在内
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

## 1. 当前现状(已核实,baseline:`main` 经 full-prototype-integration(merge `53816d9`,Tasks 0-67)+ 设计稿 v2 增量(§3.6,2026-06-12)/ 2026-06-12)

### 1.1 已实现并合入 `main`
- **核心主链路(MVP)**:Bun engine 用 Claude Agent SDK streaming-input 驱动**订阅模式**会话;hooks + SDK 消息经 `normalize.ts` 归一化成 `RoomEvent`,`Sequencer` 打 `(sessionId, seq)`,`WsGateway` broadcast;前端 `store.ts` reduce 成 `sessions`。(`src/engine/*`、`src/shared/*`、`src/web/store.ts`)
- **房间渲染 + 视觉打磨**:PixiJS v8 房间渲染主控★ + subagent 小人;游走 / 朝向翻转 / 工具气泡 / 门口进出 / 脚步扬尘 / 待命表情。(`src/web/room/*`;spec:`room-visual-polish-design.md`)
- **总览大厅 + 内景双层(Hub, S3)**:双层缩放(大厅 ↔ 内景);DOM 大厅(`lobby/HubPlaza.tsx`)= 可操控 avatar(WASD + 点击直线移动)+ 装饰广场 + 黑猫/漫步小人 + 交互结构(走到结构按 E:中央任务台→SessionGrid 进会话 / 商店 / 排行榜 / 设置);会话生命周期 ≤10/LRU/归档/删除 + 进出内景门过场(`overworld/PortalTransition.tsx`)。⚠️ 原 PixiJS Overworld 的「项目=房间走廊连通、主角 A\* 寻路、会话=NPC 走到信息卡进出」模型已被 **web-lobby-overhaul 重构取代**(无 A\* 寻路;会话改经任务台 SessionGrid 进入,而非走到 NPC);该旧模型见历史 spec `overworld-hub-design.md`。(`src/web/lobby/*`、`overworld/portal.ts`、`hud/NpcCard.tsx`=会话信息卡 Modal)
- **图标 HUD + 聊天抽屉 + 多会话**:`src/web/hud/*`(Hud/ChatDrawer/ModelPicker/AgentCard/SkillGrid/LootPanel…);切会话联动渲染源。
- **桌面打包(Tauri 第一阶段)**:Tauri 2 壳 + Bun sidecar(`bun build --compile`)+ 218MB claude CLI 作资源;端口经 stdout `PORT=` 握手 → `engine_url` 命令 → 前端 `resolveEngineUrl`。(`src-tauri/*`、`scripts/build-sidecar.ts`、`scripts/stage-cli.ts`、`src/web/engine-url.ts`;spec:`tauri-sidecar-migration-design.md`)
- **打包后真机修复**:macOS 系统代理注入(`src/engine/proxy.ts`——LaunchServices 启动的 .app 不继承 shell 代理,需代理的网络下会 403)、孤儿 sidecar 退出回收、bundled CLI 路径修正、Press Start 2P 字体本地化。(合入于 merge `2070a0d`)
- **Claude Design `Roguent.html` 像素原型落地(T0–T5,2026-06-06)**:把设计稿的《元气骑士》暖木 RPG 观感与全套面板落到真实 React/Pixi/Zustand 代码,**严格按原型样式(含字体)**,真/假分明(真数据面板不造假、mock 面板显著标注)。详见 §3.5「设计落地状态」。涉及 `src/web/styles.css`(暖木 token + 全部面板样式)、`src/web/hud/*`(图标注册表 + 12+ 面板)、`src/web/overworld/*`(漩涡过场 / 中央任务台 / 角色头像)、`src/web/settings-store.ts`。
- **聊天窗口大改(chat window overhaul,2026-06-07,merge `e427f0d`)**:聊天从"消息数组"升级为**统一 timeline**(`domain.ts` `TimelineItem` 判别联合 message/thinking/tool/prompt;`store.ts` 由 `Session.messages` 迁到 `timeline`);新增事件类型 `thinking.delta/final`、`prompt.requested/resolved`([events.ts](../src/shared/events.ts));**交互式权限/AskUserQuestion** 全链路打通——`Driver.canUseTool` + 网关 `respondPermission`/`respondQuestion`/`setPermissionMode`(commits `fd2b8f2`/`9493259`/`55653d2`),`normalize.ts` 把 AskUserQuestion 特判成 `prompt.requested`;前端 `ThinkingBlock`/`ToolCard`/`PromptCard`/`TimelineItem`/`SlashMenu`/`MessageBubble`(copy + 时间戳)+ stop 按钮 + textarea 自适应高度 + Shift+Enter 换行 + slash 补全菜单。**Codex 仍为占位**(引擎只跑 Claude)。涉及 [src/web/hud/*](../src/web/hud)(ChatDrawer/TimelineItem/MessageBubble/ThinkingBlock/ToolCard/PromptCard/SlashMenu)、`src/engine/{driver,normalize,ws-gateway}.ts`、`src/web/store.ts`。设计/计划见 [chat-window-overhaul-design](superpowers/specs/2026-06-07-chat-window-overhaul-design.md) / [plan](superpowers/plans/2026-06-07-chat-window-overhaul.md)。
- **零散修复(2026-06-06~07)**:SessionBanner 可点开 SessionGrid(`db0076d`);Bug #B/A/G/D — ESC 链 / 空态 / 模型继承 / loot 守卫(`c94b37e`);setModel 后广播 model 变更事件(`fbb62dc`)。

### 1.2 测试现状
- **723 单测全绿(106 文件)、`bun run check` 干净(318 文件;`Prototype/` 已入 biome ignore)、`bunx tsc --noEmit` 干净、`typecheck:e2e` 干净、`bun run build` 通过**(2026-06-12 核实,设计稿 v2 增量合入后;`bun run check`/build 不做类型检查,tsc 须单独跑)。
- e2e:回放驱动(`replay.e2e.test.ts` 扩展)+ store/reducer 级断言;聚合 / 映射 / 格式化 / 图标 / 阈值等可测逻辑全部下沉纯函数单测。UI 组件按约定走 `tsc + check + 回放/preview 冒烟`。

### 1.3 已知损坏 / 未验证(Phase 1 要解决)
- **打包 .app 主画布疑似黑屏 / 空**(用户报告;根因**未确认**)。→ 打包端定位见 **P1-4**。
  - ⚠️ **历史线索更新(2026-06-06 核实)**:此前记的「atlas 静默吞掉黑屏」根因已变,旧文件引用过时。① 内景 atlas 失败**已由 P1-1 修复**——`src/web/room/Room.tsx:182-193` 现 `console.error` + `setAtlasError`,并在 `:218` 渲染错误覆盖层,不再静默。② 原 PixiJS `src/web/overworld/Overworld.tsx`(旧引用 `:341/:357`)**已不存在**——web-lobby-overhaul 后大厅改为 DOM 渲染的 `src/web/lobby/HubPlaza.tsx` + `src/web/lobby/atlas-dom.ts`(DOM `background-image`,非 PixiJS spritesheet;atlas 失败在 `atlas-dom.ts:71` 静默回退、不致黑屏)。③ 故仍存在的 .app 黑屏应按 **P1-4** 聚焦资源路径 / `tauri://` 协议(`src/web/room/atlas.ts` 的 `ATLAS_URL` 绝对路径),而非已移除的 Overworld 组件。
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
| [superpowers/specs/…chat-window-overhaul-design.md](superpowers/specs/2026-06-07-chat-window-overhaul-design.md) | 设计参考 | 聊天窗口大改(timeline / 交互式权限 / thinking·tool·prompt 卡) | ✅已实现合入(`e427f0d`) |
| [superpowers/specs/…full-prototype-integration-design.md](superpowers/specs/2026-06-07-roguent-full-prototype-integration-design.md) | 设计参考 | 全原型落地:Claude/Codex 双 runtime + IM/订阅/定时/经济 | ✅已实现合入(merge `53816d9`,Tasks 0-67) |
| [superpowers/plans/…full-prototype-integration.md](superpowers/plans/2026-06-07-roguent-full-prototype-integration.md) | 历史记录 | 上者的 67-task 落地计划(已审查修订) | ✅已实现合入(merge `53816d9`,checkbox 未勾,**勿当 backlog**) |
| [superpowers/plans/…design-delta-v2.md](superpowers/plans/2026-06-11-design-delta-v2.md) | 历史记录 | 设计稿 v2 增量(`Roguent.html` 2026-06-11 修订 vs 06-07)13-task 落地 | ✅已实现合入(见 §3.6) |

> 读 specs 了解「应该是什么样」;读 plans 了解「当时怎么一步步做的」。**新工作以本 ROADMAP 的 backlog 为准。**
> 注:`specs/`、`plans/` 下另有 06-05/06-06 的若干文档(web-lobby-overhaul / usage-and-limits / import-local-sessions / real-data-and-stage-scaling / product-prds / chat-right-drawer),均已实现合入;未逐条列入上表,需要时按文件名查。

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
- **涉及文件**:`src/web/room/atlas.ts`、`src/web/room/Room.tsx:176-194`、`src/web/overworld/Overworld.tsx:339-357`(历史:后者已于 web-lobby-overhaul 重构为 DOM 渲染的 `src/web/lobby/HubPlaza.tsx`,此引用仅存档)。
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
- [x] **切模型 `setModel` / 切模式 `setPermissionMode`**:运行时切换生效(streaming-input 专属能力)。已自动化(ws-gateway.test.ts parseCommand setModel/setPermissionMode;Driver 响应 WS 命令,实时切换权限模式,store 侧联动覆盖)
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

## 3.5 Claude Design `Roguent.html` 落地状态(T0–T5,2026-06-06)

> 用户用 Claude Design 把游戏化 UI 做成高完成度像素原型(`Roguent.html` + 一套 jsx/css),要求**功能及样式严格按原型来,包括字体**。本轮按 plan `fetch-this-design-file-frolicking-tome.md`(T0–T5)落地;实现走 subagent-driven-development(逐任务派子代理 → 复核 → 提交),非 Workflow 批量。
>
> **真/假分明铁律**:接真 store 数据的面板**一个功能不丢、不造假、不挂 mock banner**;引擎暂无数据的面板用**显著标注的 mock**(`.task-mock-banner` + 独立 `*-data.ts`/`*-schema.ts` 顶部注释「全为 mock,引擎不消费」)。Codex 一律做**视觉占位**(引擎只跑 Claude)。

| 阶段 | 内容 | 真 / 占位 |
| --- | --- | --- |
| **T0** 视觉系统 | 暖木 RPG token(重指向旧名)+ 像素 chrome 类 + 自绘像素 SVG 图标注册表(`icons.tsx`,~33 个)+ 工具/loot/状态→图标名映射 + 自托管 Fusion Pixel 中文字体(`public/fonts/`,**不走 CDN**) | 全真(基础设施) |
| **T1** 壳 | settings-store(accent/theme/motion/density/cjkPixel/avatarHero,持久化)+ 复用 `Modal` + `activePanel` 单一路由 | 真 |
| **T2** 内景 HUD | LimitBars 三条(5h/CTX/周)· RosterCard 在岗 · SessionBanner · Currency · ButtonDock · Hotbar · Minimap · TaskWindow | 真(gems 标注 mock;TaskWindow/Tasks **已接真(Session.todos / TodoWrite)**;Currency「完成数」接真) |
| **T3** 面板 | NpcCard · Skills(slash 真)· Leaderboard(按会话真 + 按模型/runtime 聚合)· Backpack(loot 真)· Chat(居中 Modal,会话/消息/新建/归档全真)· Model 真 · Import(localSessions 真)· Account(limits 真)· SystemMenu · ErrorOverlay · **漩涡过场**(T3.13)· Tasks/Settings/Shop(整面板 mock 标注) | 真假分明 |
| **T4** 大厅 | SessionGrid(接 `store.sessions`)+ **Pixi 中央任务台 E 键**触发 · CharacterSelect → `avatarHero` 驱动玩家头像 · 空态(召唤小队→真 newSession)+ 错误态(接真 WS 连接状态、去抖、真重连) | 真(Codex tab 占位) |
| **T5** 收尾 | 删 legacy ui-store 布尔/`toggle`/SkillGrid/`error` PanelId/孤儿 `--bg-*` token/遗留 `⚠`emoji · 补 roleToHero/HERO_POOL 测试 · 本节 | — |

**未尽 / 已知取舍**:
- **大厅 UX**:保留现有 Pixi `Overworld` 作唯一可玩 hub(已有 WASD+A\*、传送门、项目房、会话 NPC);只从原型采纳 SessionGrid(DOM 面板)、角色选择、空/错态;**未**在 DOM 里重建原型的走动大厅。
- **Codex**:徽标 / runtime 筛选片 / 设置页签 / SessionGrid 的 Codex tab 全为视觉占位(引擎只跑 Claude)。
- **会话级 askuser 角标**:无真数据,SessionGrid/NpcCard 只做 error 角标,不造 askuser。
- **Tasks 已接真(当前会话 TodoWrite)**;**仅信箱**仍为标注 mock(引擎无 inter-agent 信箱)。**mock 面板**(Settings·CONFIG / 装饰 Shop / gems):引擎无对应能力,整面板 mock + banner;待引擎补宝石经济/askuser/任务清单后再接真。注:原混合 Shop 已在 §3.6 拆分为装饰 Shop(仍 mock)+ Market(已随 MARKET-real Task 8–9 接真,见 §3.6)。
- 全 UI 按固定 1920×1080 逻辑舞台等比缩放贴屏(`src/web/stage-scale.ts` + App `#viewport/#stage`),修复小屏人物过大。
- **冷蓝死 token**:已在 T0.1 重指向时消除(旧名改暖木值且仍被 `.px-*` 引用,非死);§9 暖木调色板里 `--hp/--shield/--mp/--purple` 等带语义注释的 token 暂未消费但保留为设计调色板。

---

## 3.6 设计稿 v2 增量落地(`Roguent.html` 2026-06-11 修订,2026-06-12)

> 用户用 Claude Design 更新了 handoff(2026-06-11 版),相对已合入的 06-07 版有一批 UI 增量。本轮按 plan [design-delta-v2](superpowers/plans/2026-06-11-design-delta-v2.md)(13 task,T0–T12)落地;走 subagent-driven-development(每 task:实现子代理 → 规格复核 → 质量复核 → 提交),非 Workflow 批量。**真/假分明铁律**同 §3.5:有引擎数据源的接真,无源的显著标注 mock,绝不造数据。

| 增量块 | 内容 | 真 / 假边界 |
| --- | --- | --- |
| **全局 i18n** | 中→英字典翻译器(`src/web/i18n.ts`:`DICT`/`translate`/`useT`/`useTL`)+ `settings.uiLang`(持久化)+ HUD「中\|EN」`LangToggle`(真实入口,Settings 是 mock 面板故不在其内造 radio);HUD chrome + 面板组全量接 `useT()` | **真**(界面文案双语切换)。产品/游戏术语(Claude/Codex/askuser/compact/Token/Context/Usage/Weekly/模型名/slash/runtime/MCP/diff/PR/CI)刻意**不入典**,两语保持英文 |
| **场景皮肤 holo** | `settings.skin`(dungeon 默认 / holo)+ `SkinSwitch` 控件 + holo 全套视觉:PixiJS 全息蓝甲板地板(`room/holo.ts` 确定性 hash + 节点)、青玻璃面板 / 扫描线 overlay / 大厅深蓝滤镜(`.skin-holo` CSS 段);holo 强制青 accent | **真**(设置驱动,持久化)。取舍:单张 canvas 不加 CSS 滤镜(避免二次染色),小人不染色保可读性 |
| **内景指挥大屏** | `BrowserScreen`(`browser-screen-view.ts` 纯函数从 `Session.timeline` 取最近 tool 条目):tab=会话标题 / url=tool inputSummary 截断 / caption=agent role · toolName / LIVE·IDLE=最近 tool running 与否 | **真**(接真 tool 活动流)。设计稿的「假浏览器轮播」无引擎数据源 → 改为真实工具流;线框页/扫描线/光标为纯装饰(不声称数据),无 tool 时显 IDLE 不造数据 |
| **Shop 拆分 + Market 接真** | 旧混合 Shop → `Market`(插件市场,独立面板)+ `Shop`(纯装饰商店)+ 挂载**真实** `GachaPanel`(此前从未挂载),`gacha` 路由由 Shop 摘除交 GachaPanel 接管;**Market 后续接真**(Task 8–9):展示真实本机插件目录(~226 条,来自 `~/.claude/plugins` 5 文件合并 + `claude plugin list`)、真实 install/enable/disable/uninstall(经 `claude plugin` CLI 串行执行);评分列无真实源已删;插件变更对新建会话生效;`SHOP_PLUGINS`/`SHOP_CATS`/`ShopPlugin` mock 已退役 | **Market 全接真**(本机插件目录 + CLI 操作);Shop gem 余额 / 已拥有**接真**(沿用现状),购买按钮仍 mock;**GachaPanel 真**(真 WS command) |
| **SessionGrid v2** | 多级过滤(runtime / 项目多选 / 模型多选 / 仅活跃,带计数 FChip + 清除筛选)、状态优先排序、inactive 置灰、`xm ago` 相对时间、空匹配态、导入卡条件显示;纯函数下沉 `session-grid-view.ts`(`agoLabel`/`sortSessions`/`applySessionFilters`/`hasAnyFilter`)单测钉死 | **全接真**(sessions/lastActiveAt/runtime/model)。**修掉现存 bug**:卡片 runtime chip 硬编码「Claude」→ 按 `s.runtime` 渲染。无 askuser 状态(本仓库 busy\|idle\|done\|error),「活跃」=busy\|error |
| **Hotbar / Dock 重排** | Hotbar 左组工作流(任务/聊天/技能/插件市场/模型/导入)右组资产(背包/装饰商店/排行/成就);ButtonDock 通知→身份→系统(设置带 `dock-sys` 分隔),删 pause 槽(纯 menu 别名,无真实逻辑);大厅新增 market 摊位(→Market 面板)+ 结构物/装饰小人坐标对齐设计 `lobby.jsx` | **真**(路由 / 交互);坐标以设计源 `lobby.jsx` 为权威(plan 的 delta 列表不全处据设计源补全:leaderboard→(362,452)、board→(360,742)) |
| **固定文案改名** | LimitBars `CTX→Context`、`WEEK→Weekly`;NpcCard `上下文→Context`;Account `5h 限额→5h`、`周限额→Weekly`(与语言无关,直接改字面量) | 真 |

**门禁**:723 单测 + `tsc` + `bun run check` + `typecheck:e2e` + `bun run build` 全绿(`check` 此前因设计稿 `Prototype/` bundle 被 biome lint 恒红,本轮把 `Prototype` 加入 `biome.json` 的 `files.ignore` 修正,使门禁如实反映真实 `src`)。

**明确不做(无数据源 / 范围控制)**:events 登录活动弹窗 / dailyRewards(引擎无源,dock「活动」槽用真实公告板 board 占位,不造签到)· git 状态横幅(无 git 状态事件,SessionBanner 维持现状只接 i18n)· PlayerCard(LimitBars+RosterCard 已承载同信息)· Codex 真接入(维持视觉占位)· 设计 Settings 面板的 uiLanguage/uiFont radio(LangToggle 是真实入口,不在 mock 面板造真控件)。

**i18n 全量收口(sweep C,2026-06-12)**:合入后 preview EN 复验发现一批**未纳入 plan sweep A/B 文件清单**的次要组件仍漏中文,已补 sweep C 全部接通:C-1 = 氛围控件(辉光/雨幕/粒子/声音)、HeroSelect 角色名+提示、聊天内部(ChatHeader/Composer/Timeline/PromptCard/MessageBubble/ThinkingBlock)、pairing(PairingQr/BindingList/PairingPanel 渠道名)、PortalTransition、CatPet(SVG title);C-2 = `settings-schema.ts` ~88 条字段 label/tip/选项/组名(Settings mock 面板)在 `Settings.tsx` 渲染处接 `t()` + 全量入 DICT(schema 数据本身不改;hook `cmd` 等命令数据按设计不译)。至此 EN 模式无遗漏;DICT ~436 键;leak 脚本交叉核对 0 泄漏。

**已知小取舍**:大厅若干结构物(tower/shop x/gacha/doors)相对设计 `lobby.jsx` 的坐标偏差为**早于本轮的既存**,不在本轮 delta 范围,未动。

**内景对齐设计稿(4 项,2026-06-12)**:design-delta-v2 合入后,用户对照设计原型 `Prototype/roguent/project/roguent/` 逐项核对内景,补齐四处视觉/信息密度差异(plan [interior-design-parity](superpowers/plans/2026-06-12-interior-design-parity.md);走 subagent-driven-development:每项 实现子代理 → 规格复核 → 质量复核 → 提交)。**真/假分明**同前:

- **#2 抽屉「小队」头像行**(`ChatTeamStrip`,插入 `ChatDrawer` 配置条下方):**全接真** —— 队员头像/状态点来自 `session.agents`(role/status/kind),lead 用 `ORCHESTRATOR_HERO` 否则 `roleToHero`,复用 `HeroPortrait`;引擎不产出的 `st-askuser/st-todo` 等状态色不留死类(同 RosterCard 处理)。
- **#3 消息作者「名 + role 徽」**(`MessageBubble`):**接真派生** —— 名 = role 的 `titleCase`(抽到 `src/shared/strings.ts` 复用),role 徽 = `AgentKind`(orchestrator→主控/subagent→分身,DICT EN: Lead/Subagent);user 消息无徽。
- **#1 左上英雄卡 + PROFILE 面板**(`PlayerCard` 替换 `LimitBars`;`Account`→PROFILE):用户选「照搬设计原稿」。**真** = Context XP 条接 `session.context.utilization`(内景 gate、阈值 `<60/≤85/else` 着色)+ plan 名;**5h/Weekly 真实用量从常驻挪入点击打开的 PROFILE 面板**(`store.limits`,完整保留未弄丢)。**mock(三重标注:`MOCK_*` 命名 + 代码注释 + 面板 faint)** = Lv 47 / 名 `指挥官 Orc` / 句柄 `orc@roguent`(**不用真实 userEmail**);无 crown 资源故省略皇冠子节点。死代码 `LimitBars` 已删(其独有 `.limitbars/.lb-*` CSS 一并清,共享 `.barframe/.barfill` 保留)。
- **#4 房间 NPC 头顶名牌**(`Character.tsx` 加 `pixiText`):**接真** —— 文案 `npcLabel(role,isLead)`(role `titleCase`,lead 带金色 `★`),挂在 `flipRef` **外**故小人翻转时文字不镜像;复用 `Room.tsx` 既有 `extend({…,Text})` 不重复注册;y=-38 在头顶、不挡 ToolBubble/Emote。

门禁:`bun test` 744 pass + `bunx tsc --noEmit` 0 + `bun run check` 0 + `bun run build` 成功。涉及 `src/web/hud/{ChatTeamStrip,PlayerCard,Account,MessageBubble,ChatDrawer,Hud}.tsx`、`src/web/room/{Character,Room}.tsx`、`src/shared/strings.ts`、`src/web/styles.css`、`src/web/i18n.ts`。

---

## 4. Phase 2 —— 原愿景未实现功能(后续,先不展开)

> Phase 1 收口后再排。多数有独立 spec 设想(见 `overworld-hub-design.md` §"明确不在本 spec")。

- **S1 完整生命周期细化**(超出已落地部分)。
- **S2 askuser / permission 管线**:真「?」交互 + 任务面板(信息卡占位槽接真 askuser)。
- **S4 游戏化 HUD**:底部 hotbar + 设置坞 + 状态条、信息卡/聊天重皮、**排行榜(按模型/runtime 聚合)、系统/暂停菜单**均已随设计落地完成(见 §3.5 T2/T3)。剩:真实徽标/角标数据(hotbar badge 等待引擎补)。
- **大厅游戏化呈现**:相机整数缩放跟随、中央 Hub 广场 + 喷泉 + 环境光、传送门进出过渡 + NPC 传送阵已落地;设计落地又补**蓝色粒子漩涡过场、中央任务台(E 键开 SessionGrid)、角色选择头像、空/错态屏**(§3.5 T3.13/T4)。剩:喷泉动画化已有、走廊多路径等留作后续。
- **S5 聊天游戏化重皮**:Chat 已重皮为居中游戏 Modal(§3.5 T3.8);深度游戏化(气泡特效等)留作后续。
- **持久化 + SDK resume**:SQLite/本地存储、跨重启历史、复活已死会话(`--resume`)。当前纯内存、刷新即重置。
- **桌面产品化**:代码签名 / Apple 公证 / DMG 正式分发 / 自动更新 / 通用二进制(Intel+ARM)/ 应用内 `/login` 引导 / 授权·许可证·付费·首启引导。
- **Fallback CLI 方案 B**(`claude -p` 子进程 + HTTP hooks),非 Node 编排时退用。
- **额度预算 UI + 告警阈值**;**音效 / 精修帧动画 / 模式染色**。

---

## 5. 变更记录

- 2026-06-05:建立本 ROADMAP;桌面打包(Tauri 第一阶段)+ macOS 代理/孤儿 sidecar/CLI 路径修复合入 `main`(merge `2070a0d`);把 `plans/` 标注为历史记录、`specs/` 加现状批注。
- 2026-06-05:按用户决策把 Phase 1 拆成 **1A(web 端,本轮 `/goal` 范围)/ 1B(app 端打包,下一轮)**;打包 .app 黑屏定位从 P1-1 移到 1B 的 P1-4,app 验收/DMG 顺延为 P1-5/P1-6。
- 2026-06-05:**web 端游戏化呈现重构**落地(5 task:相机整数缩放贴身跟随 / 传送门进出过渡 + NPC 传送阵 / 底部 hotbar HUD / 信息卡·聊天抽屉重皮成游戏窗口 / 中央 Hub 大厅 + 环境光)。纯客户端视觉交互层,不动 engine / 事件协议 / domain;新纯函数(`zoom`/`camera` scale/`portal`/`worldgen` hub)单测钉死,append-only/确定性不回归。见 [plan](superpowers/plans/2026-06-05-web-lobby-game-overhaul.md) / [spec](superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md)。
- 2026-06-06:**Claude Design `Roguent.html` 像素原型落地**(T0–T5,严格按原型样式含字体,真/假分明)。暖木 token + 像素 chrome + 自绘 SVG 图标 + Fusion Pixel 中文字体;settings-store + Modal 路由;内景 HUD 全套;12+ 面板(排行榜聚合 / 账号 / 导入 / 模型 / 背包 / 聊天 Modal / 技能 / 系统菜单 / 漩涡过场,Tasks/Settings/Shop 为标注 mock);SessionGrid + Pixi 中央任务台 E 键 + 角色选择 → avatarHero + 空/错态(错误态接真 WS 连接状态 + 去抖 + 真重连);收尾删死代码/token/emoji + 补 roleToHero 测试。212 单测 + tsc + biome 全绿;preview 截图 + 杀引擎 e2e 核验。详见 §3.5。设计落地保留现有 Pixi Overworld 作 hub,Codex 全为视觉占位。
- 2026-06-06:**真实数据接入 + 屏幕自适应缩放**。① 新增 `todos.updated` 事件管线(events/normalize/store),捕获各 agent 真实 TodoWrite → Session.todos;TaskWindow / Tasks 面板由 mock 改接真,Currency「完成数」接真(已完成 todo 计数);信箱按无源决策保留为局部标注 mock;gems/Shop/Settings CONFIG 仍标注 mock。② 全 UI 包进固定 1920×1080 逻辑舞台(`#viewport/#stage` + `stageScale=min(W/1920,H/1080)`,对齐设计原型 useStageScale),房间/人物/HUD/模态等比缩放 letterbox 居中,修复小屏人物/HUD 过大。纯函数(stage-scale / todos-view / parseTodos)+ reduce 级 e2e 钉死;tsc + biome + bun test 全绿。
- 2026-06-07:**聊天窗口大改合入**(merge `e427f0d`)。聊天升级为统一 timeline(`TimelineItem` 判别联合 + store 从 `messages` 迁 `timeline`);新增 `thinking.*`/`prompt.*` 事件;交互式权限/AskUserQuestion 双向打通(`canUseTool` + `respondPermission`/`respondQuestion`/`setPermissionMode`);前端 ThinkingBlock/ToolCard/PromptCard/SlashMenu/MessageBubble(copy+时间戳)+ stop/换行/slash 补全。Codex 仍占位。详见 §1.1。
- 2026-06-07:**ROADMAP 对齐 HEAD `e70f5db`**:修正自相矛盾的 baseline(frontmatter `6698293` / 正文 `2070a0d`)→ 统一 `e70f5db`;补记聊天窗口大改与零散修复;测试现状刷新为 **247 单测 / 39 文件 / biome 291 文件 / tsc 全绿**(2026-06-07 核实);文档地图补 chat-window-overhaul 与 full-prototype-integration 行。**新主线 = [full-prototype-integration plan](superpowers/plans/2026-06-07-roguent-full-prototype-integration.md)**(67 task,已审查修订,先做 Task 0:测试基建 + 文件盘点 + 命名锁定)。
- 2026-06-12:**设计稿 v2 增量落地**(`Roguent.html` 2026-06-11 修订 vs 已合入的 06-07 版,merge 见 git log 顶部)。13-task(走 subagent-driven-development:逐 task 实现 + 规格/质量双复核 + 提交):① 全局 i18n(中→英字典 + `useT/useTL` + `uiLang` 持久化 + HUD `LangToggle`,产品术语不入典)② 场景皮肤 holo(`settings.skin` + `SkinSwitch` + PixiJS 全息地板 + 青玻璃/扫描线/大厅深蓝滤镜)③ 内景指挥大屏 `BrowserScreen`(接真 `Session.timeline` 最近 tool 流,无源不造数据)④ Shop 拆 Market + 装饰 Shop(余额/已拥有真)+ 挂载真实 GachaPanel(Market 初期 mock,随后 MARKET-real Task 8–9 接真:本机插件目录 + CLI 操作,`SHOP_PLUGINS` mock 退役)⑤ SessionGrid v2(多级过滤/排序/置灰/相对时间,**修硬编码 Claude chip bug**)⑥ Hotbar/Dock 重排 + 大厅 market 摊位 ⑦ 固定文案改名(Context/Weekly 等)。门禁 723 单测 + tsc + check + typecheck:e2e + build 全绿;附带把设计稿 `Prototype/` 加入 biome ignore(此前恒红的 `bun run check` 转为如实校验真实 src)。详见 §3.6。无源功能(events 弹窗 / git banner / Codex 真接入)按真假分明明确不做;`settings-schema.ts` ~85 条 mock 面板字段文案留待后续 schema 翻译轮。
- 2026-06-12:**充实 demo fixtures 的 slash 命令列表 + 订正一次误诊**。现象:SKILLS 法术书/`/` 菜单只显示 3 条命令(`/code-review /deep-research /frontend-design`)。① **先误诊**(fix `d54c568`,已 revert `413d216`):轻信 `sample-run.jsonl` 的 3 条 + SDK 类型把 init 拆 `slash_commands`/`skills` 两字段,判为「normalize 漏接 skills」,沿 slashCommands 同构补了 skills 全链路。② **探针实测纠正**:忠实复制 driver 配置抓真实 `system:init`,`slash_commands` **本就返回 ~60 条**(含 superpowers:* / deep-research / codex:* / update-config 等全部),`skills`(~38)是其**子集**(`skills ⊆ slash_commands`)——live 下现有代码本就显示全部;截图里只有 3 条是因为看的是 `sample-run.jsonl` 的 replay(cwd `/work/kata` 是假路径)。故 skills 改动**冗余、回退**。③ **真正修法**:把所有 committed fixture 的 `session.created` slashCommands 充实成探针实测的代表性子集(~25 条 bare 名 + 前导 /),让 replay 演示也反映 live 真实。CLI 内建命令(/add-dir /agents 等)是 REPL 专属、SDK 从不上报,不纳入。门禁 744 单测 + tsc + check 全绿。**教训**:fixture 是陈旧快照,下结论前先用探针/真会话核对 live SDK 实际上报。
