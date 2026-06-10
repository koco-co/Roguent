---
title: Roguent Vibe-Coding 高清像素美术主题体系 — 设计
date: 2026-06-08
status: design (brainstorm 完成,待 writing-plans)
baseline: 假设 full-prototype（Task 0–67）已完成；本轮为独立美术轮,不与那份 plan 交错
---

# Roguent Vibe-Coding 高清像素美术主题体系 — 设计

## 0. 一句话

把 Roguent 现有的开源像素素材（0x72 DungeonTileset II,又小又糊看着眼睛难受）+ 像素字体,替换为**高清、清晰、roguelike 画风**的美术;世界观从"中世纪地牢"换成**vibe coding 工作空间**;地图从"一屏一间"扩成**多区域工作楼层 + 相机跟随**。做成**可切换的多主题体系**,本轮先完整设计 + 写两套主题（**赛博霓虹码库** / **暖光 lo-fi 工位**）的全部提示词,再用一个**代表性切片试产**验证出图效果。

> 画风 ≠ 设定。要的是 **roguelike 的画风/手感**（top-down 像素、清晰、小人在空间里活动、探索感）,**不是地牢这个设定**。地牢不适合 vibe coding,空间应该是"写代码的地方"。

实施（跑 GPT image 出图、整合渲染器、加相机/多区域）交给后续轮 / Codex;本文档只覆盖**头脑风暴 + 设计**,配套的 **writing-plans** 产出实施计划。

---

## 1. 目标与非目标

### 目标
1. **更清晰的 roguelike 像素**:当前 16px 素材**又小又糊、看着眼睛难受**。目标是**高分辨率、干净、对比清楚、可读性强的现代像素美术**（类比 *Dead Cells / Eastward / CrossCode*）——**还是像素、还是肉鸽味,只是清晰得多**。不是平滑插画,也不是糊小的 16px。
2. **vibe coding 世界,不是地牢**:roguelike 画风套在 coding 世界上。英雄→chibi 开发者 / AI 小助手,空间→工作室 / dev 楼层 / 机房 / cozy 工位区,掉落→PR/产物。保留 top-down chibi 小人 + 房间格式,但去奇幻、去地牢。
3. **更大的地图**:现状"一屏=整张图"太无趣。扩成**多区域工作楼层**（工位区 / 绿植休息区 / 咖啡角 / 机房 / 会议角）+ **相机跟随**当前活动/选中 agent,subagent 分布在不同区域干活。
4. **高清字体**:像素字体同样难读,换成清晰耐看的字体。
5. **多主题、可切换**:设置面板切主题;切换时全场景+NPC 整体换皮 + 游戏化加载过场。
6. **参数化生成 SKILL**:内置 `roguent-theme` skill,给一份风格 brief 就能产一整套风格一致的资产,带用户确认闸门。
7. **本轮交付物**:本设计文档 + 两套主题完整提示词库 + 代表性切片试产方案 +（writing-plans 阶段）实施计划。

### 非目标（本轮不做）
- 不实现主题切换运行时、相机/多区域渲染、加载过场、设置开关（属"完整主题系统"轮,见 §7）。
- 不一次性生成全部资产（先切片试产,见 §6）。
- 不改后端 / 引擎 / 事件协议。
- 不动 full-prototype（Task 0–67）那份 plan,不增补其 Task 41/42。
- 字体替换给出推荐与约束（§4.2）,落地由实施轮执行。

---

## 2. 决策日志（已与用户敲定）

| # | 决策 | 取值 |
| --- | --- | --- |
| D1 | 重做范围 | **全部视觉资产**（角色 + 场景 + 道具 + ~40 HUD 图标 + 黑猫 + 字体） |
| D2 | 体系形态 | 多主题 · 设置可切换 · 切换时全场景+NPC 换皮 + 加载过场 · 内置参数化 Roguent skill |
| D3 | 本轮两套主题 | **赛博霓虹码库（冷）** + **暖光 lo-fi 工位（暖）**,两套都贴 vibe coding,一冷一暖反差 |
| D4 | 排期 | 独立 spec/plan;基线＝原型已完成;用户在所有任务结束后再执行;本轮只 brainstorm+plan |
| D5 | 美术保真度 | **高清、清晰、roguelike 像素**（Dead Cells/Eastward 档）;**不是平滑插画,也不是糊小的 16px**;清晰可读、不刺眼是底线 |
| D6 | 世界观 | **vibe coding 工作空间**,不是地牢;roguelike 是画风不是设定 |
| D7 | 地图结构 | **多区域工作楼层 + 相机跟随**;subagent 分布各区域 |
| D8 | 第一波体量 | **代表性切片**（~15 项关键资产）× 两套主题 ≈ 30 张;满意再扩全量 |
| D9 | 看效果方式 | 先 **全质量预览页**;入原型走 **高清像素渲染路径**（`nearest` 整数缩放、源分辨率给高,**不降到 16px**） |

