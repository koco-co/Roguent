# Roguent 原型整屋换肤预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **项目工作流:** 按 `.claude/rules/workflow.md`,在 detached worktree 内执行(`git worktree add --detach .worktrees/art-slice-trial main`),通过后 `merge --no-ff` 回 main。
>
> **这是什么:** 一次性「看效果」预览轮——把 GPT 生成的 vibe-coding 主题美术,塞进 **`Roguent-handoff.zip` 里那套 Claude Design 像素原型**(`Roguent.html`),浏览器打开看**整屋换肤**的实际观感。**不碰 `src/` 真实实现**(那是另一轮,等 full-prototype Task 0–67 完成后再按 spec §7 接主题系统)。
>
> **取代关系:** 本计划取代旧版「怼 src/public」的切片试产;[spec](../specs/2026-06-08-roguent-vibe-coding-art-themes-design.md) 的画风/主题/字体设计仍有效,只是交付载体改为原型副本。

**Goal:** 用 GPT image 生成一套 vibe-coding 主题(首版 `cyber` 赛博霓虹码库)的 **30 项整屋资产**(对齐原型真实帧名 / 角色 base),通过一个 ~25 行的「per-asset 覆盖 shim」注入原型渲染层,开 `Roguent.html` 看整间工作楼层 + 角色全部换皮,验证清晰度/画风/一致性/vibe-coding 调性,再决定扩到第二主题与 src 集成。

**Architecture:** 三段。①**生成管线** `scripts/art/`(入 git、可复用):`prompts.ts`(提示词 + 资产字典 + `OVERRIDE_MAP` 唯一真源)→ `gen.ts`(调 OpenAI Images `gpt-image-1` 出图,先出 1 张基准图确认风格,再以基准图为参考批量出其余)→ `overrides.ts`(从 `OVERRIDE_MAP` 生成原型用的 `overrides.js`)。②**原型副本** `prototype/`(从 zip 解出、整体 gitignore、本地预览工作区):生成图落 `prototype/project/public/assets/themes/<theme>/`,`sprites.jsx` 加覆盖 shim,`Roguent.html` 加载 `overrides.js`。③**看效果**:浏览器直开 `Roguent.html`(原型自带 React/Babel CDN,无需构建)。纯逻辑(提示词组装、请求构造、override 映射)走 TDD;出图质量与整屋观感由人工 + 确认闸门把关。无 API key 时支持「手动用 GPT 出图后按命名放入目录」回退,后续步骤不变。

**Tech Stack:** Bun + TypeScript, `bun:test`, Biome, OpenAI Images API(`gpt-image-1`,REST `fetch`,无新依赖)。原型侧:React 18 + Babel standalone(CDN,原型自带,零构建)。

---

## 背景:原型怎么渲染美术(实现前必读)

`Roguent.html` 浏览器直开,CDN 拉 React18 + Babel,现场编译 jsx。加载顺序(`Roguent.html:30-41`):`atlas-frames.js` → `data.js` → `sprites.jsx` → `icons.jsx` → `room.jsx` → … → `app.jsx`。

**所有美术来自一张打包图集** `window.ATLAS`(`atlas-frames.js`):
```js
window.ATLAS = { image:"public/assets/0x72/dungeon.png", w:128, h:1178,
  frames:{ "floor_1":[0,96,16,16], "knight_m_idle_anim_f0":[32,712,16,28], ... } };  // name -> [x,y,w,h]
```

**两条渲染路径**(shim 都要挂):
1. **Canvas** —— `window.drawFrame(ctx,name,dx,dy,scale)`(`sprites.jsx:84`)。`paintRoom`/`paintHub`(`room.jsx`)用它把地板/墙/喷泉/道具/门画到 1920×1120 canvas,瓦片 16px×scale5=80px。**外加大量 `fillRect`/`arc` 程序化装饰**(符文圈、地毯、花、石头)——非帧,本轮不动(留作主题氛围,或后续轮处理)。
2. **CSS** —— `PixelSprite({name|base, anim, scale, flip, filter})`(`sprites.jsx:39`)。`name` 直给帧名;`base` → `framesFor(base,anim)` 解析成 `<base>_<anim>_anim_fN`,用 CSS `background-position` 从图集裁切。角色全走这条;少量场景 sprite(`weapon_golden_sword`、`wall_fountain_*`、`coin_anim_f0`、`doors_leaf_closed`、`chest_full_open_anim_f1`)也走它。

**关键约束:** 原型里**只有一张图、按坐标裁切**,无法「替换某张图片」。覆盖 shim 的做法:维护 `{帧名|base → assetId}` 映射,命中就**整块画新 PNG**(footprint 仍用原帧的 `w*scale × h*scale`,保证布局不位移),未命中回落 0x72 图集裁切。高清新图缩放时 `imageSmoothingEnabled=true`(平滑下采样不锯齿),旧图集像素仍 `false`(保持像素感)。

---

## File Structure

| 文件 | 职责 | git |
| --- | --- | --- |
| `scripts/art/prompts.ts` | 提示词唯一真源:`STYLE_PREFIX`(2 主题)、`FRAMING`(按类别)、`ASSETS`(30 资产 × 每主题主体)、`assemblePrompt()`、`listJobs()`、`OVERRIDE_MAP`(帧名/base → assetId) | ✅ 入库 |
| `scripts/art/prompts.test.ts` | `assemblePrompt`/`listJobs`/`OVERRIDE_MAP` 单测 | ✅ |
| `scripts/art/api.ts` | `targetPath()`/`buildGenRequest(prompt,key,size)`/`buildEditRequest()`/`decodeAndWrite()`/`callImageApi()`/`callEditApi()` | ✅ |
| `scripts/art/api.test.ts` | 请求构造 + b64 落盘单测(mock) | ✅ |
| `scripts/art/gen.ts` | CLI:`--theme`/`--asset`/`--anchor`/`--all`/`--dry-run`/`--ref-anchor`;按类别选图尺寸 | ✅ |
| `scripts/art/overrides.ts` | 从 `OVERRIDE_MAP` + `--theme` 生成 `prototype/project/roguent/overrides.js` | ✅ |
| `scripts/art/overrides.test.ts` | `renderOverridesJs()` 生成内容单测 | ✅ |
| `scripts/art/README.md` | 用法说明 | ✅ |
| `prototype/` | 从 `Roguent-handoff.zip` 解出的原型副本(预览工作区) | ❌ gitignore |
| `prototype/project/roguent/sprites.jsx` | **改**:覆盖 shim(`drawFrame`/`PixelSprite`/`loadAtlasImage` + 预加载) | ❌(在 prototype/) |
| `prototype/project/roguent/overrides.js` | **生成**:`window.ART_OVERRIDE={theme,map}` | ❌ |
| `prototype/project/Roguent.html` | **改**:多加载一行 `overrides.js` | ❌ |
| `prototype/project/public/assets/themes/<theme>/<assetId>.png` | 生成产物(本地预览) | ❌ |

