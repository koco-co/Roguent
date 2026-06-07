# Chat Window Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通聊天窗口的交互提问双向通道（权限审批 + AskUserQuestion），并完整实现转录增强（流式、思考块、工具卡、停止按钮、斜杠补全、消息操作）。

**Architecture:** Phase 0 把 `Session.messages` 迁移到统一时间线 `timeline: TimelineItem[]`，让后两阶段共用地基。Phase 1 在 Driver 里加 `canUseTool` 挂起 Promise 回路，把权限/问题卡片通过 WS 命令双向打通。Phase 2 在 normalize 层捕获 stream_event / thinking / 工具卡，前端用拆出的子组件渲染。

**Tech Stack:** Bun + TypeScript, React 19, Zustand, `@anthropic-ai/claude-agent-sdk`, bun:test, Biome

---

## 文件结构

### 新建
- `src/web/hud/TimelineItem.tsx` — 按 `kind` dispatch 渲染的路由组件
- `src/web/hud/MessageBubble.tsx` — 文本气泡 + Markdown + 操作栏
- `src/web/hud/ThinkingBlock.tsx` — 折叠/展开的思考块
- `src/web/hud/ToolCard.tsx` — 折叠/展开的工具调用卡片
- `src/web/hud/PromptCard.tsx` — 权限审批 / AskUserQuestion 可点卡片
- `src/web/hud/SlashMenu.tsx` — `/` 触发的斜杠命令浮层

### 修改
- `src/shared/domain.ts` — 新增 `TimelineItem` 判别联合 + 更新 `Session`
- `src/shared/events.ts` — 新增事件类型 + payload 形状
- `src/engine/normalize.ts` — AskUserQuestion 特判 + thinking 捕获 + stream_event
- `src/engine/driver.ts` — `canUseTool` 回调 + `pendingPrompts` map + `respondPermission`
- `src/engine/session.ts` — 路由新命令到 Driver
- `src/engine/ws-gateway.ts` — 扩展 Command 联合 + parseCommand + onCommand
- `src/web/store.ts` — reduce 处理新事件 + timeline 迁移 + appendUserMessage
- `src/web/hud/ChatDrawer.tsx` — 渲染 timeline + 停止按钮 + textarea + SlashMenu

### 测试文件
- `src/shared/domain.test.ts` — 新增 TimelineItem 辅助函数测试
- `src/engine/normalize.test.ts` — AskUserQuestion / thinking 映射测试
- `src/engine/driver.test.ts` — canUseTool / respondPermission 测试
- `src/web/store.test.ts` — timeline reduce 测试

---

## Phase 0 · 统一时间线地基

### Task 1: 在 domain.ts 中添加 TimelineItem 类型

**Files:**
- Modify: `src/shared/domain.ts`
- Test: `src/shared/domain.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/shared/domain.test.ts` 末尾添加：

```ts
import { expect, test } from "bun:test";
import { createSession } from "./domain";

test("createSession initializes timeline as empty array", () => {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  expect(s.timeline).toEqual([]);
  // messages 字段已移除
  expect((s as unknown as Record<string, unknown>).messages).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/poco/Projects/Roguent && bun test src/shared/domain.test.ts
```

期望：FAIL — `s.timeline` 为 undefined（因为尚未添加该字段）。

- [ ] **Step 3: 在 domain.ts 中添加类型 + 更新 Session**

在 `src/shared/domain.ts` 中，将 `ChatMessage` 接口及其之后添加以下内容，并修改 `Session`：

```ts
// ── Timeline types ──

export interface PermissionPromptData {
  toolName: string;
  inputSummary: string;
  title?: string;
  displayName?: string;
  description?: string;
  agentId?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionData {
  questions: Array<{
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
  }>;
}

export interface TimelineMessageItem {
  kind: "message";
  id: string;
  role: ChatRole;
  agentId?: string;
  text: string;
  ts: number;
}

export interface TimelineThinkingItem {
  kind: "thinking";
  id: string;
  agentId?: string;
  text: string;
  ts: number;
}

export interface TimelineToolItem {
  kind: "tool";
  id: string;  // toolUseId
  toolName: string;
  inputSummary: string;
  status: "running" | "ok" | "failed";
  agentId?: string;
  ts: number;
}

export interface TimelinePromptItem {
  kind: "prompt";
  id: string;  // promptId (= toolUseId for permissions)
  promptKind: "permission" | "question";
  data: PermissionPromptData | QuestionData;
  status: "pending" | "answered" | "dismissed";
  ts: number;
}

export type TimelineItem =
  | TimelineMessageItem
  | TimelineThinkingItem
  | TimelineToolItem
  | TimelinePromptItem;
```

在 `Session` 接口中，将 `messages: ChatMessage[];` 替换为 `timeline: TimelineItem[];`。

在 `createSession` 的默认值中，将 `messages: [],` 替换为 `timeline: [],`。

删除 `ChatMessage` 接口（已不再需要，被 `TimelineMessageItem` 替代）。

- [ ] **Step 4: 运行测试确认通过**

```bash
bun test src/shared/domain.test.ts
```

期望：PASS。

- [ ] **Step 5: 运行类型检查**

```bash
bunx tsc --noEmit
```

期望：有错误（store.ts 和 ChatDrawer 仍使用 `messages`）— 正常，后续 task 修复。

- [ ] **Step 6: 提交**

```bash
git add src/shared/domain.ts src/shared/domain.test.ts
git commit -m "feat: 🧩 add TimelineItem discriminated union to domain"
```

---

### Task 2: 扩展 events.ts — 添加新事件类型

**Files:**
- Modify: `src/shared/events.ts`

- [ ] **Step 1: 写失败测试**

在 `src/shared/events.test.ts` 中添加（如该文件存在；如不存在则创建）：

```ts
import { expect, test } from "bun:test";

test("new event types are string literals", () => {
  // 确保字符串常量存在于类型系统,编译通过即是测试通过
  const types = [
    "thinking.delta",
    "thinking.final",
    "prompt.requested",
    "prompt.resolved",
  ] as const;
  expect(types).toHaveLength(4);
});
```

