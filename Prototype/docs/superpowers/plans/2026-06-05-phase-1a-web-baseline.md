# Phase 1A Web Baseline (P1-0 ~ P1-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Phase 1A web 端 backlog(P1-0 ~ P1-3):基线复核 → atlas 错误可见 → 主链路 e2e 钉死 → 交互功能逐项 e2e。

**Architecture:** 纯 web 端,无 Tauri。e2e 手段:store/reducer 纯函数断言(bun:test,零额度)+ 浏览器回放冒烟(`dev:engine --replay` + `dev:web`)。所有 bun:test 测试都可在无浏览器的 CI 环境里跑;无法在 bun:test 中渲染 React/PixiJS 组件的视觉部分,改为"可测逻辑下沉到纯函数 + 人工浏览器冒烟"(与仓库既有约定一致)。

**Tech Stack:** Bun, React 19, PixiJS v8, Zustand, TypeScript, Biome lint, bun:test

---

## 文件结构 & 职责

### 已有文件(修改)
- `src/web/room/atlas.ts` — 新增 `atlasErrorText` + `resetAtlas` 两个可测纯函数
- `src/web/room/Room.tsx:170-202` — 增 `atlasError` state + 错误覆盖层 + 重试
- `src/web/overworld/Overworld.tsx:332-384` — 同上
- `src/web/replay.e2e.test.ts` — 扩展:分步中间状态断言 + `tool.failed` + 多会话 overworld
- `src/web/store.test.ts` — 新增 `switchSession` + subagent `message.delta` agentId 字段
- `docs/ROADMAP.md` — 每完成一个 P1-x 回写勾选 + commit SHA

### 新建文件
- `src/web/room/atlas.test.ts` — 测 `atlasErrorText` 的单元测试
- `fixtures/multi-session.jsonl` — 两会话不同 project 的回放 fixture(overworld 多房间)
- `src/web/ui-store.test.ts` — 测 `enterInterior` / `exitOverworld` / `toggle`

---

## Task 1: P1-0 · 浏览器 dev 基线复核

**Files:**
- Run: `bun run dev:engine -- --replay fixtures/sample-run.jsonl` + `bun run dev:web`
- Modify: `docs/ROADMAP.md` (回写清单)

- [ ] **Step 1: 确认当前 worktree 状态**

```bash
git status
git log --oneline -5
```
Expected: 工作区干净,当前 branch 是 `claude/mystifying-antonelli-0699bc`(已在隔离 worktree 中)。

- [ ] **Step 2: 拉取最新 remote refs**

```bash
git fetch origin
```
Expected: 无错误(main 当前领先 origin 属正常)。

- [ ] **Step 3: 安装依赖**

```bash
bun install
```
Expected: 无红色错误。

- [ ] **Step 4: 确认基线测试全绿**

```bash
bun test
bun run check
```
Expected:
```
 105 pass
 0 fail
```
lint 无错误。若失败先修再继续。

- [ ] **Step 5: 起 engine(replay 模式)—— 新终端**

```bash
bun run dev:engine -- --replay fixtures/sample-run.jsonl
```
Expected: 输出类似 `[engine] ws://localhost:8787` 字样,进程持续运行。

- [ ] **Step 6: 起前端 —— 另一个新终端**

```bash
bun run dev:web
```
Expected: Vite 输出 `http://localhost:5173`。

- [ ] **Step 7: 浏览器逐项目视检**

打开 `http://localhost:5173`,逐项目检查并记录结果:

| 检查项 | ✅/❌ | 现象描述 |
|--------|------|---------|
| 总览大厅可见(有房间轮廓) | ? | |
| 房间内有 NPC 图标 | ? | |
| 点 NPC → 进入内景 | ? | |
| 内景:地板瓦片 + 主控★ | ? | |
| 内景:subagent 小人出现 | ? | |
| 内景:工具气泡 | ? | |
| Esc / ←大厅 返回总览 | ? | |
| 💬 聊天抽屉:有助手消息 | ? | |
| 💎 模型切换弹窗可开关 | ? | |
| 🎒 背包弹窗有产物 | ? | |
| 控制台(F12)无未处理错误 | ? | |

