# 原型全面还原(prototype-parity-restore)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐 task 实现(每 task:实现子代理 → 规格复核 → 质量复核 → 提交)。Steps 用 checkbox(`- [ ]`)。**共享文件的 task 必须串行,不并行派实现 agent。**

**Goal:** 把 `Prototype/roguent/project/roguent/`(2026-06-11 handoff,与 `Roguent-handoff.zip` 一致)中尚未还原的内容补齐:大厅地面 canvas(草坪+石板路+北城墙+挂旗+道具+花草)、大厅环境装饰(火把/雕像/符文环/粒子)、结构物特化造型+坐标全回原型、内景布局(地毯/指挥台/泉水/道具群)、HUD 徽标+快捷键、彩蛋(撸猫/宝箱怪/许愿池/台词气泡)、三个翻案 mock 面板(UpdateModal/LoginEvents/Tasks 邮箱区)及面板细节补齐。

**用户决策(2026-06-12,本轮 AskUserQuestion):** ① 结构物坐标**全部回原型**(推翻 ROADMAP §3.6「坐标偏差既存未动」的旧取舍);② LoginEvents / UpdateModal / Tasks 邮箱区**翻案做 mock 标注版**(推翻 §3.6「明确不做」);③ 彩蛋与扭蛋 lucky 保底**全部还原**。

**Architecture:** 纯前端(`src/web`),不动 engine / 事件协议。大厅地面从 CSS 渐变 div 升级为 port 原型 `paintHub` 的 `<canvas>`(atlas 两边 md5 一致、且含 `grass`/`edge-*` 自定义帧,可直接画);环境装饰为 DOM 元素 + port CSS;内景改动在 PixiJS(`DungeonRoom`/`DecorLayer`);彩蛋为 DOM 覆盖层(内景)/大厅元素。**明确不还原**(此前用户已拍板、本轮不翻案):聊天保持右抽屉(chat-right-drawer spec)、SessionBanner 不做 git 横幅、Codex 维持视觉占位、RosterCard alert 维持无源全 null、产品术语不入 DICT。

**真假分明(铁律):**
- **真**:邮箱未读徽标 = `store.mailbox` 中 `status==="unread"` 计数;公告板便签 = mailbox board items(空则不渲染便签,不造);Market「已安装」计数 = 真插件目录;quick replies = 真发消息;gacha lucky 保底 = 纯前端确定性机制(消耗真宝石,无假数据);彩蛋全为纯交互装饰(localStorage 计数,不声称业务数据)。
- **mock(三重标注:`MOCK_*` 命名 + 代码注释 + 面板内 banner/faint)**:UpdateModal 更新日志、LoginEvents 签到/活动、Tasks 邮箱区(agent 间信件)。数据放独立 `*-mock-data.ts`,顶部注释「全为 mock,引擎不消费」。
- **纯装饰(不声称数据,无需 banner)**:火把/雕像/符文环/粒子/花草/雕像小人/喷泉水滴/door 旗。

**Tech Stack:** React 19 + Zustand + PixiJS v8(`@pixi/react`)+ canvas 2D + Biome + bun:test。

**门禁(每 task 完成必跑):** `bun test` + `bunx tsc --noEmit`(noUncheckedIndexedAccess 严格,`check` 不查类型)+ `bun run check`。不动 `tests/e2e/` 则不需 `typecheck:e2e`。

**⚠️ worktree Edit 串台风险(历史教训):** 改完用 `git -C <worktree> status`/`grep` 验证改动真的落在 worktree 磁盘;没落盘用 bash 兜底,commit 前再核验。

**⚠️ zustand 铁律(项目记忆):** selector 不构造新值(数组/对象字面量);取单引用,派生进 `useMemo`。hooks 全部在 early return 之前。

---

## 设计源与现有代码索引(实现前必读对应行)