- [ ] **Step 2: 运行测试确认通过（这个测试不依赖类型系统，会直接通过）**

```bash
bun test src/shared/events.test.ts
```

- [ ] **Step 3: 更新 events.ts**

在 `RoomEventType` 联合中，在 `"todos.updated"` 之后添加：

```ts
  | "thinking.delta"
  | "thinking.final"
  | "prompt.requested"
  | "prompt.resolved"
```

在文件末尾，在 `isToolEvent` 之前添加新 payload 类型：

```ts
export interface ThinkingPayload {
  text: string;
}

export interface PromptRequestedPayload {
  promptId: string;
  promptKind: "permission" | "question";
  data: import("./domain").PermissionPromptData | import("./domain").QuestionData;
}

export interface PromptResolvedPayload {
  promptId: string;
  result: "answered" | "dismissed";
}
```

- [ ] **Step 4: 运行类型检查**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add src/shared/events.ts src/shared/events.test.ts
git commit -m "feat: 🧩 add thinking/prompt event types to events.ts"
```

---

### Task 3: 迁移 store.ts — messages → timeline

**Files:**
- Modify: `src/web/store.ts`
- Modify: `src/web/store.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/web/store.test.ts` 中，将所有 `messages` 引用替换为 `timeline`，并将 `ChatMessage` 检查改为 `TimelineMessageItem` 的 `kind` 检查。具体：

找到：
```ts
expect(st.sessions.s1?.messages).toHaveLength(1);
expect(st.sessions.s1?.messages[0]?.text).toBe("first reply");
```
改为：
```ts
expect(st.sessions.s1?.timeline).toHaveLength(1);
expect(st.sessions.s1?.timeline[0]?.kind).toBe("message");
expect((st.sessions.s1?.timeline[0] as { text: string })?.text).toBe("first reply");
```

对文件中所有其他 `messages` 引用做类似更新（全局搜索 `.messages` 替换为 `.timeline`）。

然后添加新的 timeline 测试：

```ts
test("message.delta builds timeline message item, streaming replaces last assistant", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(st, ev({
    type: "message.delta",
    agentId: ORCHESTRATOR_ID,
    payload: { text: "hello" },
  }));
  expect(st.sessions.s1?.timeline).toHaveLength(1);
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("message");
  expect((item as { text: string })?.text).toBe("hello");

  // streaming: second delta from same agent replaces (not appends)
  st = reduce(st, ev({
    type: "message.delta",
    agentId: ORCHESTRATOR_ID,
    payload: { text: "hello world" },
  }));
  expect(st.sessions.s1?.timeline).toHaveLength(1);
  expect((st.sessions.s1?.timeline[0] as { text: string })?.text).toBe("hello world");
});

test("prompt.requested adds pending prompt item", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(st, ev({
    type: "prompt.requested",
    payload: {
      promptId: "p1",
      promptKind: "permission",
      data: { toolName: "Bash", inputSummary: "ls" },
    },
  }));
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("prompt");
  expect((item as { status: string })?.status).toBe("pending");
});

