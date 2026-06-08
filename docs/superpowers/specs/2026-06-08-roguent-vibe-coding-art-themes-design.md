---
title: Roguent Vibe-Coding 高清美术主题体系 — 设计
date: 2026-06-08
status: design (brainstorm 完成,待 writing-plans)
baseline: 假设 full-prototype（Task 0–67）已完成；本轮为独立美术轮，不与那份 plan 交错
---

# Roguent Vibe-Coding 高清美术主题体系 — 设计

## 0. 一句话

把 Roguent 现有的开源像素素材（0x72 DungeonTileset II）+ 像素字体，替换为**高清原画级、可读耐看、贴合 vibe coding** 的美术；做成**可切换的多主题体系**，并内置一个参数化的 **Roguent 主题生成 SKILL**（确认风格 → 出样图确认 → 批量生成一致风格的资产 → 写入资产目录）。本轮先**完整设计 + 写两套主题（赛博霓虹码库 / 暖光 lo-fi 工位）的全部提示词**，再用一个**代表性切片试产**验证出图效果。

实施（跑 GPT image 出图、整合进渲染器）交给后续轮次 / Codex；本文档只覆盖**头脑风暴 + 设计**，配套的 **writing-plans** 产出实施计划。

---

## 1. 目标与非目标

### 目标
1. **告别像素、改高清原画**：当前 16px 像素素材 + 像素字体**看着眼睛难受、盯久了看不清**，这是本轮要解决的首要痛点。目标观感是高分辨率、干净 cel-shading、平滑清晰边缘、可读性强的游戏插画（**不是**复古 8-bit 像素）。
2. **贴合 vibe coding**：两套主题都必须是"coding 世界"，不是中世纪奇幻。保留《元气骑士》式 top-down chibi 小人 + 房间格式，但世界观换成开发者空间（英雄→chibi 开发者 / AI 小助手，地牢房间→工作空间，掉落→PR/产物）。
3. **多主题、可切换**：设置面板里切主题；切换时全场景 + NPC 形象整体换皮 + 一个游戏化动态加载过场。
4. **参数化生成 SKILL**：内置 `roguent-theme` skill，给一份风格 brief 就能产出一整套风格一致的资产，带用户确认闸门。
5. **本轮交付物**：本设计文档 + 两套主题的完整提示词库 + 代表性切片试产方案 +（writing-plans 阶段）实施计划。

### 非目标（本轮不做）
- 不实现主题切换运行时代码、加载过场、设置开关（属"完整主题系统"轮，见 §8）。
- 不一次性生成全部资产（先切片试产，见 §6）。
- 不改后端 / 引擎 / 事件协议。
- 不动 full-prototype（Task 0–67）那份 plan，不增补其 Task 41/42。
- 字体替换给出推荐与约束（见 §4），但落地由实施轮执行。

---

## 2. 决策日志（已与用户敲定）

| # | 决策 | 取值 |
| --- | --- | --- |
| D1 | 重做范围 | **全部视觉资产**（角色 + 场景 + 道具 + ~40 HUD 图标 + 黑猫 + 字体） |
| D2 | 体系形态 | 多主题 · 设置可切换 · 切换时全场景+NPC 换皮 + 加载过场 · 内置参数化 Roguent skill |
| D3 | 本轮两套主题 | **赛博霓虹码库（冷）** + **暖光 lo-fi 工位（暖）**（两套都贴 vibe coding，一冷一暖反差） |
| D4 | 排期 | 独立 spec/plan；基线＝原型已完成；用户在所有任务结束后再执行；本轮只 brainstorm+plan |
| D5 | 美术保真度 | **高清原画级，禁止像素风**；当前像素素材+字体眼睛难受是核心痛点 |
| D6 | 第一波体量 | **代表性切片**（~14 项关键资产）× 两套主题 ≈ 28 张；满意再扩全量 |
| D7 | 看效果方式 | 先 **全质量预览页**（HD 原图分组对比）；如入原型则走 **HD 渲染路径**（不再做 16px drop-in，那会重造眼睛难受） |

---

## 3. 当前美术现状（梳理结果，作替换基线）

**唯一来源**：`0x72 "16x16 DungeonTileset II"`（CC0），单图集 `public/assets/0x72/dungeon.png` + `dungeon.json`，381 帧。所有 sprite 渲染都从这一张切片。

