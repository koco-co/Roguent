# 总览世界(Overworld Hub)修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉总览世界实现里事后审查抓到的 1 critical / 2 high / 13 medium-low 问题,并按用户决策补齐两处 spec 取舍(真门动画入场/退场/走回;每 worktree 独立房间 + `cwd='/'` 空串守卫)。

**Architecture:** 改动集中在已有文件:纯逻辑(`web/store.ts` reducer 的 permissionMode/LRU、`engine/project.ts`、`web/overworld/worldgen.ts` 的门位)走 TDD 加单测;组件层(`SessionNpc.tsx`/`Player.tsx`/`Overworld.tsx`/`App.tsx`/`NpcCard.tsx`)本仓库历来不写 .tsx 单测,按既有约定用 `bun run build` + `bun run check` + replay fixture 浏览器冒烟验证。不新增事件类型、不碰 replay 确定性。

**Tech Stack:** Bun + TypeScript(strict / noUncheckedIndexedAccess / verbatimModuleSyntax)、React 19、PixiJS v8(`@pixi/react` extend)、Zustand、Biome、`bun:test`。

---

## 不变量(每个 task 都不能破)

- 移动 / 相机 / 淡入淡出全部走命令式 `useTick` + `container.position.set` / `.alpha`,**绝不进 React state**;store 重渲染不得重置位置(spec §不变量,参考 `room/Character.tsx`)。
- 位置 / alpha 的 mount-once 落座用 `useLayoutEffect`(首帧前落座,避免一帧跳变),对齐 `room/Character.tsx:120`。
- `session.created` 幂等:engine 先合成一条、SDK init 再派生一条;第二条必须**合并**(补字段),绝不重建会话 / 不清 transcript / 不抢焦点(spec §关键约定)。
- 房间布局**追加式**:`projectOrder` 首见入尾、永不重排;worldgen 的 room rect 只依赖 slot index + id(`worldgen.ts:84` 注释)。
- index 访问是 `T | undefined`(noUncheckedIndexedAccess);跨模块用 `import type`。
- 改后即测:动了代码就跑 `bun test` + `bun run check`,失败先修;不把局部通过说成全量通过。

## 文件职责

| 文件 | 本计划里的职责 |
| --- | --- |
| `src/web/store.ts` | reducer:`session.created` 合并 permissionMode;`enforceActiveCap` 只统计带 project 的活跃会话 + 保护刚建会话;`session.error` 占位 `lastActiveAt=e.ts`;`removeSession` 空房间注释 |
| `src/web/store.test.ts` | 上述 reducer 行为的单测 |
| `src/engine/project.ts` | `projectFor` 空 basename 守卫 + worktree 行为注释 |
| `src/engine/project.test.ts` | 空 basename 回退单测 |
| `src/web/overworld/worldgen.ts` | `RoomBox` 暴露 `doorPx`(房间门口锚点) |
| `src/web/overworld/worldgen.test.ts` | `doorPx` 在房间内、在 NPC wander bounds 内的单测 |
| `src/web/overworld/SessionNpc.tsx` | 门口入场/退场/走回的相位机 + leaving 锁死恢复 + `useLayoutEffect` 落座 + `[E]` 提示文案 |
| `src/web/overworld/Overworld.tsx` | 把 `room.doorPx` 经 actor 传给 NPC;window blur 清按键 |
| `src/web/overworld/Player.tsx` | 0→1 项目卡死修复(remount key)+ `useLayoutEffect` 落座 |
| `src/web/App.tsx` | 进入内景后该会话被归档/删除 → 回落大厅 |
| `src/web/hud/NpcCard.tsx` | 子智能体按状态分桶展示 |
| `docs/superpowers/specs/2026-06-04-overworld-hub-design.md` | §验证 注记:门动画已实现、worktree=独立房间、硬删空房间留存到刷新 |

---

### Task 1: reducer 补传 permissionMode(信息卡「模式」永远显示 default)

**Files:**
- Modify: `src/web/store.ts`(`session.created` 分支,约 43-97 行)
- Test: `src/web/store.test.ts`

根因:`session.created` 的两条分支都丢掉 payload 的 `permissionMode`。engine 合成的第一条带 `"default"`,SDK init 派生的第二条带真实模式(`normalize.ts:114`),但 merge 分支没拷它 → `session.permissionMode` 永远停在 `"default"`,`NpcCard.tsx:107` 的「模式」行恒错。载荷类型 `events.ts:33` 已有该字段。

- [ ] **Step 1: 写失败测试**

在 `src/web/store.test.ts` 末尾(`archive/unarchive/remove` 测试之后)追加:

```ts
test("SDK-init session.created merges the real permissionMode over the synthesized default", () => {
  // engine 合成的第一条 permissionMode=default;SDK init 派生的第二条带真实模式。
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("default");
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "plan" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("plan");
});

test("a default-mode re-init does not clobber an already-known non-default mode", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "acceptEdits" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("acceptEdits");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/store.test.ts`
Expected: FAIL — 第二条把 permissionMode 丢了,首测期望 `"plan"` 得到 `"default"`。

- [ ] **Step 3: 实现**

在 `src/web/store.ts` 的 `session.created` 分支:载荷 cast(约 44-50 行)增加 `permissionMode?: string;`:

```ts
    const p = e.payload as {
      title: string;
      model: string;
      slashCommands?: string[];
      cwd?: string;
      project?: string;
      permissionMode?: string;
    };
```

merge 分支(`existing` 已存在时构造的对象,约 57-66 行)加一行 `permissionMode`:

```ts
      sessions[e.sessionId] = {
        ...existing,
        title: p.title || existing.title,
        model: p.model || existing.model,
        slashCommands: p.slashCommands?.length
          ? p.slashCommands
          : existing.slashCommands,
        cwd: existing.cwd ?? p.cwd,
        project: proj,
        // SDK init 派生的第二条带真实 permissionMode;只在它是非 default 时覆盖,
        // 否则保留已知值(合成的第一条恒为 "default",不能把真实模式刷回去)。
        permissionMode:
          p.permissionMode && p.permissionMode !== "default"
            ? p.permissionMode
            : existing.permissionMode,
      };
```