| 主题 | 设计源(权威) | 现有代码 |
| --- | --- | --- |
| 大厅地面 paintHub | `Prototype/roguent/project/roguent/room.jsx:112-249`(stone map/草地/石板/北城墙+3 挂旗/道具/花草石/HubCanvas) | `src/web/lobby/HubPlaza.tsx:520`(`.hub-floor` div,替换)、`src/web/lobby/atlas-dom.ts`(fetch JSON;canvas 需另加 image 加载) |
| 大厅结构与装饰 | `lobby.jsx:82-196`(INTERACT 坐标表 / torches / embers / leaves / fireflies / plaza-rune / statues / decor 小人 / mimic / hint) | `src/web/lobby/HubPlaza.tsx:64-194,510-572` |
| 结构物特化造型 | `lobby.jsx:198-271`(Structure:tower/door/gacha/announce board/mailbox/stall) | `HubPlaza.tsx` 内 `Structure`(现统一 struct-vendor) |
| 大厅 CSS | `extra.css:73-150`(hub.town/hub-sun/ember/torch/fx 档)、`extra.css:186-248`(mimic/struct-gacha/board/mailbox)、`layout.css` 搜 `.hub-`/`.stall-`/`.tower-`/`.door-`/`.statue` | `src/web/styles.css:4055-4260`(hub 段) |
| 内景房间 paintRoom | `room.jsx:33-110`(地毯 59-63 / 指挥台+符文 65-84 / 泉水 88-92 / 道具 93-106)、`room.jsx:54-56`(墙幅) | `src/web/room/DungeonRoom.tsx`、`src/web/room/DecorLayer.tsx`、`src/web/room/config.ts` |
| 彩蛋 | `hud.jsx:28-121`(PetActor/QUIPS+QuipLayer/MimicChest/WishingSpot)、挂载点 `hud.jsx:262,286,290`(内景)、`lobby.jsx:185`(mimic 大厅 1505,846) | `src/web/lobby/CatPet.tsx`(已有猫,无撸猫交互)、内景无对应 |
| HUD 徽标/快捷键 | `hud.jsx:426-449`(dock badge / hotbar g1/g2 键位字) | `src/web/hud/ButtonDock.tsx`、`src/web/hud/Hotbar.tsx` |
| UpdateModal | `panels2.jsx:789-831` | 无;`src/web/hud/About.tsx` 检查更新按钮悬空 |
| LoginEvents | `panels3.jsx:363-413`、`data.js:316-353`(announcements/dailyRewards/events) | 无 |
| Tasks 邮箱区 | `panels1.jsx:100-165`(右列下方 mailbox 区) | `src/web/hud/Tasks.tsx`(缺该区) |
| Mailbox 阅读器 | `panels3.jsx:67-144`(meta code 块 + 「转发到配对 IM」) | `src/web/hud/mailbox/MailboxPanel.tsx` |
| 成就页签 | `panels3.jsx:13-61`(全部/已解锁/进行中) | `src/web/hud/economy/AchievementsPanel.tsx`(无页签) |
| Gacha lucky | `panels3.jsx:148-220`(lucky 槽:每 5 抽下一发必出传说) | `src/web/hud/economy/GachaPanel.tsx` |
| Market owned 计数 | `panels2.jsx:174-212`(分类行 `owned` 数) | `src/web/hud/Market.tsx` |
| Chat quick replies | `panels2.jsx:696`(固定快捷回复组) | `src/web/hud/Composer.tsx` |
| 图标 | `icons.jsx`(`mail`/`medal`/`link`) | `src/web/hud/icons.tsx`(三者缺;现用 vault/laurel 顶替) |
| 邮箱未读真源 | — | `src/web/store.ts`(`MailboxState`,`status:"unread"`;board selector `selectMailboxBoardItems*`) |
| i18n | 新中文串全部入 DICT | `src/web/i18n.ts`(`useT`/`useTL`) |

---

## Task 1: 大厅地面 canvas(port paintHub)

**最大观感差距,先做。**

**Files:**
- Create: `src/web/lobby/hub-paint.ts`(纯逻辑:stone map 生成 + 绘制函数)
- Create: `src/web/lobby/HubCanvas.tsx`(组件:加载 atlas image → 画)
- Create: `src/web/lobby/atlas-image.ts`(HTMLImageElement 单例加载 + `drawFrame`;`atlas-dom.ts` 只有 URL/坐标,canvas 需要 img)
- Modify: `src/web/lobby/HubPlaza.tsx`(`.hub-floor` div → `<HubCanvas />`)
- Modify: `src/web/styles.css`(`.hub` 背景改 town 暖绿底 `#5a3f2a`→对照 `extra.css:73`;加 `.hub-canvas` 定位;port `.skin-holo .hub-canvas` 滤镜 `extra.css:655`;`.hub-floor` 旧样式删除)
- Test: `src/web/lobby/hub-paint.test.ts`

