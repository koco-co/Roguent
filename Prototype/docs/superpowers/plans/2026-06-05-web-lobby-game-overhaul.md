# Web 端游戏化呈现重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Roguent web 端总览大厅从「1:1 邮票钉黑洞」重做成「像《元气骑士》的 top-down 游戏」——相机缩放跟随、中央 Hub 大厅、传送门进出、底部 hotbar HUD、游戏窗口面板,全程不动 engine / 事件协议 / domain。

**Architecture:** 纯客户端视觉/交互层改造。可测逻辑下沉到纯函数(`zoom.ts` 缩放、`camera.ts` 带 scale 的相机、`worldgen.ts` 的 Hub、`portal.ts` 过渡时序)用 `bun:test` 钉死;Pixi `.tsx` / DOM 面板 / CSS 用 `bun run check` + `bun test`(不回归) + 回放冒烟目视验收。所有移动/相机/缩放走命令式 `useTick` + `container.position/scale.set`,绝不进 React state。

**Tech Stack:** React 19 + PixiJS v8 (@pixi/react) + Zustand + bun:test + Biome。素材 = 0x72 DungeonTileset II(已在 `public/assets`)。

**Spec:** `docs/superpowers/specs/2026-06-05-web-lobby-game-overhaul-design.md`

**前置(执行者在 worktree 起手时做一次):**
- `git worktree add --detach .worktrees/web-lobby-game main`,worktree 内 `bun install`(或 symlink 主树 node_modules)。
- 冒烟基线:`bun run dev:engine -- --replay fixtures/multi-session.jsonl` + `bun run dev:web`,浏览器开 `http://localhost:5173`(若占用则看 vite 实际端口)。每个视觉 task 完成后回这里目视/截图。

---

## Task 1: 大厅相机缩放 + 贴身跟随

把世界容器套整数缩放并让相机跟随主角铺满屏(头号根因:`overworld` 世界容器 scale 恒为 1)。

**Files:**
- Create: `src/web/overworld/zoom.ts`
- Test: `src/web/overworld/zoom.test.ts`
- Modify: `src/web/overworld/camera.ts`(`cameraOffset` 增可选 `scale`)
- Test: `src/web/overworld/camera.test.ts`(加 scale 用例)
- Modify: `src/web/overworld/Player.tsx`(tick 内套 scale + 带 scale 的相机)

- [ ] **Step 1: 写 zoom 失败测试**

`src/web/overworld/zoom.test.ts`:

```ts
import { expect, test } from "bun:test";
import { lobbyZoom } from "./zoom";

test("典型桌面视口缩放到 3", () => {
  expect(lobbyZoom({ w: 1491, h: 812 })).toBe(3);
});

test("矮视口夹到最小缩放 2", () => {
  expect(lobbyZoom({ w: 800, h: 360 })).toBe(2);
});

test("高视口夹到最大缩放 4", () => {
  expect(lobbyZoom({ w: 2000, h: 1600 })).toBe(4);
});

test("缩放恒为 [2,4] 内整数", () => {
  for (const h of [200, 500, 700, 812, 1000, 1400, 3000]) {
    const z = lobbyZoom({ w: 1000, h });
    expect(Number.isInteger(z)).toBe(true);
    expect(z).toBeGreaterThanOrEqual(2);
    expect(z).toBeLessThanOrEqual(4);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/overworld/zoom.test.ts`
Expected: FAIL（`Cannot find module './zoom'`）。

- [ ] **Step 3: 实现 zoom.ts**

`src/web/overworld/zoom.ts`:

```ts
import { TILE } from "../room/config";

// 以「目标可见行数 ≈ 内景的 14 行」为基准定整数缩放,使主角/名牌足够大、世界铺满屏。
const TARGET_ROWS = 14;
const MIN_ZOOM = 2;
const MAX_ZOOM = 4;

/** 大厅世界容器的整数缩放(贴身跟随用)。纯函数,只依赖视口高。 */
export function lobbyZoom(view: { w: number; h: number }): number {
  const z = Math.floor(view.h / (TARGET_ROWS * TILE));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/overworld/zoom.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: 给 camera 加 scale 的失败测试**

在 `src/web/overworld/camera.test.ts` 末尾追加（现有 7 个用例不动,验证 `scale` 默认值不破坏它们）:

```ts
test("scale 把世界放大后仍居中聚焦点", () => {
  // world 100×80,scale 2 → 缩放后 200×160,均小于 view(800×600) → 两轴居中。
  const tiny = { w: 100, h: 80 };
  const off = cameraOffset({ x: 50, y: 40 }, view, tiny, 2);
  expect(off.x).toBe((view.w - tiny.w * 2) / 2);
  expect(off.y).toBe((view.h - tiny.h * 2) / 2);
});

