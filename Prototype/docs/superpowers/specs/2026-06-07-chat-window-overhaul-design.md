---
title: 聊天窗口功能全面增强 · 设计文档
date: 2026-06-07
status: design-approved
authors: [koco-co]
---

# 聊天窗口功能全面增强

> 设计来源：`2d5f580e` 会话（2026-06-07）。
> 基线：`2026-06-06-chat-right-drawer-design.md`（右侧抽屉 + Markdown）已合入 `main`。
> 本 spec 在其之上增强功能，**不推翻已有布局**。

---

## 背景

Roguent 用户在 Roguent 自己的聊天窗口里与 Claude Code 对话（dogfooding），发现两个核心痛点：

1. **AskUserQuestion / 权限弹窗无法回答**：Driver 当前只被动观测（hooks 立即返回 `{}`），没有双向通道把用户回答送回 agent。UI 里弹出的选择框（`AskUserQuestion`）渲染不出来，权限提示同样授权不了。用户只能手动关掉对话框、改用文字输入——这完全抹杀了 AskUserQuestion 的价值。
2. **转录体验单薄**：思考块、工具调用、流式输出、停止按钮、`/` 补全、消息操作等"类 Claude Desktop"体验均缺失。

---

## 目标

1. **Phase 1（最高优先）**：打通 AskUserQuestion + 权限审批双向通道，让用户在 Roguent 聊天窗口里能直接作答/授权。
2. **Phase 2**：交付完整的转录增强（流式、思考块、工具卡、停止、`/` 补全、消息操作）。

---

## 1. 范围与分期

### Phase 0 · 统一时间线（地基，A、B 共用）

把 `Session.messages` 升级成 `timeline: TimelineItem[]`，ChatDrawer 改成按类型渲染。两个 Phase 都依赖此地基。

### Phase 1 · 交互提问 B（最硬，最优先）

- `canUseTool` 权限审批管线
- AskUserQuestion 可点作答（保底版 → spike 验真 tool_result）
- `setPermissionMode` WS 命令补齐

### Phase 2 · 转录增强 A（剩余功能）

- 流式逐字输出
- 思考块捕获（被动，不开扩展思考）
- 工具卡内联折叠
- 停止按钮
- 多行输入 + `Shift+Enter`
- `/` 斜杠命令补全
- 消息操作（复制 / 代码块复制按钮 / 时间戳）

---

## 2. 数据模型 · 统一时间线

### TimelineItem 判别联合

按到达顺序入列，单 seq reducer 天然保序：

```ts
type TimelineItem =
  | { kind: "message";  role: "user"|"assistant"|"system"; agentId?: string; text: string; ts: number }
  | { kind: "thinking"; agentId?: string; text: string; ts: number }
  | { kind: "tool";     toolName: string; inputSummary: string; input?: unknown;
      status: "running"|"ok"|"failed"; toolUseId: string; ts: number }
  | { kind: "prompt";   promptKind: "permission"|"question";
      data: PermissionData | QuestionData;
      status: "pending"|"answered"|"dismissed"; promptId: string; ts: number }
```

**默认展开/折叠规则**：

| kind | 默认 |
|---|---|
| `message` | 展开（始终可见） |
| `thinking` | **折叠**（像 Claude Desktop） |
| `tool` | **折叠**（折叠态显示图标+工具名+摘要） |
| `prompt` | 展开（pending 时必须可见） |

---

## 3. 交互提问通道（Phase 1）

### 3.1 全链路

```
UI →(WS命令)→ WsGateway → SessionManager → Driver →(resolve pending Promise)→ SDK
```

### 3.2 权限审批（`canUseTool`）