四类用途：
- **场景/环境**：地牢内景（`src/web/room/DungeonRoom.tsx`：地砖/砖墙/彩旗/喷泉/传送门/宝箱/道具）、大厅广场（`src/web/lobby/HubPlaza.tsx`：CSS 地板+光晕、任务台、商店/排行榜/设置摊位、Claude/Codex 门）。
- **NPC/角色**（全 0x72）：玩家英雄 8、主控=`knight_m`、subagent 池 10（`src/shared/mapping.ts` `HERO_POOL`）、会话 NPC 池 12（`src/web/overworld/skins.ts`）。每英雄 idle4/run4/hit1 帧。
- **HUD 图标**（**程序绘制，非图片**）：`src/web/hud/icons.tsx` ~40 个 rect 拼的像素图标；黑猫 `src/web/lobby/CatPet.tsx` 是手绘 SVG。
- **道具/物件**（0x72）：武器 ~28、药水 8、宝箱、金币、板条箱、骷髅。

**渲染路径**（决定切片要覆盖谁）：
1. **Pixi 内景**：`room/atlas.ts` 加载 atlas → `DungeonRoom`/`Character` 渲染，`scaleMode="nearest"`。
2. **DOM 大厅**：`lobby/atlas-dom.ts` 自行 fetch atlas → `PixelSprite` 用 CSS `background-position` 切片。
3. **DOM 头像**：`hud/HeroPortrait.tsx` 把 atlas 帧裁到 `<canvas>`。
4. **程序图标**：`hud/icons.tsx`（rect）、`CatPet.tsx`（SVG），**不读图片**。

> 关键：当前管线围绕**单张 16px 图集 + 固定帧名**建。HD 化必然要让渲染器改用**大纹理 + 线性过滤**（见 §7）。

---

## 4. 美术保真度与字体（本轮的硬约束）

### 4.1 保真度：高清原画，禁止像素风
- **目标观感**：高分辨率、干净 cel-shading / 矢量感插画、平滑清晰边缘、强可读性、柔和体积光。类比"精致独立游戏 / 现代手游 top-down 卡通"，**不是**复古 8-bit。
- **生成分辨率**：每张 ≥ 1024²（高瘦角色用 1024×1536）；运行时按需高质量降采样到合理尺寸（角色 ~256px 高、瓦片 ~128px），渲染用**线性过滤**，**绝不**降到 16px。
- **提示词纪律**：所有提示词的 `avoid` 必含 `pixel art, 8-bit, retro, jagged edges, dithering, blur, harsh eye-straining contrast`。
- **理由**（写清以免实施时回退到像素）：用户明确反馈现有像素素材"看着眼睛难受、盯着屏幕看不清"；像素 drop-in（降到 16px）会**重造**这个痛点，故 §7 试产不走 16px。

### 4.2 字体：替换眼睛难受的像素字体
- **现状**（`src/web/styles.css`）：拉丁 = `Press Start 2P`（像素）；中文 = `Fusion Pixel 12px Proportional SC`（像素）。两者都难读，是"眼睛难受"的一部分。
- **要求**：换成**清晰耐看、仍有游戏感**的字体——
  - 拉丁标题/数字：圆润有性格的游戏 UI 无衬线（如 *Baloo 2 / Fredoka / Nunito* 一类圆体；等宽数据可用 *JetBrains Mono / IBM Plex Mono* 贴 coding 调性）。
  - 中文：清晰圆体黑体（如 *思源黑体 / HarmonyOS Sans / 站酷高端黑* 之类，**OFL/可商用** 优先），不要点阵像素中文。
  - 自托管 `woff2`，不走 CDN（沿用现有约定）；许可证随附 LICENSE。
- **主题相关性**：字体可随主题微调（赛博偏冷峻几何、lo-fi 偏圆润手感），但**两套都必须清晰可读**——这是底线，压过风格。

---

## 5. 两套主题 brief（锁定的风格基准 / Style Anchor）

每条资产提示词 = **「主题风格前缀」+「资产主体描述」+「构图/技术约束」**。下面是两套主题的**风格前缀**（生成时原样前置到每条提示词，并配合"基准图参考"保持一致，见 §6.3）。