**Port 内容(逐段照 `room.jsx:112-238`,T=80、S=5、COLS=24、ROWS=14、canvas 1920×1120):**
1. **stone map**(`:121-141`):中央八角广场 `rect(9,4,15,9)` + 切角;9 个建筑 pad(坐标注释对应结构);宽 2 车道连接。**抽成纯函数 `buildStoneMap(): boolean[][]`,单测钉死**(广场内 true、切角 false、pad 位置 true)。
2. **草地层**(`:143-154`):全图 `grass` 帧 + 确定性 hash 斑驳(深/亮色块)。hash 用原型同款 `hash(a,b)`(`room.jsx` 顶部有定义,确定性,**不用 Math.random**——仓库禁随机回归)。
3. **石板层**(`:156-175`):edge-* 自动接边 + floor_1/2/3 变化 + 暖色 wash。
4. **南缘投影**(`:176-179`)。
5. **北城墙 + 挂旗**(`:181-191`):`wall_mid`×2 行 + `wall_top_mid` 帽 + 阴影条 + `wall_banner_yellow/blue/green` @ 4T/11.5T/19T。
6. **落地道具**(`:193-204`):crate/skull/flask/chest/coin 按原型坐标逐个 `at(...)`。
7. **程序化花园**(`:206-236`):flower/rock 像素绘制 + `sites` 避让表 + 密度(密度固定 1,不接 mock 设置)。

- [ ] **Step 1: 写失败测试** — `hub-paint.test.ts`:`buildStoneMap()` 断言 ① `stone[6][12]===true`(广场心)② `stone[4][9]===false`(切角)③ `stone[11][3]===true`(claude door pad)④ 行列数 14×24。
- [ ] **Step 2: 跑测试确认失败** — `bun test src/web/lobby/hub-paint.test.ts`,FAIL(模块不存在)。
- [ ] **Step 3: 实现 `hub-paint.ts`** — `buildStoneMap` + `paintHub(ctx, atlas: {img, frames})`,绘制逻辑逐段照抄原型(常量/坐标一个不改);`drawFrame` 从 `atlas-image.ts` 传入。测试过。
- [ ] **Step 4: 实现 `atlas-image.ts`** — 模块级单例:`loadAtlasImage(): Promise<HTMLImageElement>`(`/assets/0x72/dungeon.png`)+ `drawFrame(ctx, frames, name, dx, dy, scale)`(`imageSmoothingEnabled=false`,照 `sprites.jsx:73-88`)。帧表复用 `atlas-dom.ts` 的 `loadAtlasDom()`。
- [ ] **Step 5: 实现 `HubCanvas.tsx`** — `useEffect` 里 `Promise.all([loadAtlasDom(), loadAtlasImage()])` → `paintHub`;失败 `console.error` + 保底纯色底(不黑屏,对齐 P1-1 纪律);`<canvas width={1920} height={1120} className="hub-canvas" />`。
- [ ] **Step 6: 接入 HubPlaza + CSS** — 替换 `.hub-floor`;`.hub` 背景照 `extra.css:73`;`.hub-canvas{position:absolute;left:0;top:0;image-rendering:pixelated;}`;port holo 滤镜;删 `.hub-floor` 死样式;`.hub-bigglow` 保留。
- [ ] **Step 7: 门禁** — `bun test` + `bunx tsc --noEmit` + `bun run check` 全绿。
- [ ] **Step 8: 提交** — `git commit -m "feat: 🧩 lobby ground canvas — port paintHub (lawn/plaza/wall/props/garden)"`

---

## Task 2: 大厅环境装饰层(sun/粒子/火把/雕像/符文环)

**Files:**
- Modify: `src/web/lobby/HubPlaza.tsx`(在 canvas 之上、结构物之下插入装饰元素)
- Modify: `src/web/styles.css`(port 对应 CSS)
- Test: 装饰为纯静态 JSX,不强求单测;`_smoke` 级别即可(现有 LobbyView.test 若渲染 HubPlaza 则自然覆盖不崩)

**Port 清单(逐项照 `lobby.jsx:147-181,194`;CSS 从 `extra.css:81,96-150` + `layout.css` 搜类名):**
- `hub-sun`(阳光渐变,`extra.css:81`)+ `vignette town`;`tod-tint` 不接 mock 设置 → 固定 `tod-day` 观感(extra.css:540),**不造日夜数据**。
- `ember`×18(`lobby.jsx:153-154` 的 left/delay/duration 公式,密度固定 1)。
- `hub-leaf k0..k3`×14(`:156-157`)。
- `hub-firefly`×7(`:159-160`,确定性公式坐标)。
- `hub-plaza-rune`(双 `hub-plaza-ring`,一个 `rev`;`:162-165`)——位置 CSS 由原型决定(任务台脚下)。
- `torch`×5 @ `[[150,150],[560,150],[960,120],[1360,150],[1770,150]]`(bracket/flame/glow/spark×3;`:167-172`,CSS `extra.css:101-113`)。
- `hub-statue`×2:`knight_m@(724,548)` 不翻转、`elf_f@(1196,548)` 翻转(fig 用现有 `PixelSprite` scale 3.6 + ped;`:177-181`)。
- 动效档位 CSS(`extra.css:137-150` 的 `.fx-off/.fx-low/.fx-high`)只 port `.no-motion` 等价物:**仓库已有 `settings.motion`(reduced)** → 把 `.fx-off` 选择器换成挂在现有 reduced-motion 根类上(对照 styles.css 现有 `.no-motion` 用法),不引入 mock 的 fx 三档设置。
- prompts/hint 已有,不动。

