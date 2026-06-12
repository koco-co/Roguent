# 内景对齐设计稿(4 项)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐 task 实现。Steps 用 checkbox(`- [ ]`)。

**Goal:** 把内景(Room view)四处与设计原型 `Prototype/roguent/project/roguent/` 的视觉/信息密度差异补齐:① 左上英雄卡 + PROFILE 面板;② 抽屉「小队」头像行;③ 消息作者「名 + role 徽」;④ 房间 NPC 头顶名牌。

**Architecture:** 纯前端(`src/web`)。设计原型是 DOM/React.createElement + `layout.css`;我们 HUD 是 React+TSX、房间是 PixiJS(`@pixi/react`)。三处 HUD(#1/#2/#3)从设计 `layout.css` port CSS 类到 `src/web/styles.css`,数据接 `store`/`session.agents`/`session.context`;房间(#4)用 PixiJS `pixiText`(照 `src/web/room/Emote.tsx` 现成用法)。

**真假分明(铁律):**
- **真**:英雄卡 Context XP 条 = `session.context.utilization`;PROFILE 的 5h/Weekly/plan = `store.limits`(与现 Account 同源);小队头像/状态点 = `session.agents`(role/status/kind);作者名/role 徽 = agent role + `AgentKind`;房间名牌 = agent role + isLead。
- **mock/装饰(必须标注)**:英雄卡 `Lv 47` + 名字 `指挥官 Orc` + 邮箱无真实源 → 用 mock 值并在代码注释 + 面板 faint 标注;PROFILE 的 `/login`/`登出` 维持现状(已是占位,有 faint 说明)。

**Tech Stack:** React 19 + Zustand + PixiJS v8(`@pixi/react`)+ Biome + bun:test。

**门禁(每 task 完成必跑):** `bun test` + `bunx tsc --noEmit`(noUncheckedIndexedAccess 严格)+ `bun run check`(仅 Biome)。动 `tests/e2e/` 才跑 `bun run typecheck:e2e`。本计划不动 e2e。

**⚠️ worktree Edit 工具串台风险(历史教训):** 本会话曾出现 Edit/Write 静默写到主 checkout 而非 worktree。每个 implementer **必须**在改完后用 `git -C <worktree> status`/`grep` 验证改动真的落在 worktree 磁盘上;若发现没落盘,用 bash(`python3` 精确串替换)兜底,并在 commit 前再次核验。

---

## 设计源与现有代码索引(实现前必读对应行)

| 主题 | 设计源 | 现有代码 |
| --- | --- | --- |
| #1 英雄卡 markup | `Prototype/roguent/project/roguent/hud.jsx:309-345`(`LimitBars`→playercard) | `src/web/hud/LimitBars.tsx`(替换/改造) |
| #1 PROFILE 面板 | `Prototype/roguent/project/roguent/panels2.jsx:741-800`(`acct2-*`) | `src/web/hud/Account.tsx`(升级) |
| #2 小队头像行 | `panels2.jsx:660-668`(`cdrawer-team*`) | `src/web/hud/ChatDrawer.tsx`(插入) |
| #3 作者名+role | `panels2.jsx:677`(`cmsg-author`/`cmsg-role`) | `src/web/hud/MessageBubble.tsx:11-20,59-68` |
| #4 房间名牌 | `hud.jsx:147-148`(`npc-name` + `★`) | `src/web/room/Character.tsx`(加 pixiText,照 `room/Emote.tsx`) |
| CSS 全部 | `Prototype/roguent/project/roguent/layout.css`(类:playercard / pc-* / acct2-* / cdrawer-team* / cmsg-role) | port 到 `src/web/styles.css` |
| 复用:头像 | — | `src/web/hud/HeroPortrait.tsx`(DOM canvas)、`shared/mapping.ts`(`roleToHero`/`ORCHESTRATOR_HERO`) |
| 复用:房间文字 | — | `src/web/room/Emote.tsx`(`pixiText` + extend 用法) |
| i18n | 新中文串入 `src/web/i18n.ts` DICT(EN 翻译);`小队` 已在 DICT | `useT()`/`useTL()` |

---

## Task 1: #2 抽屉「小队」头像行(最小、纯接真,先做打底)

**先做 #2/#3 这两个纯接真、低风险项,再做 #1/#4。**

**Files:**
- Create: `src/web/hud/ChatTeamStrip.tsx`
- Modify: `src/web/hud/ChatDrawer.tsx`(在 `<RuntimeControls>` 与 `<Timeline>` 之间插入 `<ChatTeamStrip sessionId={currentId} />`)
- Modify: `src/web/styles.css`(port `cdrawer-team` 系列)
- Modify: `src/web/i18n.ts`(确认 `小队`→`Squad` 已有;新增状态 title 串如需要)
- Test: `src/web/hud/ChatTeamStrip.test.tsx`

**数据(真):** 当前会话 `session.agents`(`Record<id, Agent>`)。`Agent` 有 `id/role/skin/status`,`kind` 经 `createAgent` 派生(orchestrator|subagent)。lead/orchestrator 用金色(`ORCHESTRATOR_HERO`),其余 `roleToHero(role)`。状态点颜色照设计 `st-busy/st-idle/...`,映射我们的 `AgentStatus`(spawning/thinking/working/idle/done)。头像用现有 `HeroPortrait`(传 hero base + size)。

- [ ] **Step 1: 写失败测试** — `ChatTeamStrip.test.tsx`:给一个含 2 个 agents(1 orchestrator + 1 subagent)的 session,渲染后断言:出现「小队」标签、2 个头像格(`.cdrawer-team-av`)、orchestrator 格带 lead 标记类。用 `@testing-library/react` + 现有测试套路(参考 `RuntimeControls.test.tsx`)。

- [ ] **Step 2: 跑测试确认失败** — `bun test src/web/hud/ChatTeamStrip.test.tsx`,Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `ChatTeamStrip.tsx`** — 照 `panels2.jsx:660-668`:外层 `.cdrawer-team`,左侧 `.cdrawer-team-l px` 文案 `t("小队")`,然后 `Object.values(session.agents)`(orchestrator 排首)map 成 `.cdrawer-team-av`(done 态加 `.ended`),内含 `<HeroPortrait>` + `.cdrawer-team-dot st-<status>`。`title={role}`。**zustand 铁律**:selector 只取 `s.sessions[sessionId]?.agents` 单引用,排序/派生在 `useMemo`。空 agents → 不渲染(`return null`)。

- [ ] **Step 4: port CSS** — 从 `layout.css` 复制 `.cdrawer-team`、`.cdrawer-team-l`、`.cdrawer-team-av`、`.cdrawer-team-av.ended`、`.cdrawer-team-dot`、`.st-busy/.st-idle/.st-done/.st-error/.st-thinking/.st-working` 等到 `src/web/styles.css`(暖木 token 已在;若引用了设计独有变量,就近改成本仓库等价 token 或硬编 hex,与现有 `cmsg-*` 风格一致)。

- [ ] **Step 5: 接入 ChatDrawer** — 在 `ChatDrawer.tsx` 的 `<RuntimeControls .../>` 后插入 `<ChatTeamStrip sessionId={currentId} />`。

- [ ] **Step 6: 跑门禁** — `bun test` 全量 + `bunx tsc --noEmit` + `bun run check`,全绿。

- [ ] **Step 7: 提交** — `git add -A && git commit -m "feat: 🧩 chat drawer team-presence strip (real session.agents)"`

---

## Task 2: #3 消息作者「名 + role 徽」

**Files:**
- Modify: `src/web/hud/MessageBubble.tsx`(`authorName` → 名 + role 徽两段)
- Modify: `src/web/styles.css`(`.cmsg-author` 已有;补 `.cmsg-role` 若缺)
- Modify: `src/web/i18n.ts`(`主控`/`分身` 等 role 文案入 DICT)
- Test: `src/web/hud/MessageBubble.test.tsx`(已存在,补断言)

**数据(真):** `item.agentId` → `session.agents[agentId]`。**名** = role 的 Title Case(如 `orchestrator`→`Orchestrator`;纯展示派生,真)。**role 徽** = `AgentKind`:orchestrator→`t("主控")`、subagent→`t("分身")`(映射真实 kind;若 store 未存 kind,用 `agent.kind ?? (role==="orchestrator"?"orchestrator":"subagent")` 兜底,与 `createAgent` 一致)。user 消息保持 `t("你")`,无 role 徽。

- [ ] **Step 1: 写失败测试** — 在 `MessageBubble.test.tsx` 加用例:agent 消息(agentId 指向一个 role=`orchestrator` 的 agent)渲染出名 `Orchestrator` + role 徽 `主控`;subagent 出 `分身`;user 消息只出 `你` 无 role 徽。

- [ ] **Step 2: 跑测试确认失败** — `bun test src/web/hud/MessageBubble.test.tsx`,Expected: FAIL。

- [ ] **Step 3: 改 `MessageBubble.tsx`** — `authorName` 拆成 `{ name, roleTag }`:user→`{name:t("你")}`;agent→`name = titleCase(agent?.role ?? item.role)`,`roleTag = (agent?.kind==="subagent") ? t("分身") : t("主控")`。在 `.cmsg-author` 内渲染 `<span>{name}</span>` + `roleTag && <span className="cmsg-role px">{roleTag}</span>`。`titleCase` 一个小纯函数(首字母大写,连字符/下划线转空格再各词大写)。

- [ ] **Step 4: CSS** — 确认 `styles.css` 有 `.cmsg-role`(从 `layout.css` port:小字、faint、pill 样式);`.cmsg-author` 已有则只补 `.cmsg-role`。

- [ ] **Step 5: i18n** — `主控`/`分身` 入 DICT(EN:`Lead`/`Subagent` 或设计语义对应)。`titleCase` 产物是英文派生,不入 DICT。

- [ ] **Step 6: 门禁** — `bun test` + `bunx tsc --noEmit` + `bun run check` 全绿。

- [ ] **Step 7: 提交** — `git commit -m "feat: 🧩 message author shows name + role badge (kind-derived)"`

---

## Task 3: #1 左上英雄卡 + PROFILE 面板升级

**最大一项。分两半:A 英雄卡替换 LimitBars;B Account→PROFILE。**

**Files:**
- Modify: `src/web/hud/LimitBars.tsx` → 改造成英雄卡(playercard);或新建 `PlayerCard.tsx` 并在 `Hud.tsx` 把 `<LimitBars/>` 换成 `<PlayerCard/>`(二选一,推荐新建 `PlayerCard.tsx` 保留 `LimitBars` 历史/测试,Hud 切换引用)
- Modify: `src/web/hud/Hud.tsx:105`(`<LimitBars />` → `<PlayerCard />`)
- Modify: `src/web/hud/Account.tsx`(升级成 PROFILE:加头像框 + Lv + 名 + 邮箱 + Context 条,保留现有 5h/Weekly Usage 行)
- Modify: `src/web/styles.css`(port `playercard`/`pc-*`/`acct2-*`)
- Modify: `src/web/i18n.ts`(`查看个人详情 · 5h / Weekly 用量`、`▸ 查看 5h / Weekly 用量`、`指挥官` 等)
- Test: `src/web/hud/PlayerCard.test.tsx`(新)、`Account.test.tsx`(若存在则补)

**数据:**
- **真**:Context XP = `s.sessions[currentSessionId]?.context?.utilization`(内景才有;大厅无会话语境 → 设计是内景 HUD,沿用现 LimitBars 的 `inInterior` gate)。颜色阈值照设计:`<60 #5fd35f / ≤85 #f2c84b / else #ff4d6d`。plan 名 = `limits?.planName`。PROFILE 的 5h/Weekly = 现 Account 的 `store.limits`(原样保留)。
- **mock/装饰(标注)**:`Lv 47`、名字(`指挥官` + 一个 mock 代号,如 `Orc`)、邮箱(可用真实 `userEmail`?——**不要**,邮箱属隐私且非游戏数据;用 mock `orc@roguent` 或省略)。hero 立绘 base = `account.hero`?我们无 account.hero;用 `ORCHESTRATOR_HERO`(金骑士)或现 `settings.avatarHero` 若有。**所有 mock 值加代码注释 + 面板内 faint 标注「示例 · 装饰」。**

**重要(真数据可见性):** 英雄卡替换 LimitBars 后,5h/Weekly 不再常驻 → 必须保证点击英雄卡能打开 PROFILE 面板、且面板**完整展示** 5h/Weekly 真实用量(现 Account 已有)。这是用户明确选择「照搬设计原稿」的前提。

- [ ] **Step 1: 写失败测试** — `PlayerCard.test.tsx`:渲染断言出现 `.playercard`、Context XP 条(给一个 context.utilization=88 的 session → 宽度/文案含 88%)、点击触发 `openPanel("account")`。`Account.test.tsx`(若有)补断言:PROFILE 头部出现头像 + Lv + Context 条,且 5h/Weekly Usage 行仍在。

- [ ] **Step 2: 跑测试确认失败** — Expected: FAIL。

- [ ] **Step 3A: 实现 `PlayerCard.tsx`** — 照 `hud.jsx:309-345`:`.panel.rivets.playercard`,`onClick` → `useUiStore` 的 `openPanel("account")`,`title={t("查看个人详情 · 5h / Weekly 用量")}`。`.pc-body` → `.pc-frame`(`.pc-portrait` 用 `HeroPortrait` hero=ORCHESTRATOR_HERO scale 大;`.pc-level px` = `Lv 47` mock;`.pc-rt` claude 图标)+ `.pc-info`(`.pc-name px` = mock 名;`.pc-plan px` = `CLAUDE · {planName}`;`.pc-xp`(`.pc-xp-lab` Context + 着色 %;`.pc-xp-bar`>`.pc-xp-fill` 宽=util%、渐变着色)+ `.pc-hint px` = `t("▸ 查看 5h / Weekly 用量")`)。无 context（大厅或无数据)→ XP 条弱化/省略,沿用 `inInterior` + `ctxUtil==null` 处理。**zustand 铁律**:分别取 `limits`、`ctxUtil`、`inInterior` 单值,不构造新值。皇冠 `pc-crown` 我们无 crown 图标 → 省略该子节点(注释说明)。