---

## 3. 当前美术现状（梳理结果,作替换基线）

**唯一来源**:`0x72 "16x16 DungeonTileset II"`（CC0）,单图集 `public/assets/0x72/dungeon.png` + `dungeon.json`,381 帧,16px,又小又糊。

四类用途:
- **场景/环境**:内景（`src/web/room/DungeonRoom.tsx`:地砖/砖墙/彩旗/喷泉/门/宝箱/道具,**当前是地牢——本轮改工作空间**）、大厅广场（`src/web/lobby/HubPlaza.tsx`:CSS 地板+光晕、任务台、摊位、门）。
- **NPC/角色**（全 0x72）:玩家英雄 8、主控=`knight_m`、subagent 池 10（`src/shared/mapping.ts` `HERO_POOL`）、会话 NPC 池 12（`src/web/overworld/skins.ts`）。每英雄 idle4/run4/hit1 帧。
- **HUD 图标**（**程序绘制,非图片**）:`src/web/hud/icons.tsx` ~40 个 rect 像素图标;黑猫 `src/web/lobby/CatPet.tsx` 手绘 SVG。
- **道具/物件**（0x72）:武器 ~28、药水 8、宝箱、金币、板条箱、骷髅。

**渲染路径**（决定切片要覆盖谁）:
1. **Pixi 内景**:`room/atlas.ts` 加载 atlas → `DungeonRoom`/`Character`,`scaleMode="nearest"`。
2. **DOM 大厅**:`lobby/atlas-dom.ts` fetch atlas → `PixelSprite` CSS 切片。
3. **DOM 头像**:`hud/HeroPortrait.tsx` 裁帧到 `<canvas>`。
4. **程序图标**:`hud/icons.tsx`（rect）、`CatPet.tsx`（SVG）,不读图片。

> 关键:当前围绕**单张 16px 图集 + 固定帧名 + 单间一屏**建。本轮要:① 源分辨率提高（清晰像素,仍 `nearest`）② 内景改工作空间 ③ 单间→多区域 + 相机。

---

## 4. 美术保真度与字体（硬约束）

### 4.1 保真度:高清清晰的 roguelike 像素
- **目标观感**:现代高清像素——**像素颗粒清晰可辨、对比清楚、可读性强、精灵更大**;参考 *Dead Cells / Eastward / CrossCode*。还是 top-down roguelike 手感,只是清晰得多。
- **明确不是**:① 平滑插画 / 矢量 cel-shading（之前一版写错了,本轮纠正）;② 又小又糊的 16px。
- **生成分辨率**:每张 ≥ 1024²（高瘦角色 1024×1536）;运行时按需高质量降采样到合理的**高像素**源尺寸（如瓦片 32–48px、角色 ~64–96px 高）,渲染保持 **`nearest` 整数缩放**让像素脆。**绝不**降到 16px。
- **提示词纪律**:所有提示词以"high-resolution detailed pixel art, clean defined pixels, crisp, readable"为基调;`avoid` 必含 `tiny low-res muddy 16px, illegible, low contrast, blurry, smooth non-pixel gradients, photo-realism, 3D`。
- **理由**（写清以免实施回退）:用户反馈现有像素"又小又糊、眼睛难受";降到 16px 会重造痛点,故 §6 试产不走 16px drop-in,渲染走高清像素路径。