create 分支(新建,约 79-88 行)不动 —— 合成的第一条只携带 `"default"`,`createSession` 默认即 `"default"`,真实模式由上面的 merge 分支补;无需改 create。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/store.test.ts`
Expected: PASS(含既有用例)。

- [ ] **Step 5: 提交**

```bash
git add src/web/store.ts src/web/store.test.ts
git commit -m "fix: 🩹 propagate SDK permissionMode into the NPC info card"
```

---

### Task 2: reducer 的 LRU 正确性(错误占位偷槽位 + 刚建会话被自己挤掉)

**Files:**
- Modify: `src/web/store.ts`(`enforceActiveCap` 28-38 行;`session.created` create 分支 79-96 行;`session.error` 分支 102-120 行;`unarchiveSession` 293-303 行)
- Test: `src/web/store.test.ts`

两个根因:
1. **high**:`session.error` 早于 `session.created` 到达时建的占位会话**无 project**、`lastActiveAt:0`,却被 `enforceActiveCap`(只看 `!archived`)算进 ACTIVE_CAP —— 渲染不出 NPC 却占一个大厅槽,且永远是 LRU 最低。
2. **medium**:`ts` 是非单调 wall-clock。时钟回拨时,刚建的第 11 个会话可能成为严格最小 `lastActiveAt`,被 `enforceActiveCap` 当场归档,新 NPC 刚进门就走人。

修法:`enforceActiveCap` 只统计 `!archived && project` 的会话,并接受一个**受保护 id**(刚建/刚激活者不可被选为牺牲品);`session.error` 占位填 `lastActiveAt: e.ts`。

- [ ] **Step 1: 写失败测试**

在 `src/web/store.test.ts` 末尾追加:

```ts
test("an early session.error placeholder stamps lastActiveAt and never steals a lobby slot", () => {
  // 先来一条 session.error(无 project 的占位),再建 10 个带 project 的会话。
  // 占位不计入 ACTIVE_CAP,所以 10 个真实会话全部保持活跃。
  let st = reduce(
    empty,
    ev({ ts: 7, type: "session.error", payload: { message: "auth failed" } }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(7);
  expect(st.sessions.s1?.project).toBeUndefined();
  for (let i = 2; i <= 11; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
  // 错误占位还在,但没被算进大厅、也没被归档(它没 project)。
  expect(st.sessions.s1?.archived).toBe(false);
});

test("the just-created session is never the LRU victim even if the clock went backward", () => {
  let st = empty;
  for (let i = 1; i <= 10; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: 100 + i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  // 第 11 个会话的 ts 比所有人都小(时钟回拨)。它绝不能把自己挤掉。
  st = reduce(
    st,
    ev({
      sessionId: "s11",
      ts: 1,
      type: "session.created",
      payload: { title: "s11", model: "m", project: "p11" },
    }),
  );
  expect(st.sessions.s11?.archived).toBe(false);
  // 被归档的是其它会话里 lastActiveAt 最低的(s1=101)。
  expect(st.sessions.s1?.archived).toBe(true);
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/store.test.ts`
Expected: FAIL —— 错误占位被算进 cap / 刚建会话被时钟回拨挤掉。

- [ ] **Step 3: 实现**

(a) 改 `enforceActiveCap`(28-38 行)签名 + 过滤 + 保护:

```ts
/**
 * 就地把活跃度最低的会话软归档,直到「活跃(未归档)且有 project」的会话数 ≤
 * ACTIVE_CAP。只统计带 project 的会话:无 project 的(如早到的 session.error 占位)
 * 渲染不出 NPC,不该占大厅槽。protectId 永不被选为牺牲品 —— 用于保护刚建/刚激活者,
 * 防止非单调 wall-clock(时钟回拨)把它自己挤掉。
 */
function enforceActiveCap(
  sessions: Record<string, Session>,
  protectId?: string,
): void {
  while (true) {
    const active = Object.values(sessions).filter(
      (s) => !s.archived && s.project,
    );
    if (active.length <= ACTIVE_CAP) break;
    let victim: Session | undefined;
    for (const s of active) {
      if (s.id === protectId) continue;
      if (!victim || s.lastActiveAt < victim.lastActiveAt) victim = s;
    }
    if (!victim) break;
    sessions[victim.id] = { ...victim, archived: true };
  }
}
```

(b) create 分支(约 94 行)把新 id 作为受保护项传入:

```ts
    // 新建即跳第 11 个 → 软归档活跃度最低者;新会话受保护,绝不被自己挤掉。
    enforceActiveCap(sessions, e.sessionId);
```

(c) `unarchiveSession`(约 301 行)同样保护刚激活者:

```ts
      enforceActiveCap(sessions, id);
```

(d) `session.error` 占位填 `lastActiveAt`(约 104-114 行),让它不再恒为 0(虽然现在不计入 cap,但保持数据一致、避免被其它按 lastActiveAt 排序的地方误判):

```ts
    const base =
      sessions[e.sessionId] ??
      createSession({
        id: e.sessionId,
        title: e.sessionId,
        model: "",
        lastActiveAt: e.ts,
      });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/store.test.ts`
Expected: PASS(含既有「11th 软归档」用例 —— 其会话都带 project,行为不变)。

- [ ] **Step 5: 提交**

```bash
git add src/web/store.ts src/web/store.test.ts
git commit -m "fix: 🩹 harden lobby LRU against project-less ghosts and clock skew"
```

---

### Task 3: `projectFor` 空 basename 守卫 + worktree 行为注释

**Files:**
- Modify: `src/engine/project.ts`
- Test: `src/engine/project.test.ts`

根因:`cwd='/'`(或任何 git 根 basename 为空的路径)时 `basename(root)` 返回 `""`,`if (root) return basename(root)` 直接返回空串,绕过 `|| cwd` 回退 → 空 projectOrder 项 + 无名房间。`basename("/") === ""` 已实证。用户已确认:**每 worktree 独立房间是有意行为**,这里只修空串 bug + 补注释。

- [ ] **Step 1: 写失败测试**

在 `src/engine/project.test.ts` 末尾追加:

```ts
test("projectFor never returns an empty string for a root-level path", () => {
  // basename('/') === ''(已实证)。git 根 basename 为空时必须回退,绝不能产出空串
  // ——否则总览世界会出现一个无名的空房间。
  const p = projectFor("/");
  expect(p.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/project.test.ts`
Expected: FAIL —— `projectFor("/")` 返回 `""`,长度为 0。
(注:`/` 通常不是 git 仓库,git 会失败走 catch;但若运行环境的 `/` 恰在某 git 根下,`basename(root)` 仍可能为空,守卫覆盖两种情形。)

- [ ] **Step 3: 实现**

把 `src/engine/project.ts` 的函数体改为先取 basename、非空才返回,否则贯穿到 cwd 回退:

```ts
/**
 * Project name for a session's working directory: the basename of its git
 * toplevel, falling back to the directory's own basename when `cwd` isn't a git
 * repo (or git is unavailable). This is the room-grouping key for the overworld
 * (each project = one room). Shells out to git once per new session — cheap, and
 * sessions are user-initiated.
 *
 * 注意:`git rev-parse --show-toplevel` 在 worktree 内返回的是 worktree 目录,
 * 不是主仓库 —— 故同一仓库的不同 worktree 会落进不同房间。这是**有意行为**(已与
 * 用户对齐:project = git 根 basename,各 worktree 各有其根)。
 */
export function projectFor(cwd: string): string {
  try {
    const root = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    // basename('/') === '' —— git 根 basename 为空时不能返回空串,贯穿到 cwd 回退。
    const name = basename(root);
    if (name) return name;
  } catch {
    // not a git repo / git missing / cwd doesn't exist — fall back to the dir name
  }
  return basename(cwd) || cwd;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/engine/project.test.ts`
Expected: PASS(含既有两条)。

- [ ] **Step 5: 提交**

```bash
git add src/engine/project.ts src/engine/project.test.ts
git commit -m "fix: 🩹 guard projectFor against empty git-root basename"
```

---

### Task 4: worldgen 暴露每房间门口锚点 `doorPx`

**Files:**
- Modify: `src/web/overworld/worldgen.ts`(`RoomBox` 接口 + `generateWorld` 的 room 映射)
- Test: `src/web/overworld/worldgen.test.ts`

为 Task 5 的门动画做基础:给每个房间一个确定的「门口」锚点。取**房间底边中央**(NPC wander 区下沿、内部中列),NPC 从这里走进 home、退场走回这里。落在 `boundsPx` 内,免去可走性边界 corner case;只依赖该房间自身 rect,不破坏追加式。

- [ ] **Step 1: 写失败测试**

在 `src/web/overworld/worldgen.test.ts` 末尾追加(若已有 `generateWorld` import 则复用):

```ts
test("each room exposes a doorPx at the bottom-centre, inside its wander bounds", () => {
  const w = generateWorld([
    { id: "alpha", sessionCount: 1 },
    { id: "beta", sessionCount: 3 },
  ]);
  for (const room of w.rooms) {
    const d = room.doorPx;
    // 门口在 NPC wander bounds 内(横向居中、纵向贴下沿)。
    expect(d.x).toBeGreaterThanOrEqual(room.boundsPx.minX);
    expect(d.x).toBeLessThanOrEqual(room.boundsPx.maxX);
    expect(d.y).toBe(room.boundsPx.maxY);
    // 门口在 anchor 下方(或同高),即朝房间「下方入口」。
    expect(d.y).toBeGreaterThanOrEqual(room.anchorPx.y);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/overworld/worldgen.test.ts`
Expected: FAIL —— `room.doorPx` 不存在(类型上也不通过,先让 ts 报错亦可视为 fail)。

- [ ] **Step 3: 实现**

(a) `RoomBox` 接口(约 23-30 行)增加 `doorPx`:

```ts
export interface RoomBox {
  projectId: string;
  rect: Rect;
  /** Interior centre in px — NPC home anchor / spawn point. */
  anchorPx: Pos;
  /** Interior floor area in px (inset by a small margin) for NPC wander clamping. */
  boundsPx: { minX: number; maxX: number; minY: number; maxY: number };
  /**
   * Room "doorway" anchor in px — bottom-centre of the wander area. NPCs enter
   * by walking from here to anchorPx and leave by walking back to it (spec
   * §生命周期: 由房门口入场 / 走出门退场 / 再激活走回). Inside boundsPx so it never
   * lands on a wall.
   */
  doorPx: Pos;
}
```

(b) `generateWorld` 里构造 room 时(约 145-155 行的 return)加上 `doorPx`,放在已算好的 `boundsPx` 之后:

```ts
    const boundsPx = {
      minX: interiorMinXPx + BOUNDS_MARGIN_PX,
      minY: interiorMinYPx + BOUNDS_MARGIN_PX,
      maxX: interiorMaxXPx - BOUNDS_MARGIN_PX,
      maxY: interiorMaxYPx - BOUNDS_MARGIN_PX,
    };
    return {
      projectId: p.id,
      rect,
      anchorPx,
      boundsPx,
      // 门口 = 横向居中、纵向贴 wander 区下沿。
      doorPx: { x: anchorPx.x, y: boundsPx.maxY },
    };
```

(把原本内联在 return 里的 `boundsPx` 对象提到上面命名,供 `doorPx` 复用 `boundsPx.maxY`。)

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/overworld/worldgen.test.ts`
Expected: PASS(含既有 worldgen 用例)。

- [ ] **Step 5: 提交**

```bash
git add src/web/overworld/worldgen.ts src/web/overworld/worldgen.test.ts
git commit -m "feat: 🧩 expose per-room doorPx anchor for overworld NPC entrances"
```

---

### Task 5: SessionNpc 门口入场/退场/走回 + leaving 锁死恢复(critical)+ useLayoutEffect + [E] 文案;Overworld 接线 + 失焦清按键

**Files:**
- Modify: `src/web/overworld/SessionNpc.tsx`(相位机、props、seed、提示文案)
- Modify: `src/web/overworld/Overworld.tsx`(`NpcDesc`/`NpcActor` 加 `door`、传 `door` 给 NPC、window blur 清按键)

> 验证:本任务全是 .tsx 组件,本仓库不写 .tsx 单测。验证 = `bun run check` + `bun run build` 通过,且 reducer/worldgen 单测仍 81+ 全绿;行为冒烟放在最终 replay 浏览器验证。

**修四件事(都集中在 NPC 相位机,合一个 task 才能保证每步 build 绿):**
1. **critical**:`phase.current` 会锁死在 `"leaving"` —— 归档淡出未完成时取消归档,`leaving` prop 翻回 false 但相位机没有任何路径退出 `"leaving"`,照旧 fade 到 0 → `onExited` → 从 actors 移除,而 `reconcileKey` 没变,reconcile 不重跑 → NPC 永久消失。
2. **spec 门动画**(用户已确认实现):入场从 `door` 走到 `home`;退场走到 `door` 再淡出;再激活时从 leaving 恢复继续 living/走回。
3. **low**:seed 用 `useLayoutEffect`(对齐 `room/Character.tsx`)。
4. **low/medium**:`[E] 进入` 文案误导(E 只开信息卡)→ 改 `[E] 信息`。

- [ ] **Step 1: 改 `SessionNpc.tsx` —— props 增加 `door`**

在组件入参类型里(`bounds: Bounds;` 之后)加:

```ts
  door: Pos;
```

并在解构参数里加入 `door`(与 `home`、`bounds` 并列)。

- [ ] **Step 2: 改 seed 与相位机 —— 门口入场 / 退场走门 / leaving 恢复**

(a) 顶部 import 增加 `useLayoutEffect`:

```ts
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
```

(b) 在 refs 区(`leavingRef` 附近)加 `doorRef`:

```ts
  const doorRef = useRef(door);
  doorRef.current = door;
```

(c) 把「mount-once seed」从 `useEffect` 改成 `useLayoutEffect`,并改成**门口入场**(seed 在 door、target 指向 home、alpha=1、phase=entering):

```ts
  // Seed at the doorway and walk in on mount (NPC enters from its room door,
  // spec §生命周期). useLayoutEffect so position is set before first paint
  // (mirrors room/Character.tsx:120, spec §8).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once seed
  useLayoutEffect(() => {
    pos.current = { ...door };
    target.current = { ...home };
    phase.current = "entering";
    const root = rootRef.current;
    if (root) {
      root.position.set(pos.current.x, pos.current.y);
      root.alpha = 1;
    }
  }, []);
```

(d) 重写 `tick` 的相位逻辑(替换现有 149-181 行那段)。语义:
- **leaving 恢复**(critical 修复):若 `leavingRef` 已转 false 但相位还在 `"leaving"`,恢复为 `living` 并把 alpha 拉回 1、清 `exited`,使再激活的 NPC 留下而非走完退场。
- **entering**:朝 home 走;到了 → living。
- **leaving**:朝 door 走;到门口后再 fade,fade 到 0 → `onExited`。

```ts
      if (leavingRef.current && phase.current !== "leaving") {
        phase.current = "leaving";
      } else if (!leavingRef.current && phase.current === "leaving") {
        // critical 修复:归档淡出未完成时又被取消归档(再激活竞态)。回到 living,
        // 复原 alpha,清掉 exited —— 否则相位永远卡在 leaving、fade 到 0 后误报退场。
        phase.current = "living";
        exited.current = false;
        root.alpha = 1;
        pauseLeft.current = randPauseFrames();
      }

      let nowMoving = false;
      if (phase.current === "leaving") {
        // 先走到门口,再淡出。
        const s = stepToward(pos.current, doorRef.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          root.alpha -= FADE_PER_FRAME * dt;
          if (root.alpha <= 0 && !exited.current) {
            exited.current = true;
            onExited(id);
          }
        }
      } else if (phase.current === "entering") {
        // 从门口走进 home;到了就开始 living。
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          phase.current = "living";
          pauseLeft.current = randPauseFrames();
        }
      } else if (pauseLeft.current > 0) {
        pauseLeft.current -= dt;
      } else {
        const s = stepToward(pos.current, target.current, SPEED);
        pos.current = { x: s.x, y: s.y };
        facing.current = faceDir(s.vx, facing.current);
        nowMoving = !s.arrived;
        if (s.arrived) {
          pauseLeft.current = randPauseFrames();
          target.current = pickWanderTarget(
            homeRef.current,
            radius,
            boundsRef.current,
          );
        }
      }
```

(注:删掉原 `entering` 分支里基于 alpha 的淡入逻辑 —— 现在是 alpha=1 直接走入。`FADE_PER_FRAME` 仍用于 leaving 的淡出,保留常量。)

把 `tick` 的依赖数组补上不会变的引用即可(`door` 经 `doorRef` 读,无需进依赖;保持现有 `[id, radius, onExited, idleFrames, runFrames, motionRef, status]`)。

- [ ] **Step 3: 改 `[E]` 提示文案**

把底部提示(约 285-293 行)的 `text="[E] 进入"` 改成 `text="[E] 信息"`(E/Enter 实际只打开信息卡,见 `Overworld.tsx` 键处理与 spec §交互)。

- [ ] **Step 4: 改 `Overworld.tsx` —— actor 携带 door 并下传**

(a) `NpcDesc` 类型(约 38 行)加 `door`:

```ts
type NpcDesc = { hero: string; home: Pos; bounds: Bounds; door: Pos };
```

(b) `NpcActor` 接口(约 61-67 行)加 `door: Pos;`。

(c) `desired` useMemo 里构造每个 NPC 描述时(约 132-138 行)带上 `door: room.doorPx`:

```ts
        m.set(id, {
          hero: sessionHero(id),
          home: spreadHome(room.anchorPx, room.boundsPx, k, ids.length),
          bounds: room.boundsPx,
          door: room.doorPx,
        });
```

(d) reconcile 的「位置/bounds 变化」判定(约 161-169 行)把 door 一并纳入「want 变了就更新」:既有逻辑用 `...want` 覆盖,无需单独比 door —— 但要确保 door 变化也触发更新。保险起见,把 `a.bounds !== want.bounds` 那行的条件扩展为也比较 door:

```ts
        if (
          a.leaving ||
          a.home.x !== want.home.x ||
          a.home.y !== want.home.y ||
          a.bounds !== want.bounds ||
          a.door.x !== want.door.x ||
          a.door.y !== want.door.y
        ) {
          changed = true;
          return { ...a, leaving: false, ...want };
        }
```

(e) 渲染 `SessionNpc` 时把 `door` 传下去(约 286-301 行的 props 里加):

```tsx
              home={a.home}
              bounds={a.bounds}
              door={a.door}
```

- [ ] **Step 5: 改 `Overworld.tsx` —— window blur 清按键(low)**

根因:聚焦聊天输入前已按住的方向键不会被清(down handler 在 typing 时只是不再 ADD),主角会一直滑。在键盘 `useEffect`(约 222-254 行)里增加 blur 监听并清空 `keysRef`:

```ts
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    // 焦点离开画布(进输入框 / 切窗口)时清空按键,否则已按住的方向键会让主角持续滑动。
    const blur = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
```

并在 `down` 的 typing-guard 分支里顺手清一次(进输入框瞬间):把 `if (typing()) return;` 改为:

```ts
      if (typing()) {
        keysRef.current.clear();
        return;
      }
```

- [ ] **Step 6: 校验 + 构建**

Run: `bun run check && bun test && bun run build`
Expected: check 干净、`bun test` 全绿(81+)、build 成功。若 `bun test` 数量较前增加,是 Task 1-4 加的用例,正常。

- [ ] **Step 7: 提交**

```bash
git add src/web/overworld/SessionNpc.tsx src/web/overworld/Overworld.tsx
git commit -m "fix: 🩹 door-walk NPC entrances/exits and recover from the leaving-latch race"
```

---

### Task 6: Player 0→1 项目卡死修复 + useLayoutEffect 落座(high)

**Files:**
- Modify: `src/web/overworld/Overworld.tsx`(`<Player>` 加 key)
- Modify: `src/web/overworld/Player.tsx`(seed 改 `useLayoutEffect`)

根因:0 项目时 `generateWorld([])` 全是 void,spawn 落世界中心(不可走);`<Player>` 无 key、mount-once seed 只跑一次,首个房间出现后 `pos` 仍在不可走 tile → 逐轴碰撞全挡 + A* 起点不可走返回 null → 必须刷新才能动。修法:把 Player 绑到「世界是否非空」的 key,0→1 时 remount 让 seed 用新 spawn 重跑。

- [ ] **Step 1: 改 `Overworld.tsx` —— Player 加 remount key**

在渲染 `<Player ... />`(约 303-311 行)处加 `key`:

```tsx
        <Player
          key={world.rooms.length > 0 ? "live" : "empty"}
          world={world}
          spawn={spawn}
          playerPosRef={playerPosRef}
          keysRef={keysRef}
          pathRef={pathRef}
          worldRootRef={worldRootRef}
          viewRef={viewRef}
        />
```

(key 只在 0↔1 边界翻转 —— 加第 2、3 个房间不会重挂,不影响主角位置。)

- [ ] **Step 2: 改 `Player.tsx` —— seed 改 useLayoutEffect**

顶部 import 增加 `useLayoutEffect`:

```ts
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
```

把「Seed at spawn once」那个 `useEffect`(约 70-78 行)改成 `useLayoutEffect`(其余 body 不变):

```ts
  // Seed at spawn once, before first paint (mirrors room/Character.tsx:120).
  // Remounted via key on the 0->1 project transition so spawn lands on floor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once seed
  useLayoutEffect(() => {
    pos.current = { ...spawn };
    const root = rootRef.current;
    if (root) root.position.set(pos.current.x, pos.current.y);
    if (playerPosRef.current) {
      playerPosRef.current.x = pos.current.x;
      playerPosRef.current.y = pos.current.y;
    }
  }, []);
```

(下面那个 `s.anchor.set` 的 `useEffect` 保持不变。)

- [ ] **Step 3: 校验 + 构建**

Run: `bun run check && bun run build`
Expected: 干净 + 成功。

- [ ] **Step 4: 提交**

```bash
git add src/web/overworld/Overworld.tsx src/web/overworld/Player.tsx
git commit -m "fix: 🩹 re-seed the player onto floor after the first room appears"
```

---

### Task 7: 进入内景后该会话被归档/删除 → 回落大厅(low-invariant)

**Files:**
- Modify: `src/web/App.tsx`

根因:进入某会话内景(`view = {interior: id}`)后,若它被 LRU 软归档或删除,没有任何东西把视图拉回 —— `App` 仍渲染该会话的 `<Room/>`,而它的大厅 NPC 已离场,用户被困在「幽灵内景」。两个 store 故意解耦,reducer 看不到 ui-store,需在 `App` 协调。

- [ ] **Step 1: 实现 —— App 监听内景会话存活,失活即 exitOverworld**

在 `App.tsx` 顶部 import 处补上 store hooks:

```ts
import { useEffect } from "react";
import { Hud } from "./hud/Hud";
import { NpcCard } from "./hud/NpcCard";
import { Overworld } from "./overworld/Overworld";
import { Room } from "./room/Room";
import { useRoomStore } from "./store";
import { useUiStore } from "./ui-store";
import { connectRoom } from "./ws-client";
```

在 `App()` 里(`exitOverworld` 取出之后)加派生选择 + 守卫 effect:

```ts
  const view = useUiStore((s) => s.view);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const inInterior = view !== "overworld";
  const interiorId = typeof view === "object" ? view.interior : null;
  // 内景会话是否已不可见(被软归档或硬删除)。缺失 → 视作已离场。
  const interiorGone = useRoomStore((s) =>
    interiorId ? (s.sessions[interiorId]?.archived ?? true) : false,
  );

  // 进入内景后该会话被 LRU 归档 / 删除 → 自动回落大厅,避免困在幽灵内景
  // (spec §架构: 双层缩放;§生命周期: ≤10/LRU 软归档)。
  useEffect(() => {
    if (interiorId && interiorGone) exitOverworld();
  }, [interiorId, interiorGone, exitOverworld]);
```

(保留既有的 `connectRoom` effect 和 Esc effect 不变。)

- [ ] **Step 2: 校验 + 构建**

Run: `bun run check && bun run build`
Expected: 干净 + 成功。

- [ ] **Step 3: 提交**

```bash
git add src/web/App.tsx
git commit -m "fix: 🩹 drop back to the lobby when the entered session is archived or deleted"
```

---

### Task 8: NpcCard 子智能体按状态分桶展示(low)

**Files:**
- Modify: `src/web/hud/NpcCard.tsx`

根因:信息卡只显示 subagent 总数 + 单一「工作中」计数;spec 要「subagent 数 + 各状态」。补一个非零状态分桶。

- [ ] **Step 1: 实现 —— 按状态聚合**

把 `working` 那行(约 45 行)替换为按 `AgentStatus` 聚合:

```ts
  const subagents = Object.values(session.agents).filter(
    (a) => a.kind === "subagent",
  );
  // 各状态分桶(spec §生命周期/信息卡: task 摘要 = subagent 数 + 各状态),只显示非零桶。
  const STATUS_TALLY: Record<string, string> = {
    working: "工作",
    thinking: "思考",
    idle: "待命",
    spawning: "启动",
    done: "完成",
  };
  const tally = subagents.reduce<Record<string, number>>((m, a) => {
    m[a.status] = (m[a.status] ?? 0) + 1;
    return m;
  }, {});
  const breakdown = Object.entries(STATUS_TALLY)
    .filter(([k]) => (tally[k] ?? 0) > 0)
    .map(([k, label]) => `${tally[k]} ${label}`)
    .join(" · ");
```

把渲染那行(约 109-112 行 `StatRow k="子智能体"`)的 `v` 改为:

```tsx
      <StatRow
        k="子智能体"
        v={`${subagents.length} 个${breakdown ? ` · ${breakdown}` : ""}`}
      />
```

- [ ] **Step 2: 校验 + 构建**

Run: `bun run check && bun run build`
Expected: 干净 + 成功。

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/NpcCard.tsx
git commit -m "feat: 🧩 break down NPC card subagent tally by status"
```

---

### Task 9: 文档注记 + removeSession 空房间注释(low)

**Files:**
- Modify: `docs/superpowers/specs/2026-06-04-overworld-hub-design.md`(§验证 附近)
- Modify: `src/web/store.ts`(`removeSession` 注释)

收尾把已落地的决策与已知 tradeoff 写进 spec,避免日后被当成回归 / 泄漏。

- [ ] **Step 1: spec §验证 增补三条注记**

在 spec 的「验证」相关段落(约 96 行「建第 11 个会话…」那条之后,或 §验证 列表末尾)追加:

```markdown
- **门动画**:NPC 入场从项目房间门口(`RoomBox.doorPx`,底边中央)走到 home,LRU/归档退场走回门口再淡出,再激活从退场中恢复继续驻留 —— 已实现(非淡入淡出占位)。
- **worktree 分组**:`project = git rev-parse --show-toplevel` 的 basename,故同一仓库的不同 worktree 落进**不同房间**,属有意行为;`cwd` 的 git 根 basename 为空(如 `/`)时回退到目录名,绝不产出无名空房间。
- **硬删除空房间**:`removeSession` 不动 `projectOrder`(追加式、保证已存在房间不挪位),故删掉某项目最后一个会话后,该项目仍留一个空房间直到刷新页面 —— 已接受的 tradeoff,非泄漏。
```

- [ ] **Step 2: store.ts removeSession 补注释**

在 `removeSession`(约 304-314 行)的实现里、`delete sessions[id]` 上方加一行注释:

```ts
      const sessions = { ...st.sessions };
      // 注:不修剪 projectOrder(追加式、保证既有房间不挪位),删掉某项目最后一个
      // 会话会留下一个空房间直到刷新 —— 已接受的 tradeoff(见 spec §验证)。
      delete sessions[id];
```

- [ ] **Step 3: 校验**

Run: `bun run check && bun test`
Expected: 干净 + 全绿(文档改动不影响测试;store 注释不改行为)。

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/specs/2026-06-04-overworld-hub-design.md src/web/store.ts
git commit -m "docs: 📝 note door-anim, worktree rooms, and empty-room tradeoff"
```

---

## Self-Review(写完计划自查)

**1. Spec/review 覆盖** —— 16 条 review 发现 + 2 项用户决策逐条对照:
- permissionMode(medium + medium-invariant,同根)→ Task 1 ✅
- 错误占位偷槽位(high)→ Task 2 ✅
- LRU 时钟回拨/刚建会话(medium)→ Task 2 ✅
- projectFor 空 basename(medium 之一)→ Task 3 ✅;worktree 分组决策(用户选独立房间)→ Task 3 注释 + Task 9 spec ✅
- 门 doorPx(基础)→ Task 4 ✅
- NPC leaving 锁死(critical)→ Task 5 ✅
- 门动画入场/退场/走回(用户选实现 + spec line 60-61)→ Task 4+5 ✅
- `[E] 进入` 文案(low + medium 重复项)→ Task 5 ✅
- NPC seed useLayoutEffect(low)→ Task 5 ✅
- 失焦不清按键(low)→ Task 5 ✅
- Player 0→1 卡死(high)→ Task 6 ✅;Player seed useLayoutEffect(low)→ Task 6 ✅
- 进入内景被 LRU 踢成幽灵(low-invariant)→ Task 7 ✅
- NpcCard 各状态分桶(low)→ Task 8 ✅
- removeSession 空房间(low)→ Task 9 注释+spec ✅
- cwd/project merge 优先级(low,reviewer 判「无需改」)→ 不动,已在 Task 9 spec 注记隐含覆盖;无遗漏。

**2. 占位符扫描** —— 各 step 均给完整代码 / 命令 / 期望;无 TBD/「类似 TaskN」/「适当处理」。

**3. 类型一致性** —— `doorPx`(worldgen Task 4)↔ `NpcDesc.door`/`NpcActor.door`/`SessionNpc` 的 `door` prop(Task 5)命名一致;`enforceActiveCap(sessions, protectId?)` 在 create 与 unarchive 两处调用签名一致(Task 2);`permissionMode?: string` 载荷字段(Task 1)与 `events.ts:33` 既有 `permissionMode: string` 兼容。

**4. 任务顺序** —— 纯逻辑/基础(1 store · 2 store · 3 engine · 4 worldgen)先行;组件依赖基础(5 用 4 的 doorPx;6/7/8 独立)在后;9 文档收尾。每个 task 自身 build/test 绿。
