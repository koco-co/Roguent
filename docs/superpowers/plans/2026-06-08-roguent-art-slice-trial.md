# Roguent 美术切片试产 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **项目工作流:** 按 `.claude/rules/workflow.md`,在 detached worktree 内执行(`git worktree add --detach .worktrees/art-slice-trial main`),通过后 `merge --no-ff` 回 main。
>
> **执行时机:** 本计划设计为在 full-prototype(Task 0–67)完成后单独执行(独立美术轮)。但本计划**自包含**,不依赖那份 plan 的产物,先行执行亦可——它只新增 `scripts/art/` 与生成图,不改引擎/渲染器。

**Goal:** 用 GPT image 生成两套 vibe-coding 主题(赛博霓虹码库 / 暖光 lo-fi 工位)的 ~15 项代表性切片资产(共 30 张高清像素 PNG),并在一个预览页上并排对比,验证出图质量/一致性/清晰度,再决定是否扩全量。

**Architecture:** 一个 `scripts/art/` 工具链——`prompts.ts`(提示词唯一真源 + 组装函数)→ `gen.ts`(调 OpenAI Images API `gpt-image-1` 出图,先出 1 张基准图供确认,再以基准图为参考批量出其余)→ `preview.ts`(扫描生成图,产出并排对比的 HTML 预览页)。纯逻辑(提示词组装、请求构造、预览 HTML 生成)走 TDD;真实出图与视觉质量由人工 + 确认闸门把关。无 API key 时支持"手动用 GPT 出图后按命名放入目录"的回退,后续步骤不变。

**Tech Stack:** Bun + TypeScript, `bun:test`, Biome, OpenAI Images API(`gpt-image-1`,REST `fetch`,无新依赖), Vite(静态服务预览页)。

**Spec:** [docs/superpowers/specs/2026-06-08-roguent-vibe-coding-art-themes-design.md](../specs/2026-06-08-roguent-vibe-coding-art-themes-design.md)

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `scripts/art/prompts.ts` | 提示词唯一真源:两套 `STYLE_PREFIX`、按类别的 `FRAMING`、15 个资产 × 每主题的主体描述 `ASSETS`、组装函数 `assemblePrompt()`、`listJobs()` |
| `scripts/art/prompts.test.ts` | `assemblePrompt`/`listJobs` 单测 |
| `scripts/art/api.ts` | 纯函数 `buildGenRequest()`/`buildEditRequest()`/`targetPath()` + 副作用 `decodeAndWrite()`、`callImageApi()` |
| `scripts/art/api.test.ts` | 请求构造 + b64 落盘单测(mock fetch) |
| `scripts/art/gen.ts` | CLI:`--theme`/`--asset`/`--anchor`/`--all`/`--dry-run`/`--ref-anchor`;读 prompts → 调 api → 写 PNG |
| `scripts/art/preview.ts` | 扫描 `public/assets/themes/*/*.png` → 写 `public/themes-preview.html`(两主题分组并排) |
| `scripts/art/preview.test.ts` | 预览 HTML 生成单测(fixture 目录) |
| `public/assets/themes/<themeId>/<assetId>.png` | 生成产物(`cyber` / `lofi` 两目录) |
| `public/themes-preview.html` | 生成的预览页(Vite 服务) |
| `scripts/art/room-mock.ts` *(可选 Task 8)* | 用生成图手搭一个"房间场景" mock HTML,零渲染器风险地看场景观感 |

**约定:**
- `themeId ∈ {"cyber","lofi"}`。
- 15 个 `assetId`:`hero_orchestrator`、`hero_subagent_a`、`hero_subagent_b`、`npc_ambient`、`floor_work`、`floor_lounge`、`wall`、`desk`、`loot_crate`、`door`、`coffee_station`、`drink`、`decor`、`icons`、`cat_pet`。
- 资产类别:character(5:三英雄+npc+cat)、tile(3:两地面+wall)、prop(6:desk/loot_crate/door/coffee_station/drink/decor)、icon(1:icons)。

---

## Task 0: Scaffolding 与前置

**Files:**
- Create: `scripts/art/` 目录
- Create: `scripts/art/README.md`

- [ ] **Step 1: 建目录与说明**

创建 `scripts/art/README.md`:

```markdown
# Roguent 美术切片试产工具

生成两套主题(cyber/lofi)的代表性切片资产并预览。

## 用法
1. 设环境变量 `OPENAI_API_KEY`(用 OpenAI Images API 自动出图)。
2. 先出基准图:`bun scripts/art/gen.ts --anchor`
3. 人工确认两张基准图(public/assets/themes/{cyber,lofi}/hero_orchestrator.png)。
4. 批量出其余:`bun scripts/art/gen.ts --all --ref-anchor`
5. 生成预览页:`bun scripts/art/preview.ts`
6. `bun run dev:web` → http://localhost:5173/themes-preview.html

## 无 API key 的手动回退
- `bun scripts/art/gen.ts --all --dry-run` 打印每张的完整提示词与目标路径。
- 手动用 GPT(ChatGPT image / GPT image)按提示词出图,
  按打印的目标路径/文件名存为 PNG,再从第 5 步继续。
```

- [ ] **Step 2: 确认无需新依赖**

Run: `bun --version`
Expected: 打印版本(脚本用内置 `fetch`/`FormData`/`Bun.write`,不加依赖)。

- [ ] **Step 3: Commit**

```bash
git add scripts/art/README.md
git commit -m "chore: 🧹 scaffold art slice trial tooling"
```

---

## Task 1: 提示词唯一真源 + 组装函数

**Files:**
- Create: `scripts/art/prompts.ts`
- Test: `scripts/art/prompts.test.ts`

- [ ] **Step 1: 写失败测试**