### 4.2 字体:替换难读的像素字体
- **现状**（`src/web/styles.css`）:拉丁 = `Press Start 2P`（像素）;中文 = `Fusion Pixel 12px Proportional SC`（像素）。两者都难读。
- **要求**:换成**清晰耐看、仍有游戏感**的字体——
  - 拉丁标题/数字:圆润有性格的游戏 UI 无衬线（*Baloo 2 / Fredoka / Nunito*）;等宽数据可用 *JetBrains Mono / IBM Plex Mono* 贴 coding 调性。
  - 中文:清晰圆体黑体（*思源黑体 / HarmonyOS Sans / 站酷高端黑* 等,**OFL/可商用** 优先）,不要点阵像素中文。
  - 自托管 `woff2`,随附 LICENSE,不走 CDN。
- **底线**:两套主题字体可微调风格,但**都必须清晰可读**——可读性压过风格。

---

## 5. 两套主题 brief（锁定的风格基准 / Style Anchor）

每条资产提示词 = **「主题风格前缀」+「资产主体描述」+「构图/技术约束」**。下面是两套主题的**风格前缀**(生成时原样前置,并配合"基准图参考"保持一致,见 §6.3)。

### 5.1 赛博霓虹码库（Cyber Neon Code Vault · 冷）
```
STYLE PREFIX (cyber):
High-resolution detailed pixel art, modern hi-bit roguelike game art (like Dead Cells /
CrossCode): clean defined pixels, crisp, readable, clear contrast, easy on the eyes.
NOT tiny low-res 16px, NOT smooth illustration. Top-down 3/4 view, consistent light
direction. Cyberpunk neon-on-dark vibe-coding WORKSPACE (not a dungeon): a late-night
neon dev floor / server room / terminal stations / holographic UI. Palette: near-black
base #0b0a12, glowing cyan #36c5e0 and violet #a06cd5 neon accents, magenta rim light,
soft glow. Transparent background, centered subject with margin.
avoid: tiny low-res muddy 16px, illegible, low contrast, blurry, smooth non-pixel
gradients, photo-realism, 3D render, text, watermark, busy background, dungeon, medieval.
```
- **mood**:深夜、neon、专注、高科技。
- **hero 原型**:连帽黑客 / 机械臂 / AI 小机器人,终端面甲、电路镶边发光。
- **空间**:霓虹 dev 楼层——终端区 / 机房 / 全息会议区。

### 5.2 暖光 lo-fi 工位（Cozy Lo-fi Workstation · 暖）
```
STYLE PREFIX (lofi):
High-resolution detailed pixel art, modern hi-bit roguelike game art (like Eastward):
clean defined pixels, crisp, readable, warm clear contrast, easy on the eyes.
NOT tiny low-res 16px, NOT smooth illustration. Top-down 3/4 view, consistent light
direction. Cozy lo-fi vibe-coding WORKSPACE (not a dungeon): a cozy dev loft — warm
lamp, plants, coffee, sticker-covered laptop, mechanical keyboard, lo-fi mood. Palette:
warm wood browns, creamy amber lamp light (#f2c84b warmth), sage green #5fd35f plants,
soft warm shadows, cozy bloom. Transparent background, centered subject with margin.
avoid: tiny low-res muddy 16px, illegible, low contrast, blurry, smooth non-pixel
gradients, photo-realism, 3D render, text, watermark, busy background, dungeon, medieval.
```
- **mood**:温暖、放松、lo-fi、cozy。
- **hero 原型**:戴耳机连帽 chibi 开发者、AI 萌宠陪伴,桌面暖光绿植。
- **空间**:cozy dev loft——工位 / 绿植沙发区 / 咖啡角。

### 5.3 构图/技术约束（按资产类别,附加到每条）
- **角色**（hero / subagent / NPC / 猫）:全身、正面或 3/4 视角、idle 站姿、chibi 比例（头身 ~1:2）、清晰剪影、1:1 方图、透明底。
- **瓦片/地面**（floor / wall）:top-down、**可无缝平铺**、瓦片填满画面、1:1 方图。
- **道具/结构/家具**（desk / crate / coffee machine / door / sign / plant）:单个物件、3/4 视角、1:1 方图、透明底。
- **图标**（read / write / bash / quest）:单一符号、居中、粗壮可读、1:1 方图、透明底、极简背景。

---

## 6. 代表性切片试产（第一波 ≈ 30 张）