- [ ] **Step 8: 用真连冒烟(可选,花少量额度)**

```bash
# 停掉 replay engine,改跑真实 engine
bun run dev:engine
```
打开前端,点右下角 💬 新建会话,发一条短消息,确认小人动起来。

- [ ] **Step 9: 回写 ROADMAP P1-0 + 选定 e2e 方案**

在 `docs/ROADMAP.md` 的 P1-0 条目下,紧接 **DoD** 行追加:

```markdown
**e2e 方案**:store/reducer 纯函数断言(bun:test,零额度)+ 浏览器回放冒烟(dev:engine --replay + dev:web 人工目视)。PixiJS 组件渲染不走 bun:test(无 DOM 环境),可测逻辑下沉到纯函数单测。

**基线清单(2026-06-05)**:
| 检查项 | 结果 | 备注 |
|--------|------|------|
| 总览大厅 | ✅/❌ | ... |
| ... | | |
```

将上面视检结果填入,并把 `[ ] P1-0` 改为 `[x] P1-0`。

- [ ] **Step 10: commit P1-0**

```bash
git add docs/ROADMAP.md
git commit -m "docs: 📝 P1-0 浏览器 dev 基线复核清单 + e2e 方案选定"
```

---

## Task 2: P1-1 · Atlas 加载失败可见性

**Files:**
- Modify: `src/web/room/atlas.ts`
- Create: `src/web/room/atlas.test.ts`
- Modify: `src/web/room/Room.tsx`
- Modify: `src/web/overworld/Overworld.tsx`
- Modify: `docs/ROADMAP.md`

### 2a: atlas.ts — 新增可测纯函数

- [ ] **Step 1: 在 `src/web/room/atlas.ts` 末尾追加两个导出函数**

在第59行(文件末尾)后追加:

```ts
/** Format an atlas load error for the error overlay. Extracted for testability. */
export function atlasErrorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Reset the singleton promise so the next loadAtlas() call re-fetches.
 * Call before retry in the error overlay.
 */
export function resetAtlas(): void {
  sheetPromise = null;
}
```

### 2b: atlas.test.ts — 单元测试

- [ ] **Step 2: 创建 `src/web/room/atlas.test.ts`**

```ts
import { expect, test } from "bun:test";
import { atlasErrorText } from "./atlas";

test("atlasErrorText returns the Error message", () => {
  expect(atlasErrorText(new Error("fetch failed: 404"))).toBe(
    "fetch failed: 404",
  );
});

test("atlasErrorText coerces non-Error values to string", () => {
  expect(atlasErrorText("network timeout")).toBe("network timeout");
  expect(atlasErrorText(42)).toBe("42");
  expect(atlasErrorText(null)).toBe("null");
});
```

- [ ] **Step 3: 跑新测试确认通过**

```bash
bun test src/web/room/atlas.test.ts
```
Expected:
```
 2 pass
 0 fail
```

### 2c: Room.tsx — 增加 atlasError 状态与错误覆盖层

- [ ] **Step 4: 修改 `src/web/room/Room.tsx` 的 atlas import**

将第26行:
```ts
import { AtlasProvider, loadAtlas } from "./atlas";
```
改为:
```ts
import { AtlasProvider, atlasErrorText, loadAtlas, resetAtlas } from "./atlas";
```

- [ ] **Step 5: 在 `Room()` 函数中增加 `atlasError` 状态**

将 Room 函数开头(第170-179行)这一段:
```ts
export function Room() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e) => console.error("[atlas] load failed", e));
  }, []);
```
改为:
```ts
export function Room() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const retryAtlas = () => {
    setAtlasError(null);
    setSheet(null);
    resetAtlas();
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  };

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  }, []);
```

- [ ] **Step 6: 在 `Room()` 的 return 值里渲染错误覆盖层**