`scripts/art/prompts.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { ASSETS, assemblePrompt, listJobs, THEMES } from "./prompts";

describe("prompts", () => {
  it("有 15 个资产、2 个主题、共 30 个 job", () => {
    expect(Object.keys(ASSETS)).toHaveLength(15);
    expect(THEMES).toEqual(["cyber", "lofi"]);
    expect(listJobs()).toHaveLength(30);
  });

  it("assemblePrompt 含风格前缀 + 主体 + 构图 + avoid", () => {
    const p = assemblePrompt("cyber", "hero_orchestrator");
    expect(p).toContain("Cyberpunk neon"); // 风格前缀
    expect(p).toContain("code commander"); // 主体
    expect(p).toContain("full body"); // character 构图
    expect(p).toContain("avoid:"); // 负面
    expect(p).toContain("dungeon"); // avoid 含 dungeon 防回退
  });

  it("lofi 与 cyber 主体不同但同资产可解析", () => {
    expect(assemblePrompt("lofi", "floor_work")).toContain("wooden");
    expect(assemblePrompt("cyber", "floor_work")).toContain("metal");
  });

  it("assetId 唯一且 job 路径稳定", () => {
    const jobs = listJobs();
    const ids = new Set(jobs.map((j) => `${j.theme}/${j.asset}`));
    expect(ids.size).toBe(30);
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

export const THEMES = ["cyber", "lofi"] as const;
export type ThemeId = (typeof THEMES)[number];

export const STYLE_PREFIX: Record<ThemeId, string> = {
  cyber:
    "High-resolution detailed pixel art, modern hi-bit roguelike game art " +
    "(like Dead Cells / CrossCode): clean defined pixels, crisp, readable, " +
    "clear contrast, easy on the eyes. NOT tiny low-res 16px, NOT smooth " +
    "illustration. Top-down 3/4 view, consistent light direction. Cyberpunk " +
    "neon-on-dark vibe-coding WORKSPACE (not a dungeon): late-night neon dev " +
    "floor / server room / terminal stations / holographic UI. Palette: " +
    "near-black #0b0a12, glowing cyan #36c5e0 and violet #a06cd5 neon accents, " +
    "magenta rim light, soft glow.",
  lofi:
    "High-resolution detailed pixel art, modern hi-bit roguelike game art " +
    "(like Eastward): clean defined pixels, crisp, readable, warm clear " +
    "contrast, easy on the eyes. NOT tiny low-res 16px, NOT smooth " +
    "illustration. Top-down 3/4 view, consistent light direction. Cozy lo-fi " +
    "vibe-coding WORKSPACE (not a dungeon): cozy dev loft — warm lamp, plants, " +
    "coffee, sticker-covered laptop, mechanical keyboard, lo-fi mood. Palette: " +
    "warm wood browns, creamy amber lamp light #f2c84b, sage green #5fd35f " +
    "plants, soft warm shadows, cozy bloom.",
};

export const AVOID =
  "avoid: tiny low-res muddy 16px, illegible, low contrast, blurry, smooth " +
  "non-pixel gradients, photo-realism, 3D render, text, watermark, busy " +
  "background, dungeon, medieval.";

type Category = "character" | "tile" | "prop" | "icon";

export const FRAMING: Record<Category, string> = {
  character:
    "Full body, idle pose, chibi proportions (~1:2 head-to-body), clear " +
    "silhouette, centered with margin, transparent background, square 1:1.",
  tile:
    "Seamless tileable top-down texture filling the frame, even and " +
    "non-distracting, transparent where applicable, square 1:1.",
  prop:
    "Single object, 3/4 view, centered with margin, transparent background, " +
    "square 1:1.",
  icon:
    "Bold readable icons, consistent line weight, centered, minimal " +
    "background, transparent, square 1:1.",
};

interface Asset {
  category: Category;
  body: Record<ThemeId, string>;
}

export const ASSETS: Record<string, Asset> = {
  hero_orchestrator: {
    category: "character",
    body: {
      cyber:
        "a hooded 'code commander' lead, front-facing idle, dark hoodie with " +
        "glowing cyan circuit trim, a holographic terminal visor, a small " +
        "mechanical left arm, holding a glowing cyan stylus-blade of light; " +
        "confident leader stance.",
      lofi:
        "a cozy 'lead dev', front-facing idle, warm hoodie, soft-glowing " +
        "over-ear headphones, a steaming coffee in one hand, relaxed confident " +
        "stance; amber lamp glow on the face.",
    },
  },
  hero_subagent_a: {
    category: "character",
    body: {
      cyber:
        "an AI 'specialist bot', sleek robotic body, a floating holographic " +
        "panel projecting cyan code glyphs, a glowing violet core; calm " +
        "focused pose.",
      lofi:
        "a focused developer with round glasses, cardigan over hoodie, hugging " +
        "an open glowing laptop, sage-green scarf; gentle thinking pose.",
    },
  },
  hero_subagent_b: {
    category: "character",
    body: {
      cyber:
        "a sleek android 'scout' agent, chrome-and-violet streamlined body, " +
        "glowing visor, thin neon antenna, a small floating drone; agile " +
        "ready pose.",
      lofi:
        "a cozy 'designer' agent, oversized warm sweater, a drawing tablet and " +
        "stylus, a little plant pin; cheerful relaxed pose.",
    },
  },
  npc_ambient: {
    category: "character",
    body: {
      cyber:
        "a small friendly maintenance drone-bot, round body, two glowing cyan " +
        "eyes, tiny rotor, a blinking status LED; idle hovering.",
      lofi:
        "a cute intern character with an oversized beanie holding a " +
        "sticky-note; sleepy idle.",
    },
  },
  floor_work: {
    category: "tile",
    body: {
      cyber:
        "a work-zone floor: dark brushed-metal panels with faint glowing cyan " +
        "circuit lines and seams, subtle reflective sheen.",
      lofi:
        "a desk-zone floor: warm honey wooden planks, soft grain, gentle warm " +
        "sheen, cozy.",
    },
  },
  floor_lounge: {
    category: "tile",
    body: {
      cyber:
        "a lounge-zone floor: darker tech-carpet with a subtle violet hex " +
        "pattern and faint glow, distinct from the metal work-zone floor.",
      lofi:
        "a lounge-zone floor: a cozy woven rug in warm tones with a soft " +
        "pattern, distinct from the wooden desk-zone floor.",
    },
  },
  wall: {
    category: "tile",
    body: {
      cyber:
        "a workspace wall section: server-rack panels with neon cyan/violet " +
        "status lights and cable runs; a darker cap strip on top, taller face " +
        "below, tileable horizontally.",
      lofi:
        "a room wall section: warm plaster wall with a small wooden shelf, a " +
        "framed sticky-note board, a hanging plant; lighter cap strip on top, " +
        "tileable horizontally.",
    },
  },
  desk: {
    category: "prop",
    body: {
      cyber:
        "a dev desk: dark desk with dual glowing monitors showing cyan code, a " +
        "holographic keyboard, neon under-glow.",
      lofi:
        "a cozy dev desk: warm wood desk with a sticker-covered laptop, a small " +
        "lamp, a coffee mug and a tiny plant.",
    },
  },
  loot_crate: {
    category: "prop",
    body: {
      cyber:
        "a glowing 'data crate' / deploy package, dark casing with cyan seams, " +
        "lid open revealing floating violet data shards / a glowing PR badge.",
      lofi:
        "a cozy cardboard delivery box, lid open with warm light spilling out, " +
        "a little ribbon and a 'shipped!' tag.",
    },
  },
  door: {
    category: "prop",
    body: {
      cyber:
        "a neon zone-transition archway, dark frame with a swirling " +
        "cyan/violet energy gate.",
      lofi:
        "a warm wooden doorway between zones, cozy amber light through the gap, " +
        "a small 'in flow' sign.",
    },
  },
  coffee_station: {
    category: "prop",
    body: {
      cyber:
        "a sleek neon coffee/energy station, dark machine with cyan accent " +
        "lights, a glowing dispense nozzle, a small lit tray.",
      lofi:
        "a cozy coffee machine corner, warm steam rising, mugs on a little " +
        "tray, soft amber accent light.",
    },
  },
  drink: {
    category: "prop",
    body: {
      cyber:
        "two items together: a glowing cyan energy-drink can (larger) and a " +
        "small violet vial / RAM-stick charm (smaller), neon glow.",
      lofi:
        "two items together: a warm latte mug with foam art (larger) and a " +
        "small boba/tea cup (smaller), cozy steam.",
    },
  },
  decor: {
    category: "prop",
    body: {
      cyber:
        "a stacked compact server unit with cyan edge light and a small status " +
        "display; reads as cyber-zone decor.",
      lofi:
        "a cozy potted plant beside a small stack of books, warm light; reads " +
        "as lounge decor.",
    },
  },
  icons: {
    category: "icon",
    body: {
      cyber:
        "a set of 4 bold readable neon pixel icons in one image (2x2 grid), " +
        "consistent line weight: (read) a glowing eye/document, (write) a " +
        "glowing cursor/pen, (bash) a terminal '>_' chip, (quest) a glowing " +
        "waypoint diamond; cyan with violet accents, soft glow, crisp pixels.",
      lofi:
        "a set of 4 warm rounded pixel icons in one image (2x2 grid), " +
        "consistent line weight: (read) a cozy open book, (write) a pencil, " +
        "(bash) a rounded terminal window, (quest) a little flag; warm amber " +
        "with sage accents, crisp pixels.",
    },
  },
  cat_pet: {
    category: "character",
    body: {
      cyber:
        "a small robot cat companion, matte-black body, glowing cyan LED eyes, " +
        "a violet collar light, segmented tail; sitting idle.",
      lofi:
        "a sleepy real black cat companion, curled on a warm cushion, soft " +
        "amber rim light, content expression.",
    },
  },
};

/** 组装一条完整提示词:风格前缀 + 主体 + 构图约束 + 负面。 */
export function assemblePrompt(theme: ThemeId, asset: string): string {
  const a = ASSETS[asset];
  if (!a) throw new Error(`unknown asset: ${asset}`);
  const body = a.body[theme];
  return `${STYLE_PREFIX[theme]} ${body} ${FRAMING[a.category]} ${AVOID}`;
}

export interface Job {
  theme: ThemeId;
  asset: string;
  category: Category;
}

/** 列出全部 30 个生成 job(2 主题 × 15 资产)。 */
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
Expected: PASS（4 tests）。

- [ ] **Step 5: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/art/prompts.ts scripts/art/prompts.test.ts
git commit -m "feat: 🧩 art prompt source-of-truth (2 themes x 15 assets)"
```