### 5.1 赛博霓虹码库（Cyber Neon Code Vault · 冷）
```
STYLE PREFIX (cyber):
High-resolution game art, clean cel-shaded illustration, crisp smooth vector-like
edges, high readability. Cyberpunk neon-on-dark vibe-coding aesthetic: near-black
base #0b0a12, glowing cyan #36c5e0 and violet #a06cd5 neon accents, subtle magenta
rim light, dark teal ambient shadows, soft volumetric glow, high (but eye-comfortable)
contrast. Consistent soft top key light + neon rim. World theme: late-night coder's
data center / server racks / terminals / holographic UI. Transparent background,
centered subject with margin.
avoid: pixel art, 8-bit, retro, jagged edges, dithering, blur, photo-realism,
3D render, text, watermark, busy background, harsh eye-straining contrast.
```
- **mood**：深夜、neon、专注、高科技。
- **hero 原型**：连帽黑客 / 机械臂 / AI 小机器人，终端面甲、电路镶边发光。

### 5.2 暖光 lo-fi 工位（Cozy Lo-fi Workstation · 暖）
```
STYLE PREFIX (lofi):
High-resolution game art, clean cel-shaded illustration, crisp smooth vector-like
edges, high readability. Cozy lo-fi vibe-coding aesthetic: warm wood browns, creamy
amber desk-lamp light (warm #f2c84b glow), soft sage green #5fd35f plants, gentle
warm shadows, soft ambient occlusion, inviting and calm. Soft warm key light from a
desk lamp, cozy bloom. World theme: cozy home-office coding den — warm lamp, plants,
coffee, sticker-covered laptop, mechanical keyboard, lo-fi mood. Transparent
background, centered subject with margin.
avoid: pixel art, 8-bit, retro, jagged edges, dithering, blur, photo-realism,
3D render, text, watermark, busy background, harsh eye-straining contrast.
```
- **mood**：温暖、放松、lo-fi、cozy。
- **hero 原型**：戴耳机连帽 chibi 开发者、AI 萌宠陪伴，桌面暖光绿植。

### 5.3 构图/技术约束（按资产类别，附加到每条）
- **角色**（hero / subagent / NPC / 猫）：全身、正面或 3/4 视角、idle 站姿、chibi 比例（头身 ~1:2）、清晰剪影、1:1 方图、透明底。
- **瓦片**（floor / wall）：top-down、**可无缝平铺**、瓦片填满画面、1:1 方图。
- **道具/结构**（chest / flask / crate / banner / fountain / door）：单个物件、3/4 视角、1:1 方图、透明底。
- **图标**（read / write / bash / quest）：单一符号、居中、粗壮可读、1:1 方图、透明底、极简背景。

---

## 6. 代表性切片试产（第一波 ≈ 28 张）

### 6.1 切片清单（~14 逻辑资产 × 2 主题）
按"沿用帧位 / 渲染路径"定，覆盖**每一条渲染路径**（Pixi 内景 / DOM 大厅 / 头像 / 图标 / 猫）。多帧资产（英雄 idle/run/hit、宝箱、喷泉）**试产期先出 1 张基准图**，整合时复制填帧。

| # | 逻辑资产 | 沿用帧位 | 渲染路径 |
| --- | --- | --- | --- |
| 1 | 主控英雄 | `knight_m_*` | Pixi 内景 + DOM 头像 |
| 2 | subagent 英雄 A | `wizzard_m_*` | Pixi 内景 + roster |
| 3 | subagent 英雄 B | `elf_f_*` | Pixi 内景 + roster |
| 4 | 大厅 NPC | `goblin_*` | DOM 大厅装饰 |
| 5 | 地砖 | `floor_1` | Pixi 地板 |
| 6 | 墙（顶+身） | `wall_top_mid` + `wall_mid` | Pixi 墙 |
| 7 | 宝箱/掉落 | `chest_full_open_anim` | Pixi |
| 8 | 传送门/门 | `doors_leaf_open` + `doors_leaf_closed` | Pixi 内景 + 大厅 |
| 9 | 喷泉 | `wall_fountain_*` | Pixi |
| 10 | 药水瓶 | `flask_big_blue`, `flask_red` | Pixi 道具 |
| 11 | 板条箱 | `crate` | Pixi 道具 |
| 12 | 彩旗 | `wall_banner_red/blue` | Pixi |
| 13 | HUD 图标 ×4 | read / write / bash / quest | 新增 PNG 路径 |
| 14 | 黑猫 | （现 SVG） | DOM 大厅宠物 |

### 6.2 切片提示词库（28 条 · 主体描述）
> 用法：每条 = `STYLE PREFIX(主题)` + 下面的「主体」+ §5.3 对应类别的构图约束。下列只写**主体**部分。