- [ ] **Step 1: JSX 插入** — 按上面清单全量插入(顺序照原型:canvas → sun → vignette → embers → leaves → fireflies → plaza-rune → torches → decor 小人(已有)→ statues → structures)。粒子数组用 `Array.from({length:N})` + 原型公式(确定性,无随机)。
- [ ] **Step 2: CSS port** — 上述类全套复制进 `styles.css`(设计独有变量就近换本仓 token/hex;`--rune` 默认 `#36c5e0`)。keyframes 一并搬(`emberrise`/`leafdrift`/`fireflyblink`/`runespin`/`torchflick` 等,以 extra.css/layout.css 实名为准)。reduced-motion 时动画停。
- [ ] **Step 3: preview 冒烟** — 回放 fixture 起 dev,大厅截图对照原型 `_shot.png`/用户截图:城墙挂旗、火把、雕像、符文环、漂浮粒子全部出现;holo 皮肤切换不破(canvas 滤镜生效)。
- [ ] **Step 4: 门禁** — 全绿。
- [ ] **Step 5: 提交** — `git commit -m "feat: 🧩 lobby ambient decor — torches/statues/plaza rune/particles/sun"`

---

## Task 3: 结构物特化造型 + 坐标全回原型 + mail/medal 图标

**Files:**
- Modify: `src/web/lobby/HubPlaza.tsx`(INTERACT 表 + Structure 渲染分支)
- Modify: `src/web/hud/icons.tsx`(新增 `mail`、`medal` 两枚像素 SVG,照 `Prototype/.../icons.jsx` 同名图标的 path 数据 port)
- Modify: `src/web/styles.css`(port `struct-tower/door/gacha/board/mailbox/stall` 全套)
- Modify: `src/web/i18n.ts`(`成就殿`/`邮箱` 等恢复文案的 DICT 核对)
- Test: `src/web/hud/icons.test.ts`(已有图标注册表测试 → 补 mail/medal);`src/web/lobby/LobbyView.test.tsx` 补「mailbox 未读徽标」断言

**坐标/文案还原表(实现照抄,`lobby.jsx:82-94` 为准):**

| id | 现状 → 还原 |
| --- | --- |
| tower | y 480→**512** |
| shop | (1480,380)→**(1556,452)** |
| gacha | (1640,555)→**(1576,738)**,r 120→130 |
| cdoor | (230,760)→**(214,946)** |
| xdoor | (1690,760)→**(1706,946)** |
| mailbox | label 信箱→**邮箱**,sub MAIL→**MAILBOX**,r 120,x/y 已对 |
| achievements(原型 id `ach`) | label 成就陈列→**成就殿**,sub LOOT→**ACHIEVEMENTS**,r→130 |
| leaderboard(原型 id `board`) | sub RANK→**RANKING**,r→140 |
| board(原型 id `announce`) | 保持 (360,742) r140,公告板语义不变 |
| market / altar | 已一致,核对即可 |
| DECOR 小人 | knight_f y 300→**360**;goblin y 560→**600** |
| avatar 活动范围 | y 上限 1040→**1060**(`lobby.jsx:121`);初始 (960,980) 核对 |

**Structure 特化(照 `lobby.jsx:198-271` 重写渲染分支,替换统一 struct-vendor):**
- `tower`:tower-ring + tower-orb(quest icon 浮动)+ tower-base(喷泉两帧 PixelSprite)+ `fountain-drop`×4。
- `cdoor/xdoor`:`door-flag`(runtime 色 + claude/codex icon)+ `doors_leaf_closed`。
- `gacha`:`gm-dome`(5 色 gm-cap)+ `gm-body`(knob/slot)+ vendor-ped + `gacha-sparkle`(✦ 浮动)。
- `board`(公告板):`board-roof` + `board-face`(便签)+ `board-legs`。**便签接真**:`selectMailboxBoardItems`(现有 selector)前 3 条的标题截断;空则不渲染便签(原型用 `DATA.announcements` mock,我们有真源就接真,**不 port mock 数据**)。便签 `--ac` 色按 item 渠道映射或固定轮换(纯装饰)。
- `mailbox`:`mailbox-flag`(unread>0 加 `.up` 摆动)+ `mailbox-box`(mail icon)+ `mailbox-post` + `mailbox-count px` 红点数字。**unread 接真**:`store.mailbox` 中 `status==="unread"` 的条数(新增纯 selector `selectMailboxUnreadCount(mailbox): number`,放 store.ts 现有 selector 旁,单测)。
- 其余(shop/leaderboard/altar/ach/market):`struct-stall stall-<id>`(roof/valance/posts/sign/counter),icon/色照 `lobby.jsx:246-247`(ach 用新 `medal` 图标,market 用 mcp,altar gear,shop shop,leaderboard trophy)。