**约定:**
- `themeId ∈ {"cyber","lofi"}`;首版只跑 `cyber`(`lofi` 仅 `--theme lofi` 重跑即可)。
- **30 个 assetId**(= prompts.ts `ASSETS` 的 key)分三类:
  - **character(12)** = 角色 base(直接用 0x72 base 名):`knight_m`(=Orchestrator 主控,金染)、`knight_f`(Warden 测试)、`wizzard_m`(Surveyor 勘察)、`wizzard_f`、`elf_m`、`elf_f`(Scribe 文档)、`dwarf_m`(Quartermaster 依赖)、`dwarf_f`、`lizard_m`(Tinker 构建)、`lizard_f`、`goblin`、`angel`。
  - **tile(6)**:`floor_1`、`floor_2`、`floor_3`(石/木地三变体)、`grass`(户外/休息区)、`wall_mid`(墙主面,水平平铺)、`wall_top`(墙顶盖条)。
  - **prop(12)**:`banner`、`fountain_top`、`fountain_mid`、`fountain_basin`、`crate`、`skull`、`flask`、`coin`、`chest_empty`、`chest_full`、`door_frame`、`door_leaf`。
- **OVERRIDE_MAP**(帧名/base → assetId,shim 用;一对多别名让一张图覆盖多帧):

  | assetId | 覆盖的原型帧名 / base |
  | --- | --- |
  | `knight_m`…`angel`(12) | 各自 base 名(`knight_m`、`knight_f`、…) |
  | `floor_1` | `floor_1` + `edge-tl`/`edge-tr`/`edge-bl`/`edge-br`/`edge-top`/`edge-bottom`/`edge-left`/`edge-right`(8 个广场描边瓦简化为主石板) |
  | `floor_2` | `floor_2` |
  | `floor_3` | `floor_3` |
  | `grass` | `grass` |
  | `wall_mid` | `wall_mid` |
  | `wall_top` | `wall_top_mid` |
  | `banner` | `wall_banner_blue`、`wall_banner_green`、`wall_banner_yellow` |
  | `fountain_top` | `wall_fountain_top_1` |
  | `fountain_mid` | `wall_fountain_mid_blue_anim_f0` |
  | `fountain_basin` | `wall_fountain_basin_blue_anim_f0` |
  | `crate` | `crate` |
  | `skull` | `skull` |
  | `flask` | `flask_big_green`、`flask_big_blue`、`flask_big_red` |
  | `coin` | `coin_anim_f0`、`coin_anim_f1`、`coin_anim_f2`、`coin_anim_f3` |
  | `chest_empty` | `chest_empty_open_anim_f0` |
  | `chest_full` | `chest_full_open_anim_f0`、`chest_full_open_anim_f1`、`chest_mimic_open_anim_f1` |
  | `door_frame` | `doors_frame_top` |
  | `door_leaf` | `doors_leaf_closed` |

- **out of scope(首轮不换)**:HUD 图标(`icons.jsx` 是程序化 SVG 矩形,本就清晰矢量)、`weapon_golden_sword`(lobby 装饰)、程序化 canvas 装饰(符文圈/花草)、字体(spec §4.2,后续轮)、多区域+相机(spec §7.3)、第二主题 `lofi`(管线已支持,确认 cyber 后 `--theme lofi` 跑)。

---

## Task 0: 解原型副本 + gitignore + scaffold