**1 · 主控英雄（`knight_m`）**
- cyber：`a heroic hooded "code commander", front-facing idle, full body, chibi; dark hoodie with glowing cyan circuit trim, a holographic terminal visor over the eyes, a small mechanical left arm, holding a glowing cyan stylus-blade of light; confident leader stance.`
- lofi：`a cozy "lead dev" hero, front-facing idle, full body, chibi; warm hoodie, over-ear headphones glowing softly, a steaming coffee in one hand, relaxed confident stance; amber lamp glow on the face.`

**2 · subagent 英雄 A（`wizzard_m`）**
- cyber：`an AI "mage-bot" specialist, full body, chibi; sleek robotic body with a floating holographic staff projecting cyan code glyphs, glowing violet core in the chest; calm casting pose.`
- lofi：`a focused developer specialist with round glasses, full body, chibi; cardigan over hoodie, an open glowing laptop hugged to chest, soft sage-green scarf; gentle thinking pose.`

**3 · subagent 英雄 B（`elf_f`）**
- cyber：`a sleek android "scout" agent, full body, chibi; streamlined chrome-and-violet body, glowing visor, a thin neon antenna, holding a small floating drone; agile ready pose.`
- lofi：`a cozy "designer" agent, full body, chibi; oversized warm sweater, a drawing tablet and stylus, a small plant pin; cheerful relaxed pose.`

**4 · 大厅 NPC（`goblin`）— 氛围小人/陪衬**
- cyber：`a small friendly maintenance drone-bot, full body, chibi; round body, two glowing cyan eyes, tiny rotor, a blinking status LED; idle hovering.`
- lofi：`a cute intern character or a walking potted-plant buddy, full body, chibi; oversized beanie, holding a sticky-note; sleepy idle.`

**5 · 地砖（`floor_1`，无缝平铺）**
- cyber：`a seamless tileable top-down floor panel: dark brushed-metal grid with faint glowing cyan circuit lines, subtle reflective sheen, even and non-distracting.`
- lofi：`a seamless tileable top-down floor: warm honey-toned wooden planks, soft grain, gentle warm sheen, cozy and even.`

**6 · 墙（`wall_top_mid` 顶 + `wall_mid` 身，可拼接）**
- cyber：`a top-down dungeon wall section: server-rack panels with neon cyan/violet status lights and cable runs; a darker "cap" strip on top and a taller face below, tileable horizontally.`
- lofi：`a top-down room wall section: warm plaster wall with a small wooden shelf, a framed sticky-note board and a tiny hanging plant; lighter cap strip on top, tileable horizontally.`

**7 · 宝箱 / 掉落（`chest_full_open`）**
- cyber：`a glowing "data crate" / deploy package, 3/4 view; dark casing with cyan seams, lid open revealing floating violet data shards / a glowing PR badge.`
- lofi：`a cozy cardboard delivery box, 3/4 view, lid open with warm light spilling out and a little ribbon; a small "shipped!" tag.`

**8 · 传送门/门（`doors_leaf_open` 内景拱 + `doors_leaf_closed` 大厅门）**
- cyber：`a neon "login portal" archway, front view; dark frame with a swirling cyan/violet energy gate; plus a matching closed terminal door variant with a glowing lock panel.`
- lofi：`a warm wooden office doorway, front view; cozy amber light glowing through the gap; plus a matching closed door variant with a small "in flow, do not disturb" sign.`

**9 · 喷泉（`wall_fountain_*`：top + mid + basin）**
- cyber：`a server liquid-cooling pillar / data-stream fountain, front view; transparent tubes with glowing cyan coolant flowing down into a lit basin.`
- lofi：`a cozy coffee machine / water cooler, front view; warm steam rising, a little tray with mugs, soft amber accent light.`

**10 · 药水瓶（`flask_big_blue` 大 + `flask_red` 小）**
- cyber：`single object: a glowing cyan energy-drink can (big) and a small violet "RAM stick" vial (small), 3/4 view, neon glow.`
- lofi：`single object: a warm latte mug with foam art (big) and a small boba/tea cup (small), 3/4 view, cozy steam.`

**11 · 板条箱（`crate`）**
- cyber：`a stacked compact server unit / equipment crate, 3/4 view; dark metal with cyan edge light and a small status display.`
- lofi：`a cozy stack of cardboard boxes and a few books with a small plant on top, 3/4 view, warm light.`

**12 · 彩旗（`wall_banner_red` / `wall_banner_blue`）**
- cyber：`a hanging LED status banner, front view; dark fabric with a glowing cyan (variant: violet) emblem and a thin neon edge.`
- lofi：`a hanging cozy pennant / mini string-light garland, front view; warm fabric, a hand-drawn emblem, soft glow (variant: a second warm color).`