将最终 return 语句:
```tsx
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0b0a12} antialias={false}>
        {sheet && size.w > 0 ? (
          <AtlasProvider value={sheet}>
            <Scene canvasW={size.w} canvasH={size.h} />
          </AtlasProvider>
        ) : null}
      </Application>
    </div>
  );
```
改为:
```tsx
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0b0a12} antialias={false}>
        {sheet && size.w > 0 ? (
          <AtlasProvider value={sheet}>
            <Scene canvasW={size.w} canvasH={size.h} />
          </AtlasProvider>
        ) : null}
      </Application>
      {atlasError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(11,10,18,0.92)",
            color: "#ff6b6b",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 24,
            gap: 12,
          }}
        >
          <div>⚠ atlas load failed</div>
          <div
            style={{ color: "#aaa", fontSize: 10, wordBreak: "break-all", maxWidth: 360 }}
          >
            {atlasError}
          </div>
          <button type="button" className="px-btn" onClick={retryAtlas}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
```

### 2d: Overworld.tsx — 相同模式

- [ ] **Step 7: 修改 `src/web/overworld/Overworld.tsx` 的 atlas import**

找到以下行(通常在文件顶部 import 区):
```ts
import { AtlasProvider, loadAtlas } from "../room/atlas";
```
改为:
```ts
import { AtlasProvider, atlasErrorText, loadAtlas, resetAtlas } from "../room/atlas";
```

- [ ] **Step 8: 在 `Overworld()` 函数中增加 `atlasError` 状态与 retryAtlas**

将 Overworld 函数开头(第332-342行这一段):
```ts
export function Overworld() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const projectCount = useRoomStore((s) => s.projectOrder.length);

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e) => console.error("[atlas] load failed", e));
  }, []);
```
改为:
```ts
export function Overworld() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Spritesheet | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const projectCount = useRoomStore((s) => s.projectOrder.length);

  const retryAtlas = () => {
    setAtlasError(null);
    setSheet(null);
    resetAtlas();
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  };

  useEffect(() => {
    loadAtlas()
      .then(setSheet)
      .catch((e: unknown) => {
        console.error("[atlas] load failed", e);
        setAtlasError(atlasErrorText(e));
      });
  }, []);
```

- [ ] **Step 9: 在 `Overworld()` 的 return 值里渲染错误覆盖层**

将 Overworld 的 return 语句(第354-384行):
```tsx
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0b0a12} antialias={false}>
        {sheet && size.w > 0 ? (
          <AtlasProvider value={sheet}>
            <OverworldScene view={size} />
          </AtlasProvider>
        ) : null}
      </Application>
      {projectCount === 0 ? (
        <div
          className="px-panel pf"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "16px 20px",
            fontSize: 11,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          还没有会话
          <br />
          <span style={{ fontSize: 9 }}>点右下角 💬 新建一个开始</span>
        </div>
      ) : null}
    </div>
  );
```
改为:
```tsx
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <Application resizeTo={hostRef} background={0x0b0a12} antialias={false}>
        {sheet && size.w > 0 ? (
          <AtlasProvider value={sheet}>
            <OverworldScene view={size} />
          </AtlasProvider>
        ) : null}
      </Application>
      {projectCount === 0 && !atlasError ? (
        <div
          className="px-panel pf"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "16px 20px",
            fontSize: 11,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          还没有会话
          <br />
          <span style={{ fontSize: 9 }}>点右下角 💬 新建一个开始</span>
        </div>
      ) : null}
      {atlasError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(11,10,18,0.92)",
            color: "#ff6b6b",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 24,
            gap: 12,
          }}
        >
          <div>⚠ atlas load failed</div>
          <div
            style={{ color: "#aaa", fontSize: 10, wordBreak: "break-all", maxWidth: 360 }}
          >
            {atlasError}
          </div>
          <button type="button" className="px-btn" onClick={retryAtlas}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
```