test("scale 让世界超出视口时跟随并夹边", () => {
  // world 500×400,scale 3 → 1500×1200 > view → 跟随。focus 在缩放世界中点。
  const w = { w: 500, h: 400 };
  const focus = { x: 250, y: 200 };
  const off = cameraOffset(focus, view, w, 3);
  // 缩放后聚焦点落屏幕中央:off + scale*focus === view/2。
  expect(off.x + focus.x * 3).toBe(view.w / 2);
  expect(off.y + focus.y * 3).toBe(view.h / 2);
});

test("scale 下夹到 view - scale*world(右/下边不露白)", () => {
  const w = { w: 500, h: 400 };
  const off = cameraOffset({ x: w.w, y: w.h }, view, w, 3);
  expect(off.x).toBe(view.w - w.w * 3);
  expect(off.y).toBe(view.h - w.h * 3);
});

test("默认 scale=1 与旧行为一致(回归保护)", () => {
  const focus = { x: world.w / 2, y: world.h / 2 };
  expect(cameraOffset(focus, view, world)).toEqual(
    cameraOffset(focus, view, world, 1),
  );
});
```

- [ ] **Step 6: 跑测试确认新用例失败**

Run: `bun test src/web/overworld/camera.test.ts`
Expected: FAIL（`cameraOffset` 第 4 参数未支持,放大用例算错）。

- [ ] **Step 7: 给 cameraOffset 加 scale 参数**

替换 `src/web/overworld/camera.ts` 的 `axisOffset` + `cameraOffset`:

```ts
/**
 * One-axis camera offset in screen px. 屏幕坐标 = scale*worldPoint + offset。
 * - 缩放后世界小于视口 → 居中:(view - scale*world)/2。
 * - 否则居中缩放后的聚焦点(view/2 - scale*focus),夹到 [view - scale*world, 0]。
 */
function axisOffset(
  focus: number,
  view: number,
  world: number,
  scale: number,
): number {
  const sw = world * scale;
  if (sw <= view) return (view - sw) / 2;
  return clamp(view / 2 - focus * scale, view - sw, 0);
}

/**
 * 世界容器左上角偏移(屏幕 px),使 `focus`(世界 px)在缩放 `scale` 下居中、
 * 且视口不露出世界边外。配合 container.scale.set(scale) + container.position=结果。
 */
export function cameraOffset(
  focus: Pos,
  view: Size,
  world: Size,
  scale = 1,
): Pos {
  return {
    x: axisOffset(focus.x, view.w, world.w, scale),
    y: axisOffset(focus.y, view.h, world.h, scale),
  };
}
```

- [ ] **Step 8: 跑全量测试确认通过**

Run: `bun test src/web/overworld/camera.test.ts src/web/overworld/zoom.test.ts`
Expected: PASS（旧 7 + 新 4 + zoom 4）。

- [ ] **Step 9: Player 套 scale + 带 scale 的相机**

`src/web/overworld/Player.tsx`:① 顶部加 `import { lobbyZoom } from "./zoom";`;② 把 tick 里相机段(现 `:163-172`)替换为:

```ts
      // Camera follows the player at an integer zoom, clamped to world edges.
      const wr = worldRootRef.current;
      const view = viewRef.current;
      if (wr && view) {
        const z = lobbyZoom(view);
        wr.scale.set(z);
        const off = cameraOffset(pos.current, view, {
          w: w.widthPx,
          h: w.heightPx,
        }, z);
        wr.position.set(off.x, off.y);
      }
```

- [ ] **Step 10: 静态校验 + 全量测试**

Run: `bun run check && bun test`
Expected: biome 干净;全部测试 PASS（不回归 105 + 新 8）。

- [ ] **Step 11: 回放冒烟(目视)**

dev:engine(replay multi-session)+ dev:web,浏览器看大厅:房间应**铺满屏幕**、主角明显放大、WASD 走动相机贴身跟随并在世界边缘停住、NPC 名牌可读。截图留档。

- [ ] **Step 12: Commit**

```bash
git add src/web/overworld/zoom.ts src/web/overworld/zoom.test.ts src/web/overworld/camera.ts src/web/overworld/camera.test.ts src/web/overworld/Player.tsx
git commit -m "feat: 🧩 大厅相机整数缩放+贴身跟随(zoom.ts + camera scale)"
```

---

## Task 2: 传送门进出过渡 + NPC 传送阵

进出会话从瞬切改为「传送门 zoom/淡入」,NPC 脚下色环升级为脉冲传送阵。

**Files:**
- Create: `src/web/overworld/portal.ts`（过渡时序纯函数）
- Test: `src/web/overworld/portal.test.ts`
- Create: `src/web/overworld/PortalTransition.tsx`（DOM 覆盖层）
- Modify: `src/web/ui-store.ts`（transition 态 + beginEnter/beginExit）
- Modify: `src/web/App.tsx`（挂 PortalTransition;Esc 改走 beginExit)
- Modify: `src/web/hud/NpcCard.tsx`（"进入" 改走 beginEnter)
- Modify: `src/web/overworld/SessionNpc.tsx`（传送阵脉冲 + 提示语义 `[E] 进入`)

- [ ] **Step 1: 写 portal 时序失败测试**

`src/web/overworld/portal.test.ts`:

```ts
import { expect, test } from "bun:test";
import { portalFrame } from "./portal";