- [ ] **Step 4: Hud 切换** — `Hud.tsx` 把 `<LimitBars />` 换成 `<PlayerCard />`。

- [ ] **Step 5: 实现 3B PROFILE** — `Account.tsx` 在现有 Usage(5h/Weekly)之上加 PROFILE 头部(照 `panels2.jsx:741-800` 的 `acct2-hero/frame/portrait/level/info` + Context 条);Modal `title="PROFILE"` `sub="个人详情 · 订阅与用量"`。mock 值(Lv/名/邮箱)加 faint 标注。**保留** `/login`/`登出` 占位与其 faint 说明、保留真实 5h/Weekly。

- [ ] **Step 6: port CSS** — 从 `layout.css` 复制 `.playercard`、`.pc-*` 全套、`.acct2-*` 全套到 `styles.css`,设计独有变量就近换本仓 token/hex。

- [ ] **Step 7: i18n** — 新中文串入 DICT + EN 翻译。

- [ ] **Step 8: 门禁** — `bun test` + `bunx tsc --noEmit` + `bun run check` 全绿。注意现有引用 `LimitBars` 的测试:若保留 `LimitBars.tsx` 文件则其测试仍过;若删除则同步删/改测试。

- [ ] **Step 9: 提交** — `git commit -m "feat: 🧩 player hero card + PROFILE panel (real context XP / usage; Lv·name mock)"`