### 6.1 切片清单（~15 逻辑资产 × 2 主题）
覆盖**每一条渲染路径**（Pixi 内景 / DOM 大厅 / 头像 / 图标 / 猫）+ **多区域 + 工作空间**意图（含 2 种分区地面、工位家具）。多帧资产（英雄、宝箱等）**试产期先出 1 张基准图**,整合时复制/补帧。

| # | 逻辑资产 | 沿用帧位/挂点 | 渲染路径 | 多区域意图 |
| --- | --- | --- | --- | --- |
| 1 | 主控英雄 | `knight_m_*` | Pixi 内景 + DOM 头像 | 角色 |
| 2 | subagent 英雄 A | `wizzard_m_*` | Pixi 内景 + roster | 角色 |
| 3 | subagent 英雄 B | `elf_f_*` | Pixi 内景 + roster | 角色 |
| 4 | 大厅/氛围 NPC | `goblin_*` | DOM 大厅装饰 | 角色 |
| 5 | 地面 · 工位区 | `floor_1` 替位 | Pixi 地板 | **分区 A** |
| 6 | 地面 · 休息区 | 新增地面变体 | Pixi 地板 | **分区 B** |
| 7 | 墙（顶+身） | `wall_top_mid`+`wall_mid` | Pixi 墙 | 区域墙 |
| 8 | 工位家具（桌+显示器） | 新增道具 | Pixi 道具 | **工作空间核心** |
| 9 | 掉落箱 | `chest_full_open_anim` | Pixi | 道具 |
| 10 | 门 / 区域过渡 | `doors_leaf_open`+`doors_leaf_closed` | Pixi 内景 + 大厅 | **区域间过渡/入口** |
| 11 | 咖啡机 / 聚集点 | `wall_fountain_*` 替位 | Pixi | **咖啡角** |
| 12 | 饮品道具 | `flask_big_blue`,`flask_red` | Pixi 道具 | 道具 |
| 13 | 装饰物（绿植/服务器单元） | `crate` 替位 | Pixi 道具 | 各区装饰 |
| 14 | HUD 图标 ×4 | read/write/bash/quest | 新增 PNG 路径 | UI |
| 15 | 黑猫 | （现 SVG） | DOM 大厅宠物 | 宠物 |

### 6.2 切片提示词库（30 条 · 主体描述）
> 用法:每条 = `STYLE PREFIX(主题)` + 下面「主体」+ §5.3 对应类别构图约束。下列只写**主体**。

**1 · 主控英雄（`knight_m`）**
- cyber:`a hooded "code commander" lead, front-facing idle, full body, chibi; dark hoodie with glowing cyan circuit trim, a holographic terminal visor, a small mechanical left arm, holding a glowing cyan stylus-blade of light; confident leader stance.`
- lofi:`a cozy "lead dev", front-facing idle, full body, chibi; warm hoodie, soft-glowing over-ear headphones, a steaming coffee in one hand, relaxed confident stance; amber lamp glow on the face.`

**2 · subagent 英雄 A（`wizzard_m`）**
- cyber:`an AI "specialist bot", full body, chibi; sleek robotic body, a floating holographic panel projecting cyan code glyphs, a glowing violet core; calm focused pose.`
- lofi:`a focused developer with round glasses, full body, chibi; cardigan over hoodie, hugging an open glowing laptop, sage-green scarf; gentle thinking pose.`

**3 · subagent 英雄 B（`elf_f`）**
- cyber:`a sleek android "scout" agent, full body, chibi; chrome-and-violet streamlined body, glowing visor, thin neon antenna, a small floating drone; agile ready pose.`
- lofi:`a cozy "designer" agent, full body, chibi; oversized warm sweater, a drawing tablet and stylus, a little plant pin; cheerful relaxed pose.`

**4 · 大厅/氛围 NPC（`goblin`）**
- cyber:`a small friendly maintenance drone-bot, full body, chibi; round body, two glowing cyan eyes, tiny rotor, a blinking status LED; idle hovering.`
- lofi:`a cute intern character with an oversized beanie holding a sticky-note, full body, chibi; sleepy idle.`

**5 · 地面 · 工位区（无缝平铺）**
- cyber:`a seamless tileable top-down floor for a work zone: dark brushed-metal panels with faint glowing cyan circuit lines and seams, subtle reflective sheen, even, non-distracting.`
- lofi:`a seamless tileable top-down floor for a desk zone: warm honey wooden planks, soft grain, gentle warm sheen, cozy and even.`

