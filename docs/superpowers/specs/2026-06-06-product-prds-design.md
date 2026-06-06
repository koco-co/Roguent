---
title: Roguent PRD 文档集 · 设计(docs/prds/ 结构规范)
date: 2026-06-06
status: design-approved
authors: [koco-co]
topic: product-prds
---

# Roguent PRD 文档集 · 设计

> 本 spec 定义 `docs/prds/` 下一套**以子系统为单位的产品文档(PRD)**的结构规范:切分清单、命名、frontmatter、正文模板、真假分明纪律、交互边界表达。落地实现走后续 writing-plans:§1–§13 逐篇按统一模板写、顺序不限,§0 索引在全部写完后汇总。本 spec 自身经 brainstorm(superpowers)产出。

---

## 1. 背景与定位

Roguent 已是成熟项目:`docs/superpowers/specs/`(设计、"应该是什么样")、`docs/superpowers/plans/`(历史实现记录)、`docs/ROADMAP.md`(现状 + backlog 真相源)俱全。但缺少**以"子系统功能"为单位、面向产品视角的真相源索引**——回答"这个子系统做什么/为什么/有哪些功能/与别的子系统怎么交互"。

`docs/prds/` 补这一层:

- **受众**:接手的人或 agent。
- **视角**:工程产品真相源——产品功能导向,但每条结论**可核实**(落到代码锚点)。
- **与既有文档的关系**:`specs/` 讲设计取舍,`plans/` 讲当时怎么做,`ROADMAP.md` 讲现状/待办;**PRD 讲"这个子系统作为一个产品功能单元,边界与契约是什么"**。三者互补,不重复。

---

## 2. 关键决策(brainstorm 结论)

| 维度 | 决策 |
| --- | --- |
| 定位 | 工程产品真相源(产品功能视角 + 可核实) |
| 颗粒度 | **中粒度 13 篇** + 1 篇 §0 索引 |
| 命名 | `§N-<英文 kebab-slug>.md`;中文标题放 frontmatter `title` |
| frontmatter | 真相源型:`id/title/status/layer/updated/depends_on/related/code_refs/specs` |
| 正文模板 | 标准 8 节;**「交互边界」必填** |
| 真假分明 | `status ∈ {implemented, partial, mock, planned}`;mock 子项在对应 PRD 内显著标注,不另立篇 |
| 交互表达 | 两处:frontmatter 的 `depends_on`/`related`(机器可读索引)+ 正文 §4「交互边界」(契约细节) |
| 执行 | 走 writing-plans;逐篇按模板写,§0 最后汇总 |

---

## 3. 目录与命名规范

- 目录:`docs/prds/`
- 文件名:`§N-<slug>.md`,`N` 为 1..13,`slug` 为英文 kebab-case。
- 索引:`§0-index.md`。
- 标题:文件名只用英文 slug;**中文子系统名放 frontmatter `title`**,正文 H1 用 `# §N <中文名>`。
- `§` 是全角章节符(U+00A7),与用户指定格式一致。

文件名清单(权威):

| § | slug | 文件名 |
| --- | --- | --- |
| 0 | index | `§0-index.md` |
| 1 | core-driver | `§1-core-driver.md` |
| 2 | event-protocol | `§2-event-protocol.md` |
| 3 | room-render | `§3-room-render.md` |
| 4 | overworld | `§4-overworld.md` |
| 5 | sessions-chat | `§5-sessions-chat.md` |
| 6 | lifecycle-reconcile | `§6-lifecycle-reconcile.md` |
| 7 | hud-shell | `§7-hud-shell.md` |
| 8 | model-mode-skills | `§8-model-mode-skills.md` |
| 9 | usage-limits | `§9-usage-limits.md` |
| 10 | output-panels | `§10-output-panels.md` |
| 11 | import | `§11-import.md` |
| 12 | visual-theme | `§12-visual-theme.md` |
| 13 | desktop-packaging | `§13-desktop-packaging.md` |

---

## 4. frontmatter schema(真相源型)

每篇 PRD(§1–§13)固定如下字段:

```yaml
---
id: "§N"                       # 章节号
title: <中文子系统名>          # 唯一中文标题来源
status: implemented            # implemented | partial | mock | planned
layer: engine                  # engine | web | shared | tauri | cross
updated: 2026-06-06            # 最近核实日期(写作时填当天)
depends_on: ["§X"]             # 硬依赖的上游子系统(缺它本系统不成立)
related: ["§Y"]                # 有交互但非硬依赖
code_refs:                     # 可核实的代码锚点(目录或 file:line)
  - src/engine/driver.ts
specs:                         # 关联设计/计划文档(可空)
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---
```

字段纪律:

- `status` 取值含义见 §6。整篇是 mock 才用 `mock`;主体真、含个别 mock 子项用 `partial` 并在正文 §6 标注。
- `depends_on` vs `related`:**去掉 depends_on 里的子系统本系统就无法工作 → depends_on;否则 → related**。引用一律用 `"§N"` 字符串。
- `code_refs` 写到能定位即可(目录 `src/web/room/*` 或精确 `src/engine/driver.ts:42`);精确 file:line 在写每篇时核实,不照搬 ROADMAP 的过时引用。
- `specs` 关联到对应设计/历史计划,便于回溯;无则留空数组。

§0-index.md 的 frontmatter 用精简版:`id: "§0"` / `title: 索引` / `updated`,正文是汇总表 + 依赖图。

---

## 5. 正文模板(标准 8 节)

```markdown
# §N <中文子系统名>

## 1. 定位
一句话:这个子系统是什么、在产品里扮演什么角色。

## 2. 为什么
解决的问题 / 用户价值 / 不做它会怎样。可引用设计取舍。

## 3. 功能点
当前**已提供**的能力清单(动词开头、逐条)。规划中的能力标注 (planned)。

## 4. 与其它子系统的交互边界  ★必填
- **上游依赖**:§X 提供什么给本系统(数据/事件/命令)。
- **下游消费**:本系统产出什么、被 §Y 怎么用。
- **契约**:具体事件类型 / 命令 / 数据结构 / 不变量(如 `(sessionId, seq)` 单调)。
与 frontmatter 的 depends_on/related 对应一致。

## 5. 数据流与关键约定
关键流程(可用箭头链)+ 本系统特有的约定/不变量/反直觉点。

## 6. 现状与边界(真 / mock / 取舍)
已接真的部分;**标注 mock 的部分(显著)**;已知取舍;明确不做的事。对齐 ROADMAP 真假分明纪律。

## 7. 代码锚点
`file:line` 形式列主要实现位置,可核实。与 frontmatter code_refs 呼应、更细。

## 8. 验收
对应的测试 / 回放断言(test 文件名、e2e 名),说明"怎么证明它真能工作"。
```

各节按内容繁简伸缩:简单子系统某节一两句即可,不强行凑字数。

---

## 6. status 取值与真假分明纪律

| status | 含义 | 例 |
| --- | --- | --- |
| `implemented` | 主体已落地、接真数据、有测试兜底 | §1 核心驱动、§2 事件主链路 |
| `partial` | 主体真,但含 (planned) 子项或个别 mock 子项 | §8(`setPermissionMode` WS 命令未实现,模式经 `session.created` 传递)、§10(信箱 mock、Shop/gems mock)、§13(.app 黑屏未确认 / DMG 失败) |
| `mock` | 整篇所述功能当前全为视觉占位、引擎不消费 | (本批 13 篇无整篇 mock;mock 仅作子项) |
| `planned` | 设计有、尚未实现 | 个别功能点 |

**铁律**(承接 ROADMAP / §3.5):接真 store 数据的功能**不造假、不挂 mock banner**;引擎暂无数据的用**显著标注的 mock**。PRD 的 §6 必须如实区分,`status` 字段与正文一致。

---

## 7. 交互边界的表达(两处,必须一致)

1. **frontmatter**:`depends_on` / `related` 给机器可读的子系统依赖索引。
2. **正文 §4**:展开契约细节(上游给什么、下游用什么、事件/命令/数据结构)。

两处不得矛盾。§0-index.md 据各篇 frontmatter 汇总成依赖关系图(ascii),作为全局视图。

---

## 8. 13 篇清单详表(scope 要点 + 依赖 + 初判 status)