---

## Task 4: #4 房间 NPC 头顶名牌(PixiJS)

**Files:**
- Modify: `src/web/room/Character.tsx`(在 sprite 上方加 `pixiText` 名牌;lead 加 `★`)
- 参考: `src/web/room/Emote.tsx`(`pixiText` + `extend` 用法)、`hud.jsx:147-148`(设计 `npc-name` + `★`)
- Test: `src/web/room/`(若有 Character/room 渲染测试则补;PixiJS 组件难单测 → 至少加纯函数测试,见下)

**数据(真):** Character 已收 `id/heroBase/role/selected/isLead/currentTool` 等 props(见 `Character.tsx:60-80`)。名牌文案 = `isLead ? "★ " + label : label`,`label` = role 的 Title Case(与 #3 同一 `titleCase`,**抽到 `src/web/hud/` 或 `shared/` 的小工具复用,别复制**)。

- [ ] **Step 1: 抽 `titleCase` 纯函数** — 若 Task 2 已把 `titleCase` 放在可复用位置(如 `src/web/hud/widgets.ts` 或 `src/shared/`),Task 4 直接 import;否则在此抽出。**写纯函数单测**(`titleCase("code-review")==="Code Review"`、`titleCase("orchestrator")==="Orchestrator"`)。

- [ ] **Step 2: 跑纯函数测试确认失败→实现→通过**。

- [ ] **Step 3: Character 加名牌** — 照 `Emote.tsx` 的 `pixiText` 写法:在 `flipRef` 容器**外**(不随 flip 翻转)、sprite 上方加一个 `pixiText`,`text` = 名牌串,`style` 用像素字体 + 描边(参考 Emote 的 TextStyle),`anchor` 居中,`y` 取 sprite 顶部上方若干 px。lead 文字描金。**不随选中环闪烁**(常驻)。注意 PixiJS v8 `pixiText` 需 `extend({ Text })`(照 Emote 现有 extend,别重复 extend 冲突)。

- [ ] **Step 4: preview 实测** — 起回放 `fixtures/multi-session.jsonl`(多 agent)或 `sample-run.jsonl`,Room 视图截图确认名牌出现在小人头顶、lead 带 ★、不随翻转镜像、不挡 ToolBubble。

- [ ] **Step 5: 门禁** — `bun test` + `bunx tsc --noEmit` + `bun run check` 全绿。

- [ ] **Step 6: 提交** — `git commit -m "feat: 🧩 room NPC name labels above sprites (role, ★ for lead)"`

---

## Task 5: 收尾 — ROADMAP 回写 + 全量门禁 + 合并

**Files:** Modify `docs/ROADMAP.md`(§3.6 或新增小节,记录本轮 4 项内景对齐)

- [ ] **Step 1: ROADMAP** — 在 §3.6 后追加一条「内景对齐设计稿(2026-06-12)」:列 4 项 + 真假边界(Context XP/usage/agents 真;Lv/名/邮箱 mock 标注)+ 涉及文件。

- [ ] **Step 2: 全量门禁** — worktree 内 `bun test`(全绿、计数≥既有)+ `bunx tsc --noEmit`(0)+ `bun run check`(0)+ `bun run build`(成功)。

- [ ] **Step 3: preview 终验** — 回放 fixture,内景:英雄卡(点击开 PROFILE 见 5h/Weekly)、抽屉小队行、作者名+role 徽、房间名牌,CN+EN 各扫一遍(EN 0 真实泄漏)、holo/dungeon 皮肤都不破。

- [ ] **Step 4: 记 worktree HEAD SHA**,回主树 `git merge --no-ff <sha>` 合入 main。

- [ ] **Step 5: 合并后复验门禁** → 全绿。**不 push**(等用户确认,沿用上轮决定)。

- [ ] **Step 6: 清理 worktree** — `git worktree remove .worktrees/interior-design-parity`。

---

## Self-Review(写完计划自查)

- **Spec 覆盖**:用户选了 4 项(#1/#2/#3/#4)→ Task 3/1/2/4 一一对应;PROFILE 面板(用户补充截图)并入 Task 3。✅
- **类型一致**:`titleCase` 在 Task 2 引入、Task 4 复用(Step 1 显式说明抽到可复用位置);`HeroPortrait`/`roleToHero`/`ORCHESTRATOR_HERO` 既有;`openPanel("account")` 既有路由。
- **真假**:每个真数据点标了源;每个 mock(Lv/名/邮箱)要求代码注释 + 面板 faint 标注。
- **风险**:worktree Edit 串台 → 每 task 要求 git 验证落盘;PixiJS 名牌 extend 冲突 → 要求复用 Emote 的 extend。