1. Driver `Options.canUseTool` 被 SDK 调用 → 按 `toolUseId` 建挂起 Promise。
2. 发 `prompt.requested(kind=permission)`，payload 含 `{title, displayName, description, inputSummary, suggestAlwaysAllow}`。
3. UI 渲染「允许 / 总是允许 / 拒绝」卡片。
4. 用户点击 → WS `respondPermission{promptId, result}` → Driver 用 `PermissionResult` resolve。
5. **兜底**：会话结束 / `interrupt` 时，所有 pending prompt 自动拒绝。

### 3.3 AskUserQuestion（保底版）

1. normalize 在 `PreToolUse` 中特判 `tool_name === "AskUserQuestion"` → 发 `prompt.requested(kind=question)`（payload 含 questions/options），**不走普通工具卡**。
2. UI 渲染可点选项按钮。
3. 用户点击 → 把所选 label **当 `sendMessage` 发出**（= 用户手动做的事，变一键）。
4. **Spike**：验证 `canUseTool` 是否对 AskUserQuestion 触发 / 是否有 control-request 可回 `AskUserQuestionOutput`。
   - 成功 → 升级为真 tool_result，无缝单轮，不需要用户发消息。
   - 失败 → 保底版照常工作。

### 3.4 `setPermissionMode` 命令补齐

ROADMAP 标"未实现"，但 SDK `Query.setPermissionMode()` 实际存在。顺带补齐此 WS 命令，让前端可切换 `permissionMode`。

---

## 4. 转录增强（Phase 2）

### 4.1 流式

- normalize 处理 `stream_event`（`text_delta` / `thinking_delta`）→ 发增量 `message.delta` / `thinking.delta`。
- store 把碎片追加到"在飞气泡"（flying bubble），整轮 `assistant` 到达时 `*.final` 校准全文。
- **注**：`includePartialMessages: true` 在 `driver.ts:113` 已经开着，只是 normalize 没处理 stream_event，纯前端加法。

### 4.2 思考块

- normalize 捕获 `type === "thinking"` 的内容块（目前被 `type !== "text"` 过滤掉）。
- 发 `thinking.delta` / `thinking.final`，store 写入 timeline `{kind: "thinking"}`。
- **不主动开扩展思考**（不加 `maxThinkingTokens`），被动捕获即可。

### 4.3 工具卡内联

- 复用现有 `tool.started` / `tool.ended` / `tool.failed`，不改协议。
- 折叠态：`工具图标 + 工具名 + inputSummary`。
- 展开态：完整 `input`（JSON 格式）。
- **不捕获 tool_response**（输入为主，改动最小）。

### 4.4 停止按钮

- 运行中（有 in-flight message）时显示停止按钮。
- 点击 → 发 WS `interrupt` 命令（已端到端打通，`ws-gateway.ts:116`）。

### 4.5 输入体验

- `<input>` 换成 `<textarea>` 自适应高度（`rows=1`，`overflow-y: auto`，`max-height: 8rem`）。
- `Enter` 发送，`Shift+Enter` 换行。
- 发送中禁用输入框 + 发送按钮，显示加载态。

### 4.6 `/` 斜杠命令补全

- 输入框首字符为 `/` 时弹出菜单（`position: absolute`，`bottom: 100%`）。
- 数据来自 `session.slashCommands`（store 已有）。
- 支持继续键入过滤，方向键 + `Enter` 选中，`Escape` 关闭。

### 4.7 消息操作