---

## Task 2: Images API 请求构造 + 落盘(纯逻辑 TDD)

**Files:**
- Create: `scripts/art/api.ts`
- Test: `scripts/art/api.test.ts`

> OpenAI Images API 形态以执行时官方文档为准(可能演进)。本任务把易变部分集中在 `buildGenRequest`/`buildEditRequest`,只测纯函数;真实网络调用在 Task 3/4 由人工验证。

- [ ] **Step 1: 写失败测试**

`scripts/art/api.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { buildGenRequest, decodeAndWrite, targetPath } from "./api";

describe("art api", () => {
  it("targetPath 落在 public/assets/themes/<theme>/<asset>.png", () => {
    expect(targetPath("cyber", "hero_orchestrator")).toBe(
      "public/assets/themes/cyber/hero_orchestrator.png",
    );
  });

  it("buildGenRequest 指向 generations、带 gpt-image-1 与透明底", () => {
    const r = buildGenRequest("a prompt", "sk-test");
    expect(r.url).toContain("/v1/images/generations");
    expect(r.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(r.body);
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("a prompt");
    expect(body.background).toBe("transparent");
    expect(body.size).toBe("1024x1024");
  });

  it("decodeAndWrite 把 b64 写成文件", async () => {
    // 1x1 透明 PNG 的 base64
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

export function targetPath(theme: string, asset: string): string {
  return `public/assets/themes/${theme}/${asset}.png`;
}

export interface GenRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 纯文生图请求(generations)。透明底 + 1024 方图。 */
export function buildGenRequest(prompt: string, apiKey: string): GenRequest {
  return {
    url: GEN_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      background: "transparent",
      n: 1,
    }),
  };
}

/** 以参考图保持一致性的请求(edits,multipart)。返回 url + FormData。 */
export async function buildEditRequest(
  prompt: string,
  apiKey: string,
  refPath: string,
): Promise<{ url: string; headers: Record<string, string>; form: FormData }> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("background", "transparent");
  const refFile = Bun.file(refPath);
  form.append("image[]", new Blob([await refFile.arrayBuffer()]), "ref.png");
  return {
    url: EDIT_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
    form,
  };
}

/** 把 base64 PNG 写到 path(自动建目录)。 */
export async function decodeAndWrite(b64: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, Buffer.from(b64, "base64"));
}

/** 调用 generations,返回 b64_json。失败抛错(含响应文本)。 */
export async function callImageApi(req: GenRequest): Promise<string> {
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.body,
  });
  if (!res.ok) throw new Error(`images API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json in response: ${JSON.stringify(json)}`);
  return b64;
}

/** 调用 edits(参考图),返回 b64_json。 */
export async function callEditApi(req: {
  url: string;
  headers: Record<string, string>;
  form: FormData;
}): Promise<string> {
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.form,
  });
  if (!res.ok) throw new Error(`edits API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json in response: ${JSON.stringify(json)}`);
  return b64;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test scripts/art/api.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/art/api.ts scripts/art/api.test.ts
git commit -m "feat: 🧩 OpenAI images request builders + b64 writer"
```

