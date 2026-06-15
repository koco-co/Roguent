# Art Style Pack Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2026-06-15 handoff 新增的 Settings「美术风格 / Art Style」切换器忠实落到真实 React/TS 代码,只有 `pixel-fantasy` 为真内置,另外 4 包为占位。

**Architecture:** 纯前端(`src/web`),不动 engine/事件协议/domain。pack 列表 + 持久化抽到纯模块 `artpack.ts`(localStorage `roguent_artpack` + `<html data-artpack>`,忠实原型,不接 settings-store);UI 两组件 `ArtPackGroup`/`ArtPackPreview` 进 `Settings.tsx`,经 `compact` 同款 special-render 分支挂载;新 `scene` 图标;`.artpack-*`/`.apv-*` CSS 照搬;中文 UI 文案补 EN 字典。

**Tech Stack:** React 18 + TS(`noUncheckedIndexedAccess`)、Zustand、bun:test(happy-dom 预载,`localStorage`/`document` 可用,afterEach 清空)、Biome。

参照:spec [2026-06-15-art-style-pack-design.md](../specs/2026-06-15-art-style-pack-design.md);原型源 `/tmp/roguent-handoff/roguent/project/roguent/{panels2.jsx,icons.jsx,extra.css,data.js}`(= zip 内 2026-06-15 版)。

---

### Task 1: `artpack.ts` 纯模块 + 单测(TDD)

**Files:**
- Create: `src/web/hud/artpack.ts`
- Test: `src/web/hud/artpack.test.ts`

- [ ] **Step 1: 写失败测试** `src/web/hud/artpack.test.ts`

```ts
import { afterEach, expect, test } from "bun:test";
import {
  ARTPACK_KEY,
  ART_PACKS,
  DEFAULT_ARTPACK,
  applyArtPack,
  loadArtPack,
} from "./artpack";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-artpack");
});

test("ART_PACKS:5 包、id 唯一、字段齐全", () => {
  expect(ART_PACKS).toHaveLength(5);
  const ids = ART_PACKS.map((p) => p.id);
  expect(new Set(ids).size).toBe(5);
  for (const p of ART_PACKS) {
    expect(p.id.length).toBeGreaterThan(0);
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.en.length).toBeGreaterThan(0);
    expect(p.ac).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.desc.length).toBeGreaterThan(0);
  }
});

test("唯一 ready 包 = 默认 = pixel-fantasy(其余为占位)", () => {
  const ready = ART_PACKS.filter((p) => p.ready);
  expect(ready).toHaveLength(1);
  expect(ready[0]?.id).toBe(DEFAULT_ARTPACK);
  expect(DEFAULT_ARTPACK).toBe("pixel-fantasy");
});

test("loadArtPack:空→默认;读已存值", () => {
  expect(loadArtPack()).toBe("pixel-fantasy");
  localStorage.setItem(ARTPACK_KEY, "synthwave");
  expect(loadArtPack()).toBe("synthwave");
});

test("applyArtPack:写 localStorage + 盖 data-artpack", () => {
  applyArtPack("neon-terminal");
  expect(localStorage.getItem(ARTPACK_KEY)).toBe("neon-terminal");
  expect(document.documentElement.getAttribute("data-artpack")).toBe(
    "neon-terminal",
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd <worktree> && bun test src/web/hud/artpack.test.ts`
Expected: FAIL(`Cannot find module './artpack'`)

- [ ] **Step 3: 实现** `src/web/hud/artpack.ts`