- 鼠标悬停 message / thinking / tool 条目时，右上角出现操作栏：
  - 复制整条文本。
  - 代码块：每个 ` ``` ` 块右上角独立复制按钮。
  - 时间戳 tooltip（`ts` 字段）。

---

## 5. 事件与命令变更（加法，向后兼容）

### 新增事件类型

| 事件 | payload 简述 |
|---|---|
| `thinking.delta` | `{agentId, text: string}` 思考增量 |
| `thinking.final` | `{agentId, text: string}` 思考完整内容 |
| `prompt.requested` | `{promptId, kind, data}` 权限/问题请求 |
| `prompt.resolved` | `{promptId, result}` 已回答/已拒绝 |

三处同步改：`shared/events.ts`（类型）、`engine/normalize.ts`（产出）、`web/store.ts`（消费）。

### 新增 WS 命令

```ts
// ws-gateway.ts Command 联合扩展
| { cmd: "respondPermission"; sessionId: string; promptId: string; result: PermissionResult }
| { cmd: "respondQuestion";   sessionId: string; promptId: string; selectedLabels: string[] }
| { cmd: "setPermissionMode"; sessionId: string; mode: PermissionMode }
```

---

## 6. 顺带修复的过时描述

以下注释/文档与实际代码不符，随对应改动一并更正：

- `ChatDrawer.tsx` 注释：`includePartialMessages=false` → **已是 true**（`driver.ts:113`）
- `store.ts` 注释：`已实现逐字流式(替换最后一条气泡)` → **未实现**，normalize 未处理 stream_event
- `ROADMAP.md`：`setPermissionMode` 标"未实现" → SDK 实际存在，随命令补齐一并划掉

---

## 7. 测试策略

### 单测（纯函数/reducer）

- 时间线交错排序（message、thinking、tool、prompt 混合）
- 流式追加（delta → final 校准）
- 思考块折叠状态机
- 工具卡状态机（running → ok/failed）
- prompt 状态机（pending → answered/dismissed）
- normalize 映射：stream_event / thinking / AskUserQuestion / tool_response

### Driver 级单测（假 Query）

- `canUseTool` 触发 → 发 `prompt.requested` → `respondPermission` → Promise resolve
- 覆盖回放跑不到的双向回路

### 回放 e2e

补带以下内容的脱敏 fixture：
- `stream_event` / `thinking_delta`
- `AskUserQuestion` tool_use
- 权限请求场景

断言时间线条目类型与卡片折叠状态。

---

## 8. 文件与组件边界

### 前端拆分（ChatDrawer 已 ~250 行）

| 组件 | 职责 |
|---|---|
| `ChatDrawer.tsx` | 布局容器、滚动管理、输入框 |
| `TimelineItem.tsx` | 按 `kind` dispatch 渲染 |
| `MessageBubble.tsx` | 文本气泡 + Markdown + 消息操作栏 |
| `ThinkingBlock.tsx` | 折叠/展开的思考块 |
| `ToolCard.tsx` | 折叠/展开的工具调用卡片 |
| `PromptCard.tsx` | 权限审批 / AskUserQuestion 可点卡片 |
| `SlashMenu.tsx` | `/` 触发的斜杠命令浮层 |

### 引擎侧

| 文件 | 改动 |
|---|---|
| `engine/driver.ts` | 添加 `canUseTool` 回调、pending Promise map |
| `engine/normalize.ts` | 处理 stream_event、thinking、AskUserQuestion 特判 |
| `engine/session-manager.ts` | 路由新命令到 Driver |
| `engine/ws-gateway.ts` | 扩展 Command 联合类型 |

### 共用

- `shared/events.ts`：新增事件类型
- `web/store.ts`：`reduce` 处理新事件，`Session` 增 `timeline` 字段

---

## 9. 实现顺序

1. **Phase 0**：`shared/events.ts` + `store.ts` 迁移至 `timeline`，ChatDrawer 改用新模型渲染（现有 `message` 条目，其余 kind 暂无数据，UI 保持不变）。
2. **Phase 1-B**：Driver `canUseTool` → prompt 事件 → PromptCard UI → `respondPermission` 命令回路；AskUserQuestion 特判 → QuestionCard → `sendMessage` 保底；`setPermissionMode` 命令；AskUserQuestion 真 tool_result spike。
3. **Phase 2-A**：normalize stream_event → 流式气泡；thinking 捕获 → ThinkingBlock；工具卡 → ToolCard；停止按钮；textarea 输入；SlashMenu；消息操作。
4. 顺带修过时注释/ROADMAP 条目。