- [ ] **Step 1: 写失败测试** — icons.test 补 `mail`/`medal` 注册断言;store.ts 旁新增 `selectMailboxUnreadCount` 纯函数测试(2 unread + 1 read → 2);LobbyView.test 断言 mailbox 结构出现 `.mailbox-count` 文本「2」(构造带 unread 的 store 状态)。
- [ ] **Step 2: 确认失败** — FAIL。
- [ ] **Step 3: icons.tsx 加 mail/medal** — 从原型 `icons.jsx` 同名条目 port path 数据(自绘像素 SVG 注册表既有格式)。
- [ ] **Step 4: INTERACT/DECOR 坐标文案还原** — 照上表逐项改;`Interactable.icon` union 补 `"mail" | "medal"`(若走 Structure 特化分支可不经 icon 字段,以实现简洁为准)。
- [ ] **Step 5: Structure 特化重写 + selector** — 照上面清单;CSS port(`extra.css:206-248` + layout.css 相关段)。**zustand 铁律**:unread 计数 selector 返回 number 单值;board items 用现有 selector + `useMemo` 截断。
- [ ] **Step 6: preview 冒烟** — 对照用户截图:扭蛋机穹顶彩球、公告板便签、邮箱红旗+红点、双门贴底(y946)、商店/任务台归位。
- [ ] **Step 7: 门禁** — 全绿。
- [ ] **Step 8: 提交** — `git commit -m "feat: 🧩 lobby structures — prototype coords + specialized builds (gacha/board/mailbox/door/tower)"`

---

## Task 4: 内景房间布局还原(Pixi)

**Files:**
- Modify: `src/web/room/DungeonRoom.tsx`(指挥台/符文圈/泉水/横幅/地板变化)
- Modify: `src/web/room/DecorLayer.tsx`(道具群全量还原)
- Modify: `src/web/room/config.ts`(FOUNTAIN_COLS 等常量)
- Test: 既有 room 相关纯函数测试不回归;新增常量/布局表可测处下沉(如 props 表导出后断言数量与关键条目)

**Port 清单(`room.jsx:33-110` 为准,坐标单位 tile,虚拟 16px tile 体系按现有 DungeonRoom 约定换算):**
1. **地毯径**(`:59-63`):南门(11.5)→指挥台,宽 2.8T,深青底 + 金边 + 青纹理条 → Pixi `Graphics` 矩形序列(颜色照原型 hex)。
2. **指挥台**(`:65-73`):中心 (12T, 6.4T),6.4T×4.8T 石板平台(深色内部 + 发光描边)。
3. **符文圈**(`:74-84`):双同心圆 + 12 辐条 + 十字轴,色 `#36c5e0`(holo 同色系),`Graphics` 描线 + alpha;**静态即可**(Pixi 下不强求 CSS 旋转动画,先还原形;若现有 ticker 容易挂旋转则加,reduced-motion 停)。
4. **泉水**(`:88-92`):**回到北墙中央 col 11 单个**,top 用 `wall_fountain_top_1`,mid/basin 动画帧不变;`config.ts` 的 `FOUNTAIN_COLS=[4,19]` → `[11]`(命名同步单数化或保留数组)。`GlowLayer`/`Lights` 中泉水光斑坐标跟随。
5. **墙幅**(`:54-56`):回 col 4 与 col 19,均 `wall_banner_blue`(现状 col9/14 红蓝 → 改)。
6. **道具群**(`:93-106`,全量,坐标照抄):左仓库 crate(2,9)(3,9)(2,8)+skull(3,8)+flask_big_green(1,11)+flask_big_blue(2,11);右工作台 crate(16,9)(17,9)+flask_big_green(16,8)+flask_big_red(17,8)+flask_big_blue(16,10)(以原型行内为准);右远端 crate(21,11)(21,10)+coin(20,11);角落 chest_empty_open_anim(6,12)+skull(18,12)。现 DecorLayer 的 5 件杂项替换为该表;**道具表导出常量 `ROOM_PROPS`** 供单测。
7. **地板变化**(`:38-45` 同款思路在 paintRoom 内,Pixi 版):floor_1 为主 + 确定性 hash 少量 floor_2/3(替换单一 floor_1;hash 复用 `holo.ts` 的 `holoHash` 或同型确定性函数)。
8. **宝箱归位**:现 DungeonRoom 的 chest(2,3) 移除(并入上面道具表的 (6,12))。