```ts
// 美术风格包(Art Style Pack)— 忠实落地原型 panels2.jsx 的全局素材切换。
// 只有 pixel-fantasy 是真内置素材;另外 4 个为占位(用户自备素材,未导入则回退占位图)。
// 持久化沿用原型:localStorage['roguent_artpack'] + <html data-artpack>,不接 settings-store。
// name/desc 为中文(同时是 i18n DICT 键),渲染处经 t() 翻译;en 为英文副标题/useTL 用。

export interface ArtPack {
  id: string;
  name: string; // cn 名(DICT 键)
  en: string; // en 名
  ac: string; // 强调色 --ac
  desc: string; // cn 描述(DICT 键)
  ready?: boolean; // 是否有真实内置素材
}

export const ARTPACK_KEY = "roguent_artpack";
export const DEFAULT_ARTPACK = "pixel-fantasy";

export const ART_PACKS: ArtPack[] = [
  {
    id: "pixel-fantasy",
    name: "像素奇幻",
    en: "Pixel Fantasy",
    ac: "#f2c84b",
    desc: "当前内置风格 · 地牢羊皮卷 · 暖棕木质 HUD",
    ready: true,
  },
  {
    id: "neon-terminal",
    name: "霓虹终端",
    en: "Neon Terminal",
    ac: "#36c5e0",
    desc: "CRT 扫描线 · 磷光青绿 · 赛博命令行界面",
  },
  {
    id: "holo-blueprint",
    name: "全息蓝图",
    en: "Holo Blueprint",
    ac: "#5aa9ff",
    desc: "线框全息投影 · 坐标网格 · 半透冷蓝",
  },
  {
    id: "deep-space",
    name: "深空舰桥",
    en: "Deep-Space Bridge",
    ac: "#a06cd5",
    desc: "星舰指挥桥 · 深空星野 · 暗物质金属",
  },
  {
    id: "synthwave",
    name: "合成波",
    en: "Synthwave Grid",
    ac: "#ff6a8a",
    desc: "80s 落日网格 · 品红/青渐隐 · 矢量霓虹",
  },
];

/** 读取当前包(异常/未设置 → 默认 pixel-fantasy)。 */
export function loadArtPack(): string {
  try {
    return localStorage.getItem(ARTPACK_KEY) || DEFAULT_ARTPACK;
  } catch {
    return DEFAULT_ARTPACK;
  }
}

/** 持久化选择 + 盖 <html data-artpack>(供未来素材/CSS 层挂钩)。 */
export function applyArtPack(id: string): void {
  try {
    localStorage.setItem(ARTPACK_KEY, id);
  } catch {
    // ignore(隐私模式 / 存储不可用)
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-artpack", id);
  }
}
```

- [ ] **Step 4: 跑测试确认通过** Run: `bun test src/web/hud/artpack.test.ts` Expected: PASS(4 tests)

- [ ] **Step 5: 提交** `git add src/web/hud/artpack.ts src/web/hud/artpack.test.ts && git commit -m "feat: 🧩 art-pack pure module (packs + persist) + tests"`

---

### Task 2: `scene` 图标

**Files:**
- Modify: `src/web/hud/icons.tsx`(在 ICON_ART_DATA 内任意稳定位置加一条,建议紧跟现有 `menu` 之前或 `gear` 附近)

直译原型 `ART.scene`(原型 `r`/`box`/`C`/`O` 助手与真实 `icons.tsx` 完全一致)。

- [ ] **Step 1: 加图标**:在 `ICON_ART_DATA` 对象里加:

```ts
  // ---- art-style: framed scene (sun + ridge + hill) ----
  scene: [
    ...box(1, 2, 14, 11, "#163a45", O),
    r(3, 4, 2, 2, C.gold),
    r(3, 4, 2, 1, C.goldH),
    r(2, 8, 4, 1, C.cyanD),
    r(6, 7, 3, 1, C.cyanD),
    r(9, 8, 4, 1, C.cyanD),
    r(2, 9, 3, 3, C.green),
    r(5, 10, 4, 2, C.green),
    r(9, 9, 4, 3, C.green),
    r(2, 9, 3, 1, C.greenH),
    r(9, 9, 4, 1, C.greenH),
  ],
```

- [ ] **Step 2: 验证类型**:`scene` 自动进 `IconName` 联合(`ICON_ART_DATA` 是 `as const` 推导源)。Run: `bunx tsc --noEmit` Expected: 0 错误。
- [ ] **Step 3: 提交** `git add src/web/hud/icons.tsx && git commit -m "feat: 🧩 add scene icon (art-style group)"`

---

### Task 3: `artpack` 设置组

**Files:**
- Modify: `src/web/hud/settings-schema.ts`(`SETTINGS_GROUPS` 内 `compact` 组之后、`perm` 组之前)