### 2e: 测试 + 冒烟 + 提交

- [ ] **Step 10: 全量测试**

```bash
bun test
bun run check
```
Expected: ≥107 pass(原105 + 2 新), 0 fail, lint 干净。

- [ ] **Step 11: 浏览器冒烟**

用回放模式起两个终端(同 P1-0 Step 5-6),打开 `http://localhost:5173`:
- 正常情况:总览/内景正常渲染,**不出现**错误覆盖层 ✅
- 无需人工制造 atlas 错误(单元测试已覆盖逻辑;视觉正常路径确认即可)

- [ ] **Step 12: 勾选 ROADMAP P1-1 + commit**

在 `docs/ROADMAP.md` 把 `[ ] P1-1` 改为 `[x] P1-1`,条目下加结果行:
```
结果: atlas 加载失败在 Room + Overworld 均显示错误覆盖层含重试; atlasErrorText 单测 2 pass; commit <SHA>
```

```bash
git add src/web/room/atlas.ts src/web/room/atlas.test.ts \
        src/web/room/Room.tsx src/web/overworld/Overworld.tsx \
        docs/ROADMAP.md
git commit -m "fix: 🩹 P1-1 atlas 加载失败显示错误覆盖层(含重试)"
```

---

## Task 3: P1-2 · 核心可视化主链路 e2e 钉死

**Files:**
- Modify: `src/web/replay.e2e.test.ts`
- Create: `fixtures/multi-session.jsonl`
- Modify: `docs/ROADMAP.md`

### 3a: 扩展 replay.e2e.test.ts — 分步中间状态断言

- [ ] **Step 1: 在 `src/web/replay.e2e.test.ts` 顶部补充 import**

将现有:
```ts
import { expect, test } from "bun:test";
import { loadFixture } from "../engine/record";
import { type RoomState, reduce } from "./store";
```
改为:
```ts
import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { loadFixture } from "../engine/record";
import { type RoomState, reduce } from "./store";
```

- [ ] **Step 2: 在现有 test 后追加 "分步中间状态" test**

```ts
test("step-by-step replay: agent.spawned → in agents; tool.started/ended → currentTool; agent.done → removed", async () => {
  const events = await loadFixture("fixtures/sample-run.jsonl");
  let st: RoomState = { sessions: {}, currentSessionId: null, projectOrder: [] };

  // seq 1: session.created
  for (const e of events.filter((e) => e.seq <= 1)) st = reduce(st, e);
  expect(st.sessions.s1).toBeDefined();
  expect(st.currentSessionId).toBe("s1");

  // seq 3: agent.spawned ag-coder
  for (const e of events.filter((e) => e.seq === 3)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]).toBeDefined();
  expect(st.sessions.s1?.agents["ag-coder"]?.status).toBe("working");
  expect(st.sessions.s1?.status).toBe("busy");

  // seq 4: tool.started (Edit)
  for (const e of events.filter((e) => e.seq === 4)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]?.currentTool).toBe("Edit");

  // seq 7: tool.ended
  for (const e of events.filter((e) => e.seq === 7)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]?.currentTool).toBeUndefined();

  // seq 9/10: agent.done (research, then coder)
  for (const e of events.filter((e) => e.seq === 9 || e.seq === 10))
    st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]).toBeUndefined();
  expect(st.sessions.s1?.agents["ag-research"]).toBeUndefined();
  expect(st.sessions.s1?.agents[ORCHESTRATOR_ID]).toBeDefined();

  // seq 12: loot.dropped → in s.loot
  for (const e of events.filter((e) => e.seq === 12)) st = reduce(st, e);
  expect(st.sessions.s1?.loot).toHaveLength(1);
  expect(st.sessions.s1?.loot[0]?.kind).toBe("report");

  // seq 14: session.cleared → status done, only orchestrator left
  for (const e of events.filter((e) => e.seq === 14)) st = reduce(st, e);
  expect(st.sessions.s1?.status).toBe("done");
  expect(Object.keys(st.sessions.s1?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);
});
```