**13 · HUD 图标 ×4（read / write / bash / quest）**
- cyber：`a set of 4 bold readable neon glyph icons on transparent background, consistent line weight: (read) a glowing eye/document, (write) a glowing pen/cursor, (bash) a terminal prompt ">_" chip, (quest) a glowing waypoint diamond; cyan with violet accents, soft glow.`
- lofi：`a set of 4 warm flat rounded icons on transparent background, consistent line weight: (read) a cozy open book, (write) a pencil, (bash) a rounded terminal window, (quest) a little flag/marker; warm amber with sage-green accents.`

**14 · 黑猫宠物（替换 `CatPet` SVG）**
- cyber：`a small robot cat companion, full body, chibi; matte-black body, glowing cyan LED eyes, a violet collar light, segmented tail; sitting idle.`
- lofi：`a sleepy real black cat companion, full body, chibi; curled/sitting on a warm cushion, soft amber rim light, content expression.`

### 6.3 一致性机制（批量出图不跑偏）
1. **先出 1 张风格基准图**：每套主题先只生成「主控英雄」，作为 **Style Anchor**。
2. **用户确认基准图**（确认闸门）：满意后锁定它的配色/光照/比例/笔触。
3. **后续每张**：`STYLE PREFIX` + 把基准图作为**参考图**喂进 gpt-image-1（image input / edit 接口）+ 主体描述 + 构图约束。固定同一视角与光向。
4. **同类同规格**：同类资产用同一长宽比与构图模板（角色 1:1 全身、瓦片 1:1 无缝、图标 1:1 居中）。

### 6.4 看效果方式（D7）
- **预览页（必做，零风险）**：Codex 出 28 张 1024² 原图 → 生成一个简单 HTML/路由预览页，两套主题分组、原尺寸、并排对比 → 用户判断质量/一致性/冷暖反差。
- **入原型（可选，HD 路径）**：如要在游戏里看，走 **HD 渲染路径**（渲染器改用大纹理 + 线性过滤，见 §7），**不做 16px drop-in**。多帧资产用单基准图复制填帧（先看静态）。

---

## 7. 渲染器与主题包契约（设计；运行时实施留后续轮）

> 本节定义"主题包"格式与 HD 化所需的渲染器改动方向。**本轮只设计**；落地在"完整主题系统"轮。

### 7.1 主题包契约（manifest + 逐资产 HD PNG）
取代"单张硬编码 16px 图集"。每套主题一个目录：
```
public/assets/themes/<theme-id>/
  manifest.json          # 逻辑名 → { file, frames, fps, anchor{x,y}, size{w,h} }
  hero_orchestrator.png  # 透明底 HD
  hero_subagent_a.png
  npc_*.png
  tile_floor.png  tile_wall_cap.png  tile_wall_face.png
  prop_chest.png  prop_potion_big.png  ...
  door_portal.png  door_closed.png  fountain.png  banner_*.png
  icon_read.png ... (~40 全量轮)
  cat_pet.png
  theme.json             # 主题元数据: id, name(zh/en), palette, font, mood
```
- **逻辑名映射**：保留现有"逻辑角色名/帧位"概念（`knight_m` → `hero_orchestrator` 等），由 manifest 解析，渲染器**不再硬编码** `0x72` 路径与帧名。
- **动画**：HD 化后**不强求多帧**——优先**静态图 + 程序化动作**（`Character.tsx` 已有 wander/bob/fade）；idle 可选 2 帧"呼吸"。避免要求 GPT 出 4 帧顺滑循环（它做不好，也是后续可加项）。

### 7.2 HD 渲染器改动方向（要点，非本轮实施）
- atlas 单图 → **按主题读 manifest** 解析逐资产纹理（或运行时打包成大图集）。
- `scaleMode` 从 `nearest` → **`linear`**（HD 平滑）。
- 尺寸/网格：`room/config.ts` 的 `TILE` 与 `layout.ts` 常量、`PixelSprite`/`HeroPortrait` 的 `scale` 改为**主题包驱动的 HD 尺寸**，而非 16px。
- 图标：`icons.tsx`（程序 rect）→ 可选改为读主题包 `icon_*.png`（保留 rect 作回退）。
- 字体：`styles.css` 的 `--pixel/--font-px/--font-cjk` 换 §4.2 的清晰字体；像素字体保留为最末回退或删除。