- [ ] **Step 1: 插入组**:在 `{ id: "compact", ... }` 组对象之后插入:

```ts
  {
    id: "artpack",
    name: "美术风格 Art Style",
    icon: "scene",
    items: [],
  },
```

(`items: []` — special-rendered,同 `compact`。)

- [ ] **Step 2: 验证** `bunx tsc --noEmit` Expected: 0。
- [ ] **Step 3: 提交** `git add src/web/hud/settings-schema.ts && git commit -m "feat: 🧩 register artpack settings group after compact"`

---

### Task 4: i18n DICT(EN)+ 断言

**Files:**
- Modify: `src/web/i18n.ts`(`DICT` 内追加;**先 grep 确认未重复**:`取消`/`审查官`/`商人`/`向导` 可能已存在,已存在的跳过)
- Modify: `src/web/i18n.test.ts`(加断言)

- [ ] **Step 1: 加断言**(`src/web/i18n.test.ts` 末尾追加 test):

```ts
test("artpack 组关键串 en 翻译", () => {
  expect(translate("美术风格 Art Style", "en")).toBe("Art Style");
  expect(translate("像素奇幻", "en")).toBe("Pixel Fantasy");
  expect(translate("合成波", "en")).toBe("Synthwave Grid");
  expect(translate("✓ 使用中", "en")).toBe("✓ In use");
  expect(translate("确认切换", "en")).toBe("Confirm switch");
  expect(translate("CRT 扫描线 · 磷光青绿 · 赛博命令行界面", "en")).toBe(
    "CRT scanlines · phosphor cyan · cyber command line",
  );
});
```

- [ ] **Step 2: 跑确认失败** Run: `bun test src/web/i18n.test.ts` Expected: FAIL(未收录返回原中文)。

- [ ] **Step 3: 加 DICT 条目**(`src/web/i18n.ts` `DICT` 对象内,挑一处加注释段;**grep 跳过已存在键**):

```ts
  // ── art-style pack(美术风格切换器)──────────────────────────
  "美术风格 Art Style": "Art Style",
  "选择一款美术风格包后会进入预览，确认无误再应用——届时大厅场景、内景、NPC 与道具的全部贴图都会替换（自动保存）。素材由你自备，未导入对应风格时回退到占位图。":
    "Pick an art-style pack to preview it, then apply once it looks right — that swaps every texture across the lobby scene, rooms, NPCs and props (saved automatically). You bring your own assets; styles without imported art fall back to placeholders.",
  像素奇幻: "Pixel Fantasy",
  霓虹终端: "Neon Terminal",
  全息蓝图: "Holo Blueprint",
  深空舰桥: "Deep-Space Bridge",
  合成波: "Synthwave Grid",
  "当前内置风格 · 地牢羊皮卷 · 暖棕木质 HUD":
    "Built-in style · dungeon parchment · warm-wood HUD",
  "CRT 扫描线 · 磷光青绿 · 赛博命令行界面":
    "CRT scanlines · phosphor cyan · cyber command line",
  "线框全息投影 · 坐标网格 · 半透冷蓝":
    "Wireframe hologram · coordinate grid · translucent cold blue",
  "星舰指挥桥 · 深空星野 · 暗物质金属":
    "Starship bridge · deep-space starfield · dark-matter metal",
  "80s 落日网格 · 品红/青渐隐 · 矢量霓虹":
    "80s sunset grid · magenta/cyan fade · vector neon",
  "✓ 使用中": "✓ In use",
  预览: "Preview",
  "当前使用内置「像素奇幻」素材，开箱即用。":
    'Using the built-in "Pixel Fantasy" assets — ready out of the box.',
  审查官: "Reviewer",
  商人: "Merchant",
  向导: "Guide",
  "该风格已在使用中。": "This style is already in use.",
  "内置素材，确认后立即生效。":
    "Built-in assets — applies immediately on confirm.",
  "确认后将切换至此风格；缺失的贴图会显示占位图，导入素材后自动补全。":
    "On confirm, switches to this style; missing textures show placeholders and fill in once you import the assets.",
  确认切换: "Confirm switch",
  当前风格: "Current style",
  "SCENE / 场景": "SCENE / Scene",
```

