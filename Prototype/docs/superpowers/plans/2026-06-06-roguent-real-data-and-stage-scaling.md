# Roguent 真实数据接入 + 屏幕自适应缩放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Roguent 游戏化 HUD 里**能接真但仍 mock** 的面板(Tasks/TaskWindow、Currency 的「完成数」)接到真实数据(捕获 agent 的 TodoWrite),并让整个 UI 按固定 1920×1080 逻辑舞台等比缩放贴合任意屏幕(修复小屏下人物/HUD 过大)。无真实数据源的纯虚构面板(gems、Shop、Settings CONFIG、inter-agent 信箱)保持「标注 mock」不变。

**Architecture:** 两条互相独立的工作流,可分别实现/提交/验证:
- **A. Stage 缩放(纯 web,不动引擎)**:把 App 包进 `#viewport(fixed,inset:0,overflow:hidden) > #stage(absolute,1920×1080,transform-origin:center)`,用 `--stage-scale = min(W/1920, H/1080)` 等比缩放。HUD(全为 `position:absolute`)、Lobby(% 映射到 1920×1080 虚拟坐标)、Room(Pixi 在 1920×1080 逻辑尺寸内整数倍渲染)、Modal(`.scrim` 为 `position:absolute`)全部一起缩放,letterbox 居中。完全对齐设计原型 `app.jsx` 的 `useStageScale` + `styles.css` 的 `#viewport/#stage`。
- **B. TodoWrite → 真实 Tasks(引擎 + shared + web)**:引擎 PreToolUse hook 已能拿到 `tool_input`;新增 `todos.updated` 事件,在 `normalize.ts` 捕获 TodoWrite 的 `todos`,store 折叠进 `Session.todos`(按 agentId),TaskWindow/Tasks 渲染当前会话的真实待办,Currency 的「完成数」由已完成 todo 派生。

**Tech Stack:** Bun + TypeScript;React 19 + PixiJS v8(`@pixi/react`)+ Zustand;Claude Agent SDK;`bun:test`(纯函数 / reduce 级零额度 e2e);Biome(`bun run check`);浏览器回放冒烟(`bun run dev:engine -- --replay` + `dev:web` / preview 截图)。

**前置(执行者必读):**
- 走 detached worktree([.claude/rules/workflow.md](../../../.claude/rules/workflow.md)):`git worktree add --detach .worktrees/real-data-scaling main` → 实现 → `bun run check` + `bun test` + `bunx tsc --noEmit` → 按主题 commit → 记 HEAD SHA → 回 main `git merge --no-ff <sha>` → 再验证 → 清理 worktree。**push 到 origin 需用户确认**。
- 改后即测:动了代码/配置就跑 `bun test` + `bun run check`,失败先修;**不把局部通过说成全量通过**。
- 真/假铁律:接真的面板不造假、不挂 mock banner;无源面板(gems/Shop/Settings CONFIG/信箱)保持现有「三重标注 mock」。
- Conventional Commits:英文标题 `type: emoji description`(feat 🧩 / fix 🩹 / refactor ✨ / test 🧪 / chore 🧹);body 可中文。

---

## File Structure

**Workstream A(缩放)**
- 新建 `src/web/stage-scale.ts` — 纯函数 `stageScale(w,h)` + 常量 `STAGE_W/STAGE_H`(单一职责:缩放数学,可单测)。
- 新建 `src/web/stage-scale.test.ts` — `stageScale` 单测。
- 改 `src/web/App.tsx` — 包 `#viewport/#stage`、挂 `useStageScale`、根节点 class/style 移到 `#stage`。
- 改 `src/web/styles.css` — 新增 `.viewport` / `.stage` / `.stage canvas` 规则(`body` 块之后)。
- `src/web/room/Room.tsx`、`src/web/lobby/HubPlaza.tsx`:**无需改逻辑**(进 1920×1080 舞台后 `inset:0` / % 映射自动适配);仅在 A4 验证它们正确缩放。

**Workstream B(TodoWrite 真数据)**
- 改 `src/shared/domain.ts` — 加 `TodoStatus`/`TodoItem` 类型 + `Session.todos: Record<string, TodoItem[]>` + `createSession` 初始化。
- 改 `src/shared/events.ts` — 加 `"todos.updated"` 事件类型 + `TodosUpdatedPayload`。
- 改 `src/engine/normalize.ts` — `parseTodos()` + 在 TodoWrite 的 PreToolUse 上追发 `todos.updated`。
- 改 `src/engine/normalize.test.ts` — TodoWrite 捕获单测。
- 改 `src/web/store.ts` — reduce `todos.updated`(按 agentId 覆盖)+ `agent.done` 清理该 agent todos。
- 改 `src/web/store.test.ts` — todos reduce 单测 + reduce 级 e2e。
- 新建 `src/web/hud/todos-view.ts` — 纯函数 `sessionTodos()` / `todoCounts()` + `TODO_META`(展平 + 计数 + 状态色/文案,可单测、DRY)。
- 新建 `src/web/hud/todos-view.test.ts` — todos-view 单测。
- 改 `src/web/hud/TaskWindow.tsx` — 消费 `sessionTodos` 真数据,去 mock 标注。
- 改 `src/web/hud/Tasks.tsx` — 消费真 todos(owner=真 agent);信箱保留为**局部**标注 mock。
- 改 `src/web/hud/Currency.tsx` — 「完成数」接真(已完成 todo 计数);gems 保留 mock。
- 改 `src/web/hud/mock-data.ts` — 删 `MOCK_TASKS`/`MockTask`/`taskProgress`/`STATE_META`(移入 todos-view);保留 `MOCK_MAILBOX`/`MOCK_OWNERS`(仅信箱)。

**Workstream C(收尾)**
- 改 `docs/ROADMAP.md` — §3.5 / 变更记录 回写本轮成果。

---

## Workstream A — Stage 缩放

### Task A1: 缩放数学纯函数

**Files:**
- Create: `src/web/stage-scale.ts`
- Test: `src/web/stage-scale.test.ts`

- [ ] **Step 1: 写失败测试**

`src/web/stage-scale.test.ts`:

```ts
import { expect, test } from "bun:test";
import { STAGE_H, STAGE_W, stageScale } from "./stage-scale";

test("design size constants are 1920×1080", () => {
  expect(STAGE_W).toBe(1920);
  expect(STAGE_H).toBe(1080);
});

test("exact design size → scale 1", () => {
  expect(stageScale(1920, 1080)).toBe(1);
});

test("half on both axes → 0.5", () => {
  expect(stageScale(960, 540)).toBe(0.5);
});

test("picks the smaller axis ratio (letterbox, never crop)", () => {
  // 宽够高不够 → 受高度约束
  expect(stageScale(3840, 1080)).toBe(1);
  // 1440×900 笔记本:min(0.75, 0.8333…) = 0.75
  expect(stageScale(1440, 900)).toBe(0.75);
});

test("upscales above 1 on larger-than-design screens (no clamp)", () => {
  expect(stageScale(3840, 2160)).toBe(2);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/stage-scale.test.ts`