### 7.3 切主题运行时（要点，非本轮实施）
- 设置面板加"主题"选择 → 写持久化 `settings.theme` → 触发资产重载。
- 切换时播**游戏化加载过场**（沿用 `overworld/PortalTransition.tsx` 的漩涡，文案"切换世界…"），过场中点真正 swap manifest + 预加载新主题纹理，加载完再淡出。

---

## 8. Roguent 主题生成 SKILL（设计；实施留后续轮）

参数化 skill，给一份风格 brief 就能产一整套一致风格的资产。

- **触发**：`/roguent-theme`（或带参数：主题名 / 一句话风格 brief）。
- **Step 1 · 确认 brief**（闸门）：skill 把风格 brief（mood / palette / world / hero 原型 / 字体倾向）整理后给用户确认/修改。
- **Step 2 · 出基准图 + 确认**（闸门）：生成 1–2 张 Style Anchor（主控英雄）→ 给用户看 → 确认或迭代，锁定风格。
- **Step 3 · 批量生成**：用 §6.3 一致性机制，按**全量资产清单**（角色池 + 场景 + 道具 + ~40 图标 + 猫）逐张生成 HD 透明 PNG。
- **Step 4 · 写入 + 打包**：存进 `public/assets/themes/<id>/`，生成 `manifest.json` + `theme.json`；多帧资产按约定生成/复制帧。
- **产出**：一套完整、风格一致、可被渲染器按主题加载的主题包。
- **复用**：本轮两套主题（赛博 / lo-fi）即该 skill 的两次实例化；以后加新主题只需再跑一次。

---

## 9. 全量资产清单（扩展用，切片满意后照此放大）

> 切片（§6.1）验证通过后，按下表扩到全量。每项 × 每主题。

- **角色**：玩家英雄全池（≥8）、主控（金骑士位）、subagent 池（10，`HERO_POOL`）、会话 NPC 池（12，`skins.ts`）、大厅漫步装饰小人（4）。每角色：基准 idle（必出）；run/hit 可选（或程序化）。
- **场景·内景**：floor、wall（top_left/mid/right + left/mid/right + 各 edge 变体）、banner×N、fountain（top/mid/basin）、door（open/closed/frame）、chest（empty/full/mimic）、column、ladder/stairs、spikes 等装饰。
- **场景·大厅**：地板/光晕（现 CSS，可出贴图）、任务台、商店/排行榜/设置摊位、Claude/Codex 门、座基/装饰。
- **道具**：flask×8、coin、crate、skull、weapon×~28（按需挑常用）。
- **HUD 图标**：`icons.tsx` 全量 ~40（heart/gem/coins/quest/shop/trophy/gear/menu/account/pause/read/write/bash/search/task/mcp/ask/todo/idle/done/error/compact/claude/codex/save/vault/…）。
- **宠物**：黑猫（+ 可选其它）。
- **字体**：每主题拉丁 + 中文各 1（§4.2）。

---

## 10. 风险与开放问题
1. **无缝瓦片**：GPT image 出真正可平铺的 floor/wall 不稳；试产需检查接缝，必要时人工/工具补缝或改用"整块地面图"而非 tile。
2. **多帧动画**：GPT 难出顺滑 4 帧；本设计默认"静态 + 程序化动作"，run/hit 列为可选。
3. **跨资产一致性**：靠基准图参考 + 固定前缀；若仍漂移，可锁定 seed / 增加参考图数量。
4. **HD 性能**：大纹理 + 线性过滤 + bloom 的 draw call / 显存；运行时可打包大图集 + 池化（原 spec §13.1 已有此意）。
5. **图标可读性**：HUD 小尺寸下 HD 图标要保持粗壮可读，可能需要专门的"小尺寸图标"规格。
6. **字体许可证**：选 OFL/可商用字体，随附 LICENSE，自托管。
7. **基线漂移**：本设计假设原型（Task 0–67）完成后再执行；届时 Task 41/42 已重构场景代码，§7 的渲染器改动需对照那时的实际结构再细化。

---

## 11. 本轮交付与下一步
- **交付**：本设计文档 + 两套主题完整风格前缀（§5）+ 切片 28 条提示词（§6.2）+ 一致性机制 + 试产看效果方案。
- **下一步**：进入 **writing-plans**，产出代表性切片试产的实施计划（Codex 可执行：出基准图→确认→批量出图→预览页/HD 入原型），以及（可选）后续全量 + 主题系统 + Roguent skill 的分阶段计划骨架。
- **实施归属**：跑 GPT image 出图、整合渲染器 = 后续轮 / Codex；本轮止于设计 + 计划。