const D = 400;

test("起点:遮罩 0、未到中点切换、未结束", () => {
  expect(portalFrame(0, D)).toEqual({ cover: 0, swapped: false, done: false });
});

test("中点:遮罩满 1、触发 view 切换", () => {
  const f = portalFrame(D / 2, D);
  expect(f.cover).toBeCloseTo(1, 5);
  expect(f.swapped).toBe(true);
  expect(f.done).toBe(false);
});

test("终点及之后:遮罩 0、已切换、已结束", () => {
  expect(portalFrame(D, D)).toEqual({ cover: 0, swapped: true, done: true });
  expect(portalFrame(D + 50, D)).toEqual({
    cover: 0,
    swapped: true,
    done: true,
  });
});

test("遮罩前半升 0→1、后半降 1→0", () => {
  expect(portalFrame(D * 0.25, D).cover).toBeCloseTo(0.5, 5);
  expect(portalFrame(D * 0.75, D).cover).toBeCloseTo(0.5, 5);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/overworld/portal.test.ts`
Expected: FAIL（`Cannot find module './portal'`）。

- [ ] **Step 3: 实现 portal.ts**

`src/web/overworld/portal.ts`:

```ts
export interface PortalFrame {
  /** 全屏遮罩透明度 0..1(前半升、后半降)。 */
  cover: number;
  /** 是否已过中点 —— 中点真正切换 view(进/出内景)。 */
  swapped: boolean;
  /** 过渡是否结束(可清掉 transition 态)。 */
  done: boolean;
}

/** 传送门遮罩的三角时序:0→1(前半)→0(后半)。纯函数,便于单测。 */
export function portalFrame(elapsedMs: number, durationMs: number): PortalFrame {
  if (elapsedMs >= durationMs) return { cover: 0, swapped: true, done: true };
  const half = durationMs / 2;
  const swapped = elapsedMs >= half;
  const cover =
    elapsedMs < half ? elapsedMs / half : 1 - (elapsedMs - half) / half;
  return { cover: Math.max(0, Math.min(1, cover)), swapped, done: false };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/overworld/portal.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: ui-store 加 transition 态**

`src/web/ui-store.ts`:① 在 `UiState` 接口加字段与 action:

```ts
  // 传送门过渡:进/出内景时由 PortalTransition 驱动遮罩,中点真正切 view。
  transition: { kind: "enter" | "exit"; sessionId: string } | null;
  beginEnter: (id: string) => void;
  beginExit: (id: string) => void;
  endTransition: () => void;
```

② 在 `create` 初始值加 `transition: null,`,并加实现(注意:真正的 view 切换仍由 `enterInterior`/`exitOverworld` 完成,过渡只是包一层):

```ts
  beginEnter: (id) => set({ transition: { kind: "enter", sessionId: id } }),
  beginExit: (id) => set({ transition: { kind: "exit", sessionId: id } }),
  endTransition: () => set({ transition: null }),
```

- [ ] **Step 6: 实现 PortalTransition 覆盖层**

`src/web/overworld/PortalTransition.tsx`:

```ts
import { useEffect, useRef, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { portalFrame } from "./portal";

const DURATION_MS = 420;

/**
 * 全屏传送门遮罩。transition 非空时跑一次 rAF:前半淡入到不透明,中点真正切 view
 * (enter→进内景 / exit→回大厅),后半淡出,结束清 transition。解耦 Pixi 生命周期。
 */
export function PortalTransition() {
  const transition = useUiStore((s) => s.transition);
  const enterInterior = useUiStore((s) => s.enterInterior);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const endTransition = useUiStore((s) => s.endTransition);
  const switchSession = useRoomStore((s) => s.switchSession);
  const [cover, setCover] = useState(0);

  // 用 ref 装最新 action/transition,避免 rAF 闭包过期。
  const swappedRef = useRef(false);

  useEffect(() => {
    if (!transition) {
      setCover(0);
      return;
    }
    swappedRef.current = false;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const f = portalFrame(now - start, DURATION_MS);
      setCover(f.cover);
      if (f.swapped && !swappedRef.current) {
        swappedRef.current = true;
        if (transition.kind === "enter") {
          switchSession(transition.sessionId);
          enterInterior(transition.sessionId);
        } else {
          exitOverworld();
        }
      }
      if (f.done) {
        endTransition();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [transition, enterInterior, exitOverworld, endTransition, switchSession]);

  if (!transition && cover === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: cover > 0.05 ? "auto" : "none",
        background:
          "radial-gradient(circle at 50% 50%, #4fe0ff 0%, #1a0f3a 55%, #05030b 100%)",
        opacity: cover,
        transition: "none",
        zIndex: 50,
      }}
    />
  );
}
```

- [ ] **Step 7: App 挂 PortalTransition + Esc 走 beginExit**

`src/web/App.tsx`:① import `PortalTransition`;② 在根 `<div>` 内(`<Hud/>` 之后)加 `<PortalTransition />`;③ 把 Esc 处理改为走过渡:

```ts
  const beginExit = useUiStore((s) => s.beginExit);
  // ...在 Esc effect 内:
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && interiorId) beginExit(interiorId);
    };
```

④ `← 大厅` 按钮 `onClick` 由 `exitOverworld` 改为 `() => interiorId && beginExit(interiorId)`。

- [ ] **Step 8: NpcCard "进入" 走 beginEnter**

`src/web/hud/NpcCard.tsx`:把 `enterInterior` 依赖换成 `beginEnter`,`enter()` 改为:

```ts
  const beginEnter = useUiStore((s) => s.beginEnter);
  const enter = () => {
    beginEnter(id);
    selectNpc(null);
  };
```
(`switchSession` 由 PortalTransition 在中点统一调用,这里不再直接调；删掉 NpcCard 里对 `switchSession`/`enterInterior` 的引用以免重复切。)

- [ ] **Step 9: SessionNpc 传送阵脉冲 + 提示语义**

`src/web/overworld/SessionNpc.tsx`:① 把 `near` 时的提示文案 `[E] 信息` 改为 `[E] 进入`(`:312`)。② 给脚下 ring 叠一层脉冲传送光圈:在 `ring` 的 `pixiGraphics` 后、`flipRef` 容器前插入一个发光精灵并在 tick 里改其 alpha(脉冲),复用 `glowTexture`。具体:顶部 import `import { glowTexture } from "../room/effects";`;在 `rootRef` 容器内 ring 之后加:

```tsx
      <pixiSprite
        ref={portalGlowRef}
        texture={glowTexture()}
        anchor={0.5}
        y={1}
        scale={0.28}
        tint={ringColor}
        alpha={0.35}
        blendMode="add"
      />
```
并在组件内加 `const portalGlowRef = useRef<Sprite | null>(null);`(import `Sprite` 类型),在 `tick` 末尾加脉冲(不进 state):

```ts
      const pg = portalGlowRef.current;
      if (pg) {
        const base = 0.3 + 0.15 * (Math.sin(performance.now() / 380) + 1) / 2;
        pg.alpha = near || selected ? Math.min(0.7, base + 0.25) : base;
      }
```
（脉冲用 `performance.now()`,纯客户端视觉,不入 domain/replay。`near`/`selected` 已是组件 props,但 tick 闭包需经 ref 读最新值——给它们各加一个 `xxxRef` 并在渲染期 `xxxRef.current = xxx`,仿 `leavingRef` 既有写法。）

- [ ] **Step 10: 静态校验 + 全量测试**

Run: `bun run check && bun test`
Expected: biome 干净;全部 PASS(105 + Task1 的 8 + portal 4)。

- [ ] **Step 11: 回放冒烟(目视)**

进入会话(点 NPC → 信息卡 → 进入)应播青色传送门淡入淡出过渡再落内景;Esc / `← 大厅` 反向过渡回大厅;NPC 脚下传送阵随状态色脉冲,靠近变亮。

- [ ] **Step 12: Commit**

```bash
git add src/web/overworld/portal.ts src/web/overworld/portal.test.ts src/web/overworld/PortalTransition.tsx src/web/ui-store.ts src/web/App.tsx src/web/hud/NpcCard.tsx src/web/overworld/SessionNpc.tsx
git commit -m "feat: 🧩 传送门进出过渡 + NPC 传送阵脉冲"
```

---

## Task 3: 底部 hotbar HUD 排版

四角散图标 → 底部居中操作坞 + 顶部状态条 banner;功能/onClick 不变。

**Files:**
- Modify: `src/web/hud/Hud.tsx`（布局重排）
- Modify: `src/web/hud/widgets.tsx`（`IconButton` 的 `pos` 改可选,缺省走 flow 布局）
- Modify: `src/web/styles.css`（`.px-hotbar` / `.px-dock`）

- [ ] **Step 1: styles.css 加 hotbar/dock 样式**

在 `src/web/styles.css` 末尾追加:

```css
/* ── 底部居中操作坞(hotbar)+ 左上设置坞 ───────────────────────────────── */
.px-hotbar {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  gap: 8px;
  padding: 8px 10px;
  background: var(--panel-2);
  border: 3px solid var(--edge-dark);
  box-shadow: inset 0 0 0 2px var(--edge-light), 0 5px 0 0 #00000080, 0 0 0 1px
    #000;
}
.px-dock {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  gap: 8px;
  padding: 6px 8px;
  background: var(--panel-2);
  border: 3px solid var(--edge-dark);
  box-shadow: inset 0 0 0 2px var(--edge-light), 0 0 0 1px #000;
}
```

- [ ] **Step 2: Hud.tsx 重排为 hotbar + 顶部 bar + 左上坞**

把 `src/web/hud/Hud.tsx` 的 6 个散布 `IconButton` 收进容器:顶部状态 banner 不动;左上 `⚙` 放进 `.px-dock`;`💎/📂/📜/🎒/💬` 放进底部 `.px-hotbar`。替换 return 内的 6 个 `IconButton`(`:67-108`)为:

```tsx
      <div className="px-dock">
        <IconButton
          icon="⚙"
          title="会话信息"
          lit={ui.infoOpen}
          onClick={() => toggle("infoOpen")}
        />
      </div>

      <div className="px-hotbar">
        <IconButton icon="📜" title="技能" lit={ui.skillsOpen} onClick={() => toggle("skillsOpen")} />
        <IconButton icon="🎒" title="背包" lit={ui.lootOpen} onClick={() => toggle("lootOpen")} />
        <IconButton icon="💬" title="聊天" lit={ui.drawerOpen} onClick={() => toggle("drawerOpen")} />
        <IconButton icon="💎" title="模型" lit={ui.modelOpen} onClick={() => toggle("modelOpen")} />
        <IconButton icon="📂" title="导入会话" lit={ui.importOpen} onClick={() => toggle("importOpen")} />
      </div>
```

注意:`IconButton`(`src/web/hud/widgets.tsx`)当前用 `pos` 绝对定位。改为在 dock/hotbar 内 flow 布局 → `IconButton` 的 `pos` 改为可选;若 `pos` 缺省则不加绝对定位 style。先读 `widgets.tsx` 确认 `IconButton` 签名,给 `pos?` 设默认并在缺省时渲染为普通 inline 按钮(`className="px-btn px-icon"`)。InfoPopover 的 `top/left` 锚点(`:21-22`)保持不变(它锚在左上设置坞下方,仍合理)。

- [ ] **Step 3: 静态校验 + 全量测试**

Run: `bun run check && bun test`
Expected: biome 干净;全部 PASS(无新逻辑,确保不回归)。

- [ ] **Step 4: 回放冒烟(目视)**

底部出现一排带外框的 hotbar 图标、左上设置坞、顶部状态条;点击各图标对应面板照常开合;hover 出 title。

- [ ] **Step 5: Commit**

```bash
git add src/web/hud/Hud.tsx src/web/hud/widgets.tsx src/web/styles.css
git commit -m "feat: 🧩 底部 hotbar HUD + 左上设置坞排版"
```

---

## Task 4: 面板重皮成游戏窗口

信息卡 → 角色档案卡(带 NPC 头像缩略);聊天抽屉 → 厚边带标题栏窗口。纯 DOM/CSS,数据流不动。

**Files:**
- Modify: `src/web/styles.css`（`.px-window` / `.px-titlebar` / `.px-dossier`）
- Modify: `src/web/hud/NpcCard.tsx`（标题栏 + 档案版式)
- Modify: `src/web/hud/ChatDrawer.tsx`（窗口框 + 标题栏)

- [ ] **Step 1: styles.css 加 window/titlebar 样式**

末尾追加:

```css
/* ── 游戏窗口:厚边 + 标题栏(信息卡 / 聊天抽屉共用) ─────────────────────── */
.px-window {
  background: var(--panel);
  border: 3px solid var(--edge-dark);
  box-shadow: inset 0 0 0 2px var(--edge-light), 0 6px 0 0 #00000099, 0 0 0 1px
    #000;
}
.px-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--panel-2);
  border-bottom: 3px solid var(--edge-dark);
  font-size: 10px;
}
.px-titlebar .grow {
  flex: 1;
}
.px-dossier-portrait {
  width: 40px;
  height: 40px;
  image-rendering: pixelated;
  background: #0e1622;
  border: 2px solid var(--edge-dark);
}
```

- [ ] **Step 2: NpcCard 套标题栏 + 档案版式**

把 `src/web/hud/NpcCard.tsx` 最外层 `className="px-panel px-pop"` 改为 `className="px-window px-pop"`,把标题行(`:109-119` 的 `⚔ title` div)替换为标题栏结构;在标题栏内放一个该会话 hero 的头像缩略(用一个 16×16 → 放大的 canvas,从 atlas 取 `${sessionHero(id)}_idle_anim_f0`,或退化为纯色块占位)。最小实现:标题栏含状态色名 + 关闭按钮,正文 StatRow 不变。示例标题栏:

```tsx
      <div className="px-titlebar">
        <div
          className="px-dossier-portrait"
          aria-hidden
          style={{ background: STATUS_COLOR[session.status], opacity: 0.5 }}
        />
        <div className="pf grow" style={{ color: STATUS_COLOR[session.status], fontSize: 11 }}>
          ⚔ {session.title}
        </div>
        <button type="button" title="关闭" className="px-btn" style={{ width: 26, height: 26, fontSize: 12 }} onClick={() => selectNpc(null)}>
          ✕
        </button>
      </div>
      <div style={{ padding: "12px 16px" }}>
        {/* 原 StatRow 列表 + 动作按钮搬进这里 */}
      </div>
```
（注:原 `px-panel` 的 `padding:"14px 16px"` 移到正文 div;关闭按钮从绝对定位改到标题栏内。头像缩略 v1 用状态色块占位,真 sprite 缩略可后续在浏览器内迭代——保持 task 小。）

- [ ] **Step 3: ChatDrawer 套窗口 + 标题栏**

把 `src/web/hud/ChatDrawer.tsx` 最外层 `className="px-panel px-pop"` 改为 `className="px-window px-pop"`;在右侧消息区顶部(`:158` 关闭按钮处)替换为一个标题栏:`<div className="px-titlebar"><span className="grow">💬 {当前会话标题 ?? "聊天"}</span><button…✕…/></div>`,关闭按钮并入标题栏。会话列表区与输入框不动。

- [ ] **Step 4: 静态校验 + 全量测试**

Run: `bun run check && bun test`
Expected: biome 干净;全部 PASS。

- [ ] **Step 5: 回放冒烟(目视)**

信息卡有标题栏 + 头像位 + 厚边;聊天抽屉有标题栏、像游戏窗口;开合/发消息/切会话照常。

- [ ] **Step 6: Commit**

```bash
git add src/web/styles.css src/web/hud/NpcCard.tsx src/web/hud/ChatDrawer.tsx
git commit -m "feat: 🧩 信息卡/聊天抽屉重皮成游戏窗口(标题栏+厚边)"
```

---

## Task 5: 中央 Hub 大厅 + 大厅光照(worldgen 改动最大,压后)

加一个永远存在的中央 Hub 广场(主角在此出生、带喷泉地标),project 房间由走廊接到它;给大厅撒环境光。**保持 worldgen append-only/确定性。**

**Files:**
- Modify: `src/web/overworld/worldgen.ts`（`WorldModel.hub` + 预留顶部 Hub 槽行)
- Modify: `src/web/overworld/worldgen.test.ts`（Hub 用例 + 更新 empty 用例)
- Create: `src/web/overworld/LobbyLights.tsx`（Hub 地标 + 房门辉光)
- Modify: `src/web/overworld/Overworld.tsx`（spawn=Hub 中心、挂 Hub 地标 + LobbyLights、Player key 稳定)