---

## Task 3: 生成 CLI + dry-run

**Files:**
- Create: `scripts/art/gen.ts`

> CLI 编排逻辑较薄、易变,这里以 `--dry-run` 自检替代单测(dry-run 不触网、可重复验证)。

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
  anchor: boolean; // 仅出 hero_orchestrator
  all: boolean; // 出全部
  theme?: string;
  asset?: string;
  dryRun: boolean;
  refAnchor: boolean; // 以各主题 hero_orchestrator 为参考图
}

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
  if (o.anchor) jobs = jobs.filter((j) => j.asset === "hero_orchestrator");
  if (o.theme) jobs = jobs.filter((j) => j.theme === o.theme);
  if (o.asset) jobs = jobs.filter((j) => j.asset === o.asset);
  if (!o.anchor && !o.all && !o.asset) {
    throw new Error("指定 --anchor / --all / --asset <id> 之一");
  }
  return jobs;
}

async function run(): Promise<void> {
  const o = parseArgs(Bun.argv.slice(2));
  const jobs = selectJobs(o);
  const key = process.env.OPENAI_API_KEY;

  for (const job of jobs) {
    const prompt = assemblePrompt(job.theme, job.asset);
    const out = targetPath(job.theme, job.asset);
    if (o.dryRun) {
      console.log(`\n# ${job.theme}/${job.asset} -> ${out}\n${prompt}`);
      continue;
    }
    if (!key) throw new Error("缺 OPENAI_API_KEY(或用 --dry-run 手动出图)");
    // 非基准资产 + --ref-anchor:以该主题基准图为参考保持一致。
    const ref = `public/assets/themes/${job.theme}/hero_orchestrator.png`;
    const useRef =
      o.refAnchor && job.asset !== "hero_orchestrator" && (await Bun.file(ref).exists());
    let b64: string;
    if (useRef) {
      b64 = await callEditApi(await buildEditRequest(prompt, key, ref));
    } else {
      b64 = await callImageApi(buildGenRequest(prompt, key));
    }
    await decodeAndWrite(b64, out);
    console.log(`✓ ${out}`);
  }
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: dry-run 自检(列出 30 条)**

Run: `bun scripts/art/gen.ts --all --dry-run | grep -c '^# '`
Expected: `30`

- [ ] **Step 3: dry-run 抽查一条含正确要素**

Run: `bun scripts/art/gen.ts --theme cyber --asset hero_orchestrator --dry-run`
Expected: 输出含 `Cyberpunk neon`、`code commander`、`-> public/assets/themes/cyber/hero_orchestrator.png`。

- [ ] **Step 4: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 5: Commit**

```bash
git add scripts/art/gen.ts
git commit -m "feat: 🧩 art generation CLI (anchor/all/dry-run/ref-anchor)"
```

---

## Task 4: 出两张基准图 + 用户确认闸门

> 对应 spec §6.3:先锁风格。无 `OPENAI_API_KEY` 则走手动回退(见 Task 0 README)。

- [ ] **Step 1: 生成两张基准图**

Run: `bun scripts/art/gen.ts --anchor`
Expected: 写出
`public/assets/themes/cyber/hero_orchestrator.png` 与
`public/assets/themes/lofi/hero_orchestrator.png`。

（手动回退:`bun scripts/art/gen.ts --anchor --dry-run` 取提示词,用 GPT 出图后按上述路径存。）

- [ ] **Step 2: 确认文件存在**

Run: `ls -la public/assets/themes/cyber/hero_orchestrator.png public/assets/themes/lofi/hero_orchestrator.png`
Expected: 两文件均存在且非空。

- [ ] **Step 3: 用户确认闸门(必须人工)**

把两张基准图给用户看,确认:① 是否"高清清晰像素、非插画非糊 16px";② 冷/暖主题反差与 vibe-coding 调性;③ chibi 比例/像素密度。
- **通过** → 进 Task 5。
- **不通过** → 调 `scripts/art/prompts.ts` 里 `hero_orchestrator` 主体 / `STYLE_PREFIX`,重跑 Step 1,再确认。

- [ ] **Step 4: Commit 基准图**

```bash
git add public/assets/themes/cyber/hero_orchestrator.png public/assets/themes/lofi/hero_orchestrator.png
git commit -m "feat: 🎨 art slice — style anchors (orchestrator hero, 2 themes)"
```

---

## Task 5: 以基准图为参考批量出其余 28 张

- [ ] **Step 1: 批量生成(参考基准图保持一致)**

Run: `bun scripts/art/gen.ts --all --ref-anchor`
Expected: 写出全部 30 张(基准图已存在则被同名覆盖/跳过判断,可加 `--asset` 单出)；逐行打印 `✓ ...`。

（手动回退:`--all --dry-run` 取全部提示词,逐张用 GPT 出图,在 GPT 里把对应主题的基准图作参考上传以保持一致,按目标路径存。）

- [ ] **Step 2: 确认 30 张齐全**

Run: `ls public/assets/themes/cyber/*.png public/assets/themes/lofi/*.png | wc -l`
Expected: `30`

- [ ] **Step 3: Commit 资产**

```bash
git add public/assets/themes/cyber/*.png public/assets/themes/lofi/*.png
git commit -m "feat: 🎨 art slice — 30 assets across cyber + lofi themes"
```

---

## Task 6: 预览页生成器

**Files:**
- Create: `scripts/art/preview.ts`
- Test: `scripts/art/preview.test.ts`

- [ ] **Step 1: 写失败测试**

`scripts/art/preview.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { renderPreviewHtml } from "./preview";

describe("preview html", () => {
  it("两主题分组、每资产一行并排、像素渲染", () => {
    const html = renderPreviewHtml(["hero_orchestrator", "floor_work"]);
    expect(html).toContain("cyber");
    expect(html).toContain("lofi");
    expect(html).toContain("/assets/themes/cyber/hero_orchestrator.png");
    expect(html).toContain("/assets/themes/lofi/floor_work.png");
    expect(html).toContain("image-rendering: pixelated");
    // 每资产一个标签
    expect(html).toContain("hero_orchestrator");
    expect(html).toContain("floor_work");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test scripts/art/preview.test.ts`
Expected: FAIL（`Cannot find module "./preview"`）。

- [ ] **Step 3: 实现 preview.ts**

`scripts/art/preview.ts`:

```ts
import { ASSETS, THEMES } from "./prompts";

/** 纯函数:给定资产 id 列表,产出并排对比的预览 HTML。 */
export function renderPreviewHtml(assetIds: string[]): string {
  const rows = assetIds
    .map((id) => {
      const cells = THEMES.map(
        (t) =>
          `<figure><img src="/assets/themes/${t}/${id}.png" alt="${t} ${id}" />` +
          `<figcaption>${t}</figcaption></figure>`,
      ).join("");
      return `<section class="row"><h2>${id}</h2><div class="cells">${cells}</div></section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8" />
<title>Roguent 主题切片预览</title><style>
  body { margin:0; background:#14121a; color:#e9dcc0; font-family:system-ui,sans-serif; }
  h1 { padding:16px 24px; }
  .row { padding:8px 24px 24px; border-bottom:1px solid #2c2738; }
  .row h2 { font-size:14px; color:#9fe9f7; margin:0 0 8px; }
  .cells { display:flex; gap:24px; flex-wrap:wrap; }
  figure { margin:0; text-align:center; }
  img { width:256px; height:256px; object-fit:contain;
    image-rendering: pixelated; background:
      repeating-conic-gradient(#1d1a26 0% 25%, #232030 0% 50%) 0/24px 24px; }
  figcaption { font-size:12px; color:#8a8170; margin-top:4px; }
</style></head><body>
<h1>Roguent 主题切片预览 — ${assetIds.length} 资产 × ${THEMES.length} 主题</h1>
${rows}
</body></html>`;
}

/** 写出 public/themes-preview.html(覆盖所有定义的资产)。 */
async function main(): Promise<void> {
  const html = renderPreviewHtml(Object.keys(ASSETS));
  await Bun.write("public/themes-preview.html", html);
  console.log("✓ public/themes-preview.html");
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test scripts/art/preview.test.ts`
Expected: PASS（1 test）。

- [ ] **Step 5: 生成预览页**

Run: `bun scripts/art/preview.ts`
Expected: 写出 `public/themes-preview.html`。

- [ ] **Step 6: 类型 + lint**

Run: `bunx tsc --noEmit && bun run check`
Expected: 均无错误。

- [ ] **Step 7: Commit**

```bash
git add scripts/art/preview.ts scripts/art/preview.test.ts public/themes-preview.html
git commit -m "feat: 🧩 art slice preview page generator"
```

---

## Task 7: 看效果(预览页) + 迭代闸门

- [ ] **Step 1: 起前端、打开预览页**

Run: `bun run dev:web`
打开: `http://localhost:5173/themes-preview.html`

- [ ] **Step 2: 用户评审(必须人工)**

逐项核对 30 张:
- **清晰度**:是否解决了"又小又糊、眼睛难受"。
- **画风**:高清 roguelike 像素(非插画、非糊 16px)。
- **一致性**:同主题内像素密度/比例/光向统一。
- **冷暖反差 + vibe-coding 调性**:cyber vs lofi 是否一眼区分、都贴题、无地牢/中世纪味。

- [ ] **Step 3: 迭代(按需)**

对不满意的资产:改 `scripts/art/prompts.ts` 对应 `body`,重跑
`bun scripts/art/gen.ts --theme <t> --asset <id> --ref-anchor`,
再 `bun scripts/art/preview.ts` 刷新预览。满意后 commit 改动。

- [ ] **Step 4: 结论**

记录评审结论(扩全量 / 调风格基准重来 / 局部返修)到本任务日志,供"全量 + 主题系统"轮决策。

---

## Task 8(可选): 房间场景 mock — 零渲染器风险看"在场景里"

> 满足"在原型/场景里看效果"的诉求,但**不碰 Pixi/渲染器**:用生成图手搭一个静态"工作楼层"场景 HTML,看瓦片拼接 + 小人 + 家具的整体观感。真正接渲染器/相机属"完整主题系统"轮(spec §7)。

**Files:**
- Create: `scripts/art/room-mock.ts`

- [ ] **Step 1: 实现 room-mock.ts**

`scripts/art/room-mock.ts`:

```ts
import { THEMES } from "./prompts";

// 用绝对定位手搭一个示意场景:floor 平铺背景 + 一面 wall + 桌/咖啡机/掉落箱 + 三个小人 + 猫。
function scene(theme: string): string {
  const a = (id: string) => `/assets/themes/${theme}/${id}.png`;
  const sprite = (id: string, x: number, y: number, w: number) =>
    `<img class="sp" style="left:${x}px;top:${y}px;width:${w}px" src="${a(id)}" alt="${id}" />`;
  return `<div class="stage" style="background:
      repeating-image">
    <div class="floor" style="background-image:url(${a("floor_work")})"></div>
    ${sprite("wall", 0, 0, 640)}
    ${sprite("desk", 60, 120, 140)}
    ${sprite("coffee_station", 470, 110, 96)}
    ${sprite("loot_crate", 300, 300, 96)}
    ${sprite("hero_orchestrator", 280, 180, 110)}
    ${sprite("hero_subagent_a", 120, 280, 96)}
    ${sprite("hero_subagent_b", 440, 280, 96)}
    ${sprite("cat_pet", 360, 360, 64)}
    <div class="tag">${theme}</div>
  </div>`;
}

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8" />
<title>Roguent 场景 mock</title><style>
  body{margin:0;background:#0c0b12;display:flex;flex-wrap:wrap;gap:24px;padding:24px}
  .stage{position:relative;width:640px;height:440px;overflow:hidden;border-radius:8px;
    outline:1px solid #2c2738}
  .floor{position:absolute;inset:0;background-size:96px 96px;image-rendering:pixelated}
  .sp{position:absolute;image-rendering:pixelated;object-fit:contain;height:auto}
  .tag{position:absolute;left:8px;top:8px;color:#9fe9f7;font:12px system-ui}
</style></head><body>
${THEMES.map(scene).join("\n")}
</body></html>`;

await Bun.write("public/themes-room-mock.html", html);
console.log("✓ public/themes-room-mock.html");
```

- [ ] **Step 2: 生成并查看**

Run: `bun scripts/art/room-mock.ts` 然后打开 `http://localhost:5173/themes-room-mock.html`
Expected: 两个并排的示意"工作楼层"场景(各主题),floor 平铺 + 家具 + 小人。

- [ ] **Step 3: 类型 + lint + Commit**

```bash
bunx tsc --noEmit && bun run check
git add scripts/art/room-mock.ts public/themes-room-mock.html
git commit -m "feat: 🧩 zero-renderer scene mock for art slice"
```

---

## Self-Review(已执行)

- **Spec 覆盖**:§4.1 像素保真度 → 体现在 `STYLE_PREFIX`/`AVOID`(Task 1)与预览的 `pixelated`(Task 6);§5 两套风格前缀 → Task 1;§6.1 切片 15 资产 → `ASSETS`(15 项,Task 1);§6.2 30 条提示词 → `assemblePrompt`×`listJobs`(Task 1);§6.3 一致性(基准图先行+参考) → Task 4/5 + `--ref-anchor`;§6.4 看效果(预览页 + 高清像素、不降 16px) → Task 6/7 + 可选 Task 8;字体(§4.2)、多区域+相机渲染(§7.3)、全量、Roguent skill → **明确属后续轮,不在本试产计划内**(spec §11 已述)。
- **占位符扫描**:无 TBD/TODO;每个代码步骤含完整代码与确切命令/预期。
- **类型一致**:`ThemeId`/`assemblePrompt(theme,asset)`/`listJobs():Job[]`/`targetPath(theme,asset)`/`buildGenRequest(prompt,key)`/`renderPreviewHtml(ids)` 跨任务签名一致;`assetId` 全程 snake_case 与 `ASSETS` 键一致。

---

## Execution Handoff

跑真实出图需 `OPENAI_API_KEY`(或走 Task 0 的手动 GPT 回退)。Task 1/2/6 是 TDD 纯逻辑,可先做并验证;Task 4/5/7 含人工确认闸门。