- [ ] **Step 1: 写失败测试** — `ROOM_PROPS` 导出断言:包含 `["crate",2,9]`、`["chest_empty_open_anim",6,12]`(帧名前缀)等关键条目、总数对得上原型(数一遍 `room.jsx:93-106`);`FOUNTAIN` 常量断言 col 11。
- [ ] **Step 2: 确认失败** — FAIL。
- [ ] **Step 3: 实现** — 按 Port 清单逐项;Pixi Graphics 写法照 DungeonRoom 既有 holo 分支风格;holo 皮肤下地毯/指挥台/符文**保留与否照原型**:`room.jsx` holo 分支(`:16-31`)只画全息地板,不画地毯道具 → 跟随(holo 时跳过 1/2/3/6/7,与现 DecorLayer 在 holo 下的处理一致性核对)。
- [ ] **Step 4: preview 冒烟** — 回放 fixture 进内景:dungeon 皮肤见地毯+指挥台+符文圈+单泉水+道具群;holo 皮肤不画这些、不破;小人/名牌/气泡不被遮挡(层级:地板 < 地毯/台 < 道具 < 角色)。
- [ ] **Step 5: 门禁** — 全绿。
- [ ] **Step 6: 提交** — `git commit -m "feat: 🧩 room parity — carpet/dais/rune circle/fountain@11/full props per prototype"`

---

## Task 5: HUD 徽标接真 + Hotbar 快捷键字

**Files:**
- Modify: `src/web/hud/ButtonDock.tsx`(邮箱槽未读徽标)
- Modify: `src/web/hud/Hotbar.tsx`(槽位右下快捷键字)
- Modify: `src/web/styles.css`(badge/键位字样式,port `layout.css` 对应类)
- Test: ButtonDock/Hotbar 若有测试则补;至少 `selectMailboxUnreadCount` 已在 Task 3 测过,此处补一个 dock 渲染断言(unread>0 → 徽标文本)

**内容:**
- **dock 邮箱徽标(真)**:`hud.jsx:435` 同款 — unread>0 渲染 `.dock-badge px` 数字;数据 = Task 3 的 `selectMailboxUnreadCount`。**只做邮箱槽**;原型 events 槽徽标对应我们 board 槽 → board items 无「未读」概念(公告聚合),**不造**,跳过并注释。
- **Hotbar 快捷键字**:`hud.jsx:445-446` 槽位带单字键标(`务/话/技/插/智/入/包/饰/榜/成`)→ 实现为 `.hb-key px` 角标,纯展示(原型也未绑真实键)。文案入 DICT(EN 用首字母或图标语义词,如 `T/C/S…` 按 i18n 惯例;产品术语不涉及)。
- **medal 用于成就槽**:Hotbar 成就槽 icon `laurel`→`medal`(Task 3 已加图标)。

- [ ] **Step 1: 失败测试** → **Step 2: 实现** → **Step 3: 门禁全绿**。
- [ ] **Step 4: 提交** — `git commit -m "feat: 🧩 HUD — real mailbox unread badge on dock + hotbar key glyphs + medal icon"`

---

## Task 6: 彩蛋(撸猫 / 宝箱怪 / 许愿池 / 台词气泡)