- [ ] **Step 1: 写 Hub 失败测试 + 更新 empty 用例**

`src/web/overworld/worldgen.test.ts`:① 把 `empty input yields ...` 用例整体替换为(空输入现在仍有 Hub):

```ts
test("空输入也产出一个有地板的中央 Hub(没有 project 房间)", () => {
  const w = generateWorld([]);
  expect(w.rooms.length).toBe(0);
  expect(w.hub).toBeDefined();
  const hub = tileAt(w.hub.anchorPx);
  expect(w.walkable[hub.row * w.cols + hub.col]).toBe(true);
  expect(w.tiles[hub.row * w.cols + hub.col]).toBe("floor");
});
```
② 末尾追加:

```ts
test("Hub 恒存在,中心可行走,且是出生点", () => {
  const w = generateWorld([P("alpha", 1)]);
  const hub = tileAt(w.hub.anchorPx);
  expect(w.walkable[hub.row * w.cols + hub.col]).toBe(true);
});

test("每个 project 房间都能从 Hub 走到", () => {
  const w = generateWorld(Array.from({ length: 5 }, (_, i) => P(`p${i}`, i % 4)));
  const start = tileAt(w.hub.anchorPx);
  for (const room of w.rooms) {
    expect(reachable(w, start, tileAt(room.anchorPx))).toBe(true);
  }
});

test("加 Hub 后 project 房间仍 append-only", () => {
  const base = [P("alpha", 3), P("beta", 5)];
  const w1 = generateWorld(base);
  const w2 = generateWorld([...base, P("gamma", 2)]);
  expect(w2.rooms[0]?.rect).toEqual(w1.rooms[0]?.rect);
  expect(w2.rooms[1]?.rect).toEqual(w1.rooms[1]?.rect);
  expect(w2.cols).toBe(w1.cols);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/overworld/worldgen.test.ts`