Expected: FAIL —「Cannot find module './stage-scale'」。

- [ ] **Step 3: 写实现**

`src/web/stage-scale.ts`:

```ts
// 固定逻辑舞台尺寸 + 等比贴屏缩放因子。对齐设计原型 app.jsx 的 useStageScale:
// 整个 UI 在 1920×1080 设计像素里布局,#stage 按 stageScale 缩放,使房间/人物/HUD/
// 模态在任意屏幕保持恒定比例(letterbox 居中,不裁切);不 clamp —— >1920 屏幕上
// 等比放大,像素图靠 CSS image-rendering:pixelated 保持锐利(与原型一致)。
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function stageScale(winW: number, winH: number): number {
  return Math.min(winW / STAGE_W, winH / STAGE_H);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/stage-scale.test.ts`
Expected: PASS(5 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add src/web/stage-scale.ts src/web/stage-scale.test.ts
git commit -m "feat: 🧩 add stage-scale: fixed 1920x1080 fit-to-screen factor"
```

---

### Task A2: `.viewport` / `.stage` CSS

**Files:**
- Modify: `src/web/styles.css`(在 `body { … }` 块之后,约 86 行)

- [ ] **Step 1: 加舞台缩放样式**

在 `src/web/styles.css` 的 `body { … }` 规则之后、`/* crisp upscaling for any raster the DOM shows */ img { … }` 之前插入:

```css
/* ── 固定 1920×1080 逻辑舞台 + 等比贴屏(屏幕自适应)──────────────────────
   整个 UI 在 1920×1080 设计像素里布局;#stage 由 --stage-scale =
   min(W/1920, H/1080)(App 的 useStageScale 在 resize 时写入)等比缩放,使
   房间/人物/HUD/模态在任意屏幕保持恒定比例并 letterbox 居中,而非在小屏渲染过大。
   对齐设计原型 styles.css 的 #viewport/#stage + app.jsx 的 useStageScale。
   注:styles.css 全文无 position:fixed,HUD/.scrim 均为 position:absolute,
   故 #stage 的 transform 不会改变任何后代定位语义,只是统一缩放。 */
.viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--ink);
}
.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  transform-origin: center center;
  transform: translate(-50%, -50%) scale(var(--stage-scale, 1));
}
/* Pixi 房间 canvas:舞台放大/缩小它时保持像素图锐利(对齐原型 .room-canvas)。 */
.stage canvas {
  image-rendering: pixelated;
}
```

- [ ] **Step 2: 校验格式**

Run: `bun run check`
Expected: PASS(Biome 不报 `src/web/styles.css`)。若报缩进/排序问题,按提示 `bun run check` 的 fixer 修正(`bunx biome format --write src/web/styles.css`)。

- [ ] **Step 3: 提交**

```bash
git add src/web/styles.css
git commit -m "feat: 🧩 add .viewport/.stage CSS for fit-to-screen logical stage"
```

---

### Task A3: App 包进 viewport/stage + 挂缩放

**Files:**
- Modify: `src/web/App.tsx`

- [ ] **Step 1: 加 import 与 useStageScale**

把 `src/web/App.tsx` 顶部的 React import 改成带 `useRef`,并加 `stageScale` import:

```ts
import type React from "react";
import { useEffect, useRef } from "react";
import { resolveEngineUrl } from "./engine-url";
import { stageScale } from "./stage-scale";
```

(其余既有 import 原样保留。)

在 `App.tsx` 内、`export function App()` **之前**加缩放 hook:

```ts
// 把固定 1920×1080 舞台等比缩放到当前窗口(对齐原型 useStageScale)。把缩放因子写进
// #viewport 的 --stage-scale CSS 变量(命令式,避免 resize 每帧触发 React 重渲染)。
function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.setProperty(
        "--stage-scale",
        String(stageScale(window.innerWidth, window.innerHeight)),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref]);
}
```

- [ ] **Step 2: 在组件里建 ref 并调用**

在 `export function App() {` 内、`const settings = useSettingsStore();` 之后加:

```ts
  const viewportRef = useRef<HTMLDivElement>(null);
  useStageScale(viewportRef);
```

- [ ] **Step 3: 重构 return —— 包 viewport/stage**

把 `App.tsx` 末尾的 `return ( … )` 整段替换为:

```tsx
  return (
    <div id="viewport" ref={viewportRef} className="viewport">
      <div
        id="stage"
        className={`stage ${settingsRootClass(settings)}`}
        style={settingsRootStyle(settings) as React.CSSProperties}
      >
        {/* 双层缩放:总览大厅(暖色 DOM 广场)↔ 进入的会话内景(Pixi Room)。*/}
        {inInterior ? <Room /> : <LobbyView />}
        <Hud />
        {inInterior ? (
          <button
            type="button"
            className="px-btn pf"
            style={{
              position: "absolute",
              top: 14,
              left: 70,
              padding: "8px 12px",
              fontSize: 10,
              color: "var(--cyan)",
            }}
            onClick={() => interiorId && beginExit(interiorId)}
          >
            ← 大厅
          </button>
        ) : (
          <NpcCard />
        )}
        <PortalTransition />
        {/* 首次进入的强制角色选择门(avatarHero === null 时显示,覆盖 overworld + HUD)。*/}
        <CharacterSelect />
      </div>
    </div>
  );
```

> 说明:旧根 div 的 `position:fixed; inset:0; overflow:hidden` 行为移到 `.viewport`(CSS);主题 class(`settingsRootClass`)与 CSS 变量(`settingsRootStyle`,仅 `--accent`/`--core-glow`)移到 `#stage`,与缩放用的 `transform` 互不冲突(transform 在 `.stage` 类里,style 只带 CSS 变量)。所有 `position:absolute` 的 HUD/Modal 现以 1920×1080 的 `#stage` 为定位上下文,自动随舞台缩放。

- [ ] **Step 4: 类型 + 格式 + 单测**

Run: `bunx tsc --noEmit && bun run check && bun test`
Expected: tsc 干净、Biome 干净、既有单测全绿(此步无新单测;App 是 `.tsx` 组件,按本仓库约定走 tsc + check + 回放/preview 冒烟)。

- [ ] **Step 5: 提交**

```bash
git add src/web/App.tsx
git commit -m "feat: 🧩 wrap App in fit-to-screen 1920x1080 stage (fixes oversized chars)"
```

---

### Task A4: 缩放浏览器冒烟验证

**Files:**(无代码改动;验证 + 记录)

- [ ] **Step 1: 起回放 + 前端**

```bash
bun run dev:engine -- --replay fixtures/sample-run.jsonl
# 另一终端
bun run dev:web
```

- [ ] **Step 2: preview 1920×1080 基准**

用 preview 工具:`preview_start` → `preview_resize` 到 1920×1080 → `preview_screenshot`。
Expected:画面与设计原型同比例,`#stage` 充满(scale≈1),无 letterbox 黑边;房间瓦片 + 主控★ + HUD 各就各位。

- [ ] **Step 3: preview 小屏(1366×768)验证人物变小**

`preview_resize` 到 1366×768 → `preview_screenshot`。
Expected:整个画面(房间/人物/HUD)等比缩小 letterbox 居中(scale≈0.71),**人物明显比缩放前小、不再溢出**;HUD 不重叠、不裁切。这是本需求「人物太大」的核验点。

- [ ] **Step 4: 交互坐标不偏移**

`preview_resize` 到 1366×768 后:大厅视图 `preview_click` 点一个结构(如任务台)→ `preview_snapshot` 确认面板打开;内景视图 `preview_click` 点一个小人 → 确认 NpcCard 打开。
Expected:点击命中正确(`getBoundingClientRect` 已反映 transform,Pixi/DOM 命中均不偏移)。若偏移,检查是否误把 transform 放进了内联 style 覆盖了 `.stage` 规则。

- [ ] **Step 5: 记录结果**

把 1920 与 1366 两张截图对比写进 PR/任务说明(证明人物随屏缩放)。无代码改动,本任务不提交。

---

## Workstream B — TodoWrite → 真实 Tasks

### Task B1: domain 加 Todo 类型 + Session.todos

**Files:**
- Modify: `src/shared/domain.ts`
- Test: `src/shared/domain.test.ts`(扩展)

- [ ] **Step 1: 写失败测试**

在 `src/shared/domain.test.ts` 末尾追加:

```ts
import { createSession } from "./domain";

test("createSession initializes empty todos map", () => {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  expect(s.todos).toEqual({});
});
```

(若该文件已 import `createSession`/`test`/`expect`,复用现有 import,勿重复。)

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/shared/domain.test.ts`
Expected: FAIL —「expected undefined to equal {}」(Session 还没 todos 字段)。

- [ ] **Step 3: 写实现**

在 `src/shared/domain.ts` 的 `Loot` 接口之后加类型:

```ts
// TodoWrite 工具的真实待办项(引擎从 PreToolUse 的 tool_input.todos 捕获)。
// status 沿用 SDK 的枚举(pending | in_progress | completed)。activeForm =
// 进行时文案(可选)。
export type TodoStatus = "pending" | "in_progress" | "completed";
export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}
```

在 `Session` 接口里(`loot: Loot[];` 之后)加字段:

```ts
  // 每 agent 的 TodoWrite 真实待办,按 agentId 归集(每次 TodoWrite 整体覆盖该
  // agent 的清单)。供 TaskWindow / Tasks / Currency「完成数」消费。
  todos: Record<string, TodoItem[]>;