**Files:**
- Create: `src/web/easter/PetActor.tsx`(包 CatPet:点击 hop + 心形粒子,每 10 次彩虹心;`hud.jsx:29-49`)
- Create: `src/web/easter/MimicChest.tsx`(`hud.jsx:83-98`:平时 `chest_full_open_anim_f0`,点击 `chest_mimic_open_anim_f1` + `?!`,localStorage `roguent_mimic`)
- Create: `src/web/easter/WishingSpot.tsx`(`hud.jsx:101-121`:点击 → 金币+涟漪+「+1 福气」,第 7n 次 lucky ★;localStorage `roguent_wish`)
- Create: `src/web/easter/QuipOverlay.tsx`(`hud.jsx:52-80`:QUIPS 词库照抄 — **删 askuser/todo 两组**(引擎无此状态,真假分明)— 周期随机挑一个在场 agent 弹 2.8s 台词气泡)
- Modify: `src/web/lobby/HubPlaza.tsx`(pet → PetActor 包裹;mimic @ (1505,846) 插入)
- Modify: `src/web/room/Room.tsx`(DOM 覆盖层挂 WishingSpot(泉水位,`left:15%/top:14%` 对齐我们 col11 泉水的屏幕位)、PetActor(固定角落)、QuipOverlay)
- Modify: `src/web/styles.css`(port `petactor/pet-heart/mimic/mimic-pop/wish-*/quip/quip-bubble`,CSS 在 `extra.css:152-203` 与 layout.css 搜类名)
- Modify: `src/web/i18n.ts`(QUIPS 台词 + `撸一下/许愿/宝箱` title + 福气文案入 DICT)
- Test: `src/web/easter/` 新组件各一个轻测(点击 → 类名/文本出现;QuipOverlay 用 fake timers 断言气泡出现消失)

**注意:** QuipOverlay 的 npc 位置 — 我们内景小人是 Pixi 动态位,DOM 层拿不到逐帧坐标 → **取该 agent 的 home anchor**(`room/layout.ts` 可算静态锚位)换算 %,台词弹在锚位上方;台词随机数用 `Math.random` 仅限**交互触发的装饰层**(不进渲染快照/不进测试断言路径;测试用 fake timers + 注入 RNG 参数,组件签名留 `rng?: () => number` 默认 Math.random)。

- [ ] **Step 1: 失败测试**(4 组件)→ **Step 2: 实现 + CSS port + 挂载** → **Step 3: preview 冒烟**(撸猫出心、点宝箱怪 ?!、许愿 +1 福气、内景隔几秒冒台词)→ **Step 4: 门禁全绿**。
- [ ] **Step 5: 提交** — `git commit -m "feat: 🧩 easter eggs — pettable cat, mimic chest, wishing spot, agent quips"`

---

## Task 7: 翻案三面板(UpdateModal / LoginEvents / Tasks 邮箱区,全 mock 标注)

**Files:**
- Create: `src/web/hud/UpdateModal.tsx` + `src/web/hud/update-mock-data.ts`(版本号/更新日志;照 `panels2.jsx:789-831` 布局)
- Create: `src/web/hud/mailbox/LoginEvents.tsx` + `src/web/hud/mailbox/login-events-mock-data.ts`(签到日历 + 活动海报轮播;照 `panels3.jsx:363-413`;数据形状照 `data.js:316-353` 的 dailyRewards/events,**值标注 MOCK**)
- Modify: `src/web/hud/Tasks.tsx`(右列下方加「邮箱区」:agent 间信件列表,照 `panels1.jsx:155-160`;数据 `tasks-mailbox-mock-data.ts`)
- Modify: `src/web/ui-store.ts`(PanelId 加 `update`、`loginEvents`;路由)
- Modify: `src/web/hud/About.tsx`(检查更新 → `openPanel("update")`)
- Modify: `src/web/hud/Hud.tsx`/`Modal` 路由处(挂两个新面板;LoginEvents 入口 = dock「活动」槽?**不**——dock 活动槽已被 board 占用且为真数据;LoginEvents 入口放 SystemMenu 或 board 面板内「活动」按钮,实现者按最小侵入选,并在 plan 复核时说明)
- Modify: `src/web/styles.css` + `src/web/i18n.ts`
- Test: 三个 UI 各一渲染测试(mock banner 文本必须出现——断言「示例数据」类标注存在,防漏标)

**铁律落点:** 三个面板都挂 `.task-mock-banner`(既有样式)+ 数据文件顶注「全为 mock,引擎不消费」+ `MOCK_` 前缀;LoginEvents **不自动弹**(无登录事件源)——仅手动入口打开,注释说明。

- [ ] **Step 1: 失败测试** → **Step 2: 实现(UpdateModal → LoginEvents → Tasks 邮箱区,同文件串行)** → **Step 3: 门禁全绿**。
- [ ] **Step 4: 提交** — `git commit -m "feat: 🧩 reinstate mock-flagged panels — update log, login events, tasks inter-agent mail"`

---

## Task 8: 面板细节补齐(成就页签 / Mailbox 阅读器 / Market 计数 / quick replies / gacha lucky)