Expected: FAIL（`w.hub` undefined;empty 用例新断言失败）。

- [ ] **Step 3: worldgen 加 Hub(预留顶部槽行 + 单独 hub 房)**

`src/web/overworld/worldgen.ts` 的改动:

a) `WorldModel` 接口加 `hub: RoomBox;`。

b) 加常量(Hub 尺寸,放进顶部预留的一整槽行、横向居中):

```ts
const HUB_W = 9; // Hub 内部宽(tiles)
const HUB_H = 6; // Hub 内部高(tiles)
const HUB_SLOT_ROWS = 1; // 顶部预留给 Hub 的槽行数
```

c) project 槽行整体下移 `HUB_SLOT_ROWS`:把 `roomRect` 内 `const slotY = PAD + slotRow * SLOT_H;` 改为 `const slotY = PAD + (slotRow + HUB_SLOT_ROWS) * SLOT_H;`。

d) `generateWorld` 顶部:`rows` 计算加上 Hub 槽行;并构造 hub 房(横向居中于整幅宽,纵向落在顶部槽行):

```ts
  const projRows = n === 0 ? 0 : Math.ceil(n / SLOT_COLS);
  const cols = PAD * 2 + SLOT_COLS * SLOT_W;
  const rows = PAD * 2 + (HUB_SLOT_ROWS + projRows) * SLOT_H;

  // 中央 Hub:整幅宽居中、落在顶部预留槽行,带喷泉地标(= anchorPx)。
  const hubRectX = Math.floor((cols - (HUB_W + 2)) / 2);
  const hubRectY = PAD + Math.floor((SLOT_H - (HUB_H + 2)) / 2);
  const hub = makeRoomBox("__hub__", {
    x: hubRectX,
    y: hubRectY,
    w: HUB_W + 2,
    h: HUB_H + 2,
  });
```