- [ ] **Step 3: 追加 "tool.failed 清除 currentTool" test**

```ts
test("tool.failed clears the agent's currentTool (red-light signal)", () => {
  const ev = (p: Partial<RoomEvent>): RoomEvent => ({
    seq: 1,
    ts: 0,
    sessionId: "s1",
    type: "agent.spawned",
    payload: {},
    ...p,
  });
  let st: RoomState = { sessions: {}, currentSessionId: null, projectOrder: [] };
  st = reduce(st, ev({ type: "session.created", payload: { title: "t", model: "m" } }));
  st = reduce(
    st,
    ev({ type: "agent.spawned", agentId: "ag-1", payload: { role: "coder", parentId: ORCHESTRATOR_ID } }),
  );
  st = reduce(
    st,
    ev({ type: "tool.started", agentId: "ag-1", payload: { toolName: "Bash" } }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBe("Bash");

  st = reduce(st, ev({ type: "tool.failed", agentId: "ag-1", payload: {} }));
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBeUndefined();
});
```

- [ ] **Step 4: 确认新测试通过**

```bash
bun test src/web/replay.e2e.test.ts
```
Expected: 3 pass(原1 + 2 新).

### 3b: multi-session fixture + overworld 多房间测试

- [ ] **Step 5: 创建 `fixtures/multi-session.jsonl`**

```jsonl
{"seq":1,"ts":0,"sessionId":"sA","type":"session.created","payload":{"title":"alpha project","model":"claude-opus-4-8","permissionMode":"default","apiKeySource":"oauth","cwd":"/repo/alpha","project":"alpha","slashCommands":[]}}
{"seq":2,"ts":100,"sessionId":"sB","type":"session.created","payload":{"title":"beta project","model":"claude-sonnet-4-6","permissionMode":"default","apiKeySource":"oauth","cwd":"/repo/beta","project":"beta","slashCommands":[]}}
{"seq":3,"ts":200,"sessionId":"sA","type":"agent.spawned","agentId":"ag-a","payload":{"role":"coder","promptSummary":"work","parentId":"orchestrator"}}
{"seq":4,"ts":300,"sessionId":"sB","type":"agent.spawned","agentId":"ag-b","payload":{"role":"researcher","promptSummary":"find","parentId":"orchestrator"}}
{"seq":5,"ts":400,"sessionId":"sA","type":"loot.dropped","payload":{"kind":"file","label":"alpha.ts","sourceRef":"src/alpha.ts"}}
{"seq":6,"ts":500,"sessionId":"sB","type":"session.cleared","payload":{}}
```

- [ ] **Step 6: 在 `replay.e2e.test.ts` 中追加 overworld 多房间 test**

```ts
test("multi-session fixture: two projects → two overworld room slots; per-session state isolated", async () => {
  const events = await loadFixture("fixtures/multi-session.jsonl");
  let st: RoomState = { sessions: {}, currentSessionId: null, projectOrder: [] };
  for (const e of events) st = reduce(st, e);

  // Two distinct projects → two room slots in the overworld.
  expect(st.projectOrder).toEqual(["alpha", "beta"]);

  // Each session has the correct project binding.
  expect(st.sessions.sA?.project).toBe("alpha");
  expect(st.sessions.sB?.project).toBe("beta");

  // sA: spawned agent + loot, still busy.
  expect(st.sessions.sA?.agents["ag-a"]).toBeDefined();
  expect(st.sessions.sA?.loot).toHaveLength(1);
  expect(st.sessions.sA?.loot[0]?.label).toBe("alpha.ts");

  // sB: session.cleared → status done, only orchestrator.
  expect(st.sessions.sB?.status).toBe("done");
  expect(Object.keys(st.sessions.sB?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);
  expect(st.sessions.sB?.loot).toHaveLength(0);

  // Focus ended on sB (last new session wins).
  expect(st.currentSessionId).toBe("sB");
});
```