> `code_refs` 为主要锚点(写作时核实精确 file:line);`status` 为基于 ROADMAP@2026-06-06 的初判,以写作核实为准。

### §1 核心驱动与订阅模式 · `core-driver`
- **layer** engine · **status** implemented · **depends_on** [] · **related** [§2,§8,§13]
- **scope**:Agent SDK `query()` streaming-input 驱动;订阅 OAuth(`stripSubscriptionEnv` 抹 API key、反向 `usesApiKey` 校验);`Driver.send`/`setModel`/`setPermissionMode`/skill 触发的底层落地;macOS 系统代理注入;凭据读取。
- **code_refs**:`src/engine/driver.ts` `src/engine/session.ts` `src/engine/credentials.ts` `src/engine/proxy.ts`
- **specs**:roguent-design.md §3/§8

### §2 事件协议与归一化主链路 · `event-protocol`
- **layer** cross · **status** implemented · **depends_on** [§1] · **related** [§3,§4,§5,§6,§9,§10]
- **scope**:统一信封 `{seq,ts,sessionId,type,agentId?,payload}`;`normalize` 把 SDK 消息 + hooks 归一成 RoomEvent;`Sequencer` 打 `(sessionId,seq)` 单调序号;`WsGateway` broadcast + `onCommand`;前端 `store.reduce` 折叠成 sessions;`ws-client` 收事件。新增事件类型「改三处」的约定。**枢纽子系统**。
- **code_refs**:`src/shared/events.ts` `src/engine/normalize.ts` `src/engine/sequencer.ts` `src/engine/ws-gateway.ts` `src/web/store.ts` `src/web/ws-client.ts` `src/shared/domain.ts`
- **specs**:roguent-design.md §5/§10

### §3 房间可视化(内景) · `room-render`
- **layer** web · **status** implemented · **depends_on** [§2] · **related** [§4,§12]
- **scope**:PixiJS v8 内景渲染——主控★ + subagent 小人;游走/朝向翻转/工具气泡/门口进出/脚步扬尘/待命表情;粒子/辉光/灯光;atlas 加载失败的可见错误覆盖层(P1-1)。
- **code_refs**:`src/web/room/Room.tsx` `src/web/room/DungeonRoom.tsx` `src/web/room/Character.tsx` `src/web/room/{Particles,Lights,Emote,ToolBubble}.tsx` `src/web/room/{atlas,layout,motion,effects,config,drawIcon}.ts`
- **specs**:room-visual-polish-design.md

### §4 总览世界与导航 · `overworld`
- **layer** web · **status** implemented · **depends_on** [§2] · **related** [§3,§5,§6,§12]
- **scope**:双层缩放(大厅 ↔ 内景);项目=房间、走廊连通、相机跟随;主角 WASD + A\* 寻路;会话=NPC + 信息卡;漩涡过场;中央任务台 E 键。**入口是 `lobby/HubPlaza.tsx` 的 `LobbyView`**(非历史 `Overworld.tsx`,后者已不存在)。
- **code_refs**:`src/web/lobby/HubPlaza.tsx` `src/web/lobby/{CatPet,PixelSprite}.tsx` `src/web/lobby/{sprite-tick,atlas-dom}.ts` `src/web/overworld/{portal,skins}.ts` `src/web/overworld/PortalTransition.tsx` `src/web/hud/ViewSwitch.tsx` `src/web/ui-store.ts`
- **specs**:overworld-hub-design.md、web-lobby-game-overhaul-design.md

### §5 多会话与聊天抽屉 · `sessions-chat`
- **layer** cross · **status** implemented · **depends_on** [§1,§2] · **related** [§4,§6,§8]
- **scope**:`SessionManager` 按 sessionId 管多个 Driver;每会话独立实例/agent 树/model/mode/usage;前置合成 `session.created` 破死锁 + 幂等合并;聊天 Modal(消息流/输入/新建/切换);切会话=切渲染源;message.delta/final 归到 agent。
- **code_refs**:`src/engine/session.ts` `src/web/hud/ChatDrawer.tsx` `src/web/hud/SessionGrid.tsx` `src/web/store.ts`(sessions/activeSession)
- **specs**:roguent-design.md §4/§7