e) 把现有 `rooms.map` 里「rect → anchorPx/boundsPx/doorPx → RoomBox」那段抽成共享函数 `makeRoomBox(projectId, rect)`(hub 与 project 复用同一构造,DRY),`rooms` 改为 `projects.map((p, i) => makeRoomBox(p.id, roomRect(i, p)))`。

f) Floor carving:在「Room interiors」循环前先 carve hub 内部:

```ts
  for (let r = hub.rect.y + 1; r < hub.rect.y + hub.rect.h - 1; r++) {
    for (let c = hub.rect.x + 1; c < hub.rect.x + hub.rect.w - 1; c++)
      setFloor(c, r);
  }
```

g) 走廊:在现有 room 链 carve 后,加 Hub→rooms[0] 走廊(若有 project):

```ts
  if (rooms[0]) {
    const from = interiorCentreTile(hub.rect);
    const to = interiorCentreTile(rooms[0].rect);
    carveHSeg(from.col, to.col, from.row);
    carveVSeg(from.row, to.row, to.col);
  }
```

h) `return { ... }` 加 `hub,`。

（`makeRoomBox` 用现有 `BOUNDS_MARGIN_PX` / anchorPx / doorPx 公式;hub 的 doorPx 即其底边中央,作为 Hub→project 走廊起点不影响。）