**Files:**
- Modify: `src/web/hud/economy/AchievementsPanel.tsx`(三页签:全部/已解锁/进行中,照 `panels3.jsx:37`;过滤纯函数下沉 + 单测)
- Modify: `src/web/hud/mailbox/MailboxPanel.tsx`(阅读器补 `meta` code 块(item 有 meta/原始载荷才显,无则不渲染——不造);「转发到配对 IM」按钮:**有真配对设备(pairing store/BindingList 数据源)时可点、走真实 relay 通道;无配对则置灰 + faint「未配对」**——实现者先核 `src/web/hud/pairing/` 与 engine relay 命令是否已有「转发」能力,**没有就做置灰占位 + 注释,不造发送成功**)
- Modify: `src/web/hud/Market.tsx`(分类行「已安装」计数 = 真 installed 数,照 `panels2.jsx:190`)
- Modify: `src/web/hud/Composer.tsx`(quick replies 行,照 `panels2.jsx:696` 的固定句组;点击 = 真发送该文本;文案入 DICT)
- Modify: `src/web/hud/economy/GachaPanel.tsx`(lucky 保底:连续 5 抽未出传说 → 下一抽必出,照 `panels3.jsx:167` 机制;**纯前端确定性**,计数随会话内存即可;UI 显示 lucky 槽进度)
- Test: 各改动对应纯函数/渲染断言(成就过滤、market 计数、gacha lucky 触发边界 5→6 抽)

- [ ] **Step 1: 失败测试** → **Step 2: 逐面板实现(不同文件,可一个 agent 串行完成)** → **Step 3: 门禁全绿**。
- [ ] **Step 4: 提交** — `git commit -m "feat: 🧩 panel parity — achievement tabs, mailbox reader+forward, market counts, quick replies, gacha pity"`

---

## Task 9: i18n 收口 + ROADMAP 回写 + 全量门禁 + 合并

**Files:** `src/web/i18n.ts`(漏网中文串全量入 DICT)、`docs/ROADMAP.md`

- [ ] **Step 1: i18n sweep** — 用既有 leak 脚本(§3.6 提过)扫 EN 模式 0 泄漏;新增串(结构标牌/彩蛋/三面板/quips)全入 DICT。
- [ ] **Step 2: ROADMAP 回写** — §3.6 后新增「§3.7 原型全面还原(2026-06-12)」:逐块记内容 + 真假边界 + 用户翻案决策(坐标/三面板/彩蛋)+ 涉及文件;**修订 §3.6 的「已知小取舍(坐标偏差未动)」与「明确不做(events/dailyRewards)」两段,标注已被本轮用户决策推翻**。
- [ ] **Step 3: 全量门禁** — worktree 内 `bun test`(全绿,计数 ≥ 744+新增)+ `bunx tsc --noEmit` 0 + `bun run check` 0 + `bun run build` 成功。
- [ ] **Step 4: preview 终验** — 回放 fixture:大厅(对照原型截图逐结构核)、内景(地毯/指挥台/泉水/道具)、CN+EN、dungeon+holo、彩蛋逐个点;截图留档。
- [ ] **Step 5: 合并** — 记 worktree HEAD SHA → 主树 `git merge --no-ff <sha>` → 复验门禁全绿。**不 push**(等用户确认)。
- [ ] **Step 6: 清理** — `git worktree remove .worktrees/prototype-parity-restore`。

---

## Self-Review(写完计划自查)

- **Spec 覆盖**:差异盘点的 high/medium 项逐一对位 — 大厅地面 canvas(T1)、环境装饰(T2)、结构特化+坐标+邮箱徽标(T3)、内景布局(T4)、dock 徽标/hotbar 键字/medal(T5)、彩蛋四件套(T6)、翻案三面板(T7)、面板细节五项(T8)、i18n/文档/合并(T9)。**有意不做**已在 Architecture 段列明(聊天抽屉/git 横幅/Codex/RosterCard alert/fx 三档设置/日夜设置),均为此前用户决策或无源,不属遗漏。
- **误报剔除**:scheduler/pairing/gacha/mailbox/board 面板「整块缺失」为盘点 agent 误报(已亲核存在);`hub-grass`/`hub-rug` 是原型死样式(lobby.jsx 不渲染),不 port。
- **类型一致**:`selectMailboxUnreadCount` Task 3 定义、Task 5 复用;`mail`/`medal` 图标 Task 3 加、Task 3/5 用;`ROOM_PROPS` Task 4 自包含;`hub-paint.ts` 的 `buildStoneMap` 仅 Task 1 用。
- **真假分明**:每个数据点标了真源或 MOCK 三重标注;board 便签/邮箱徽标弃原型 mock 改接真;QUIPS 删 askuser/todo 两组无源状态。
- **确定性**:canvas/粒子全用确定性 hash/公式;Math.random 仅限交互触发的彩蛋装饰层且测试注入 RNG。