**Files:**
- Create: `prototype/`(解压产物)、`scripts/art/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 解 zip 到 prototype/**

Run:
```bash
rm -rf prototype && unzip -q Roguent-handoff.zip -d prototype/_unzipped \
  && mv prototype/_unzipped/roguent/* prototype/ && rm -rf prototype/_unzipped
```
Expected: 存在 `prototype/project/Roguent.html`、`prototype/project/roguent/sprites.jsx`、`prototype/project/public/assets/0x72/dungeon.png`。

- [ ] **Step 2: gitignore 原型副本**

把 `prototype/` 加入 `.gitignore`(预览工作区,可从 zip 复现,含大截图,不入库):
```
# 美术预览原型副本(从 Roguent-handoff.zip 解出,本地预览用)
prototype/
```

Run: `git check-ignore prototype/project/Roguent.html`
Expected: 打印 `prototype/project/Roguent.html`(已被忽略)。

- [ ] **Step 3: 冒烟——原型原样能开**

Run: `cd prototype/project && python3 -m http.server 8910 >/dev/null 2>&1 & sleep 1 && curl -s -o /dev/null -w "%{http_code}" http://localhost:8910/Roguent.html ; kill %1`
Expected: `200`(静态可服务;真正肉眼看在 Task 7,这里只确认文件齐全可起服务)。

- [ ] **Step 4: scaffold scripts/art/README.md**

`scripts/art/README.md`:
```markdown
# Roguent 原型整屋换肤预览工具

生成一套主题(cyber/lofi)的 30 项整屋资产,经覆盖 shim 注入 zip 原型,开 Roguent.html 看整屋换肤。

## 用法
1. 解原型副本(见 plan Task 0):prototype/ 由 Roguent-handoff.zip 解出。
2. 设 `OPENAI_API_KEY`(自动出图)。
3. 基准图:`bun scripts/art/gen.ts --anchor --theme cyber`
4. 人工确认基准图 prototype/project/public/assets/themes/cyber/knight_m.png。
5. 批量:`bun scripts/art/gen.ts --all --theme cyber --ref-anchor`
6. 生成覆盖表:`bun scripts/art/overrides.ts --theme cyber`
7. 装 shim(plan Task 6,改 sprites.jsx + Roguent.html 一次性)。
8. 浏览器开 prototype/project/Roguent.html(或 `cd prototype/project && python3 -m http.server`)。

## 无 API key 的手动回退
- `bun scripts/art/gen.ts --all --theme cyber --dry-run` 打印每张完整提示词与目标路径。
- 手动用 GPT 按提示词出图,按目标路径存为 PNG,再从第 6 步继续。

## 换第二主题
重跑第 3–6 步把 `--theme cyber` 换成 `--theme lofi`,再刷新页面。
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore scripts/art/README.md
git commit -m "chore: 🧹 scaffold prototype reskin preview (unzip + gitignore + readme)"
```

---

## Task 1: 提示词唯一真源 + 资产字典 + OVERRIDE_MAP

**Files:**
- Create: `scripts/art/prompts.ts`
- Test: `scripts/art/prompts.test.ts`

- [ ] **Step 1: 写失败测试**

`scripts/art/prompts.test.ts`:
```ts
import { describe, expect, it } from "bun:test";
import { ASSETS, OVERRIDE_MAP, assemblePrompt, listJobs, THEMES } from "./prompts";

describe("prompts", () => {
  it("30 资产、2 主题、60 个 job", () => {
    expect(Object.keys(ASSETS)).toHaveLength(30);
    expect(THEMES).toEqual(["cyber", "lofi"]);
    expect(listJobs()).toHaveLength(60);
  });

  it("assemblePrompt 含风格前缀 + 主体 + 构图 + avoid(含 dungeon 防回退)", () => {
    const p = assemblePrompt("cyber", "knight_m");
    expect(p).toContain("Cyberpunk neon");
    expect(p).toContain("Orchestrator");
    expect(p).toContain("Full body");
    expect(p).toContain("avoid:");
    expect(p).toContain("dungeon");
  });

  it("同资产 cyber/lofi 主体不同", () => {
    expect(assemblePrompt("cyber", "floor_1")).toContain("metal");
    expect(assemblePrompt("lofi", "floor_1")).toContain("wood");
  });

  it("OVERRIDE_MAP 每个 value 都是合法 assetId", () => {
    const ids = new Set(Object.keys(ASSETS));
    for (const aid of Object.values(OVERRIDE_MAP)) {
      expect(ids.has(aid)).toBe(true);
    }
  });

  it("OVERRIDE_MAP 覆盖了 12 个角色 base + 关键场景帧", () => {
    for (const base of ["knight_m", "wizzard_m", "elf_f", "lizard_m", "goblin", "angel"]) {
      expect(OVERRIDE_MAP[base]).toBe(base);
    }
    expect(OVERRIDE_MAP["wall_top_mid"]).toBe("wall_top");
    expect(OVERRIDE_MAP["coin_anim_f3"]).toBe("coin");
    expect(OVERRIDE_MAP["edge-tl"]).toBe("floor_1");
    expect(OVERRIDE_MAP["doors_leaf_closed"]).toBe("door_leaf");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test scripts/art/prompts.test.ts`
Expected: FAIL（`Cannot find module "./prompts"`）。

- [ ] **Step 3: 实现 prompts.ts**

`scripts/art/prompts.ts`:
```ts
// 提示词唯一真源(对应 spec §5/§6.2)。每条 = STYLE_PREFIX + 主体 + FRAMING + AVOID。
// 资产对齐原型真实帧名/角色 base(见 plan「约定」);OVERRIDE_MAP 给覆盖 shim 用。

export const THEMES = ["cyber", "lofi"] as const;
export type ThemeId = (typeof THEMES)[number];

export const STYLE_PREFIX: Record<ThemeId, string> = {
  cyber:
    "High-resolution detailed pixel art, modern hi-bit roguelike game art " +
    "(like Dead Cells / CrossCode): clean defined pixels, crisp, readable, " +
    "clear contrast, easy on the eyes. NOT tiny low-res 16px, NOT smooth " +
    "illustration. Top-down 3/4 view, consistent top-left light. Cyberpunk " +
    "neon-on-dark vibe-coding WORKSPACE (not a dungeon): late-night neon dev " +
    "floor / server room / terminal stations. Palette: near-black #0b0a12, " +
    "glowing cyan #36c5e0 and violet #a06cd5 neon accents, magenta rim light, " +
    "soft glow.",
  lofi:
    "High-resolution detailed pixel art, modern hi-bit roguelike game art " +
    "(like Eastward): clean defined pixels, crisp, readable, warm clear " +
    "contrast, easy on the eyes. NOT tiny low-res 16px, NOT smooth " +
    "illustration. Top-down 3/4 view, consistent top-left light. Cozy lo-fi " +
    "vibe-coding WORKSPACE (not a dungeon): cozy dev loft — warm lamp, plants, " +
    "coffee, sticker-covered laptops, mechanical keyboards. Palette: warm wood " +
    "browns, creamy amber lamp light #f2c84b, sage green #5fd35f plants, soft " +
    "warm shadows, cozy bloom.",
};

export const AVOID =
  "avoid: tiny low-res muddy 16px, illegible, low contrast, blurry, smooth " +
  "non-pixel gradients, photo-realism, 3D render, text, watermark, busy " +
  "background, dungeon, medieval, fantasy weapons.";

type Category = "character" | "tile" | "prop";

export const FRAMING: Record<Category, string> = {
  character:
    "Full body, idle pose, chibi proportions (~1:2 head-to-body), clear " +
    "silhouette, centered with margin, fully transparent background, tall 2:3.",
  tile:
    "Seamless tileable top-down texture filling the whole frame edge-to-edge, " +
    "even and non-distracting, no border, square 1:1.",
  prop:
    "Single object, top-down 3/4 view, grounded, centered with margin, fully " +
    "transparent background, square 1:1.",
};

interface Asset {
  category: Category;
  body: Record<ThemeId, string>;
}

export const ASSETS: Record<string, Asset> = {
  // ---- characters (12 base) ----
  knight_m: {
    category: "character",
    body: {
      cyber:
        "the lead 'Orchestrator' dev — a hooded operator in a dark techwear " +
        "hoodie with glowing cyan circuit trim, a holographic visor, a small " +
        "glowing cyan stylus-blade, confident commander stance.",
      lofi:
        "the lead 'Orchestrator' dev — cozy hoodie, over-ear headphones, a " +
        "steaming coffee mug, relaxed confident leader stance, warm lamp glow.",
    },
  },
  knight_f: {
    category: "character",
    body: {
      cyber:
        "the 'Warden' QA agent — sleek techwear jacket with cyan piping, a " +
        "glowing earpiece HUD, ponytail, alert verifying pose holding a scan lens.",
      lofi:
        "the 'Warden' QA dev — warm cardigan, glasses, a magnifier and a " +
        "checklist, attentive careful pose.",
    },
  },
  wizzard_m: {
    category: "character",
    body: {
      cyber:
        "the 'Surveyor' code-scout AI — long dark coat with violet neon runes, " +
        "holding a glowing staff that projects floating code glyphs, scanning pose.",
      lofi:
        "the 'Surveyor' code reader — long knit cardigan, holding a glowing " +
        "tablet of code, soft amber reading light, contemplative pose.",
    },
  },
  wizzard_f: {
    category: "character",
    body: {
      cyber:
        "a data-mage analytics AI — violet-lit robe-coat, a floating " +
        "holographic data orb, glowing glyph markings, focused pose.",
      lofi:
        "a data analyst dev — comfy oversized sweater, holding a notebook of " +
        "charts, a small plant pin, thoughtful pose.",
    },
  },
  elf_m: {
    category: "character",
    body: {
      cyber:
        "a frontend 'scout' agent — slim chrome-and-cyan body, a floating UI " +
        "panel, neon visor, agile ready pose.",
      lofi:
        "a frontend dev — light hoodie, a sketch tablet and stylus, cheerful " +
        "nimble pose.",
    },
  },
  elf_f: {
    category: "character",
    body: {
      cyber:
        "the 'Scribe' docs agent — sleek neon-trimmed bodysuit, a glowing " +
        "floating document panel, poised writing pose.",
      lofi:
        "the 'Scribe' docs dev — warm pastel sweater, an open notebook and " +
        "pen, a little plant pin, friendly pose.",
    },
  },
  dwarf_m: {
    category: "character",
    body: {
      cyber:
        "the 'Quartermaster' deps/infra bot — stout armored chassis with cyan " +
        "vents, a glowing wrench-tool, sturdy stance.",
      lofi:
        "the 'Quartermaster' infra dev — work apron over hoodie, a wrench and " +
        "a coffee, sturdy friendly stance.",
    },
  },
  dwarf_f: {
    category: "character",
    body: {
      cyber:
        "a devops agent — compact reinforced body, cyan status lights, a " +
        "floating deploy token, ready stance.",
      lofi:
        "a devops dev — beanie, tool-belt, holding a deploy checklist, " +
        "dependable pose.",
    },
  },
  lizard_m: {
    category: "character",
    body: {
      cyber:
        "the 'Tinker' build agent — lean cyan-eyed streamlined droid chassis, " +
        "a glowing build-beam tool, alert assembling pose.",
      lofi:
        "the 'Tinker' build dev — rolled sleeves, a soldering iron and gears, " +
        "focused tinkering pose.",
    },
  },
  lizard_f: {
    category: "character",
    body: {
      cyber:
        "a crawler/data agent — sleek dark body with cyan sensor stripes, a " +
        "floating radar ping, agile pose.",
      lofi:
        "a researcher dev — scarf, a stack of open tabs/papers, curious pose.",
    },
  },
  goblin: {
    category: "character",
    body: {
      cyber:
        "a tiny utility 'linter' bot — small round chassis, one big glowing " +
        "cyan eye, blinking, helpful mischievous idle.",
      lofi:
        "a tiny helper intern — oversized beanie, holding a sticky-note, " +
        "sleepy cute idle.",
    },
  },
  angel: {
    category: "character",
    body: {
      cyber:
        "a 'monitor' guardian AI — softly glowing cyan halo ring, floating " +
        "sentinel body, calm watchful hover.",
      lofi:
        "a guardian dev — a soft glowing desk-lamp halo, a clipboard of " +
        "uptime, gentle watchful pose.",
    },
  },

  // ---- tiles (6) ----
  floor_1: {
    category: "tile",
    body: {
      cyber:
        "a seamless tileable top-down WORK-FLOOR: dark brushed-metal panel " +
        "with faint glowing cyan circuit seams, subtle reflective sheen.",
      lofi:
        "a seamless tileable top-down floor: warm honey wooden plank, soft " +
        "grain, gentle warm sheen, cozy.",
    },
  },
  floor_2: {
    category: "tile",
    body: {
      cyber:
        "a seamless tileable metal floor variant: a slightly different cyan " +
        "seam / panel split, same dark palette as the main work-floor.",
      lofi:
        "a seamless tileable wooden floor variant: a slightly different plank " +
        "grain/knot, same warm palette as the main floor.",
    },
  },
  floor_3: {
    category: "tile",
    body: {
      cyber:
        "a seamless tileable metal floor accent: a faint glowing cyan vent " +
        "grille detail, same dark palette, used sparsely.",
      lofi:
        "a seamless tileable wooden floor accent: a small inlaid knot/seam " +
        "detail, same warm palette, used sparsely.",
    },
  },
  grass: {
    category: "tile",
    body: {
      cyber:
        "a seamless tileable tile for an outdoor tech-courtyard: dark " +
        "synthetic turf with a faint cyan grid glow, calm.",
      lofi:
        "a seamless tileable tile for a cozy garden courtyard: soft green " +
        "grass with gentle warm dapple, calm.",
    },
  },
  wall_mid: {
    category: "tile",
    body: {
      cyber:
        "a workspace wall face, horizontally tileable: server-rack panels " +
        "with neon cyan/violet status lights and cable runs, top-down 3/4.",
      lofi:
        "a workspace wall face, horizontally tileable: warm plaster wall with " +
        "a wooden batten and a small framed note, top-down 3/4.",
    },
  },
  wall_top: {
    category: "tile",
    body: {
      cyber:
        "a thin wall cap/coping strip, horizontally tileable: dark metal trim " +
        "with a faint cyan edge light, matches the server-rack wall.",
      lofi:
        "a thin wall cap/coping strip, horizontally tileable: warm wood " +
        "molding, matches the plaster wall.",
    },
  },

  // ---- props (12) ----
  banner: {
    category: "prop",
    body: {
      cyber:
        "a hanging workspace banner/pennant: dark fabric with a glowing cyan " +
        "emblem (a stylized terminal prompt), neon trim.",
      lofi:
        "a hanging cozy felt pennant: warm fabric with a cute embroidered " +
        "coffee-cup emblem, soft tassels.",
    },
  },
  fountain_top: {
    category: "prop",
    body: {
      cyber:
        "the TOP segment of a central 'server core' column: a glowing cyan " +
        "data-crystal finial emitting soft light; designed to stack above the " +
        "mid segment.",
      lofi:
        "the TOP segment of a central 'coffee bar' fixture: a warm hanging " +
        "lamp and a shelf of mugs; designed to stack above the mid segment.",
    },
  },
  fountain_mid: {
    category: "prop",
    body: {
      cyber:
        "the MID segment of the central server-core column: a humming server " +
        "stack with cyan light bars and cables; stacks below the top, above " +
        "the basin.",
      lofi:
        "the MID segment of the central coffee bar: a wooden counter with a " +
        "coffee machine and rising steam; stacks below the top shelf.",
    },
  },
  fountain_basin: {
    category: "prop",
    body: {
      cyber:
        "the BASE/basin segment of the central server-core: a wide dark " +
        "plinth with a glowing cyan coolant pool; the bottom of the stack.",
      lofi:
        "the BASE segment of the central coffee bar: a wide wooden base with " +
        "a warm rug and a little cat bowl; the bottom of the stack.",
    },
  },
  crate: {
    category: "prop",
    body: {
      cyber:
        "a single 'deploy crate': dark casing with glowing cyan seams and a " +
        "small status LED.",
      lofi:
        "a single cozy cardboard storage box, slightly worn, a little tape " +
        "and a label.",
    },
  },
  skull: {
    category: "prop",
    body: {
      cyber:
        "a small desk ornament: a glowing cyan 'error/bug' totem chip, neon, " +
        "compact.",
      lofi:
        "a small desk ornament: a cute ceramic mug shaped like a sleepy face, " +
        "warm tones.",
    },
  },
  flask: {
    category: "prop",
    body: {
      cyber:
        "a glowing neon energy drink can with cyan liquid and a soft glow.",
      lofi:
        "a warm latte mug with foam art and gentle steam.",
    },
  },
  coin: {
    category: "prop",
    body: {
      cyber:
        "a single glowing cyan hexagonal 'credit' token, soft neon glow, small.",
      lofi:
        "a single warm golden star token / cookie coin, soft shine, small.",
    },
  },
  chest_empty: {
    category: "prop",
    body: {
      cyber:
        "an opened empty 'data vault': dark with a cyan rim light, lid up, " +
        "dark interior.",
      lofi:
        "an opened empty wooden chest: warm wood, lid up, empty interior.",
    },
  },
  chest_full: {
    category: "prop",
    body: {
      cyber:
        "an opened 'reward' data vault overflowing with glowing violet data " +
        "shards and a cyan PR badge, lid up.",
      lofi:
        "an opened wooden treasure chest overflowing with warm golden " +
        "trinkets and a small 'shipped!' ribbon, lid up.",
    },
  },
  door_frame: {
    category: "prop",
    body: {
      cyber:
        "the TOP lintel of a neon zone doorway: a dark frame with a glowing " +
        "cyan energy header; sits above the door leaf.",
      lofi:
        "the TOP lintel of a warm wooden doorway: a carved wood header with a " +
        "small hanging sign; sits above the door leaf.",
    },
  },
  door_leaf: {
    category: "prop",
    body: {
      cyber:
        "a closed neon door leaf: a dark panel with a swirling cyan/violet " +
        "energy surface; fits under the frame.",
      lofi:
        "a closed warm wooden door leaf: planked wood with a round window of " +
        "cozy amber light; fits under the frame.",
    },
  },
};

/** 帧名 / 角色 base → assetId(覆盖 shim 用)。一对多别名让一张图覆盖多帧。 */
export const OVERRIDE_MAP: Record<string, string> = {
  // characters: base 直映射
  knight_m: "knight_m", knight_f: "knight_f", wizzard_m: "wizzard_m",
  wizzard_f: "wizzard_f", elf_m: "elf_m", elf_f: "elf_f",
  dwarf_m: "dwarf_m", dwarf_f: "dwarf_f", lizard_m: "lizard_m",
  lizard_f: "lizard_f", goblin: "goblin", angel: "angel",
  // floor + 广场描边瓦(简化为主石板)
  floor_1: "floor_1", floor_2: "floor_2", floor_3: "floor_3", grass: "grass",
  "edge-tl": "floor_1", "edge-tr": "floor_1", "edge-bl": "floor_1",
  "edge-br": "floor_1", "edge-top": "floor_1", "edge-bottom": "floor_1",
  "edge-left": "floor_1", "edge-right": "floor_1",
  // walls
  wall_mid: "wall_mid", wall_top_mid: "wall_top",
  // banners
  wall_banner_blue: "banner", wall_banner_green: "banner", wall_banner_yellow: "banner",
  // fountain → central core (3 段)
  wall_fountain_top_1: "fountain_top",
  wall_fountain_mid_blue_anim_f0: "fountain_mid",
  wall_fountain_basin_blue_anim_f0: "fountain_basin",
  // props
  crate: "crate", skull: "skull",
  flask_big_green: "flask", flask_big_blue: "flask", flask_big_red: "flask",
  coin_anim_f0: "coin", coin_anim_f1: "coin", coin_anim_f2: "coin", coin_anim_f3: "coin",
  chest_empty_open_anim_f0: "chest_empty",
  chest_full_open_anim_f0: "chest_full", chest_full_open_anim_f1: "chest_full",
  chest_mimic_open_anim_f1: "chest_full",
  doors_frame_top: "door_frame", doors_leaf_closed: "door_leaf",
};