**6 · 地面 · 休息区（无缝平铺,与工位区区分）**
- cyber:`a seamless tileable top-down floor for a lounge zone: darker tech-carpet with a subtle violet hex pattern and faint glow, soft, distinct from the metal work-zone floor.`
- lofi:`a seamless tileable top-down floor for a lounge zone: a cozy woven rug in warm tones with a soft pattern, distinct from the wooden desk-zone floor.`

**7 · 墙（`wall_top_mid` 顶 + `wall_mid` 身,可拼接）**
- cyber:`a top-down workspace wall section: server-rack panels with neon cyan/violet status lights and cable runs; a darker cap strip on top, taller face below, tileable horizontally.`
- lofi:`a top-down room wall section: warm plaster wall with a small wooden shelf, a framed sticky-note board, a hanging plant; lighter cap strip on top, tileable horizontally.`

**8 · 工位家具：桌 + 显示器（新增,工作空间核心）**
- cyber:`a top-down 3/4 dev desk: dark desk with dual glowing monitors showing cyan code, a holographic keyboard, neon under-glow; single object.`
- lofi:`a top-down 3/4 cozy dev desk: warm wood desk with a sticker-covered laptop, a small lamp, a coffee mug and a tiny plant; single object.`

**9 · 掉落箱（`chest_full_open`）**
- cyber:`a glowing "data crate" / deploy package, 3/4 view; dark casing with cyan seams, lid open revealing floating violet data shards / a glowing PR badge.`
- lofi:`a cozy cardboard delivery box, 3/4 view, lid open with warm light spilling out, a little ribbon and a "shipped!" tag.`

**10 · 门 / 区域过渡（`doors_leaf_open` 入口拱 + `doors_leaf_closed` 闭门）**
- cyber:`a neon zone-transition archway, front view; dark frame with a swirling cyan/violet energy gate; plus a matching closed terminal door with a glowing lock panel.`
- lofi:`a warm wooden doorway between zones, front view; cozy amber light through the gap; plus a matching closed door with a small "in flow" sign.`

**11 · 咖啡机 / 聚集点（`wall_fountain_*`）**
- cyber:`a sleek neon coffee/energy station, front view; dark machine with cyan accent lights, glowing dispense nozzle, a small lit tray.`
- lofi:`a cozy coffee machine corner, front view; warm steam rising, mugs on a little tray, soft amber accent light.`

**12 · 饮品道具（`flask_big_blue` 大 + `flask_red` 小）**
- cyber:`single object: a glowing cyan energy-drink can (big) and a small violet vial / RAM-stick charm (small), 3/4 view, neon glow.`
- lofi:`single object: a warm latte mug with foam art (big) and a small boba/tea cup (small), 3/4 view, cozy steam.`

**13 · 装饰物（`crate`:各区点缀）**
- cyber:`a stacked compact server unit with cyan edge light and a small status display, 3/4 view; reads as cyber-zone decor.`
- lofi:`a cozy potted plant beside a small stack of books, 3/4 view, warm light; reads as lounge decor.`

**14 · HUD 图标 ×4（read / write / bash / quest）**
- cyber:`a set of 4 bold readable neon pixel icons, consistent line weight, transparent background: (read) a glowing eye/document, (write) a glowing cursor/pen, (bash) a terminal ">_" chip, (quest) a glowing waypoint diamond; cyan with violet accents, soft glow, crisp clean pixels.`
- lofi:`a set of 4 warm rounded pixel icons, consistent line weight, transparent background: (read) a cozy open book, (write) a pencil, (bash) a rounded terminal window, (quest) a little flag; warm amber with sage accents, crisp clean pixels.`

**15 · 黑猫宠物（替换 `CatPet`）**
- cyber:`a small robot cat companion, full body, chibi; matte-black body, glowing cyan LED eyes, a violet collar light, segmented tail; sitting idle.`
- lofi:`a sleepy real black cat companion, full body, chibi; curled on a warm cushion, soft amber rim light, content expression.`