> 注:`取消`(Cancel)若已在 DICT 则**不要重复加**(biome 会报 duplicate key,且 tsc 不查)。`审查官`/`商人`/`向导` 同理 grep 后再决定。note 的「当前生效:…」插值串不进 DICT,组件里用 `useTL` 直给 cn/en(见 Task 5)。

- [ ] **Step 4: 跑确认通过** Run: `bun test src/web/i18n.test.ts` Expected: PASS。
- [ ] **Step 5: 提交** `git add src/web/i18n.ts src/web/i18n.test.ts && git commit -m "feat: 🧩 EN dict for art-style pack strings"`

---

### Task 5: `ArtPackGroup` + `ArtPackPreview` + special-render

**Files:**
- Modify: `src/web/hud/Settings.tsx`
  - import:加 `useEffect`(已 import `useState`);加 `import { ART_PACKS, type ArtPack, applyArtPack, loadArtPack } from "./artpack";`
  - special-render 分支(当前 `grp === "compact" ? <CompactGroup /> : (...)`,约 793 行):改成 `grp === "compact" ? <CompactGroup /> : grp === "artpack" ? <ArtPackGroup /> : (...)`
  - 在文件内(`CompactGroup` 附近)加两个组件。

逐字对照原型 `panels2.jsx` 的 `ArtPackGroup`/`ArtPackPreview`,`h(...)`→JSX,`T`→`t`(`useT()`),插值 note→`useTL()`,卡片/预览标题的英文副标题在 `t(name)===en`(EN 模式)时隐藏避免重复。

- [ ] **Step 1: 加组件**(放在 `CompactGroup` 函数之后):

```tsx
// 美术风格包切换器(§ art-style)— special-rendered,忠实原型 panels2.jsx。
// 只有 pixel-fantasy 真内置;选其余包只持久化 + 盖 data-artpack(占位,世界仍渲染内置贴图)。
function ArtPackGroup() {
  const t = useT();
  const tl = useTL();
  const [cur, setCur] = useState<string>(loadArtPack);
  const [preview, setPreview] = useState<string | null>(null);

  // 挂载时盖一次 data-artpack(与持久值同步)。
  useEffect(() => {
    applyArtPack(loadArtPack());
  }, []);

  const apply = (id: string) => {
    setCur(id);
    applyArtPack(id);
    setPreview(null);
  };
  const open = (id: string) => {
    if (id !== cur) setPreview(id);
  };
  const curPack = ART_PACKS.find((p) => p.id === cur) ?? ART_PACKS[0];
  const pvPack = ART_PACKS.find((p) => p.id === preview) ?? null;
  if (!curPack) return null;

  return (
    <div className="artpack-group">
      <div className="comp-intro">
        <Icon name="scene" size={20} />
        <span>
          {t(
            "选择一款美术风格包后会进入预览，确认无误再应用——届时大厅场景、内景、NPC 与道具的全部贴图都会替换（自动保存）。素材由你自备，未导入对应风格时回退到占位图。",
          )}
        </span>
      </div>
      <div className="artpack-grid">
        {ART_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`artpack-card${cur === p.id ? " on" : ""}`}
            style={{ ["--ac" as string]: p.ac }}
            data-pk={p.id}
            onClick={() => open(p.id)}
          >
            <div className="artpack-prev" data-pk={p.id}>
              <span className="artpack-stripe" />
              <span className="artpack-prev-tag">
                {p.ready ? "art pack" : "drop assets"}
              </span>
            </div>
            <div className="artpack-meta">
              <div className="artpack-name">
                <span>{t(p.name)}</span>
                {t(p.name) !== p.en && <span className="artpack-en">{p.en}</span>}
              </div>
              <div className="artpack-desc">{t(p.desc)}</div>
            </div>
            <div className={`artpack-badge${cur === p.id ? " on" : ""}`}>
              {cur === p.id ? t("✓ 使用中") : t("预览")}
            </div>
          </button>
        ))}
      </div>
      <div className="artpack-note">
        <Icon name={curPack.ready ? "done" : "import"} size={14} />
        <span>
          {curPack.ready
            ? t("当前使用内置「像素奇幻」素材，开箱即用。")
            : tl(
                `当前生效:「${curPack.name}」。把该风格的场景 / NPC / 道具贴图导入素材目录后即可全局生效。`,
                `Active: "${curPack.en}". Import this pack's scene / NPC / prop textures into the assets directory to apply globally.`,
              )}
        </span>
      </div>
      {pvPack && (
        <ArtPackPreview
          pack={pvPack}
          isCur={pvPack.id === cur}
          onCancel={() => setPreview(null)}
          onConfirm={() => apply(pvPack.id)}
        />
      )}
    </div>
  );
}