/** 组装一条完整提示词:风格前缀 + 主体 + 构图约束 + 负面。 */
export function assemblePrompt(theme: ThemeId, asset: string): string {
  const a = ASSETS[asset];
  if (!a) throw new Error(`unknown asset: ${asset}`);
  return `${STYLE_PREFIX[theme]} ${a.body[theme]} ${FRAMING[a.category]} ${AVOID}`;
}

export interface Job {
  theme: ThemeId;
  asset: string;
  category: Category;
}

/** 列出全部 60 个生成 job(2 主题 × 30 资产)。 */
export function listJobs(): Job[] {
  const jobs: Job[] = [];
  for (const theme of THEMES) {
    for (const [asset, def] of Object.entries(ASSETS)) {
      jobs.push({ theme, asset, category: def.category });
    }
  }
  return jobs;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test scripts/art/prompts.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/art/prompts.ts scripts/art/prompts.test.ts
git commit -m "feat: 🧩 art prompts + 30-asset override map (prototype frames)"
```

---

## Task 2: Images API 请求构造 + 落盘(纯逻辑 TDD)

**Files:**
- Create: `scripts/art/api.ts`
- Test: `scripts/art/api.test.ts`

> OpenAI Images API 形态以执行时官方文档为准(可能演进)。把易变部分集中在 `buildGenRequest`/`buildEditRequest`,只测纯函数;真实网络调用在 Task 4/5 由人工验证。

- [ ] **Step 1: 写失败测试**

`scripts/art/api.test.ts`:
```ts
import { describe, expect, it } from "bun:test";
import { buildGenRequest, decodeAndWrite, targetPath } from "./api";

describe("art api", () => {
  it("targetPath 落在 prototype 副本的 themes 目录", () => {
    expect(targetPath("cyber", "knight_m")).toBe(
      "prototype/project/public/assets/themes/cyber/knight_m.png",
    );
  });

  it("buildGenRequest 指向 generations、gpt-image-1、透明底、默认 1024 方图", () => {
    const r = buildGenRequest("a prompt", "sk-test");
    expect(r.url).toContain("/v1/images/generations");
    expect(r.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(r.body);
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("a prompt");
    expect(body.background).toBe("transparent");
    expect(body.size).toBe("1024x1024");
  });

  it("buildGenRequest 接受竖图尺寸(角色用)", () => {
    const body = JSON.parse(buildGenRequest("p", "k", "1024x1536").body);
    expect(body.size).toBe("1024x1536");
  });

  it("decodeAndWrite 把 b64 写成文件", async () => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const path = `/tmp/roguent-art-test-${Date.now()}.png`;
    await decodeAndWrite(b64, path);
    const f = Bun.file(path);
    expect(await f.exists()).toBe(true);
    expect((await f.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test scripts/art/api.test.ts`
Expected: FAIL（`Cannot find module "./api"`）。

- [ ] **Step 3: 实现 api.ts**

`scripts/art/api.ts`:
```ts
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const GEN_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";

/** 生成图落在原型副本的 themes 目录(本地预览;prototype/ 已 gitignore)。 */
export function targetPath(theme: string, asset: string): string {
  return `prototype/project/public/assets/themes/${theme}/${asset}.png`;
}

export interface GenRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 纯文生图请求(generations)。透明底;size 角色用 "1024x1536" 竖图、其余 "1024x1024"。 */
export function buildGenRequest(
  prompt: string,
  apiKey: string,
  size = "1024x1024",
): GenRequest {
  return {
    url: GEN_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      background: "transparent",
      n: 1,
    }),
  };
}

/** 以参考图保持一致性的请求(edits,multipart)。 */
export async function buildEditRequest(
  prompt: string,
  apiKey: string,
  refPath: string,
  size = "1024x1024",
): Promise<{ url: string; headers: Record<string, string>; form: FormData }> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("background", "transparent");
  const refFile = Bun.file(refPath);
  form.append("image[]", new Blob([await refFile.arrayBuffer()]), "ref.png");
  return { url: EDIT_URL, headers: { Authorization: `Bearer ${apiKey}` }, form };
}

/** 把 base64 PNG 写到 path(自动建目录)。 */
export async function decodeAndWrite(b64: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, Buffer.from(b64, "base64"));
}

function extractB64(json: unknown): string {
  const b64 = (json as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json in response: ${JSON.stringify(json)}`);
  return b64;
}

/** 调用 generations,返回 b64_json。失败抛错(含响应文本)。 */
export async function callImageApi(req: GenRequest): Promise<string> {
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`images API ${res.status}: ${await res.text()}`);
  return extractB64(await res.json());
}

/** 调用 edits(参考图),返回 b64_json。 */
export async function callEditApi(req: {
  url: string;
  headers: Record<string, string>;
  form: FormData;
}): Promise<string> {
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.form });
  if (!res.ok) throw new Error(`edits API ${res.status}: ${await res.text()}`);
  return extractB64(await res.json());
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test scripts/art/api.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/art/api.ts scripts/art/api.test.ts
git commit -m "feat: 🧩 OpenAI images request builders + b64 writer (portrait size)"
```

---

## Task 3: 生成 CLI + dry-run

**Files:**
- Create: `scripts/art/gen.ts`

> CLI 编排逻辑较薄,以 `--dry-run` 自检替代单测(不触网、可重复)。

- [ ] **Step 1: 实现 gen.ts**

`scripts/art/gen.ts`:
```ts
import {
  buildEditRequest,
  buildGenRequest,
  callEditApi,
  callImageApi,
  decodeAndWrite,
  targetPath,
} from "./api";
import { type Job, assemblePrompt, listJobs } from "./prompts";

interface Opts {
  anchor: boolean; // 仅出 knight_m(orchestrator 基准)
  all: boolean;
  theme?: string;
  asset?: string;
  dryRun: boolean;
  refAnchor: boolean; // 以该主题 knight_m 为参考图保持一致
}

const ANCHOR = "knight_m";

function parseArgs(argv: string[]): Opts {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    anchor: has("--anchor"),
    all: has("--all"),
    theme: val("--theme"),
    asset: val("--asset"),
    dryRun: has("--dry-run"),
    refAnchor: has("--ref-anchor"),
  };
}

function selectJobs(o: Opts): Job[] {
  let jobs = listJobs();
  if (o.anchor) jobs = jobs.filter((j) => j.asset === ANCHOR);
  if (o.theme) jobs = jobs.filter((j) => j.theme === o.theme);
  if (o.asset) jobs = jobs.filter((j) => j.asset === o.asset);
  if (!o.anchor && !o.all && !o.asset) {
    throw new Error("指定 --anchor / --all / --asset <id> 之一");
  }
  return jobs;
}

function sizeFor(job: Job): string {
  return job.category === "character" ? "1024x1536" : "1024x1024";
}

async function run(): Promise<void> {
  const o = parseArgs(Bun.argv.slice(2));
  const jobs = selectJobs(o);
  const key = process.env.OPENAI_API_KEY;

  for (const job of jobs) {
    const prompt = assemblePrompt(job.theme, job.asset);
    const out = targetPath(job.theme, job.asset);
    const size = sizeFor(job);
    if (o.dryRun) {
      console.log(`\n# ${job.theme}/${job.asset} (${size}) -> ${out}\n${prompt}`);
      continue;
    }
    if (!key) throw new Error("缺 OPENAI_API_KEY(或用 --dry-run 手动出图)");
    // 非基准资产 + --ref-anchor:以该主题基准图为参考保持一致。
    const ref = targetPath(job.theme, ANCHOR);
    const useRef =
      o.refAnchor && job.asset !== ANCHOR && (await Bun.file(ref).exists());
    const b64 = useRef
      ? await callEditApi(await buildEditRequest(prompt, key, ref, size))
      : await callImageApi(buildGenRequest(prompt, key, size));
    await decodeAndWrite(b64, out);
    console.log(`✓ ${out}`);
  }
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: dry-run 自检(单主题 30 条)**

Run: `bun scripts/art/gen.ts --all --theme cyber --dry-run | grep -c '^# '`
Expected: `30`

- [ ] **Step 3: dry-run 抽查基准图含正确要素**

Run: `bun scripts/art/gen.ts --anchor --theme cyber --dry-run`
Expected: 输出含 `Cyberpunk neon`、`Orchestrator`、`(1024x1536)`、`-> prototype/project/public/assets/themes/cyber/knight_m.png`。

- [ ] **Step 4: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 5: Commit**

```bash
git add scripts/art/gen.ts
git commit -m "feat: 🧩 art generation CLI (anchor/all/dry-run/ref-anchor + per-category size)"
```

---

## Task 4: 出基准图(knight_m)+ 用户确认闸门

> 对应 spec §6.3:先锁风格。基准图 = orchestrator(`knight_m`),角色一致性的锚。无 `OPENAI_API_KEY` 走手动回退(Task 0 README)。

- [ ] **Step 1: 生成基准图**

Run: `bun scripts/art/gen.ts --anchor --theme cyber`
Expected: 写出 `prototype/project/public/assets/themes/cyber/knight_m.png`。

（手动回退:`bun scripts/art/gen.ts --anchor --theme cyber --dry-run` 取提示词,用 GPT 出图后按该路径存。）

- [ ] **Step 2: 确认文件存在**

Run: `ls -la prototype/project/public/assets/themes/cyber/knight_m.png`
Expected: 文件存在且非空。

- [ ] **Step 3: 用户确认闸门(必须人工)**

把基准图给用户看,确认:① 高清清晰像素、非插画非糊 16px;② cyber 调性 + vibe-coding(neon dev,无地牢/中世纪/奇幻武器味);③ chibi 比例、透明底、竖图构图。
- **通过** → 进 Task 5。
- **不通过** → 调 `prompts.ts` 的 `knight_m` 主体 / `STYLE_PREFIX.cyber`,重跑 Step 1,再确认。

---

## Task 5: 以基准图为参考批量出其余 29 张

- [ ] **Step 1: 批量生成(参考基准图保持一致)**

Run: `bun scripts/art/gen.ts --all --theme cyber --ref-anchor`
Expected: 逐行打印 `✓ ...`,写出该主题全部 30 张(基准图已存在会被同名重生成;如需保护可改用 `--asset <id>` 单出)。

（手动回退:`--all --theme cyber --dry-run` 取全部提示词,逐张用 GPT 出图、把 `knight_m.png` 作参考上传保持一致,按目标路径存。）

- [ ] **Step 2: 确认 30 张齐全**

Run: `ls prototype/project/public/assets/themes/cyber/*.png | wc -l`
Expected: `30`

- [ ] **Step 3: 抽查关键资产命名正确**

Run: `ls prototype/project/public/assets/themes/cyber/ | sort | tr '\n' ' '`
Expected: 含 `knight_m.png floor_1.png wall_mid.png wall_top.png fountain_mid.png crate.png coin.png chest_full.png door_leaf.png`(等 30 项,文件名 = assetId)。

> prototype/ 已 gitignore,本步不 commit。资产是本地预览产物;如需长期保留,用户可另行拷出(将来 src 主题系统轮会按 spec §7.1 正式入库)。

---

## Task 6: 覆盖 shim — 注入原型渲染层

**Files:**
- Create: `scripts/art/overrides.ts` + `scripts/art/overrides.test.ts`(生成 `overrides.js` 的纯函数)
- Modify: `prototype/project/roguent/sprites.jsx`(shim)、`prototype/project/Roguent.html`(加载一行)
- Generate: `prototype/project/roguent/overrides.js`

- [ ] **Step 1: 写 overrides.ts 失败测试**

`scripts/art/overrides.test.ts`:
```ts
import { describe, expect, it } from "bun:test";
import { renderOverridesJs } from "./overrides";

describe("overrides.js 生成", () => {
  it("产出 window.ART_OVERRIDE,含 theme 与 map", () => {
    const js = renderOverridesJs("cyber");
    expect(js).toContain("window.ART_OVERRIDE");
    expect(js).toContain('"theme": "cyber"');
    expect(js).toContain('"knight_m": "knight_m"');
    expect(js).toContain('"wall_top_mid": "wall_top"');
    expect(js).toContain('"coin_anim_f3": "coin"');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test scripts/art/overrides.test.ts`
Expected: FAIL（`Cannot find module "./overrides"`）。

- [ ] **Step 3: 实现 overrides.ts**

`scripts/art/overrides.ts`:
```ts
import { OVERRIDE_MAP, THEMES } from "./prompts";

const OUT = "prototype/project/roguent/overrides.js";

/** 纯函数:产出注入原型的 overrides.js 文本。 */
export function renderOverridesJs(theme: string): string {
  const payload = { theme, map: OVERRIDE_MAP };
  return (
    "/* AUTO-GENERATED by scripts/art/overrides.ts — do not edit by hand. */\n" +
    `window.ART_OVERRIDE = ${JSON.stringify(payload, null, 2)};\n`
  );
}

async function main(): Promise<void> {
  const i = Bun.argv.indexOf("--theme");
  const theme = i >= 0 ? Bun.argv[i + 1] : "cyber";
  if (!theme || !THEMES.includes(theme as (typeof THEMES)[number])) {
    throw new Error(`--theme 必须是 ${THEMES.join(" / ")}`);
  }
  await Bun.write(OUT, renderOverridesJs(theme));
  console.log(`✓ ${OUT} (theme=${theme})`);
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: 跑测试确认通过 + 生成 overrides.js**

Run: `bun test scripts/art/overrides.test.ts && bun scripts/art/overrides.ts --theme cyber`
Expected: PASS（1 test）;写出 `prototype/project/roguent/overrides.js`。

- [ ] **Step 5: 在 sprites.jsx 顶部加 override 运行时**

编辑 `prototype/project/roguent/sprites.jsx`,在 `const A = window.ATLAS;`(第 4 行)**之后**插入:
```js
  // ---- art override runtime (per-asset hi-res theme art) ----
  const OVcfg = window.ART_OVERRIDE || { theme: "", map: {} };
  const OVmap = OVcfg.map || {};
  const ovImg = {};                                   // assetId -> loaded HTMLImageElement
  function ovAssetOf(name){ return OVmap[name]; }     // 帧名/base -> assetId | undefined
  function ovUrlOf(assetId){ return "public/assets/themes/"+OVcfg.theme+"/"+assetId+".png"; }
  function loadOverrides(){
    if(!OVcfg.theme) return Promise.resolve();
    const ids = Array.from(new Set(Object.values(OVmap)));
    return Promise.all(ids.map(id => new Promise(res => {
      const im = new Image();
      im.onload = () => { ovImg[id] = im; res(); };
      im.onerror = () => res();                        // 缺图就回落图集,不阻塞
      im.src = ovUrlOf(id);
    })));
  }
```

- [ ] **Step 6: 让 loadAtlasImage 同时等覆盖图**

在 `sprites.jsx` 把 `window.loadAtlasImage`(约第 73 行)整段替换为:
```js
  let atlasImg=null, atlasPromise=null;
  window.loadAtlasImage=function(){
    if(atlasPromise) return atlasPromise;
    const atlasOnce=new Promise((res,rej)=>{
      const im=new Image();
      im.onload=()=>{ atlasImg=im; res(im); };
      im.onerror=rej;
      im.src=A.image;
    });
    atlasPromise=Promise.all([atlasOnce, loadOverrides()]).then(()=>atlasImg);
    return atlasPromise;
  };
```

- [ ] **Step 7: drawFrame 命中覆盖图就画新 PNG**

在 `sprites.jsx` 把 `window.drawFrame`(约第 84 行)整段替换为:
```js
  // draw a named frame onto a 2d context at (dx,dy) scaled; override-aware
  window.drawFrame=function(ctx,name,dx,dy,scale){
    const f=A.frames[name]; if(!f) return;
    const aid=ovAssetOf(name), im=aid&&ovImg[aid];
    if(im){
      ctx.imageSmoothingEnabled=true;                 // 高清图平滑下采样,不锯齿
      ctx.drawImage(im, dx,dy, f[2]*scale, f[3]*scale);
      ctx.imageSmoothingEnabled=false;
      return;
    }
    if(!atlasImg) return;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlasImg, f[0],f[1],f[2],f[3], dx,dy, f[2]*scale, f[3]*scale);
  };
```

- [ ] **Step 8: PixelSprite 命中覆盖图就用新 PNG 背景**

在 `sprites.jsx` 的 `PixelSprite` 函数里,定位到 `const fr = A.frames[list[idx]] || A.frames[list[0]];`(约第 51 行),在**它之前**插入覆盖分支:
```js
    // override: 角色按 base、场景按帧名命中 → 整块画新 PNG(footprint 沿用原帧尺寸)
    const ovAid = (base && ovAssetOf(base)) || ovAssetOf(list[idx]) || ovAssetOf(list[0]);
    if(ovAid && OVcfg.theme){
      const baseFr = A.frames[base?(framesFor(base,'idle')[0]):list[idx]] || A.frames[list[0]];
      if(baseFr){
        const [,,fw,fh]=baseFr;
        return React.createElement('div',{className:'pxsprite '+className, title, style:{
          width:fw*scale, height:fh*scale,
          backgroundImage:`url(${ovUrlOf(ovAid)})`,
          backgroundRepeat:'no-repeat', backgroundSize:'100% 100%',
          imageRendering:'auto',
          transform: flip?'scaleX(-1)':undefined, filter, ...style,
        }});
      }
    }
```

- [ ] **Step 9: Roguent.html 加载 overrides.js**

编辑 `prototype/project/Roguent.html`,在 `<script src="roguent/atlas-frames.js"></script>`(第 30 行)**之后**加一行:
```html
<script src="roguent/overrides.js"></script>
```
(必须在 `sprites.jsx` 之前;`window.ART_OVERRIDE` 要先于 shim 读取就绪。)

- [ ] **Step 10: 类型 + lint(仅 scripts/,prototype/ 不纳入校验)**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误(`prototype/` 已 gitignore,不进 tsc/Biome 范围;若 Biome 报到 prototype 路径,确认其被 ignore)。

- [ ] **Step 11: Commit(仅 scripts/)**

```bash
git add scripts/art/overrides.ts scripts/art/overrides.test.ts
git commit -m "feat: 🧩 generate prototype override map (overrides.js) for art preview"
```
> shim 改动在 `prototype/`(gitignore),不入库——它是预览注入,随原型副本本地存在。

---

## Task 7: 开 Roguent.html 看整屋 + 评审闸门

- [ ] **Step 1: 起静态服务、打开原型**

Run: `cd prototype/project && python3 -m http.server 8910`
打开: `http://localhost:8910/Roguent.html`
(或直接用浏览器打开 `prototype/project/Roguent.html` 文件;静态服务更稳,避免 file:// 的 CORS。)

- [ ] **Step 2: 用户评审(必须人工)**

进入房间 / 大厅,核对整屋换肤:
- **清晰度**:是否解决「又小又糊、眼睛难受」。
- **画风**:高清 roguelike 像素(非插画、非糊 16px),`imageRendering` 下高清图缩放是否干净。
- **整屋一致性**:地板/墙/喷泉核心/道具/12 角色在同一 cyber 调性下是否统一(像素密度、光向、配色)。
- **vibe-coding 调性**:neon dev floor 是否一眼成立、无地牢/中世纪/奇幻味;角色像开发者/AI 而非骑士法师。
- **布局完好**:footprint 沿用原帧,新图是否大致归位(轻微比例失真可接受;明显错位记下)。

- [ ] **Step 3: 迭代(按需)**

对不满意的资产:改 `scripts/art/prompts.ts` 对应 `body`,重跑
`bun scripts/art/gen.ts --theme cyber --asset <id> --ref-anchor`,刷新页面即生效(overrides.js 不变,图被同名覆盖)。

- [ ] **Step 4: 第二主题(可选,确认 cyber 后)**

Run:
```bash
bun scripts/art/gen.ts --anchor --theme lofi
# 确认 lofi 基准后
bun scripts/art/gen.ts --all --theme lofi --ref-anchor
bun scripts/art/overrides.ts --theme lofi   # 切换 overrides.js 的 theme
```
刷新页面看 lofi 整屋。(cyber/lofi 切换 = 重新生成 overrides.js 的 `theme` 字段。)

- [ ] **Step 5: 结论**

记录评审结论(扩第二主题 / 调风格基准重来 / 局部返修 / 进 src 主题系统轮)到本任务日志,供 spec §7 的「全量 + 主题系统 + 多区域相机」轮决策。

---

## Self-Review(已执行)

- **Spec 覆盖**:§4.1 像素保真度 → `STYLE_PREFIX`/`AVOID`(Task 1)+ shim `imageRendering`/平滑下采样(Task 6);§5 风格前缀 → Task 1;§6.1/§6.2 切片资产与提示词 → `ASSETS`(30 项,对齐原型真实帧)+ `assemblePrompt`/`listJobs`(Task 1);§6.3 一致性(基准图先行 + 参考) → Task 4/5 + `--ref-anchor`;§6.4 看效果 → **改为原型整屋实景**(Task 6/7),比独立预览页更贴「先看下效果」诉求;字体(§4.2)、多区域+相机(§7.3)、src 主题系统(§7.1)、Roguent skill、第二主题全量 → **明确属后续轮**(spec §11),本预览轮不含。
- **占位符扫描**:无 TBD/TODO;每个代码步骤含完整代码与确切命令/预期。
- **类型一致**:`ThemeId`/`assemblePrompt(theme,asset)`/`listJobs():Job[]`/`OVERRIDE_MAP`/`targetPath(theme,asset)`/`buildGenRequest(prompt,key,size?)`/`renderOverridesJs(theme)` 跨任务签名一致;`assetId`(=文件名)全程与 `ASSETS` 键、`OVERRIDE_MAP` 值一致;shim 引用的 `window.ART_OVERRIDE.{theme,map}` 与 `overrides.ts` 产物结构一致。
- **原型事实核对**:`drawFrame`/`PixelSprite`/`loadAtlasImage` 行号与签名据 zip 内 `sprites.jsx` 实读;覆盖帧名/角色 base 据 `room.jsx`/`data.js` 实测(orchestrator=`knight_m`,12 base,~28 场景帧)。

---

## Execution Handoff

跑真实出图需 `OPENAI_API_KEY`(或走 Task 0 的手动 GPT 回退)。Task 1/2/6(纯逻辑)是 TDD,可先做并验证;Task 4/5/7 含人工确认闸门。**整轮产物只有 `scripts/art/*` 入库;`prototype/` 全程 gitignore(预览工作区,可从 zip + 脚本复现)。** 看完效果决定是否进 spec §7 的 src 主题系统正式轮。