### 6.3 一致性机制（批量出图不跑偏）
1. **先出 1 张风格基准图**:每套主题先只生成「主控英雄」作为 **Style Anchor**。
2. **用户确认基准图**（闸门）:满意后锁定配色/光照/比例/像素密度/笔触。
3. **后续每张**:`STYLE PREFIX` + 把基准图作为**参考图**喂进 gpt-image-1（image input / edit）+ 主体描述 + 构图约束;固定同一视角与光向、同一像素密度。
4. **同类同规格**:同类资产同长宽比/构图模板（角色 1:1 全身、瓦片 1:1 无缝、图标 1:1 居中）。

### 6.4 看效果方式（D9）
- **预览页（必做,零风险）**:Codex 出 30 张 1024² 原图 → 简单 HTML/路由预览页,两套主题分组、原尺寸、并排对比 → 判断质量/一致性/冷暖反差/清晰度。
- **入原型（可选,高清像素路径）**:在游戏里看就走高清像素路径（源分辨率给高、`nearest` 整数缩放,见 §7）,**不做 16px drop-in**。多帧资产用单基准图复制填帧（先看静态）。

---

## 7. 渲染器 / 主题包契约 / 多区域+相机（设计;运行时实施留后续轮）

> 本节定义"主题包"格式与高清像素 + 多区域所需的渲染器方向。**本轮只设计**;落地在"完整主题系统"轮。

### 7.1 主题包契约（manifest + 逐资产高清像素 PNG）
取代"单张硬编码 16px 图集"。每套主题一个目录:
```
public/assets/themes/<theme-id>/
  manifest.json          # 逻辑名 → { file, frames, fps, anchor{x,y}, size{w,h} }
  hero_orchestrator.png  # 透明底,高清像素
  hero_subagent_a.png  npc_*.png
  floor_work.png  floor_lounge.png  wall_cap.png  wall_face.png
  desk.png  prop_crate.png  prop_coffee.png  door_portal.png  door_closed.png
  sign_*.png  decor_plant.png
  icon_read.png ... (~40 全量轮)
  cat_pet.png
  theme.json             # 主题元数据: id, name(zh/en), palette, font, mood
```
- **逻辑名映射**:保留"逻辑角色名/帧位"概念（`knight_m`→`hero_orchestrator` 等）,由 manifest 解析,渲染器不再硬编码 `0x72` 路径与帧名。
- **动画**:高清像素下**不强求多帧**——优先**静态图 + 程序化动作**（`Character.tsx` 已有 wander/bob/fade）;idle 可选 2 帧呼吸。不要求 GPT 出顺滑 4 帧。

### 7.2 高清像素渲染改动方向（要点,非本轮实施）
- atlas 单图 → **按主题读 manifest** 解析逐资产纹理（或运行时打包大图集）。
- **保持 `scaleMode="nearest"` + 整数缩放**让像素脆;源分辨率从 16px 提到高像素（瓦片 32–48、角色 64–96）。**不要** linear（那会糊,失去像素感）。
- 尺寸/网格:`room/config.ts` 的 `TILE` 与 `layout.ts` 常量、`PixelSprite`/`HeroPortrait` 的 `scale` 改为**主题包驱动的高像素尺寸**。
- 图标:`icons.tsx`（程序 rect）→ 可选改读主题包 `icon_*.png`（保留 rect 作回退）。
- 字体:`styles.css` 的 `--pixel/--font-px/--font-cjk` 换 §4.2 清晰字体。

### 7.3 多区域工作楼层 + 相机（要点,非本轮实施;但决定 §6/§9 的场景资产）
- **空间**:把"单间一屏"扩成一个连通的大楼层,分若干 **vibe-coding 区域**:工位区 / 绿植休息区 / 咖啡角 / 机房（cyber）或安静专注区（lofi）/ 会议角。区域间用门/开口/地面变体区分。
- **相机**:虚拟世界 > 视口;相机**跟随**当前活动/选中 agent（或主控）,可平滑跟随 + 边界夹取。`stage-scale.ts`/`layout.ts` 从"等比贴一屏"扩成"世界坐标 + 相机视窗"。
- **agent 分布**:subagent 按角色/工具分配到不同区域的工位,在各自区域 wander 干活;主控居中或在"指挥位"。
- **art 影响（本轮要画的）**:每区一套地面 + 墙变体、区域间过渡件、各区标志性家具/装饰（桌+显示器、沙发、咖啡机、机架、绿植、白板等）。切片已含 2 种地面 + 桌 + 咖啡机 + 装饰作验证。