test("prompt.resolved marks prompt as answered", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(st, ev({
    type: "prompt.requested",
    payload: { promptId: "p1", promptKind: "permission", data: { toolName: "Bash", inputSummary: "" } },
  }));
  st = reduce(st, ev({
    type: "prompt.resolved",
    payload: { promptId: "p1", result: "answered" },
  }));
  const item = st.sessions.s1?.timeline[0];
  expect((item as { status: string })?.status).toBe("answered");
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test src/web/store.test.ts
```

- [ ] **Step 3: 更新 store.ts**

**A) 更新导入**：将 `import type { Loot, ... } from "../shared/domain"` 中的引入列表添加 `TimelineItem`, `TimelineMessageItem`, `TimelinePromptItem`, `TimelineToolItem`；移除 `ChatMessage` 导入（如有）。

**B) 更新 `Session` 类型使用**：已在 domain.ts 改好，store 只需消费。

**C) 更新 `reduce` 函数**：

将 `session.error` 处理块中的 `messages` 改为 `timeline`：

```ts
// session.error handler 里:
const item: TimelineMessageItem = {
  kind: "message",
  id: String(e.seq),
  role: "system",
  text: p.message,
  ts: e.ts,
};
sessions[e.sessionId] = {
  ...base,
  status: "error",
  timeline: [...base.timeline, item],
};
```

将 `message.delta` / `message.final` case 替换：

```ts
case "message.delta":
case "message.final": {
  const p = e.payload as { text: string; role?: "user" | "assistant" };
  const role = p.role ?? "assistant";
  if (!p.text) break;
  const last = s.timeline[s.timeline.length - 1];
  const lastIsMsg = last?.kind === "message";
  if (
    role === "assistant" &&
    lastIsMsg &&
    (last as TimelineMessageItem).role === "assistant" &&
    (last as TimelineMessageItem).agentId === e.agentId
  ) {
    s.timeline = [
      ...s.timeline.slice(0, -1),
      { ...last, text: p.text } as TimelineMessageItem,
    ];
  } else {
    const item: TimelineMessageItem = {
      kind: "message",
      id: String(e.seq),
      role,
      agentId: role === "user" ? undefined : e.agentId,
      text: p.text,
      ts: e.ts,
    };
    s.timeline = [...s.timeline, item];
  }
  break;
}
```

在 `default: break;` 之前添加新 case：

```ts
case "prompt.requested": {
  const p = e.payload as import("../shared/events").PromptRequestedPayload;
  const item: TimelinePromptItem = {
    kind: "prompt",
    id: p.promptId,
    promptKind: p.promptKind,
    data: p.data,
    status: "pending",
    ts: e.ts,
  };
  s.timeline = [...s.timeline, item];
  break;
}
case "prompt.resolved": {
  const p = e.payload as import("../shared/events").PromptResolvedPayload;
  s.timeline = s.timeline.map((item) =>
    item.kind === "prompt" && item.id === p.promptId
      ? { ...item, status: p.result }
      : item,
  );
  break;
}
```

**D) 更新 `appendUserMessage`**：

```ts
appendUserMessage: (sessionId, text) =>
  set((st) => {
    const prev = st.sessions[sessionId];
    if (!prev) return st;
    const item: TimelineMessageItem = {
      kind: "message",
      id: `u-${prev.timeline.length}-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    return {
      sessions: {
        ...st.sessions,
        [sessionId]: {
          ...prev,
          lastActiveAt: Date.now(),
          timeline: [...prev.timeline, item],
        },
      },
    };
  }),
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/web/store.test.ts
```

期望：PASS。

- [ ] **Step 5: 全量测试**

```bash
bun test && bunx tsc --noEmit
```

期望：除 ChatDrawer（仍引用 `messages`）外全部通过。

- [ ] **Step 6: 提交**

```bash
git add src/web/store.ts src/web/store.test.ts
git commit -m "feat: 🧩 migrate Session.messages to timeline: TimelineItem[]"
```

---

### Task 4: 迁移 ChatDrawer.tsx + 新建 TimelineItem.tsx / MessageBubble.tsx

**Files:**
- Modify: `src/web/hud/ChatDrawer.tsx`
- Create: `src/web/hud/TimelineItem.tsx`
- Create: `src/web/hud/MessageBubble.tsx`

- [ ] **Step 1: 新建 MessageBubble.tsx**

创建 `src/web/hud/MessageBubble.tsx`：

```tsx
import type { TimelineMessageItem } from "../../shared/domain";
import type { Session } from "../../shared/domain";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
}

const authorName = (item: TimelineMessageItem, session: Session): string => {
  if (item.role === "user") return "你";
  return (
    (item.agentId ? session.agents[item.agentId]?.role : undefined) ??
    item.agentId ??
    item.role
  );
};

export function MessageBubble({ item, session }: Props) {
  return (
    <div className={`cmsg ${item.role === "user" ? "me" : "agent"}`}>
      <div className="cmsg-author px">{authorName(item, session)}</div>
      <div
        className="cmsg-bubble md"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染
        dangerouslySetInnerHTML={{ __html: mdToHtml(item.text) }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 新建 TimelineItem.tsx**

创建 `src/web/hud/TimelineItem.tsx`：

```tsx
import type { TimelineItem as TItem } from "../../shared/domain";
import type { Session } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";

interface Props {
  item: TItem;
  session: Session;
}

export function TimelineItem({ item, session }: Props) {
  if (item.kind === "message") {
    return <MessageBubble item={item} session={session} />;
  }
  // thinking / tool / prompt: rendered in later tasks
  return null;
}
```

- [ ] **Step 3: 更新 ChatDrawer.tsx**

将 `ChatDrawer.tsx` 中的：
- `import type { ChatMessage }` → 删除
- 渲染循环 `{messages?.map((m) => ...)}` → 改为：

```tsx
const timeline = session?.timeline;

// ...（保留其他 hooks 和逻辑）...

{timeline?.map((item) => (
  <TimelineItem key={item.id} item={item} session={session!} />
))}
```

更新 import 顶部添加：
```tsx
import { TimelineItem } from "./TimelineItem";
```

移除对 `ChatMessage` 类型的引用，移除 `authorName` 和 `messages` 变量（改为 `timeline`）。

- [ ] **Step 4: 运行检查**

```bash
bun test && bun run check && bunx tsc --noEmit
```

期望：全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/web/hud/ChatDrawer.tsx src/web/hud/TimelineItem.tsx src/web/hud/MessageBubble.tsx
git commit -m "feat: 🧩 render timeline in ChatDrawer via TimelineItem/MessageBubble"
```

---

## Phase 1 · 交互提问双向通道

### Task 5: Driver 添加 canUseTool + respondPermission

**Files:**
- Modify: `src/engine/driver.ts`
- Modify: `src/engine/driver.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/engine/driver.test.ts` 末尾添加：

```ts
import { Driver } from "./driver";
import type { DraftEvent } from "./normalize";

test("canUseTool callback fires prompt.requested, respondPermission resolves it", async () => {
  const drafts: DraftEvent[] = [];
  const driver = new Driver(
    { onDraft: (ds) => drafts.push(...ds) },
    "m",
    "/tmp",
  );

  // 模拟 SDK 调用 canUseTool
  const canUseTool = (driver as unknown as Record<string, unknown>)["_canUseTool"] as Function;
  // 在真实 start() 之前通过内部方法测试
  const pendingResult = driver.askPermission({
    toolName: "Bash",
    input: { command: "ls" },
    toolUseID: "t1",
    title: "Run bash command",
    displayName: "Bash",
    description: "ls in /tmp",
    agentID: undefined,
  });

  // prompt.requested draft should have been emitted
  expect(drafts.some((d) => d.type === "prompt.requested")).toBe(true);
  const draft = drafts.find((d) => d.type === "prompt.requested");
  expect((draft?.payload as { promptId: string })?.promptId).toBe("t1");

  // resolve it
  driver.respondPermission("t1", { behavior: "allow" });
  const result = await pendingResult;
  expect(result.behavior).toBe("allow");
});

test("Driver.respondPermission with deny works", async () => {
  const drafts: DraftEvent[] = [];
  const driver = new Driver({ onDraft: (ds) => drafts.push(...ds) }, "m", "/tmp");
  const p = driver.askPermission({
    toolName: "Write",
    input: {},
    toolUseID: "t2",
  });
  driver.respondPermission("t2", { behavior: "deny", message: "rejected" });
  const result = await p;
  expect(result.behavior).toBe("deny");
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test src/engine/driver.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: 更新 driver.ts**

**A) 更新 import**：

```ts
import type {
  CanUseTool,
  Options,
  PermissionResult,
  Query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
```

**B) 在 `IDriver` 接口中添加新方法**：

```ts
export interface IDriver {
  start(): void;
  send(text: string): void;
  setModel(model: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
  getContextUsage(): Promise<{ totalTokens: number; maxTokens: number } | null>;
  // 权限审批:将挂起 Promise 暴露给 SessionManager 路由（测试也用）
  askPermission(opts: {
    toolName: string;
    input: Record<string, unknown>;
    toolUseID: string;
    title?: string;
    displayName?: string;
    description?: string;
    agentID?: string;
  }): Promise<PermissionResult>;
  respondPermission(promptId: string, result: PermissionResult): void;
}
```

**C) 在 `Driver` 类中添加字段和方法**：

```ts
private pendingPrompts = new Map<string, (r: PermissionResult) => void>();
```

在 `start()` 方法里的 `options` 对象中添加 `canUseTool` 字段：

```ts
const options: Options = {
  // ...existing fields...
  canUseTool: this.buildCanUseTool(),
};
```

添加新私有方法：

```ts
private buildCanUseTool(): CanUseTool {
  return async (toolName, input, opts) => {
    return this.askPermission({
      toolName,
      input,
      toolUseID: opts.toolUseID,
      title: opts.title,
      displayName: opts.displayName,
      description: opts.description,
      agentID: opts.agentID,
    });
  };
}
```

添加公共方法：

```ts
askPermission(opts: {
  toolName: string;
  input: Record<string, unknown>;
  toolUseID: string;
  title?: string;
  displayName?: string;
  description?: string;
  agentID?: string;
}): Promise<PermissionResult> {
  const { toolUseID, toolName, input, title, displayName, description, agentID } = opts;
  const { summarizeToolInput } = require("./normalize") as typeof import("./normalize");
  const inputSummary = summarizeToolInput(input);
  this.cb.onDraft(
    [
      {
        type: "prompt.requested",
        agentId: agentID,
        payload: {
          promptId: toolUseID,
          promptKind: "permission" as const,
          data: { toolName, inputSummary, title, displayName, description, agentId: agentID },
        },
      },
    ],
    Date.now(),
  );
  return new Promise<PermissionResult>((resolve) => {
    this.pendingPrompts.set(toolUseID, resolve);
  });
}

respondPermission(promptId: string, result: PermissionResult): void {
  const resolve = this.pendingPrompts.get(promptId);
  if (resolve) {
    this.pendingPrompts.delete(promptId);
    resolve(result);
  }
  this.cb.onDraft(
    [{ type: "prompt.resolved", payload: { promptId, result: "answered" } }],
    Date.now(),
  );
}
```

更新 `end()` 方法，在关闭时拒绝所有 pending：

```ts
end(): void {
  this.ended = true;
  this.resolveNext?.();
  this.resolveNext = null;
  // 兜底:会话结束时自动拒绝所有 pending 权限提示
  for (const [id, resolve] of this.pendingPrompts) {
    resolve({ behavior: "deny", message: "session ended" });
    this.cb.onDraft(
      [{ type: "prompt.resolved", payload: { promptId: id, result: "dismissed" } }],
      Date.now(),
    );
  }
  this.pendingPrompts.clear();
}
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/engine/driver.test.ts
```

期望：PASS。

- [ ] **Step 5: 全量检查**

```bash
bun test && bunx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/engine/driver.ts src/engine/driver.test.ts
git commit -m "feat: 🧩 add canUseTool/respondPermission to Driver"
```

---

### Task 6: normalize.ts — AskUserQuestion 特判

**Files:**
- Modify: `src/engine/normalize.ts`
- Modify: `src/engine/normalize.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/engine/normalize.test.ts` 末尾添加：

```ts
test("PreToolUse AskUserQuestion → prompt.requested(kind=question), NOT tool.started", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    agent_id: "ag-1",
    tool_use_id: "t-ask",
    tool_input: {
      questions: [
        {
          question: "Which approach?",
          header: "Approach",
          options: [
            { label: "A", description: "opt A" },
            { label: "B", description: "opt B" },
          ],
          multiSelect: false,
        },
      ],
    },
  });
  expect(drafts).toHaveLength(1);
  expect(drafts[0]?.type).toBe("prompt.requested");
  const p = drafts[0]?.payload as {
    promptId: string;
    promptKind: string;
    data: { questions: unknown[] };
  };
  expect(p.promptId).toBe("t-ask");
  expect(p.promptKind).toBe("question");
  expect(p.data.questions).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test src/engine/normalize.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: 更新 normalize.ts 的 PreToolUse 分支**

在 `normalizeHook` 的 `case "PreToolUse":` 块中，在现有代码开头插入 AskUserQuestion 特判：

```ts
case "PreToolUse": {
  // AskUserQuestion 特判:不走普通工具卡,直接发 prompt.requested(kind=question)
  if (h.tool_name === "AskUserQuestion") {
    const input = (h.tool_input ?? {}) as Record<string, unknown>;
    const rawQs = Array.isArray(input.questions) ? input.questions : [];
    const questions = rawQs.map((q: unknown) => {
      const qi = (q ?? {}) as Record<string, unknown>;
      const rawOpts = Array.isArray(qi.options) ? qi.options : [];
      return {
        question: typeof qi.question === "string" ? qi.question : "",
        header: typeof qi.header === "string" ? qi.header : "",
        options: rawOpts.map((o: unknown) => {
          const oi = (o ?? {}) as Record<string, unknown>;
          return {
            label: typeof oi.label === "string" ? oi.label : "",
            description: typeof oi.description === "string" ? oi.description : undefined,
          };
        }),
        multiSelect: typeof qi.multiSelect === "boolean" ? qi.multiSelect : false,
      };
    });
    return [
      {
        type: "prompt.requested",
        agentId: h.agent_id ?? ORCHESTRATOR_ID,
        payload: {
          promptId: h.tool_use_id ?? "",
          promptKind: "question" as const,
          data: { questions },
        },
      },
    ];
  }

  const drafts: DraftEvent[] = [
    // ...existing tool.started code (no change)...
  ];
  // ...rest of PreToolUse unchanged...
}
```

- [ ] **Step 4: 运行测试**

```bash
bun test src/engine/normalize.test.ts
```

期望：PASS。

- [ ] **Step 5: 全量检查**

```bash
bun test && bunx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/engine/normalize.ts src/engine/normalize.test.ts
git commit -m "feat: 🧩 special-case AskUserQuestion to prompt.requested in normalize"
```

---

### Task 7: 扩展 ws-gateway.ts + session.ts — 新命令路由

**Files:**
- Modify: `src/engine/ws-gateway.ts`
- Modify: `src/engine/session.ts`

- [ ] **Step 1: 写失败测试（gateway parseCommand）**

在 `src/engine/ws-gateway.test.ts` 末尾添加（如该文件存在，否则创建）：

```ts
import { expect, test } from "bun:test";
import { parseCommand } from "./ws-gateway";

test("parseCommand respondPermission valid", () => {
  const c = parseCommand(
    JSON.stringify({ cmd: "respondPermission", sessionId: "s1", promptId: "p1", behavior: "allow" }),
  );
  expect(c?.cmd).toBe("respondPermission");
});

test("parseCommand respondQuestion valid", () => {
  const c = parseCommand(
    JSON.stringify({ cmd: "respondQuestion", sessionId: "s1", promptId: "p1", selectedLabels: ["A"] }),
  );
  expect(c?.cmd).toBe("respondQuestion");
});

test("parseCommand setPermissionMode valid", () => {
  const c = parseCommand(
    JSON.stringify({ cmd: "setPermissionMode", sessionId: "s1", mode: "acceptEdits" }),
  );
  expect(c?.cmd).toBe("setPermissionMode");
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test src/engine/ws-gateway.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: 更新 ws-gateway.ts**

在 `Command` 联合中添加新变体：

```ts
export type Command =
  | { cmd: "newSession"; sessionId: string; title: string; model: string; cwd?: string }
  | { cmd: "sendMessage"; sessionId: string; text: string }
  | { cmd: "setModel"; sessionId: string; model: string }
  | { cmd: "interrupt"; sessionId: string }
  | { cmd: "deleteSession"; sessionId: string }
  | { cmd: "listLocalSessions" }
  | { cmd: "importSession"; path: string }
  // ── 新增 ──
  | { cmd: "respondPermission"; sessionId: string; promptId: string; behavior: "allow" | "deny"; message?: string }
  | { cmd: "respondQuestion"; sessionId: string; promptId: string; selectedLabels: string[] }
  | { cmd: "setPermissionMode"; sessionId: string; mode: string };
```

在 `parseCommand` 的 `switch` 中添加新 case（在 `default: return null;` 之前）：

```ts
case "respondPermission":
  return typeof o.sessionId === "string" &&
    typeof o.promptId === "string" &&
    (o.behavior === "allow" || o.behavior === "deny")
    ? (o as Command)
    : null;
case "respondQuestion":
  return typeof o.sessionId === "string" &&
    typeof o.promptId === "string" &&
    Array.isArray(o.selectedLabels)
    ? (o as Command)
    : null;
case "setPermissionMode":
  return typeof o.sessionId === "string" && typeof o.mode === "string"
    ? (o as Command)
    : null;
```

在 `onCommand` 中添加路由（在 `else if (c.cmd === "importSession")` 之后）：

```ts
else if (c.cmd === "respondPermission") {
  const result = c.behavior === "allow"
    ? { behavior: "allow" as const }
    : { behavior: "deny" as const, message: c.message ?? "denied" };
  this.mgr.respondPermission(c.sessionId, c.promptId, result);
}
else if (c.cmd === "respondQuestion") {
  this.mgr.respondQuestion(c.sessionId, c.promptId, c.selectedLabels);
}
else if (c.cmd === "setPermissionMode") {
  void this.mgr.setPermissionMode(c.sessionId, c.mode);
}
```

- [ ] **Step 4: 更新 session.ts**

在 `SessionManager` 类中添加三个新方法：

```ts
respondPermission(
  id: string,
  promptId: string,
  result: import("@anthropic-ai/claude-agent-sdk").PermissionResult,
): void {
  this.drivers.get(id)?.respondPermission(promptId, result);
}

respondQuestion(id: string, promptId: string, selectedLabels: string[]): void {
  // 保底版:把所选项拼成消息发给 agent
  const text = selectedLabels.join("、");
  this.drivers.get(id)?.send(text);
  // 同时发 prompt.resolved 让 UI 更新状态
  this.emit(
    this.seq.stamp(id, "prompt.resolved", { promptId, result: "answered" }, Date.now()),
  );
}

async setPermissionMode(id: string, mode: string): Promise<void> {
  // SDK Query.setPermissionMode 存在;IDriver 不暴露,直接转到 Driver 实例
  const driver = this.drivers.get(id);
  if (driver && "setPermissionMode" in driver) {
    await (driver as unknown as { setPermissionMode(m: string): Promise<void> }).setPermissionMode(mode);
  }
}
```

同时更新 `IDriver` 接口中已有的 `respondPermission`（在 Task 5 中添加的）是否与此一致。

- [ ] **Step 5: 运行测试**

```bash
bun test src/engine/ws-gateway.test.ts && bun test && bunx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/engine/ws-gateway.ts src/engine/ws-gateway.test.ts src/engine/session.ts
git commit -m "feat: 🧩 add respondPermission/Question/setPermissionMode commands to gateway"
```

---

### Task 8: 创建 PromptCard.tsx + 接入 TimelineItem

**Files:**
- Create: `src/web/hud/PromptCard.tsx`
- Modify: `src/web/hud/TimelineItem.tsx`

- [ ] **Step 1: 创建 PromptCard.tsx**

创建 `src/web/hud/PromptCard.tsx`：

```tsx
import type {
  PermissionPromptData,
  QuestionData,
  TimelinePromptItem,
} from "../../shared/domain";
import { sendCommand } from "../ws-client";
import { useRoomStore } from "../store";

interface Props {
  item: TimelinePromptItem;
  sessionId: string;
}

export function PromptCard({ item, sessionId }: Props) {
  if (item.status !== "pending") {
    return (
      <div className="prompt-card resolved px faint" style={{ fontSize: 11 }}>
        {item.status === "answered" ? "✓ 已回答" : "✕ 已忽略"}
      </div>
    );
  }

  if (item.promptKind === "permission") {
    const data = item.data as PermissionPromptData;
    return (
      <div className="prompt-card permission glass">
        <div className="prompt-title px" style={{ fontSize: 12, fontWeight: 600 }}>
          {data.title ?? `允许使用 ${data.toolName}？`}
        </div>
        {data.description && (
          <div className="prompt-desc px faint" style={{ fontSize: 11 }}>
            {data.description}
          </div>
        )}
        {data.inputSummary && (
          <div className="prompt-summary px" style={{ fontSize: 11, fontFamily: "monospace" }}>
            {data.inputSummary}
          </div>
        )}
        <div className="prompt-actions" style={{ display: "flex", gap: 6, padding: "6px 8px" }}>
          <button
            type="button"
            className="pxbtn primary sm cjk"
            onClick={() =>
              sendCommand({
                cmd: "respondPermission",
                sessionId,
                promptId: item.id,
                behavior: "allow",
              })
            }
          >
            允许
          </button>
          <button
            type="button"
            className="pxbtn sm cjk"
            onClick={() =>
              sendCommand({
                cmd: "respondPermission",
                sessionId,
                promptId: item.id,
                behavior: "deny",
              })
            }
          >
            拒绝
          </button>
        </div>
      </div>
    );
  }

  // kind === "question"
  const data = item.data as QuestionData;
  return (
    <div className="prompt-card question glass">
      {data.questions.map((q, qi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: questions 顺序固定
        <div key={qi} style={{ marginBottom: 10 }}>
          <div className="px" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            {q.question}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 8px" }}>
            {q.options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="pxbtn sm cjk"
                title={opt.description}
                onClick={() =>
                  sendCommand({
                    cmd: "respondQuestion",
                    sessionId,
                    promptId: item.id,
                    selectedLabels: [opt.label],
                  })
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 更新 TimelineItem.tsx 路由 prompt kind**

在 `TimelineItem.tsx` 中添加 import 和 prompt 分支：

```tsx
import type { TimelineItem as TItem } from "../../shared/domain";
import type { Session } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";
import { PromptCard } from "./PromptCard";

interface Props {
  item: TItem;
  session: Session;
  sessionId: string;
}

export function TimelineItem({ item, session, sessionId }: Props) {
  if (item.kind === "message") {
    return <MessageBubble item={item} session={session} />;
  }
  if (item.kind === "prompt") {
    return <PromptCard item={item} sessionId={sessionId} />;
  }
  return null;
}
```

- [ ] **Step 3: 更新 ChatDrawer.tsx — 把 sessionId 传给 TimelineItem**

找到渲染循环中的 `<TimelineItem>` 用法，添加 `sessionId={currentId!}`：

```tsx
{timeline?.map((item) => (
  <TimelineItem
    key={item.id}
    item={item}
    session={session!}
    sessionId={currentId!}
  />
))}
```

同时更新 `sendCommand` 里的 `ws-client` 类型：若 `sendCommand` 的 `Command` 类型定义在 `ws-client.ts` 中，确保 `respondPermission` / `respondQuestion` 的类型包含在其接受的 union 里（与 ws-gateway 的 `Command` 对齐）。

- [ ] **Step 4: 运行检查**

```bash
bun run check && bunx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add src/web/hud/PromptCard.tsx src/web/hud/TimelineItem.tsx src/web/hud/ChatDrawer.tsx
git commit -m "feat: 🧩 add PromptCard for permission/question interactive prompts"
```

---

## Phase 2 · 转录增强

### Task 9: normalize.ts — thinking 块捕获 + store 处理

**Files:**
- Modify: `src/engine/normalize.ts`
- Modify: `src/engine/normalize.test.ts`
- Modify: `src/web/store.ts`
- Modify: `src/web/store.test.ts`

- [ ] **Step 1: 写失败测试（normalize）**

在 `src/engine/normalize.test.ts` 末尾添加：

```ts
test("assistant message with thinking block → both thinking.final and message.final", () => {
  const drafts = normalizeSdkMessage({
    type: "assistant",
    message: {
      content: [
        { type: "thinking", text: "let me reason..." },
        { type: "text", text: "final answer" },
      ],
    },
  });
  const types = drafts.map((d) => d.type);
  expect(types).toContain("thinking.final");
  expect(types).toContain("message.delta");
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test src/engine/normalize.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: 更新 normalizeSdkMessage 捕获 thinking 块**

在 `normalizeSdkMessage` 的 `if (m.type === "assistant")` 块中，修改内容处理：

```ts
if (m.type === "assistant") {
  const content = m.message?.content ?? [];
  const results: DraftEvent[] = [];

  // 捕获 thinking 块(被动,不开扩展思考)
  const thinkingText = content
    .filter((b) => b.type === "thinking")
    .map((b) => b.text ?? "")
    .join("");
  if (thinkingText) {
    results.push({
      type: "thinking.final",
      agentId: m.parent_tool_use_id ? undefined : ORCHESTRATOR_ID,
      payload: { text: thinkingText },
    });
  }

  // 文本块(原有逻辑)
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (text) {
    results.push({
      type: "message.delta",
      agentId: m.parent_tool_use_id ? undefined : ORCHESTRATOR_ID,
      payload: { text },
    });
  }

  return results;
}
```

- [ ] **Step 4: 更新 store.ts 处理 thinking 事件**

在 `reduce` 函数的 `switch` 中（在 `prompt.resolved` 之后），添加：

```ts
case "thinking.delta":
case "thinking.final": {
  const p = e.payload as { text: string };
  if (!p.text) break;
  const lastThinking = [...s.timeline].reverse().find(
    (i) => i.kind === "thinking" && (i as { agentId?: string }).agentId === e.agentId,
  );
  if (lastThinking) {
    s.timeline = s.timeline.map((item) =>
      item === lastThinking ? { ...item, text: p.text } : item,
    );
  } else {
    s.timeline = [
      ...s.timeline,
      {
        kind: "thinking" as const,
        id: String(e.seq),
        agentId: e.agentId,
        text: p.text,
        ts: e.ts,
      },
    ];
  }
  break;
}
```

- [ ] **Step 5: 写 store 测试并运行**

在 `src/web/store.test.ts` 末尾添加：

```ts
test("thinking.final adds thinking item to timeline", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(st, ev({
    type: "thinking.final",
    agentId: ORCHESTRATOR_ID,
    payload: { text: "hmm..." },
  }));
  const item = st.sessions.s1?.timeline[0];
  expect(item?.kind).toBe("thinking");
  expect((item as { text: string })?.text).toBe("hmm...");
});
```

```bash
bun test src/engine/normalize.test.ts src/web/store.test.ts
```

期望：PASS。

- [ ] **Step 6: 提交**

```bash
git add src/engine/normalize.ts src/engine/normalize.test.ts src/web/store.ts src/web/store.test.ts
git commit -m "feat: 🧩 capture thinking blocks in normalize + store"
```

---

### Task 10: 创建 ThinkingBlock.tsx + ToolCard.tsx

**Files:**
- Create: `src/web/hud/ThinkingBlock.tsx`
- Create: `src/web/hud/ToolCard.tsx`
- Modify: `src/web/hud/TimelineItem.tsx`

- [ ] **Step 1: 创建 ThinkingBlock.tsx**

```tsx
import { useState } from "react";
import type { TimelineThinkingItem } from "../../shared/domain";

export function ThinkingBlock({ item }: { item: TimelineThinkingItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-hd px"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--gold)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>思考过程</span>
      </button>
      {open && (
        <div
          className="thinking-body scroll"
          style={{
            fontSize: 11,
            color: "var(--text)",
            opacity: 0.7,
            whiteSpace: "pre-wrap",
            padding: "4px 8px",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {item.text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 ToolCard.tsx**

```tsx
import { useState } from "react";
import type { TimelineToolItem } from "../../shared/domain";

const statusIcon = (s: TimelineToolItem["status"]) =>
  s === "running" ? "⋯" : s === "ok" ? "✓" : "✗";

export function ToolCard({ item }: { item: TimelineToolItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tool-card ${item.status}`} style={{ fontSize: 11 }}>
      <button
        type="button"
        className="tool-hd px"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
          padding: "4px 0",
          width: "100%",
          textAlign: "left",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: "var(--gold)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ opacity: 0.6 }}>{statusIcon(item.status)}</span>
        <span style={{ fontFamily: "monospace" }}>{item.toolName}</span>
        {!open && (
          <span className="faint" style={{ marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {item.inputSummary}
          </span>
        )}
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: "4px 8px",
            fontSize: 10,
            color: "var(--text)",
            opacity: 0.8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {item.inputSummary || "(no input)"}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 接入 TimelineItem.tsx**

更新 `src/web/hud/TimelineItem.tsx`：

```tsx
import type { TimelineItem as TItem } from "../../shared/domain";
import type { Session } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";
import { PromptCard } from "./PromptCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCard } from "./ToolCard";

interface Props {
  item: TItem;
  session: Session;
  sessionId: string;
}

export function TimelineItem({ item, session, sessionId }: Props) {
  if (item.kind === "message") return <MessageBubble item={item} session={session} />;
  if (item.kind === "thinking") return <ThinkingBlock item={item} />;
  if (item.kind === "tool") return <ToolCard item={item} />;
  if (item.kind === "prompt") return <PromptCard item={item} sessionId={sessionId} />;
  return null;
}
```

- [ ] **Step 4: 更新 store.ts 处理 tool.started 入 timeline**

在 `case "tool.started":` 分支，在现有逻辑之后添加 timeline 记录：

```ts
case "tool.started": {
  const p = e.payload as { toolName: string; inputSummary: string; toolUseId: string };
  const a = e.agentId ? s.agents[e.agentId] : undefined;
  if (a && e.agentId)
    s.agents[e.agentId] = { ...a, status: "working", currentTool: p.toolName };
  // AskUserQuestion 不走工具卡(已被 normalize 特判为 prompt.requested)
  if (p.toolName !== "AskUserQuestion") {
    s.timeline = [
      ...s.timeline,
      {
        kind: "tool" as const,
        id: p.toolUseId,
        toolName: p.toolName,
        inputSummary: p.inputSummary,
        status: "running" as const,
        agentId: e.agentId,
        ts: e.ts,
      },
    ];
  }
  break;
}
```

在 `case "tool.ended":` 和 `case "tool.failed":` 分支，添加状态更新：

```ts
case "tool.ended":
case "tool.failed": {
  const p = e.payload as { toolUseId: string; ok: boolean };
  const a = e.agentId ? s.agents[e.agentId] : undefined;
  if (a && e.agentId) s.agents[e.agentId] = { ...a, currentTool: undefined };
  // 更新 timeline 工具卡状态
  s.timeline = s.timeline.map((item) =>
    item.kind === "tool" && item.id === p.toolUseId
      ? { ...item, status: (e.type === "tool.ended" ? "ok" : "failed") as "ok" | "failed" }
      : item,
  );
  break;
}
```

- [ ] **Step 5: 运行检查**

```bash
bun test && bun run check && bunx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/web/hud/ThinkingBlock.tsx src/web/hud/ToolCard.tsx src/web/hud/TimelineItem.tsx src/web/store.ts
git commit -m "feat: 🧩 add ThinkingBlock + ToolCard + wire tool events to timeline"
```

---

### Task 11: 停止按钮 + Textarea 输入 + Shift+Enter

**Files:**
- Modify: `src/web/hud/ChatDrawer.tsx`

- [ ] **Step 1: 更新 ChatDrawer.tsx 输入区域**

找到 `<div className="cdrawer-input">` 块，替换为：

```tsx
{/* 是否有进行中的 assistant 消息 */}
{(() => {
  const inFlight = session?.timeline.some(
    (i) => i.kind === "message" && (i as { role: string }).role === "assistant" &&
      i === session.timeline[session.timeline.length - 1],
  );
  const isRunning = session?.status === "busy";
  return (
    <div className="cdrawer-input" style={{ position: "relative" }}>
      <textarea
        className="pxinput"
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // 自适应高度
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
        disabled={isRunning && !inFlight}
        style={{ resize: "none", overflowY: "auto" }}
      />
      {isRunning ? (
        <button
          type="button"
          className="pxbtn sm cjk"
          style={{ color: "var(--red, #e05)" }}
          onClick={() => currentId && sendCommand({ cmd: "interrupt", sessionId: currentId })}
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          className="pxbtn primary sm cjk"
          onClick={send}
          disabled={!text.trim()}
        >
          发送
        </button>
      )}
    </div>
  );
})()}
```

- [ ] **Step 2: 运行检查**

```bash
bun run check && bunx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/ChatDrawer.tsx
git commit -m "feat: 🧩 stop button + textarea auto-height + Shift+Enter newline"
```

---

### Task 12: SlashMenu 斜杠命令补全

**Files:**
- Create: `src/web/hud/SlashMenu.tsx`
- Modify: `src/web/hud/ChatDrawer.tsx`

- [ ] **Step 1: 创建 SlashMenu.tsx**

```tsx
import { useEffect, useRef } from "react";

interface Props {
  commands: string[];
  filter: string;
  onSelect: (cmd: string) => void;
  onClose: () => void;
}

export function SlashMenu({ commands, filter, onSelect, onClose }: Props) {
  const filtered = commands.filter((c) =>
    c.toLowerCase().includes(filter.toLowerCase()),
  );
  const ref = useRef<HTMLDivElement>(null);

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="slash-menu glass scroll"
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: 160,
        overflowY: "auto",
        zIndex: 10,
        marginBottom: 4,
      }}
    >
      {filtered.map((cmd) => (
        <button
          key={cmd}
          type="button"
          className="slash-item px"
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: 12,
            padding: "5px 10px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text)",
            fontFamily: "monospace",
          }}
          onClick={() => onSelect(cmd)}
        >
          {cmd}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 接入 ChatDrawer.tsx**

在 `ChatDrawer` 顶部添加 `slashOpen` state：

```tsx
const [slashOpen, setSlashOpen] = useState(false);
```

在 `onChange` 的 textarea 中，在更新 text 之后添加：

```tsx
const val = e.target.value;
setText(val);
setSlashOpen(val.startsWith("/"));
```

在 `cdrawer-input` div 里（textarea 之前）添加 SlashMenu：

```tsx
{slashOpen && session?.slashCommands.length ? (
  <SlashMenu
    commands={session.slashCommands}
    filter={text.slice(1)}
    onSelect={(cmd) => {
      setText(cmd + " ");
      setSlashOpen(false);
    }}
    onClose={() => setSlashOpen(false)}
  />
) : null}
```

在 import 顶部添加：

```tsx
import { SlashMenu } from "./SlashMenu";
```

- [ ] **Step 3: 运行检查**

```bash
bun run check && bunx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/web/hud/SlashMenu.tsx src/web/hud/ChatDrawer.tsx
git commit -m "feat: 🧩 add slash command completion menu to ChatDrawer"
```

---

### Task 13: 消息操作 — 复制 + 时间戳

**Files:**
- Modify: `src/web/hud/MessageBubble.tsx`

- [ ] **Step 1: 更新 MessageBubble.tsx 添加复制按钮 + 时间戳**

```tsx
import { useState } from "react";
import type { Session, TimelineMessageItem } from "../../shared/domain";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
}

const authorName = (item: TimelineMessageItem, session: Session): string => {
  if (item.role === "user") return "你";
  return (
    (item.agentId ? session.agents[item.agentId]?.role : undefined) ??
    item.agentId ??
    item.role
  );
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

export function MessageBubble({ item, session }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(item.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={`cmsg ${item.role === "user" ? "me" : "agent"}`}
      style={{ position: "relative" }}
    >
      <div
        className="cmsg-author px"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {authorName(item, session)}
        <span
          className="faint"
          style={{ fontSize: 9, opacity: 0.5 }}
          title={new Date(item.ts).toLocaleString("zh-CN")}
        >
          {formatTime(item.ts)}
        </span>
        <button
          type="button"
          onClick={copy}
          title="复制消息"
          style={{
            fontSize: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: copied ? "var(--green, #3c3)" : "var(--text)",
            opacity: 0.6,
            padding: 0,
          }}
        >
          {copied ? "✓" : "⎘"}
        </button>
      </div>
      <div
        className="cmsg-bubble md"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染
        dangerouslySetInnerHTML={{ __html: mdToHtml(item.text) }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 运行全量检查**

```bash
bun test && bun run check && bunx tsc --noEmit
```

期望：全部通过。

- [ ] **Step 3: 提交**

```bash
git add src/web/hud/MessageBubble.tsx
git commit -m "feat: 🧩 add copy button + timestamp to MessageBubble"
```

---

### Task 14: 修复过时注释 + 整合验证

**Files:**
- Modify: `src/web/hud/ChatDrawer.tsx` — 移除过时注释
- Modify: `docs/ROADMAP.md` — 更新 setPermissionMode 状态

- [ ] **Step 1: 清理过时注释**

在 `ChatDrawer.tsx` 中，删除任何提到 `includePartialMessages=false` 的注释（已是 true）。

在 `docs/ROADMAP.md` 中，找到 `setPermissionMode` 相关条目（标"未实现"），更新为"已实现"。

- [ ] **Step 2: 全量验证**

```bash
bun test && bun run check && bunx tsc --noEmit
```

期望：全部通过，零类型错误，零 lint 警告。

- [ ] **Step 3: 提交**

```bash
git add docs/ROADMAP.md src/web/hud/ChatDrawer.tsx
git commit -m "docs: 📝 fix stale comments + mark setPermissionMode as implemented"
```

---

## 验收标准

1. `bun test` — 全部通过，无 skip
2. `bun run check` — 无 lint/format 错误
3. `bunx tsc --noEmit` — 零类型错误
4. 在 Roguent 聊天窗口里（dogfooding 模式），Claude 发 AskUserQuestion 时能看到可点按钮并作答
5. 权限提示（`canUseTool`）在聊天窗口里渲染为「允许 / 拒绝」卡片，点击后 agent 继续执行
6. 思考块默认折叠，点「▸ 思考过程」展开
7. 工具调用折叠态显示工具名 + 摘要
8. 停止按钮在 agent 运行时可见，点击后中断
9. `/` 触发斜杠命令浮层，选中后填入输入框
10. 气泡右上角有复制按钮和时间戳