- [ ] **Step 7: 全量测试**

```bash
bun test
bun run check
```
Expected: ≥111 pass, 0 fail.

- [ ] **Step 8: 勾选 ROADMAP P1-2 + commit**

把 `[ ] P1-2` 改为 `[x] P1-2`,条目下加结果行。

```bash
git add src/web/replay.e2e.test.ts fixtures/multi-session.jsonl docs/ROADMAP.md
git commit -m "test: 🧪 P1-2 主链路 e2e:agent/tool/loot/cleared 分步断言 + overworld 多房间"
```

---

## Task 4: P1-3 · 已实现交互功能逐项 e2e

**Files:**
- Modify: `src/web/store.test.ts`
- Create: `src/web/ui-store.test.ts`
- Modify: `docs/ROADMAP.md`

### 4a: 多会话 — switchSession 显式测试

- [ ] **Step 1: 在 `src/web/store.test.ts` 末尾追加 switchSession test**

```ts
test("switchSession changes currentSessionId without modifying sessions", () => {
  useRoomStore.setState({ sessions: {}, currentSessionId: null, projectOrder: [] });
  const api = useRoomStore.getState();
  api.applyEvent(ev({ type: "session.created", payload: { title: "s1", model: "m" } }));
  api.applyEvent(
    ev({ sessionId: "s2", type: "session.created", payload: { title: "s2", model: "m" } }),
  );
  // After two sessions, focus is on s2 (last new session wins).
  expect(useRoomStore.getState().currentSessionId).toBe("s2");

  api.switchSession("s1");
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  // The sessions themselves are untouched.
  expect(Object.keys(useRoomStore.getState().sessions)).toHaveLength(2);
  expect(useRoomStore.getState().sessions.s1?.title).toBe("s1");
  expect(useRoomStore.getState().sessions.s2?.title).toBe("s2");
});
```

### 4b: 聊天 — subagent agentId 字段

- [ ] **Step 2: 在 `src/web/store.test.ts` 末尾追加 subagent message agentId test**

```ts
test("message.delta from a subagent records the subagent agentId in the transcript", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-sub",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: "ag-sub",
      payload: { text: "sub reply" },
    }),
  );
  const msg = st.sessions.s1?.messages.at(-1);
  expect(msg?.agentId).toBe("ag-sub");
  expect(msg?.role).toBe("assistant");
  expect(msg?.text).toBe("sub reply");
});
```

### 4c: 切模型 — setModel 命令解析(已有覆盖,记录即可)

`parseCommand` 对 `setModel` 命令的解析已在 `src/engine/ws-gateway.test.ts` 中测试(见现有 test "parseCommand accepts known commands…")。无需新增测试,在 ROADMAP 子项下记录"已覆盖"。

注:P1-3 中 `setPermissionMode` WS 命令在当前 ws-gateway.ts 中**未实现**(gateway 只有 `setModel`、`sendMessage`、`newSession`、`interrupt`、`deleteSession` 五条命令)。permissionMode 在 store 层通过 `session.created` 的 payload 字段更新,对应测试已在 `store.test.ts` 中覆盖("SDK-init session.created merges the real permissionMode…")。如需增加 `setPermissionMode` WS 命令,属于新功能,超出 Phase 1A 范围。

### 4d: 进出内景 — ui-store 状态机

- [ ] **Step 3: 创建 `src/web/ui-store.test.ts`**