### §6 会话生命周期与重连对账 · `lifecycle-reconcile`
- **layer** cross · **status** implemented · **depends_on** [§2,§5] · **related** [§4]
- **scope**:归档/删除/LRU ≤10/再激活;门动画进出;重连对账(引擎下发会话花名册、客户端清幽灵会话);WS 重连 + 缓冲补发。
- **code_refs**:`src/web/store.ts`(archive/LRU/unarchive/remove/reconcile)`src/engine/session.ts`(花名册)`src/web/ws-client.ts`
- **specs**:overworld-hub-design.md

### §7 游戏化 HUD 外壳与面板路由 · `hud-shell`
- **layer** web · **status** implemented · **depends_on** [§2] · **related** [§8,§9,§10,§11,§12]
- **scope**:图标 HUD 外壳;自绘像素 SVG 图标注册表(~33);`activePanel` 单一路由 + 复用 Modal;Hotbar/Minimap/ButtonDock/SessionBanner/RosterCard/HeroPortrait;主屏零正文原则。
- **code_refs**:`src/web/hud/Hud.tsx` `src/web/hud/icons.tsx` `src/web/hud/{ButtonDock,Hotbar,Minimap,SessionBanner,RosterCard,HeroPortrait,ViewSwitch}.tsx` `src/web/ui-store.ts`
- **specs**:roguent-design.md §7

### §8 模型·权限模式·技能控制 · `model-mode-skills`
- **layer** cross · **status** partial · **depends_on** [§1,§2,§7] · **related** [§5]
- **scope**:运行时 `setModel`(ModelPicker);permissionMode 选择;技能格(`system:init.slash_commands` + model-invoke skills)触发到当前会话。**partial 点**:`setPermissionMode` 无独立 WS 命令,permissionMode 经 `session.created` payload 传递(§6 标注)。
- **code_refs**:`src/web/hud/ModelPicker.tsx` `src/web/hud/Skills.tsx` `src/engine/ws-gateway.ts`(parseCommand setModel)`src/engine/driver.ts`
- **specs**:roguent-design.md §8

### §9 用量与限额 · `usage-limits`
- **layer** cross · **status** implemented · **depends_on** [§1,§2,§7] · **related** [§10]
- **scope**:5h / CTX / 周三条限额;SDK `rate_limit_event` 兜底 + OAuth poll 权威源(planName);LimitBars「已用%」统一显示;CTX 仅内景显示、账户级 5h/WEEK 始终显;limits 走非 seq 的 LimitsMessage(不做成 RoomEvent)。
- **code_refs**:`src/engine/usage-limits.ts` `src/engine/usage-poller.ts` `src/engine/limits-aggregator.ts` `src/web/hud/LimitBars.tsx` `src/web/hud/limits-format.ts`
- **specs**:usage-and-limits-design.md

### §10 任务·背包·排行榜(产出与计量) · `output-panels`
- **layer** web · **status** partial · **depends_on** [§2,§7] · **related** [§5,§9]
- **scope**:TaskWindow/Tasks(接真 `todos.updated`/Session.todos);背包/LootPanel(`loot.dropped` 真);Leaderboard(按会话真 + 按模型/runtime 聚合);Currency 完成数接真。**partial 点**:信箱 mock、Shop/gems mock(显著标注,引擎无对应能力)。
- **code_refs**:`src/web/hud/{TaskWindow,Tasks,LootPanel,Leaderboard,Currency,Shop}.tsx` `src/web/hud/{todos-view,leaderboard-rows,shop-data}.ts`
- **specs**:roguent-real-data-and-stage-scaling(plan)

### §11 本地会话导入 · `import`
- **layer** cross · **status** implemented · **depends_on** [§2,§7] · **related** [§5]
- **scope**:扫描/解析本机 Claude Code 历史会话(local-sessions)→ 导入为可视化会话;ImportPanel UI;transcript 解析。
- **code_refs**:`src/engine/local-sessions.ts` `src/engine/import.ts` `src/engine/transcript.ts` `src/shared/local-sessions.ts` `src/web/hud/ImportPanel.tsx`
- **specs**:import-local-sessions-design.md