- [ ] **Step 4: 跑 worldgen 测试确认通过**

Run: `bun test src/web/overworld/worldgen.test.ts`
Expected: PASS(现有用例 + 新 Hub 用例;append-only/连通/对齐/doorPx 不回归)。

- [ ] **Step 5: 实现 LobbyLights**

`src/web/overworld/LobbyLights.tsx`（复用 `room/Lights` 的 `Glow` 思路,但按 world 撒点;放进相机容器内,world 空间):

```tsx
import { glowTexture } from "../room/effects";
import type { WorldModel } from "./worldgen";

/** 大厅环境光:Hub 地标暖光 + 每个 project 房门口冷光。world 空间,挂在相机容器内。 */
export function LobbyLights({ world }: { world: WorldModel }) {
  const lights = [
    { key: "hub", x: world.hub.anchorPx.x, y: world.hub.anchorPx.y, r: 48, tint: 0xffd166, a: 0.4 },
    ...world.rooms.map((rm) => ({
      key: `door_${rm.projectId}`,
      x: rm.doorPx.x,
      y: rm.doorPx.y,
      r: 30,
      tint: 0x6fd8ff,
      a: 0.32,
    })),
  ];
  return (
    <pixiContainer>
      {lights.map((l) => (
        <pixiSprite
          key={l.key}
          texture={glowTexture()}
          anchor={0.5}
          x={l.x}
          y={l.y}
          scale={l.r / 64}
          tint={l.tint}
          alpha={l.a}
          blendMode="add"
        />
      ))}
    </pixiContainer>
  );
}
```