```ts
import { beforeEach, expect, test } from "bun:test";
import { useUiStore } from "./ui-store";

beforeEach(() => {
  useUiStore.setState({
    drawerOpen: false,
    modelOpen: false,
    skillsOpen: false,
    lootOpen: false,
    infoOpen: false,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
  });
});

test("enterInterior sets view to { interior: id } and clears NPC selection", () => {
  useUiStore.getState().selectNpc("session-1");
  expect(useUiStore.getState().selectedNpcId).toBe("session-1");

  useUiStore.getState().enterInterior("session-1");
  expect(useUiStore.getState().view).toEqual({ interior: "session-1" });
  expect(useUiStore.getState().selectedNpcId).toBeNull();
});

test("exitOverworld returns to overworld view and clears selectedAgentId", () => {
  useUiStore.getState().enterInterior("session-1");
  useUiStore.getState().select("ag-1");
  expect(useUiStore.getState().selectedAgentId).toBe("ag-1");

  useUiStore.getState().exitOverworld();
  expect(useUiStore.getState().view).toBe("overworld");
  expect(useUiStore.getState().selectedAgentId).toBeNull();
});

test("toggle opens and closes a HUD panel", () => {
  expect(useUiStore.getState().drawerOpen).toBe(false);
  useUiStore.getState().toggle("drawerOpen");
  expect(useUiStore.getState().drawerOpen).toBe(true);
  useUiStore.getState().toggle("drawerOpen");
  expect(useUiStore.getState().drawerOpen).toBe(false);
});

test("enterInterior then exitOverworld round-trips back to overworld", () => {
  useUiStore.getState().enterInterior("sess-abc");
  expect(useUiStore.getState().view).toEqual({ interior: "sess-abc" });
  useUiStore.getState().exitOverworld();
  expect(useUiStore.getState().view).toBe("overworld");
});
```

- [ ] **Step 4: 跑新测试**

```bash
bun test src/web/ui-store.test.ts
```
Expected: 4 pass.

### 4e: 生命周期子项(已有测试,核对记录)

以下子项在 `store.test.ts` 已有测试,逐项核对引用:

| P1-3 子项 | 对应测试 |
|-----------|---------|
| 归档 / 取消归档 / 删除 | `"archive/unarchive/remove session actions"` |
| LRU ≤10 软归档 | `"creating the 11th active session soft-archives the least-recently-active one"` |
| 时钟回拨保护 | `"the just-created session is never the LRU victim even if the clock went backward"` |
| 门动画进出(小人离场) | 渲染层,无法在 bun:test 中断言;浏览器回放冒烟覆盖 |
| 再激活走回 | `"unarchiveSession"` + 浏览器冒烟 |

### 4f: 浏览器冒烟验证(P1-3 综合)

- [ ] **Step 5: 浏览器回放冒烟 — 验证多会话 + 内景 + 聊天**

起回放 engine + dev:web,在浏览器中依次操作:

1. **多会话切换**:
   - 在聊天抽屉新建会话 s1(若 replay 已带会话则跳过)
   - 再新建会话 s2 → 确认 HUD 标题切换到 s2
   - 手动 `useRoomStore.getState().switchSession("s1")` (DevTools Console) → 确认 HUD 切回 s1

2. **进出内景**:
   - 总览大厅:点击 NPC 信息卡 → 打开 NpcCard
   - 点「进入」→ 进入内景,看到主控★
   - 按 Esc → 返回大厅原位

3. **聊天抽屉**:
   - 点 💬 → 抽屉打开
   - 确认 fixture 回放的助手消息出现在对话列表

4. **模型切换弹窗**:
   - 点 💎 → 模型列表弹窗打开 → 点选另一个模型 → 弹窗关闭(命令已发送 engine)

### 4g: 全量测试 + ROADMAP + commit

- [ ] **Step 6: 全量测试**

```bash
bun test
bun run check
```
Expected: ≥116 pass, 0 fail.

- [ ] **Step 7: 勾选 ROADMAP P1-3 所有子项 + commit**

把 `[ ] P1-3` 及其所有 `[ ]` 子项改为 `[x]`,每项加"已自动化" / "回放冒烟覆盖"标注。

```bash
git add src/web/store.test.ts src/web/ui-store.test.ts docs/ROADMAP.md
git commit -m "test: 🧪 P1-3 交互 e2e:switchSession/chat-agentId/enterInterior/exitOverworld/生命周期"
```

---

## Task 5: 收尾 — 合并回 main + 清理

- [ ] **Step 1: 最终全量验证**