### §12 视觉系统·主题·设置 · `visual-theme`
- **layer** web · **status** partial · **depends_on** [] · **related** [§3,§4,§7,§13]
- **scope**:暖木 RPG token + 像素 chrome;自绘 SVG 图标;自托管 Fusion Pixel 中文字体(不走 CDN);settings-store(accent/theme/motion/density/cjkPixel/avatarHero,持久化);固定 1920×1080 舞台等比缩放(stage-scale)。**partial 点**:Settings CONFIG 整面板 mock(标注)。
- **code_refs**:`src/web/styles.css` `src/web/hud/icons.tsx` `src/web/settings-store.ts` `src/web/hud/{Settings,settings-schema}.ts(x)` `src/web/stage-scale.ts` `public/fonts/`
- **specs**:roguent-design.md §3.5(落地)

### §13 桌面打包(Tauri sidecar) · `desktop-packaging`
- **layer** tauri · **status** partial · **depends_on** [§1,§12] · **related** [§9]
- **scope**:Tauri 2 壳 + Bun sidecar(`bun build --compile`);218MB claude CLI 作 bundle 资源、`ROGUENT_CLI_PATH` 传给 SDK;端口经 stdout `PORT=` 握手 → `engine_url` 命令 → 前端 `resolveEngineUrl` 退避重试;孤儿 sidecar 回收;字体本地化。**partial 点**:.app 主画布黑屏未确认(P1-4)、DMG 打包失败(P1-6)。
- **code_refs**:`src-tauri/*` `scripts/build-sidecar.ts` `scripts/stage-cli.ts` `src/engine/port.ts` `src/web/engine-url.ts`
- **specs**:tauri-sidecar-migration-design.md

---

## 9. §0-index.md 结构

```markdown
---
id: "§0"
title: 索引
updated: 2026-06-06
---

# Roguent PRD 索引

## 这是什么 / 怎么读(与 specs/plans/ROADMAP 的关系)

## 13 篇一览
| § | 子系统 | layer | status | 一句话 |

## 子系统依赖关系图(ascii)
（§1 源头 → §2 枢纽 → 各 web 消费方;§13 打包依赖 §1/§12）

## 真假分明速查
（哪些 partial、各自的 mock/planned 子项一行）
```

依赖图骨架(写 §0 时据各篇 frontmatter 校正):

```
        §1 core-driver ──┐
                         ▼
                  §2 event-protocol (枢纽)
   ┌──────┬──────┬───────┼───────┬───────┬───────┐
   ▼      ▼      ▼       ▼       ▼       ▼       ▼
  §3     §4     §5      §6      §9      §10    (§7 HUD 外壳)
 room  overworld sessions life  usage  output    │
   │      │       │              │       │   ┌───┴───┐
   └──┬───┘       └─ §8 model/mode/skills ─┘   ▼       ▼
      ▼                                       §11     §12
   §12 visual-theme ───────────────────────► import  visual
      │                                                │
      └────────────► §13 desktop-packaging ◄───────────┘  (+§1)
```

---

## 10. 执行计划(writing-plans 接力)

- 本 spec 通过 → 调 writing-plans 出实现计划,把 §1–§13 + §0 拆成有序写作任务。
- 写作纪律:逐篇按 §5 模板 + §4 frontmatter schema;**每篇的 code_refs / status / 交互边界写作时用 grep/读码核实**,不照搬 ROADMAP(已发现其 `Overworld.tsx` 引用过时)。
- §0-index.md 在 §1–§13 全部写完后汇总(依赖图/状态表据最终 frontmatter 校正)。
- 文档任务不改源码;无需 worktree 隔离,但提交时只 add `docs/prds/`,不裹挟主工作树既有未提交的 `src/` 改动。
- Conventional Commits:`docs: 📝 ...`。

## 11. 验收

- `docs/prds/` 下存在 §0–§13 共 14 个文件,命名合规。
- 每篇 §1–§13 含合规 frontmatter(真相源型全字段)+ 8 节正文;§4 交互边界与 frontmatter depends_on/related 一致。
- `status` 与正文 §6 一致;partial 篇的 mock/planned 子项有显著标注。
- code_refs 指向真实存在的文件(抽查可定位)。
- §0-index.md 的一览表 / 依赖图 / 真假速查与各篇一致。