// 切换前全屏确认浮层 — mock 场景 + NPC 条 + 道具行(忠实原型 ArtPackPreview)。
function ArtPackPreview({
  pack,
  isCur,
  onCancel,
  onConfirm,
}: {
  pack: ArtPack;
  isCur: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const NPCS: { k: string; cn: string; ic: IconName }[] = [
    { k: "reviewer", cn: "审查官", ic: "search" },
    { k: "merchant", cn: "商人", ic: "shop" },
    { k: "guide", cn: "向导", ic: "account" },
  ];
  const PROPS: IconName[] = ["scene", "coins", "crystal", "trophy", "quest"];
  return (
    <div className="apv-scrim" onClick={onCancel}>
      <div
        className="apv-panel"
        data-pk={pack.id}
        style={{ ["--ac" as string]: pack.ac }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apv-head">
          <div className="apv-title">
            <span className="apv-cn">{t(pack.name)}</span>
            {t(pack.name) !== pack.en && <span className="apv-en">{pack.en}</span>}
          </div>
          <button type="button" className="apv-x" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="apv-scene">
          <span className="apv-sky" />
          <span className="apv-grid" />
          <span className="apv-ridge" />
          <span className="apv-sun" />
          <span className="apv-scene-lbl">{t("SCENE / 场景")}</span>
          <span className="apv-hero" />
        </div>
        <div className="apv-strip">
          {NPCS.map((n) => (
            <div key={n.k} className="apv-npc">
              <div className="apv-npc-sprite">
                <Icon name={n.ic} size={22} />
              </div>
              <div className="apv-npc-l">{t(n.cn)}</div>
            </div>
          ))}
        </div>
        <div className="apv-props">
          {PROPS.map((ic, i) => (
            <div key={`${ic}-${i}`} className="apv-prop">
              <Icon name={ic} size={16} />
            </div>
          ))}
        </div>
        <div className="apv-metaline">{t(pack.desc)}</div>
        <div className="apv-foot">
          <span className="apv-hint">
            {isCur
              ? t("该风格已在使用中。")
              : pack.ready
                ? t("内置素材，确认后立即生效。")
                : t(
                    "确认后将切换至此风格；缺失的贴图会显示占位图，导入素材后自动补全。",
                  )}
          </span>
          <div className="apv-btns">
            <button type="button" className="apv-btn ghost" onClick={onCancel}>
              {t("取消")}
            </button>
            <button
              type="button"
              className="apv-btn go"
              disabled={isCur}
              onClick={onConfirm}
            >
              {isCur ? t("当前风格") : t("确认切换")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

> `IconName` 需 import:`Settings.tsx` 顶部 `import { Icon } from "./icons";` 改为 `import { Icon, type IconName } from "./icons";`(确认 `icons.tsx` 导出 `IconName`,已导出)。

- [ ] **Step 2: 接 special-render**:把约 793 行的
  `{grp === "compact" ? (\n  <CompactGroup />\n) : (` 改为
  `{grp === "compact" ? (\n  <CompactGroup />\n) : grp === "artpack" ? (\n  <ArtPackGroup />\n) : (`
  (末尾 `)}` 配平不变。)

- [ ] **Step 3: 类型 + lint** Run: `bunx tsc --noEmit && bun run check` Expected: 0 错误(注意 `["--ac" as string]` 自定义 CSS 变量写法已被仓库其它处使用;若 biome 偏好对象 key 形式可调成 `{"--ac": p.ac} as React.CSSProperties`)。
- [ ] **Step 4: 提交** `git add src/web/hud/Settings.tsx && git commit -m "feat: 🧩 ArtPackGroup + ArtPackPreview in Settings"`

---

### Task 6: CSS(`.artpack-*` + `.apv-*`)+ 外层 `.artpack-group`

**Files:**
- Modify: `src/web/styles.css`(末尾追加)

把原型 2026-06-15 `extra.css` 新增的 `.artpack-*` 与 `.apv-*` 块**逐字照搬**(源见下),并补一条外层 `.artpack-group`(原型外层用 `amb-group`,真实 app 用等价列布局):

- [ ] **Step 1: 追加 CSS**:

```css
/* ============================================================
   ART STYLE PACK SWITCHER (settings → 美术风格)
   ============================================================ */
.artpack-group{display:flex;flex-direction:column;gap:16px;}
.artpack-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px;}
.artpack-card{--ac:#f2c84b;display:flex;align-items:center;gap:13px;text-align:left;background:rgba(11,10,18,.42);box-shadow:inset 0 0 0 2px var(--panel-edge);padding:11px;cursor:pointer;transition:transform .1s,box-shadow .1s,background .1s;font-family:var(--font-cjk);}
.artpack-card:hover{transform:translateY(-2px);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ac) 60%,transparent);}
.artpack-card.on{box-shadow:inset 0 0 0 2px var(--ac),0 0 12px color-mix(in srgb,var(--ac) 40%,transparent);background:color-mix(in srgb,var(--ac) 9%,rgba(11,10,18,.42));}
.artpack-prev{position:relative;width:74px;height:54px;flex-shrink:0;overflow:hidden;background:#0b0a12;box-shadow:inset 0 0 0 2px #15100a;display:grid;place-items:center;}
.artpack-stripe{position:absolute;inset:0;background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--ac) 22%,transparent) 0 6px,transparent 6px 12px);}
.artpack-prev::after{content:"";position:absolute;left:0;right:0;bottom:0;height:38%;background:color-mix(in srgb,var(--ac) 30%,transparent);box-shadow:inset 0 2px 0 color-mix(in srgb,var(--ac) 60%,transparent);}
.artpack-prev-tag{position:relative;z-index:2;font-family:var(--font-px);font-size:7px;letter-spacing:.5px;color:var(--ink-faint);background:rgba(8,8,14,.72);padding:2px 4px;}
.artpack-meta{flex:1;min-width:0;}
.artpack-name{display:flex;align-items:baseline;gap:7px;}
.artpack-name>span:first-child{font-size:13px;color:var(--ink);}
.artpack-en{font-family:var(--font-px);font-size:8px;color:var(--ink-faint);letter-spacing:.5px;}
.artpack-desc{font-size:11px;color:var(--ink-dim);line-height:1.5;margin-top:5px;text-wrap:pretty;}
.artpack-badge{flex-shrink:0;align-self:center;font-family:var(--font-px);font-size:8px;color:var(--ink-faint);padding:5px 8px;white-space:nowrap;box-shadow:inset 0 0 0 1px var(--panel-edge);}
.artpack-card.on .artpack-badge.on{color:color-mix(in srgb,var(--ac) 85%,#fff);box-shadow:inset 0 0 0 1px var(--ac);}
.artpack-note{display:flex;align-items:center;gap:9px;margin-top:14px;padding:11px 14px;background:rgba(8,10,16,.5);box-shadow:inset 0 0 0 2px var(--panel-edge);font-size:11px;color:var(--ink-dim);line-height:1.5;}
/* --- art pack PREVIEW overlay (confirm before global swap) --- */
.apv-scrim{position:absolute;inset:0;z-index:60;display:grid;place-items:center;background:rgba(4,4,8,.72);backdrop-filter:blur(2px);animation:apvFade .14s ease-out;}
@keyframes apvFade{from{opacity:0}to{opacity:1}}
.apv-panel{--ac:#f2c84b;width:min(560px,92%);max-height:88%;overflow:auto;background:#0c0b14;box-shadow:inset 0 0 0 2px var(--ac),0 0 0 2px #050409,0 14px 40px rgba(0,0,0,.6);padding:16px;font-family:var(--font-cjk);animation:apvPop .16s cubic-bezier(.2,.9,.3,1.2);}
@keyframes apvPop{from{transform:translateY(10px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.apv-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.apv-title{display:flex;align-items:baseline;gap:9px;}
.apv-cn{font-size:16px;color:var(--ink);}
.apv-en{font-family:var(--font-px);font-size:9px;letter-spacing:.5px;color:var(--ac);}
.apv-x{background:none;border:0;color:var(--ink-faint);font-size:15px;cursor:pointer;padding:2px 6px;line-height:1;}
.apv-x:hover{color:var(--ink);}
.apv-scene{position:relative;height:184px;overflow:hidden;background:#05060b;box-shadow:inset 0 0 0 2px #15100a;image-rendering:pixelated;}
.apv-sky{position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--ac) 26%,#070710) 0%,#06060d 70%);}
.apv-sun{position:absolute;left:50%;top:30px;width:64px;height:64px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--ac) 88%,#fff) 0%,color-mix(in srgb,var(--ac) 60%,transparent) 60%,transparent 70%);}
.apv-grid{position:absolute;left:0;right:0;bottom:0;height:50%;background:
  repeating-linear-gradient(90deg,color-mix(in srgb,var(--ac) 38%,transparent) 0 2px,transparent 2px 34px),
  repeating-linear-gradient(0deg,color-mix(in srgb,var(--ac) 34%,transparent) 0 2px,transparent 2px 22px);
  transform:perspective(120px) rotateX(58deg);transform-origin:bottom;opacity:.7;}
.apv-ridge{position:absolute;left:0;right:0;bottom:46%;height:4px;background:var(--ac);box-shadow:0 0 10px color-mix(in srgb,var(--ac) 70%,transparent);}
.apv-hero{position:absolute;left:50%;bottom:18%;width:26px;height:40px;transform:translateX(-50%);background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--ac) 70%,#fff) 0 4px,color-mix(in srgb,var(--ac) 40%,#000) 4px 8px);box-shadow:inset 0 0 0 2px #050409;}
.apv-scene-lbl{position:absolute;left:8px;top:8px;z-index:3;font-family:var(--font-px);font-size:8px;letter-spacing:1px;color:var(--ink-faint);background:rgba(5,5,11,.7);padding:3px 5px;}
.apv-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;}
.apv-npc{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;background:rgba(11,10,18,.5);box-shadow:inset 0 0 0 2px var(--panel-edge);}
.apv-npc-sprite{width:46px;height:46px;display:grid;place-items:center;background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--ac) 16%,transparent) 0 5px,transparent 5px 10px);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ac) 45%,transparent);}
.apv-npc-l{font-size:11px;color:var(--ink-dim);}
.apv-props{display:flex;gap:7px;margin-top:8px;}
.apv-prop{width:34px;height:34px;display:grid;place-items:center;background:rgba(8,8,14,.5);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ac) 35%,transparent);}
.apv-metaline{margin-top:11px;font-size:11px;color:var(--ink-dim);line-height:1.5;text-wrap:pretty;}
.apv-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;box-shadow:inset 0 2px 0 -1px var(--panel-edge);}
.apv-hint{flex:1;font-size:10px;color:var(--ink-faint);line-height:1.45;text-wrap:pretty;}
.apv-btns{display:flex;gap:8px;flex-shrink:0;}
.apv-btn{font-family:var(--font-px);font-size:9px;letter-spacing:.5px;padding:9px 14px;cursor:pointer;border:0;color:var(--ink);background:rgba(20,18,28,.8);box-shadow:inset 0 0 0 2px var(--panel-edge);}
.apv-btn.ghost:hover{box-shadow:inset 0 0 0 2px var(--ink-faint);}
.apv-btn.go{color:#080608;background:var(--ac);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ac) 70%,#fff),0 0 12px color-mix(in srgb,var(--ac) 45%,transparent);}
.apv-btn.go:hover{filter:brightness(1.1);}
.apv-btn.go:disabled{opacity:.4;cursor:default;filter:none;box-shadow:inset 0 0 0 2px var(--panel-edge);background:rgba(20,18,28,.8);color:var(--ink-faint);}
```

> 校验 token 存在性:`--panel-edge`/`--ink`/`--ink-dim`/`--ink-faint`/`--font-cjk`/`--font-px` 均为仓库现有 token(原型同名)。`.apv-scrim` 用 `position:absolute;inset:0` 覆盖在 Modal `.panel-body` 上 — 若实测未铺满,改 `position:fixed`(`#stage` 缩放上下文里 fixed 仍贴 stage);先按原型 `absolute` 落地,e2e 时核实覆盖范围。

- [ ] **Step 2: lint + build** Run: `bun run check && bun run build` Expected: 0。
- [ ] **Step 3: 提交** `git add src/web/styles.css && git commit -m "feat: 🧩 art-pack switcher + preview overlay styles"`

---

### Task 7: 全门禁 + 浏览器 e2e + ROADMAP 回写

**Files:**
- Modify: `docs/ROADMAP.md`(§3 加一条「设计稿 2026-06-15 增量:Art Style Pack」)

- [ ] **Step 1: 全量门禁**(worktree 内):

```bash
bun test            # 期望:全绿(含新 artpack.test.ts + i18n 新断言)
bunx tsc --noEmit   # 期望:0
bun run check       # 期望:0
bun run build       # 期望:成功
```

- [ ] **Step 2: 记 worktree HEAD SHA**:`git rev-parse HEAD`
- [ ] **Step 3: 回主工作树合并**:`cd <main> && git merge --no-ff <sha>`
- [ ] **Step 4: 浏览器 e2e(强约束)**:`preview_start`(主仓根)→ 进内景或大厅 → 打开 Settings(CONFIG)→ 左侧点「美术风格 Art Style」→ 断言 5 卡网格 + pixel-fantasy「✓ 使用中」→ 点占位卡(如 synthwave)→ 断言预览浮层(场景/3 NPC/道具/取消·确认切换)→ 点「确认切换」→ 断言该卡「✓ 使用中」+ `localStorage['roguent_artpack']`+ `<html data-artpack>` 已更新 → 切 EN 复验无中文泄漏。**中/EN 各截图**。
- [ ] **Step 5: ROADMAP 回写**:在 §3 加一条记录(增量内容 + 真假边界 + commit + e2e 证据)。
- [ ] **Step 6: 合并后再门禁**:主工作树 `bun test && bunx tsc --noEmit && bun run check`。
- [ ] **Step 7: 提交 ROADMAP**:`git commit -m "docs: 📝 record 2026-06-15 art-style-pack delta in ROADMAP"`
- [ ] **Step 8: push**(**经用户确认**):`git push origin main`;清理 worktree:`git worktree remove .worktrees/art-style-pack`。

---

## Self-Review

**1. Spec coverage:** spec §3.1 ArtPackGroup→Task 5;§3.2 ArtPackPreview→Task 5;§3.3 持久化→Task 1;§4 文件映射:icons→T2、schema→T3、Settings→T5、artpack.ts→T1、styles→T6、i18n→T4;§5 测试→T1/T4/T7;§6 不做(不接 settings-store/不互联 skin)→由 Task 1 持久化方式 + Task 5 不引用 skin 保证。全覆盖。

**2. Placeholder scan:** 无 TBD/TODO;每个改码步骤含完整代码。

**3. Type consistency:** `ArtPack`(T1)字段 `id/name/en/ac/desc/ready?` 与 T5 组件用法一致;`ART_PACKS`/`applyArtPack`/`loadArtPack`/`ARTPACK_KEY`/`DEFAULT_ARTPACK` 命名 T1↔T5 一致;`IconName` 用于 NPCS/PROPS 类型与 icons.tsx 导出一致;`useTL` 签名 `(cn,en)=>string` 与 i18n.ts 一致。