- [ ] **Step 6: Overworld 挂 Hub 地标 + LobbyLights + spawn=Hub + 稳定 Player key**

`src/web/overworld/Overworld.tsx`:
① import `LobbyLights`;import `anim, tex` from `../room/atlas`(若未引)。
② `spawn`(`:115-122`)改为以 Hub 中心为准:`const spawn = useMemo(() => ({ ...world.hub.anchorPx }), [world]);`。
③ 在 `<WorldTilemap world={world} />` 之后、NPC 之前,加 Hub 喷泉地标(复用 `wall_fountain_top_2` + `wall_fountain_*_blue_anim` 帧,放在 hub 中心上方两格;最小可先放一个静态 `tex(sheet, "wall_fountain_top_2")` 精灵 + 一圈 crates 装饰)与 `<LobbyLights world={world} />`(放在 NPC 之后、`Player` 之前,保证光在地板之上、人之下或之上按观感调)。
④ Player 的 `key`(`:321`)由 `world.rooms.length > 0 ? "live" : "empty"` 改为常量 `"player"`(Hub 恒在 → spawn 永远落 Hub floor,不再需要 0→1 remount)。

- [ ] **Step 7: 静态校验 + 全量测试**

Run: `bun run check && bun test`
Expected: biome 干净;全部 PASS。

- [ ] **Step 8: 回放冒烟(目视)**

大厅中央有 Hub 广场 + 喷泉地标 + 暖光,主角在 Hub 出生;0 会话时也站在一个大厅里(不再空黑);有会话时房间由走廊接到 Hub、门口有冷光;走到房间进入会话照常。

- [ ] **Step 9: Commit**

```bash
git add src/web/overworld/worldgen.ts src/web/overworld/worldgen.test.ts src/web/overworld/LobbyLights.tsx src/web/overworld/Overworld.tsx
git commit -m "feat: 🧩 中央 Hub 大厅 + 大厅环境光(worldgen Hub + LobbyLights)"
```

---

## 收口(全部 task 后)

- [ ] `bun run check && bun test` 全绿;逐 task 回放冒烟截图齐全(大厅铺满/Hub/传送门/hotbar/面板)。
- [ ] 回主树 `git merge --no-ff <worktree HEAD SHA>` 合入 main,合并后再 `bun run check && bun test`。
- [ ] 回写 `docs/ROADMAP.md`:在 §4 Phase 2 标注「S4 游戏化 HUD 雏形 + 大厅游戏化呈现」已落地一部分,链到本 plan 与 spec。
- [ ] `git push origin main` **需用户确认**(main 领先 origin)。
- [ ] `git worktree remove .worktrees/web-lobby-game`。

## 自查(spec 覆盖 / 占位符 / 类型一致)

- **spec 覆盖**:① 相机缩放→Task1;② Hub+氛围→Task5;③ 传送门→Task2;④ HUD→Task3;⑤ 面板→Task4。全覆盖。
- **占位符**:无 TBD;头像缩略 v1 明确用状态色块占位(标注为后续浏览器内迭代,非计划缺口)。
- **类型一致**:`lobbyZoom(view)`、`cameraOffset(focus,view,world,scale)`、`portalFrame(elapsedMs,durationMs)`、`WorldModel.hub: RoomBox`、`makeRoomBox(projectId,rect)`、ui-store `transition`/`beginEnter`/`beginExit`/`endTransition` 在引用处签名一致。
- **共享文件串行**:`styles.css`(Task3/4)、`Overworld.tsx`(Task1 不改它,Task5 改)、`ui-store.ts`(Task2)、`worldgen.ts`(Task5)——按 Task 顺序串行执行,不并行派实现 agent。