```

在 `createSession` 的返回对象里(`loot: [],` 之后)加默认值:

```ts
    todos: {},
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/shared/domain.test.ts && bunx tsc --noEmit`
Expected: PASS;tsc 干净。

> 注:加了 `Session.todos` 必填字段后,引擎/前端任何**手写** Session 字面量的地方都要补 `todos: {}`。所有正常路径都走 `createSession`(已补默认),故只需关注测试里手写 Session 的地方——`bunx tsc --noEmit` 会逐一报出,按报错补 `todos: {}` 即可。

- [ ] **Step 5: 提交**

```bash
git add src/shared/domain.ts src/shared/domain.test.ts
git commit -m "feat: 🧩 add TodoItem type + Session.todos (per-agent TodoWrite list)"
```

---

### Task B2: events 加 `todos.updated` 协议

**Files:**
- Modify: `src/shared/events.ts`
- Test: `src/shared/events.test.ts`(扩展;若存在相关断言模式)

- [ ] **Step 1: 写失败测试**

在 `src/shared/events.test.ts` 末尾追加(若文件无 import,按其现有风格补 `import { test, expect } from "bun:test"`):

```ts
import type { RoomEventType, TodosUpdatedPayload } from "./events";

test("todos.updated is a known RoomEventType with a TodoItem[] payload", () => {
  const t: RoomEventType = "todos.updated";
  const p: TodosUpdatedPayload = {
    todos: [{ content: "写计划", status: "in_progress" }],
  };
  expect(t).toBe("todos.updated");
  expect(p.todos[0]?.status).toBe("in_progress");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/shared/events.test.ts`
Expected: FAIL(类型 `"todos.updated"` / `TodosUpdatedPayload` 不存在,tsc/测试报错)。

- [ ] **Step 3: 写实现**

在 `src/shared/events.ts`:

把顶部 import 改为(加 `TodoItem`):

```ts
import type { Loot, TodoItem } from "./domain";
```

在 `RoomEventType` 联合里(`"context.updated"` 同级)加一项:

```ts
  | "context.updated"
  | "todos.updated";
```

在 payload 区(`ContextUpdatedPayload` 之后)加:

```ts
// 某 agent 的 TodoWrite 整表快照(引擎在该 agent 调 TodoWrite 时下发;事件 agentId =
// 该 agent)。reducer 用它覆盖 Session.todos[agentId]。
export interface TodosUpdatedPayload {
  todos: TodoItem[];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/shared/events.test.ts && bunx tsc --noEmit`
Expected: PASS;tsc 干净。

- [ ] **Step 5: 提交**

```bash
git add src/shared/events.ts src/shared/events.test.ts
git commit -m "feat: 🧩 add todos.updated event type + TodosUpdatedPayload"
```

---

### Task B3: 引擎在 TodoWrite 上捕获真 todos

**Files:**
- Modify: `src/engine/normalize.ts`
- Test: `src/engine/normalize.test.ts`(扩展)

- [ ] **Step 1: 写失败测试**

在 `src/engine/normalize.test.ts` 末尾追加(复用文件已有的 `test`/`expect`/`normalizeHook` import):

```ts
test("PreToolUse on TodoWrite emits tool.started AND todos.updated with parsed todos", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "TodoWrite",
    tool_use_id: "tu-1",
    tool_input: {
      todos: [
        { content: "重构缩放", status: "in_progress", activeForm: "正在重构缩放" },
        { content: "写测试", status: "pending" },
        { content: "提交", status: "completed" },
      ],
    },
  });
  const started = drafts.find((d) => d.type === "tool.started");
  const todos = drafts.find((d) => d.type === "todos.updated");
  expect(started).toBeDefined();
  expect(started?.agentId).toBe("ag-coder");
  expect(todos).toBeDefined();
  expect(todos?.agentId).toBe("ag-coder");
  const payload = todos?.payload as { todos: Array<{ content: string; status: string }> };
  expect(payload.todos).toHaveLength(3);
  expect(payload.todos[1]).toEqual({ content: "写测试", status: "pending" });
});