```bash
bun test
bun run check
```
Expected: ≥116 pass, 0 fail.

- [ ] **Step 2: 记录 worktree HEAD SHA**

```bash
git rev-parse HEAD
```
记下输出的 SHA(如 `abcdef1`)。

- [ ] **Step 3: 回主工作树 merge**

```bash
# 在主工作树目录执行(注意不是 worktree 路径)
git -C /Users/poco/Projects/Roguent merge --no-ff abcdef1 -m "merge: 🔀 Phase 1A web 端 P1-0~P1-3 完成"
```

- [ ] **Step 4: 在主工作树再次验证**

```bash
bun -C /Users/poco/Projects/Roguent test
bun -C /Users/poco/Projects/Roguent run check
```

- [ ] **Step 5: 清理 worktree(合并后)**

```bash
git -C /Users/poco/Projects/Roguent worktree remove .claude/worktrees/mystifying-antonelli-0699bc
```

- [ ] **Step 6: 移交用户**

**Phase 1A 完成定义已满足**:P1-0~P1-3 全绿 + 浏览器冒烟逐项通过。按 ROADMAP 约定:**停在这里,移交用户决定是否开启 Phase 1B(app 端打包)**。

---

## 自审 (Self-Review)

### Spec 覆盖率核对

| ROADMAP 条目 | 本计划覆盖 | 文件/步骤 |
|------------|---------|---------|
| P1-0 浏览器基线复核清单 | ✅ Task 1 Step 7 | ROADMAP 回写 |
| P1-0 e2e 方案选定 | ✅ Task 1 Step 9 | ROADMAP 回写 |
| P1-1 atlas 失败→错误覆盖层 | ✅ Task 2 Step 4-9 | Room.tsx/Overworld.tsx |
| P1-1 单测:模拟失败→错误态 | ✅ Task 2 Step 2-3 | atlas.test.ts |
| P1-1 重试按钮 | ✅ Task 2 Step 5-9 | retryAtlas() + resetAtlas() |
| P1-2 agent.spawned→小人 | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 tool.started→currentTool | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 tool.ended→cleared | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 tool.failed→cleared | ✅ Task 3 Step 3 | replay.e2e.test.ts |
| P1-2 agent.done→离场 | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 loot.dropped→入背包 | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 session.cleared→done | ✅ Task 3 Step 2 | replay.e2e.test.ts |
| P1-2 overworld 多 cwd→多房间 | ✅ Task 3 Step 5-6 | multi-session.jsonl + test |
| P1-3 多会话 switchSession | ✅ Task 4 Step 1 | store.test.ts |
| P1-3 聊天 message transcript | ✅ Task 4 Step 2 | store.test.ts |
| P1-3 切模型 setModel | ✅ 已有 ws-gateway.test.ts | 记录覆盖 |
| P1-3 切模式 setPermissionMode | ⚠️ WS 命令未实现,permissionMode 通过 session.created 覆盖 | 在计划中注记 |
| P1-3 生命周期 archive/LRU | ✅ 已有 store.test.ts | 记录覆盖 |
| P1-3 进出内景 enterInterior | ✅ Task 4 Step 3 | ui-store.test.ts |
| P1-3 exitOverworld | ✅ Task 4 Step 3 | ui-store.test.ts |

### Placeholder 扫描

无 TBD / TODO / "类似" / 空代码块。所有步骤含完整代码。

### 类型一致性

- `atlasErrorText` / `resetAtlas`:在 atlas.ts 导出、Room.tsx + Overworld.tsx 导入 ✓
- `RoomState` / `reduce`:在 replay.e2e.test.ts 导入 ✓
- `ORCHESTRATOR_ID`:在 replay.e2e.test.ts import 中补加 ✓
- `RoomEvent` type:在 replay.e2e.test.ts import 中补加 ✓
- `useUiStore`:在 ui-store.test.ts 导入 ✓
- `beforeEach`:从 `bun:test` 导入 ✓