---

## 8. Roguent 主题生成 SKILL（设计;实施留后续轮）

参数化 skill,给一份风格 brief 就能产一整套一致风格的资产。

- **触发**:`/roguent-theme`（或带参数:主题名 / 一句话风格 brief）。
- **Step 1 · 确认 brief**（闸门）:整理风格 brief（mood / palette / world / hero 原型 / 区域设定 / 字体倾向）给用户确认/修改。
- **Step 2 · 出基准图 + 确认**（闸门）:生成 1–2 张 Style Anchor（主控英雄）→ 给用户看 → 确认或迭代,锁定风格。
- **Step 3 · 批量生成**:用 §6.3 一致性机制,按**全量资产清单**逐张生成高清像素透明 PNG。
- **Step 4 · 写入 + 打包**:存进 `public/assets/themes/<id>/`,生成 `manifest.json` + `theme.json`;多帧资产按约定生成/复制帧。
- **产出**:一套完整、风格一致、可被渲染器按主题加载的主题包。
- **复用**:本轮两套主题即该 skill 的两次实例化;以后加新主题再跑一次。

---

## 9. 全量资产清单（扩展用,切片满意后照此放大）

> 切片（§6.1）验证通过后,按下表扩到全量。每项 × 每主题。

- **角色**:玩家英雄全池（≥8）、主控、subagent 池（10）、会话 NPC 池（12）、漫步装饰小人（4）。每角色:基准 idle（必出）;run/hit 可选（或程序化）。
- **场景·楼层（多区域）**:每区一套 floor + wall（含 cap/face/edge 变体）、区域间过渡件、门（open/closed/frame）。区域:工位 / 休息绿植 / 咖啡角 / 机房或专注区 / 会议角。
- **场景·大厅**:地板/光晕、任务台、商店/排行榜/设置摊位、Claude/Codex 门、座基/装饰。
- **家具/道具**:桌+显示器、椅、沙发、白板、书架、咖啡机、绿植、服务器单元、掉落箱（empty/full/mimic 替位）、饮品×N、coin、装饰小物。
- **HUD 图标**:`icons.tsx` 全量 ~40。
- **宠物**:黑猫（+ 可选其它）。
- **字体**:每主题拉丁 + 中文各 1（§4.2）。

---

## 10. 风险与开放问题
1. **无缝瓦片**:GPT image 出真正可平铺的 floor/wall 不稳;试产需检查接缝,必要时补缝或改"整块地面图"。
2. **多区域布局/相机**:是新增的渲染器系统(世界坐标 + 相机 + 区域划分),工作量不小,落地在运行时轮;本轮只定 art 需求与方向。
3. **高清像素一致性**:跨资产像素密度/比例要统一;靠基准图参考 + 固定前缀,必要时锁 seed。
4. **多帧动画**:GPT 难出顺滑 4 帧;默认"静态 + 程序化动作",run/hit 可选。
5. **性能**:高清纹理 + 多区域大世界 + bloom 的 draw call/显存;可运行时打包大图集 + 池化 + 视锥剔除。
6. **图标可读性**:HUD 小尺寸下高清像素图标要保持粗壮可读,可能需专门"小尺寸图标"规格。
7. **字体许可证**:选 OFL/可商用,随附 LICENSE,自托管。
8. **基线漂移**:本设计假设原型（Task 0–67）完成后再执行;届时 Task 41/42 已重构场景代码,§7 渲染改动需对照那时实际结构再细化。

---

## 11. 本轮交付与下一步
- **交付**:本设计文档 + 两套主题完整风格前缀（§5）+ 切片 30 条提示词（§6.2）+ 一致性机制 + 试产看效果方案 + 多区域/相机的 art 需求与方向。
- **下一步**:进入 **writing-plans**,产出代表性切片试产的实施计划（Codex 可执行:出基准图→确认→批量出图→预览页/高清像素入原型）,以及（可选）后续全量 + 多区域主题系统 + Roguent skill 的分阶段计划骨架。
- **实施归属**:跑 GPT image 出图、整合渲染器、加相机/多区域 = 后续轮 / Codex;本轮止于设计 + 计划。