test("PreToolUse on TodoWrite with malformed input emits no todos (defensive)", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "TodoWrite",
    tool_use_id: "tu-2",
    tool_input: { todos: "not-an-array" },
  });
  expect(drafts.some((d) => d.type === "todos.updated")).toBe(false);
  // tool.started 仍照常产出
  expect(drafts.some((d) => d.type === "tool.started")).toBe(true);
});

test("PreToolUse on a non-TodoWrite tool emits no todos.updated", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "Edit",
    tool_use_id: "tu-3",
    tool_input: { file_path: "a.ts" },
  });
  expect(drafts.some((d) => d.type === "todos.updated")).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/normalize.test.ts`
Expected: FAIL(第一个用例找不到 `todos.updated` draft)。

- [ ] **Step 3: 写实现**

在 `src/engine/normalize.ts` 顶部、`summarizeToolInput` 之后加 todos 解析器:

```ts
// 从 TodoWrite 的 tool_input 里防御性解析 todos 表。SDK 的 TodoWrite 输入形如
// { todos: [{ content, status, activeForm? }] };status ∈ pending|in_progress|
// completed。任何非法项丢弃,非数组直接返回空(不抛、不阻塞 agent)。
const TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);
export function parseTodos(
  input: unknown,
): Array<{ content: string; status: string; activeForm?: string }> {
  const o = (input ?? {}) as Record<string, unknown>;
  const raw = o.todos;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ content: string; status: string; activeForm?: string }> =
    [];
  for (const it of raw) {
    const t = (it ?? {}) as Record<string, unknown>;
    if (typeof t.content !== "string") continue;
    if (typeof t.status !== "string" || !TODO_STATUSES.has(t.status)) continue;
    out.push({
      content: t.content,
      status: t.status,
      ...(typeof t.activeForm === "string" ? { activeForm: t.activeForm } : {}),
    });
  }
  return out;
}
```

把 `normalizeHook` 的 `case "PreToolUse":` 分支改为(在原 `tool.started` 之外按需追发 `todos.updated`):

```ts
    case "PreToolUse": {
      const drafts: DraftEvent[] = [
        {
          type: "tool.started",
          agentId,
          payload: {
            toolName: h.tool_name ?? "",
            inputSummary: summarizeToolInput(h.tool_input),
            toolUseId: h.tool_use_id ?? "",
          },
        },
      ];
      // TodoWrite:把真实待办表同时下发(供任务面板/任务窗实时同步)。
      if (h.tool_name === "TodoWrite") {
        const todos = parseTodos(h.tool_input);
        if (todos.length > 0) {
          drafts.push({ type: "todos.updated", agentId, payload: { todos } });
        }
      }
      return drafts;
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/engine/normalize.test.ts && bunx tsc --noEmit`
Expected: PASS(3 个新用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add src/engine/normalize.ts src/engine/normalize.test.ts
git commit -m "feat: 🧩 capture TodoWrite todos → todos.updated draft in normalize"
```

---

### Task B4: store 折叠 `todos.updated`

**Files:**
- Modify: `src/web/store.ts`
- Test: `src/web/store.test.ts`(扩展)

- [ ] **Step 1: 写失败测试**

在 `src/web/store.test.ts` 末尾追加(复用文件已有的 `reduce`/`RoomState`/`test`/`expect`,以及它构造事件的既有 helper 风格;下面用裸 `RoomEvent` 字面量,与文件其它用例一致):

```ts
test("todos.updated populates Session.todos by agentId and replaces on re-send", () => {
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  st = reduce(st, {
    seq: 1,
    ts: 1,
    sessionId: "s1",
    type: "session.created",
    payload: { title: "t", model: "m", project: "p" },
  });
  // 主控发一版 todos
  st = reduce(st, {
    seq: 2,
    ts: 2,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "orchestrator",
    payload: {
      todos: [
        { content: "A", status: "in_progress" },
        { content: "B", status: "pending" },
      ],
    },
  });
  expect(st.sessions.s1?.todos.orchestrator).toHaveLength(2);
  // 同 agent 再发 → 整表覆盖(不累加)
  st = reduce(st, {
    seq: 3,
    ts: 3,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "orchestrator",
    payload: { todos: [{ content: "A", status: "completed" }] },
  });
  expect(st.sessions.s1?.todos.orchestrator).toHaveLength(1);
  expect(st.sessions.s1?.todos.orchestrator?.[0]?.status).toBe("completed");
});

test("agent.done clears that subagent's todos (no ghosts)", () => {
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  st = reduce(st, {
    seq: 1,
    ts: 1,
    sessionId: "s1",
    type: "session.created",
    payload: { title: "t", model: "m", project: "p" },
  });
  st = reduce(st, {
    seq: 2,
    ts: 2,
    sessionId: "s1",
    type: "agent.spawned",
    agentId: "ag-x",
    payload: { role: "coder", parentId: "orchestrator" },
  });
  st = reduce(st, {
    seq: 3,
    ts: 3,
    sessionId: "s1",
    type: "todos.updated",
    agentId: "ag-x",
    payload: { todos: [{ content: "X", status: "pending" }] },
  });
  expect(st.sessions.s1?.todos["ag-x"]).toHaveLength(1);
  st = reduce(st, {
    seq: 4,
    ts: 4,
    sessionId: "s1",
    type: "agent.done",
    agentId: "ag-x",
    payload: { stopReason: "normal" },
  });
  expect(st.sessions.s1?.todos["ag-x"]).toBeUndefined();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/store.test.ts`
Expected: FAIL(`todos.updated` 未处理,`todos.orchestrator` 为 undefined)。

- [ ] **Step 3: 写实现**

在 `src/web/store.ts` 的 `reduce` 内 `switch (e.type)` 里加分支(放在 `case "agent.done":` 之前或之后均可):

```ts
    case "todos.updated": {
      const p = e.payload as {
        todos: Array<{
          content: string;
          status: "pending" | "in_progress" | "completed";
          activeForm?: string;
        }>;
      };
      const owner = e.agentId ?? ORCHESTRATOR_ID;
      s.todos = { ...prev.todos, [owner]: p.todos };
      break;
    }
```

并在既有 `case "agent.done":` 分支里清掉该 subagent 的 todos(避免离场后残留幽灵任务):

```ts
    case "agent.done": {
      if (e.agentId && e.agentId !== ORCHESTRATOR_ID) {
        delete s.agents[e.agentId];
        if (s.todos[e.agentId]) {
          const todos = { ...prev.todos };
          delete todos[e.agentId];
          s.todos = todos;
        }
      }
      break;
    }
```

> 注:`s` 由 `const s: Session = { ...prev, agents: { ...prev.agents } }` 浅拷而来,`s.todos` 初始指向 `prev.todos`;上面两处都重新赋一个新对象(`{ ...prev.todos, … }` / 删键拷贝),不就地改 `prev.todos`,保持 reducer 纯净。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/store.test.ts && bunx tsc --noEmit`
Expected: PASS(2 个新用例 + 既有用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add src/web/store.ts src/web/store.test.ts
git commit -m "feat: 🧩 reduce todos.updated into Session.todos; clear on agent.done"
```

---

### Task B5: todos-view 纯函数(展平 + 计数 + 状态元数据)

**Files:**
- Create: `src/web/hud/todos-view.ts`
- Test: `src/web/hud/todos-view.test.ts`

- [ ] **Step 1: 写失败测试**

`src/web/hud/todos-view.test.ts`:

```ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID, createSession } from "../../shared/domain";
import { TODO_META, sessionTodos, todoCounts } from "./todos-view";

function sessionWith(todos: Record<string, Array<{ content: string; status: "pending" | "in_progress" | "completed" }>>) {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  return { ...s, todos };
}

test("sessionTodos returns [] for undefined session", () => {
  expect(sessionTodos(undefined)).toEqual([]);
});

test("sessionTodos flattens per-agent lists, orchestrator first, tagging agentId", () => {
  const s = sessionWith({
    "ag-b": [{ content: "B1", status: "pending" }],
    [ORCHESTRATOR_ID]: [{ content: "O1", status: "in_progress" }],
  });
  const rows = sessionTodos(s);
  expect(rows.map((r) => r.content)).toEqual(["O1", "B1"]);
  expect(rows[0]?.agentId).toBe(ORCHESTRATOR_ID);
  expect(rows[1]?.agentId).toBe("ag-b");
});

test("todoCounts tallies by status", () => {
  const rows = sessionTodos(
    sessionWith({
      [ORCHESTRATOR_ID]: [
        { content: "a", status: "completed" },
        { content: "b", status: "in_progress" },
        { content: "c", status: "pending" },
        { content: "d", status: "completed" },
      ],
    }),
  );
  expect(todoCounts(rows)).toEqual({
    pending: 1,
    in_progress: 1,
    completed: 2,
    total: 4,
  });
});

test("TODO_META covers all three statuses with [color, label]", () => {
  expect(TODO_META.pending[1]).toBe("待办");
  expect(TODO_META.in_progress[1]).toBe("进行中");
  expect(TODO_META.completed[1]).toBe("完成");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/hud/todos-view.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 写实现**

`src/web/hud/todos-view.ts`:

```ts
import {
  ORCHESTRATOR_ID,
  type Session,
  type TodoItem,
  type TodoStatus,
} from "../../shared/domain";

// 一条带归属 agent 的待办(展平后供面板渲染)。
export interface TodoRow extends TodoItem {
  agentId: string;
}

// 把会话各 agent 的 TodoWrite 清单展平成一条有序列表:主控优先,其余按 agentId 升序;
// 各 agent 内部顺序原样保留(= TodoWrite 写入顺序)。无会话 / 空表 → []。
export function sessionTodos(session: Session | undefined): TodoRow[] {
  if (!session) return [];
  const ids = Object.keys(session.todos).sort((a, b) =>
    a === ORCHESTRATOR_ID ? -1 : b === ORCHESTRATOR_ID ? 1 : a.localeCompare(b),
  );
  const rows: TodoRow[] = [];
  for (const id of ids) {
    for (const item of session.todos[id] ?? []) rows.push({ ...item, agentId: id });
  }
  return rows;
}

export interface TodoCounts {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}
export function todoCounts(rows: TodoRow[]): TodoCounts {
  const c: TodoCounts = { pending: 0, in_progress: 0, completed: 0, total: rows.length };
  for (const r of rows) c[r.status]++;
  return c;
}

// status → [圆点/进度条颜色, 中文文案]。对标原型 STATE_META,但用真实 TodoWrite 枚举
// (pending | in_progress | completed)。TaskWindow 与 Tasks 共用。
export const TODO_META: Record<TodoStatus, [string, string]> = {
  pending: ["#8a8170", "待办"],
  in_progress: ["#36c5e0", "进行中"],
  completed: ["#5fd35f", "完成"],
};

// status → 进度条宽度 %(TodoWrite 无逐项百分比,按状态给固定值;进行中给 60 + live 流光)。
export function todoProgress(status: TodoStatus): number {
  if (status === "completed") return 100;
  if (status === "in_progress") return 60;
  return 0;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/hud/todos-view.test.ts && bunx tsc --noEmit`
Expected: PASS(4 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add src/web/hud/todos-view.ts src/web/hud/todos-view.test.ts
git commit -m "feat: 🧩 add todos-view: flatten/count/meta for real session todos"
```

---

### Task B6: TaskWindow 接真 todos

**Files:**
- Modify: `src/web/hud/TaskWindow.tsx`

- [ ] **Step 1: 重写为真数据消费**

把 `src/web/hud/TaskWindow.tsx` 整体替换为(去掉 MOCK_TASKS / 三重 mock 标注,改读当前会话真 todos):

```tsx
import { useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon } from "./icons";
import { TODO_META, sessionTodos, todoCounts, todoProgress } from "./todos-view";

/**
 * 内景左栈底部「实时任务窗」TaskWindow(对标设计原型 hud.jsx 的 TaskWindow):
 * 展示**当前会话**各 agent 的真实 TodoWrite 待办(进行中/待办/完成),可折叠;
 * 点击某条跳「任务」面板。**真数据**:来自 store 的 Session.todos(引擎在 agent 调
 * TodoWrite 时捕获);不造假、无 mock 标注。仅内景显示(view !== overworld);
 * gate 的 return null 放在所有 hooks 之后(React hooks 规则)。selector 只取稳定的
 * 函数引用 / 基元,绝不在 selector 里构造新值(zustand 铁律)。
 */
export function TaskWindow() {
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const openPanel = useUiStore((s) => s.openPanel);
  // 取当前会话对象引用(稳定:同一会话对象同一引用),todos 展平在渲染期算,不进 selector。
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const [open, setOpen] = useState(true);

  if (!inInterior) return null;

  const rows = sessionTodos(session);
  const c = todoCounts(rows);

  return (
    <div className={`taskwin glass${open ? "" : " collapsed"}`}>
      <button
        type="button"
        className="tw-head"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="quest" size={18} />
        <span className="tw-title px">LIVE TASKS</span>
        <span className="tw-count">
          {c.in_progress}/{c.total}
        </span>
        <span className="tw-chev">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="tw-body scroll">
          {rows.length === 0 ? (
            <div className="roster-empty">暂无任务(agent 调 TodoWrite 后同步)</div>
          ) : (
            rows.map((tk, i) => {
              const [color] = TODO_META[tk.status];
              const p = todoProgress(tk.status);
              const live = tk.status === "in_progress";
              return (
                <button
                  // todos 表会整体覆盖、可能重复 content,index + agentId 作 key 稳定
                  // biome-ignore lint/suspicious/noArrayIndexKey: 列表整体替换,无就地重排
                  key={`${tk.agentId}:${i}`}
                  type="button"
                  className="tw-item"
                  onClick={() => openPanel("tasks")}
                >
                  <div className="tw-row">
                    <span
                      className="tw-dot"
                      style={{
                        background: color,
                        boxShadow: live
                          ? `0 0 0 1px rgba(0,0,0,.5), 0 0 6px ${color}`
                          : undefined,
                      }}
                    />
                    <span className="tw-name">{tk.content}</span>
                  </div>
                  <div className="tw-bar">
                    <div
                      className={`tw-fill${live ? " live" : ""}`}
                      style={{ width: `${p}%`, background: color }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {open && (
        <div className="tw-foot">
          <span className="cyan">{c.in_progress} 进行中</span>
          <span className="faint">{c.pending} 待办</span>
          <span className="greenc">{c.completed} 完成</span>
        </div>
      )}
    </div>
  );
}
```

> 说明:删了 `title="示例数据…"`、`.tw-mock`「示例」角标、`MOCK_TASKS` import —— 现在是真数据,按铁律不得挂 mock 标注。`.roster-empty` 是既有类(灰字小号),复用作空态文案。

- [ ] **Step 2: 类型 + 格式**

Run: `bunx tsc --noEmit && bun run check`
Expected: 干净(`.tw-mock` 样式类暂成无消费的孤儿,留到 B9 收尾删;此步不报错)。

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/TaskWindow.tsx
git commit -m "feat: 🧩 TaskWindow renders real session TodoWrite todos (drop mock)"
```

---

### Task B7: Tasks 面板接真 todos(信箱保留为局部 mock)

**Files:**
- Modify: `src/web/hud/Tasks.tsx`

- [ ] **Step 1: 重写为真数据 + 局部 mock 信箱**

把 `src/web/hud/Tasks.tsx` 整体替换为:

```tsx
import { useState } from "react";
import {
  ORCHESTRATOR_ID,
  type Session,
  type TodoStatus,
} from "../../shared/domain";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { MOCK_MAILBOX, MOCK_OWNERS } from "./mock-data";
import { TODO_META, sessionTodos } from "./todos-view";

// 三组渲染顺序(对标原型):待办 → 进行中 → 完成。
const GROUP_ORDER: TodoStatus[] = ["pending", "in_progress", "completed"];

// owner agentId → 展示名:主控固定「主控」,其余取真 agent 的 role(回落 agentId)。
function ownerLabel(agentId: string, session: Session | undefined): string {
  if (agentId === ORCHESTRATOR_ID) return "主控";
  return session?.agents[agentId]?.role ?? agentId;
}
// owner agentId → 0x72 hero base:主控金骑士,其余按 role 稳定哈希(同房间渲染)。
function ownerHero(agentId: string, session: Session | undefined): string {
  if (agentId === ORCHESTRATOR_ID) return ORCHESTRATOR_HERO;
  const role = session?.agents[agentId]?.role;
  return role ? roleToHero(role) : ORCHESTRATOR_HERO;
}

/**
 * 共享任务面板 Tasks(对标设计原型 panels1.jsx 的 Tasks):左列按状态分组的**当前会话
 * 真实 TodoWrite 待办**(归属 = 真 agent)+ 右列选中详情。**真数据**:来自 store 的
 * Session.todos。底部 inter-agent 信箱**仍为标注 mock**(引擎不暴露 agent 间信箱),
 * 以局部 banner 显式标注、绝不冒充真实。activePanel gate 的 return null 放在所有 hooks
 * 之后;selector 只取基元 / 稳定引用(zustand 铁律)。
 */
export function Tasks() {
  const active = useUiStore((s) => s.activePanel === "tasks");
  const closePanel = useUiStore((s) => s.closePanel);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  // 选中项用「agentId:索引」标识(content 可能重复)。
  const [selKey, setSelKey] = useState<string | null>(null);

  if (!active) return null;

  const rows = sessionTodos(session).map((r, i) => ({ ...r, key: `${r.agentId}:${i}` }));
  const selected = rows.find((r) => r.key === selKey) ?? rows.find((r) => r.status === "in_progress") ?? rows[0] ?? null;

  return (
    <Modal
      title="TASKS"
      sub="实时待办 · 当前会话 TodoWrite"
      icon="quest"
      width={1180}
      onClose={closePanel}
    >
      <div className="tasks-wrap">
        <div className="tasks-cols">
          {/* 左列:按状态分三组的真实待办清单。 */}
          <div className="tasks-list scroll">
            {rows.length === 0 ? (
              <div className="faint">当前会话暂无待办(agent 调 TodoWrite 后实时同步)</div>
            ) : (
              GROUP_ORDER.map((st) => {
                const group = rows.filter((t) => t.status === st);
                if (group.length === 0) return null;
                const [color, label] = TODO_META[st];
                return (
                  <div key={st} className="task-group">
                    <div className="task-group-h px">
                      <span className="dot" style={{ background: color }} />
                      {label} ({group.length})
                    </div>
                    {group.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`task-item${selected?.key === t.key ? " sel" : ""}`}
                        onClick={() => setSelKey(t.key)}
                      >
                        <div className="task-title">{t.content}</div>
                        <div className="task-sub">
                          <span className="task-owner">
                            <HeroPortrait
                              sessionId=""
                              hero={ownerHero(t.agentId, session)}
                              size={20}
                              className=""
                            />
                            {ownerLabel(t.agentId, session)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* 右列:选中待办详情。 */}
          <div className="task-detail">
            {selected ? (
              <>
                <div className="task-d-title">{selected.content}</div>
                <span
                  className="chip"
                  style={{
                    color: TODO_META[selected.status][0],
                    boxShadow: `inset 0 0 0 1px ${TODO_META[selected.status][0]}`,
                  }}
                >
                  {TODO_META[selected.status][1]}
                </span>
                {selected.activeForm ? (
                  <div className="task-d-desc">{selected.activeForm}</div>
                ) : null}
                <div className="task-d-meta">
                  <div className="statrow">
                    <span className="sr-label">归属</span>
                    <span className="sr-val">{ownerLabel(selected.agentId, session)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="faint">选择一个待办</div>
            )}
          </div>
        </div>

        {/* 信箱:inter-agent 消息 —— 引擎无对应能力,**局部标注 mock**(绝不冒充真实)。 */}
        <div className="mailbox">
          <div className="task-mock-banner" style={{ marginBottom: 10 }}>
            <Icon name="error" size={14} glow="#f2c84b" />
            信箱为示例 · 引擎暂无 inter-agent 信箱
          </div>
          <div
            className="px gold"
            style={{ fontSize: 9, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}
          >
            <Icon name="chat" size={16} glow="#f2c84b" />
            信箱 · inter-agent
          </div>
          <div className="mb-list">
            {MOCK_MAILBOX.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 静态 mock 列表,无重排
              <div key={i} className="mb-msg">
                <span className="cyan">{MOCK_OWNERS[m.from]?.name ?? m.from}</span>
                <span className="faint"> → </span>
                <span className="gold">{MOCK_OWNERS[m.to]?.name ?? m.to}</span>
                <span className="dim">：{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

> 取舍说明:TodoWrite 无依赖图 / 认领 / 时间线,故删掉原 mock 的「askbar / 阻塞链 / 依赖行 / 状态时间线 / 认领按钮」——这些无真实源,不再以 mock 形式留在「真数据」面板里(避免真假混淆)。信箱按用户决策(无源 → 标注 mock)保留,改为**局部** `.task-mock-banner`(原来是整面板 banner)。import 分工:`ORCHESTRATOR_ID` + `Session`/`TodoStatus` 类型来自 `../../shared/domain`;`ORCHESTRATOR_HERO` + `roleToHero` 来自 `../../shared/mapping`(见上方 import 区,已分别引,勿合并)。

- [ ] **Step 2: 类型 + 格式**

Run: `bunx tsc --noEmit && bun run check`
Expected: 干净。`HeroPortrait` 接受 `hero`(base 名)+ `sessionId` + `size` + `className`(沿用原 Tasks.tsx 既有用法);`ownerHero` 传计算出的 base 名即可。

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/Tasks.tsx
git commit -m "feat: 🧩 Tasks panel renders real session todos; mailbox stays labeled mock"
```

---

### Task B8: Currency「完成数」接真(gems 保留 mock)

**Files:**
- Modify: `src/web/hud/Currency.tsx`

- [ ] **Step 1: 改完成数为真、保留 gems mock**

编辑 `src/web/hud/Currency.tsx`:

把顶部 mock 常量区改为(删 `MOCK_COMPLETED`,保留 `MOCK_GEMS`):

```ts
// ── mock 占位:引擎暂无「宝石」经济,gems 用固定示例值并显式标注「示例」(角标 +
// title)。完成数已接真(当前会话已完成 TodoWrite 计数,见下),不再 mock。
const MOCK_GEMS = 1280; // 待引擎补:gems 经济
```

加 todos-view import:

```ts
import { sessionTodos, todoCounts } from "./todos-view";
```

在 `export function Currency() {` 内,`const tokens = useRoomStore(...)` 之后加一个**返回 number 的** selector(基元,安全;不构造新对象):

```ts
  // 已完成数 = 当前会话已完成的 TodoWrite 计数(真)。selector 返回 number(基元),
  // 不在 selector 里构造新对象(zustand 铁律)。
  const completed = useRoomStore((s) => {
    const sess = s.currentSessionId ? s.sessions[s.currentSessionId] : undefined;
    return sess ? todoCounts(sessionTodos(sess)).completed : 0;
  });
```

把渲染里「桂冠」那格从 mock 改成真(去掉 `mock`、值用 `completed`):

```tsx
        <CurCell
          icon="laurel"
          value={String(completed)}
          color="#5fd35f"
        />
```

gems 那格保持 `mock`(不动):

```tsx
        <CurCell
          icon="gemcur"
          value={MOCK_GEMS.toLocaleString()}
          color="#a06cd5"
          mock
        />
```

同步更新组件顶部 JSDoc:把「桂冠(完成数 示例)」改为「桂冠 = 已完成 todo 计数(真)」,「gemcur / laurel = mock」改为「gemcur = mock,laurel 真」。

- [ ] **Step 2: 类型 + 格式**

Run: `bunx tsc --noEmit && bun run check`
Expected: 干净。

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/Currency.tsx
git commit -m "feat: 🧩 Currency completed = real completed-todo count (gems stays mock)"
```

---

### Task B9: 清理 mock-data + 孤儿样式

**Files:**
- Modify: `src/web/hud/mock-data.ts`
- Modify: `src/web/styles.css`(删 `.tw-mock` 孤儿规则)

- [ ] **Step 1: 精简 mock-data 到只剩信箱所需**

把 `src/web/hud/mock-data.ts` 整体替换为(只保留信箱用的 `MOCK_MAILBOX` + `MOCK_OWNERS`;删 `MockTask`/`MockTaskState`/`MOCK_TASKS`/`STATE_META`/`taskProgress` —— 任务数据已全部来自真 store):

```ts
// ── inter-agent 信箱 mock 单一源 ──────────────────────────────────────────────
// 仅 Tasks 面板底部「信箱」用:引擎不暴露 agent 间信箱,故保留为**标注 mock**
// (Tasks.tsx 内有局部 .task-mock-banner 显式声明)。任务/待办数据已全部接真
// (Session.todos),原 MOCK_TASKS / STATE_META / taskProgress 已删除,改用
// src/web/hud/todos-view.ts 的 TODO_META / todoProgress。

export interface MockOwner {
  name: string;
  hero: string;
}

// 信箱 from/to 用的展示名(纯 mock 角色,与真实 agent 无关)。
export const MOCK_OWNERS: Record<string, MockOwner> = {
  orc: { name: "Orchestrator", hero: "knight_m" },
  mage: { name: "Surveyor", hero: "wizzard_m" },
  kf: { name: "Warden", hero: "knight_f" },
  elf: { name: "Scribe", hero: "elf_f" },
  dwf: { name: "Auditor", hero: "dwarf_f" },
};

export interface MockMail {
  from: string;
  to: string;
  text: string;
}

// inter-agent 信箱(占位)。from / to 用 owner id,渲染时映射成 MOCK_OWNERS 的展示名。
export const MOCK_MAILBOX: MockMail[] = [
  { from: "mage", to: "orc", text: "勘察完成，HERO_POOL 有 8 个稳定皮肤。" },
  { from: "orc", to: "kf", text: "状态槽优先级按 §6.6，askuser 置顶。" },
  { from: "kf", to: "orc", text: "测试套件 88% 上下文，接近阈值，请求压缩。" },
  { from: "dwf", to: "orc", text: "bun.lock 无异常，依赖审计通过。" },
];
```

- [ ] **Step 2: 删 `.tw-mock` 孤儿样式**

在 `src/web/styles.css` 删掉 `.tw-mock { … }` 规则(约 962–968 行;TaskWindow 已不再用「示例」角标)。其它 `.task-mock-banner` / `.cur-mock` / `.mock-chip` 仍被消费,**保留**。

- [ ] **Step 3: 全量校验**

Run: `bunx tsc --noEmit && bun run check && bun test`
Expected: 全绿。tsc 会报出任何仍 import 已删导出(`MOCK_TASKS`/`STATE_META`/`taskProgress`/`MockTask`)的地方 —— 应只剩 Tasks.tsx(已在 B7 改为不 import 它们)和 TaskWindow.tsx(B6 已改)。若有遗漏,按报错清理 import。

- [ ] **Step 4: 提交**

```bash
git add src/web/hud/mock-data.ts src/web/styles.css
git commit -m "refactor: ✨ trim mock-data to mailbox-only; drop orphan .tw-mock"
```

---

### Task B10: TodoWrite 端到端回放冒烟 + reduce e2e

**Files:**
- Modify: `src/web/replay.e2e.test.ts`(扩展;reduce 级零额度 e2e)

- [ ] **Step 1: 写 reduce 级 e2e(主链路:spawn → TodoWrite → 面板可见)**

在 `src/web/replay.e2e.test.ts` 末尾追加:

```ts
test("e2e: TodoWrite stream → Session.todos drives task counts", () => {
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  const evs: RoomEvent[] = [
    { seq: 1, ts: 1, sessionId: "s1", type: "session.created", payload: { title: "t", model: "m", project: "p" } },
    { seq: 2, ts: 2, sessionId: "s1", type: "agent.spawned", agentId: "ag-coder", payload: { role: "coder", parentId: "orchestrator" } },
    // 主控的 TodoWrite 整表
    { seq: 3, ts: 3, sessionId: "s1", type: "todos.updated", agentId: "orchestrator", payload: { todos: [
      { content: "重构缩放", status: "in_progress" },
      { content: "接 TodoWrite", status: "pending" },
    ] } },
    // subagent 的 TodoWrite 整表
    { seq: 4, ts: 4, sessionId: "s1", type: "todos.updated", agentId: "ag-coder", payload: { todos: [
      { content: "写 normalize 测试", status: "completed" },
    ] } },
  ];
  for (const e of evs) st = reduce(st, e);

  const s = st.sessions.s1;
  expect(s?.todos.orchestrator).toHaveLength(2);
  expect(s?.todos["ag-coder"]).toHaveLength(1);
  // 跨 agent 展平计数(供 TaskWindow / Currency 完成数)
  const all = Object.values(s?.todos ?? {}).flat();
  expect(all.filter((t) => t.status === "completed")).toHaveLength(1);
  expect(all.filter((t) => t.status === "in_progress")).toHaveLength(1);
});
```

- [ ] **Step 2: 跑 e2e**

Run: `bun test src/web/replay.e2e.test.ts`
Expected: PASS(新用例 + 既有回放用例全绿)。

- [ ] **Step 3: 浏览器冒烟(真 TodoWrite,少量额度,放最后)**

> 零额度路径已由 Step 1 的 reduce e2e + B3/B4 单测覆盖。真连冒烟用于核验「真实 agent 调 TodoWrite → 任务窗/面板实时刷新」:

```bash
bun run dev:engine   # 真连(订阅态),不带 --replay
bun run dev:web
```
在前端发一条会触发 agent 用 TodoWrite 的消息(如「列个 3 步计划并用 TodoWrite 跟踪」)。preview 核验:内景左栈 **LIVE TASKS** 出现真实条目并随 agent 推进变色;打开「任务」面板看到分组待办 + 真 agent 归属;顶右「桂冠」完成数随之增长。截图留证。**额度敏感,放最后、只发一两条。**

- [ ] **Step 4: 提交**

```bash
git add src/web/replay.e2e.test.ts
git commit -m "test: 🧪 e2e TodoWrite stream → Session.todos counts"
```

---

## Workstream C — 收尾

### Task C1: 回写 ROADMAP

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: 更新 §3.5 表与「未尽/已知取舍」**

在 `docs/ROADMAP.md` §3.5:
- 把 T2「TaskWindow 标注 mock」、T3「Tasks 整面板 mock 标注」改为「**已接真(Session.todos / TodoWrite)**」。
- 在「mock 面板」取舍里:把「Tasks 共享任务清单」从 mock 清单移除;明确「Tasks 已接真(当前会话 TodoWrite);**仅信箱**仍为标注 mock(引擎无 inter-agent 信箱)」;gems/Shop/Settings CONFIG 仍 mock 不变。
- 新增一句「全 UI 按固定 1920×1080 逻辑舞台等比缩放贴屏(`src/web/stage-scale.ts` + App `#viewport/#stage`),修复小屏人物过大」。

- [ ] **Step 2: 加变更记录**

在 §5 变更记录追加一条(日期 2026-06-06):

```markdown
- 2026-06-06:**真实数据接入 + 屏幕自适应缩放**。① 新增 `todos.updated` 事件管线(events/normalize/store),捕获各 agent 真实 TodoWrite → Session.todos;TaskWindow / Tasks 面板由 mock 改接真,Currency「完成数」接真(已完成 todo 计数);信箱按无源决策保留为局部标注 mock;gems/Shop/Settings CONFIG 仍标注 mock。② 全 UI 包进固定 1920×1080 逻辑舞台(`#viewport/#stage` + `stageScale=min(W/1920,H/1080)`,对齐设计原型 useStageScale),房间/人物/HUD/模态等比缩放 letterbox 居中,修复小屏人物/HUD 过大。纯函数(stage-scale / todos-view / parseTodos)+ reduce 级 e2e 钉死;tsc + biome + bun test 全绿。
```

- [ ] **Step 3: 全量校验 + 提交**

Run: `bunx tsc --noEmit && bun run check && bun test`
Expected: 全绿。

```bash
git add docs/ROADMAP.md
git commit -m "docs: 📝 ROADMAP: real TodoWrite tasks + fit-to-screen stage scaling"
```

---

## 合入与最终验证(执行者收口时做)

- [ ] worktree 内 `bunx tsc --noEmit && bun run check && bun test` 全绿;A4 / B10 浏览器冒烟两张对比截图(小屏人物变小、真 todos 刷新)留证。
- [ ] 记 worktree HEAD SHA → 回主工作树 `git merge --no-ff <sha>`;合并后再跑一遍 `bunx tsc --noEmit && bun run check && bun test`。
- [ ] **push 到 origin 需用户确认**;清理 `git worktree remove .worktrees/real-data-scaling`。

---

## Self-Review(已对照需求核对)

- **「对接所有功能的真实数据」**:能接真的全部接真——Tasks/TaskWindow(B6/B7,Session.todos)、Currency 完成数(B8)。已是真的(排行榜/技能/会话网格/用量/背包/小地图/账号/导入/模型/tokens)不动。无真实源的(gems/Shop/Settings CONFIG/信箱)按用户决策**保留标注 mock**(B7 信箱局部 banner、B8 gems「示例」角标)。
- **「页面比例自适应屏幕 1920x1080,人物太大」**:A1–A4 固定 1920×1080 舞台 + `min(W/1920,H/1080)` 等比缩放,房间/人物/HUD 一起缩,letterbox 居中;A4 在 1366×768 核验人物变小。
- **占位扫描**:无 TBD / 「类似 Task N」/ 无代码的「写测试」;每个改代码步骤都给了完整代码与命令。
- **类型一致**:`TodoItem`/`TodoStatus`(domain)贯穿 events/normalize/store/todos-view;`sessionTodos`/`todoCounts`/`TODO_META`/`todoProgress`(todos-view)在 B5 定义、B6/B7/B8 消费,签名一致;`stageScale`/`STAGE_W`/`STAGE_H`(A1)在 A3/CSS 引用一致。
- **真/假铁律**:接真面板去 mock 标注(B6 删三重标注、B8 桂冠去「示例」);保留的 mock 全部显式标注。
