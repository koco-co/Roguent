---
id: "§10"
title: 任务·背包·排行榜(产出与计量)
status: partial
layer: web
updated: 2026-06-06
depends_on: ["§2", "§7"]
related: ["§5", "§9"]
code_refs:
  - src/web/hud/TaskWindow.tsx
  - src/web/hud/Tasks.tsx
  - src/web/hud/LootPanel.tsx
  - src/web/hud/Leaderboard.tsx
  - src/web/hud/todos-view.ts
  - src/web/hud/leaderboard-rows.ts
  - src/web/hud/Shop.tsx
  - src/web/hud/shop-data.ts
specs:
  - docs/superpowers/plans/2026-06-06-roguent-real-data-and-stage-scaling.md
---

# §10 任务·背包·排行榜(产出与计量)

## 1. 定位

本节涵盖展示 agent 产出与计量的四类面板：

- **TaskWindow**：内景左栈底部的折叠式实时任务窗，常驻显示当前会话所有 agent 的 TodoWrite 待办摘要。
- **Tasks**（任务面板）：全屏 Modal，按状态分三组（待办/进行中/完成）展开真实 TodoWrite 清单 + 右列详情，底部附 inter-agent 信箱（局部 mock 标注）。
- **LootPanel**（背包面板）：全屏 Modal，以格子背包形式展示当前会话真实产出的工件（loot）。
- **Leaderboard**（排行榜面板）：全屏 Modal，三页签按会话/按模型/按 runtime 对全部会话 token 用量排序或聚合。
- **Shop**（商店面板）：原型面板，整体为 mock 占位，不接任何真实 store。

这几个面板共同构成「可视化 agent 做了什么、消耗了多少」的产出与计量层，是游戏化呈现真实 subagent 活动的核心展示面之一。

---

## 2. 为什么

Claude Code subagent 活动在 engine 层已经归一化为事件流（`todos.updated`、`loot.dropped`、`usage.*`），但若不在 UI 侧以结构化方式呈现，用户只能看到「小人在动」，无法了解具体做了哪些任务、产出了什么工件、哪个会话/模型消耗最多。

游戏化呈现的价值：

- **任务面板**把 TodoWrite 的三态流转（待办→进行中→完成）可视化，让用户第一时间感知 agent 的工作进度而不必阅读 transcript。
- **背包面板**把工件（diff、report、answer）以格子背包的形式呈现，赋予产出「可感知的物质形态」。
- **排行榜面板**把 token 用量游戏化为竞技排名，辅助用户评估各会话/模型的效率与成本。

铁律**真假分明**：已有引擎数据的面板直接读 store，不造假、不加 mock banner；引擎尚无能力支撑的功能（inter-agent 信箱、插件市场、宝石经济）用显著 `.task-mock-banner` 显式标注，绝不冒充真实。

---

## 3. 功能点

### 3.1 TaskWindow（实时任务窗）

- 常驻内景（`view !== "overworld"`）左栈底部，可折叠/展开。
- 展示当前会话所有 agent 的 TodoWrite 待办：进度点颜色区分状态（待办灰/进行中青/完成绿），进行中项附流光进度条。
- 顶部显示「进行中/合计」计数；底部汇总三态数量。
- 点击任意待办项跳转至 Tasks 面板（`openPanel("tasks")`）。

### 3.2 Tasks（任务面板）

- 全屏 Modal，`activePanel === "tasks"` 激活。
- 左列：待办清单按状态分三组（待办/进行中/完成）渲染，每行展示内容 + 归属 agent 头像与角色名；主控固定显示「主控」。
- 右列：选中待办详情（内容、状态 chip、activeForm 描述、归属）；默认选中第一条进行中项。
- 底部信箱区（inter-agent 消息）：**局部 mock 标注**——`.task-mock-banner` 显式提示「信箱为示例 · 引擎暂无 inter-agent 信箱」，数据来自 `MOCK_MAILBOX`。

### 3.3 LootPanel（背包/战利品面板）

- 全屏 Modal，`activePanel === "backpack"` 激活。
- 读取当前会话 `session.loot`，以 4 列格子背包渲染；真实工件格显示图标 + 标签 + 辉光；空槽补足至下一个 4 的倍数（≥8），纯装饰。
- loot.kind → 图标映射：`file`=读文件 / `diff`=写改 / `report`=报告 / `answer`=回答。

### 3.4 Leaderboard（排行榜面板）

- 全屏 Modal，`activePanel === "leaderboard"` 激活。
- 三页签切换：
  - **按会话**（真）：`leaderboardRows(sessions)` 取全部会话 `usage.tokens` 降序；会话 ≥3 时渲染领奖台（金/银/铜）。
  - **按模型**（真聚合）：`leaderboardByModel` 对同 model 的会话 tokens/cost 求和。
  - **按 runtime**（部分真/部分占位）：Claude 行=全部会话求和（真）；Codex 行恒为 0，置灰 + 页签底部注「Codex 为占位 · 引擎暂未接入」。
- 每行显示名次、头像、会话/模型标题、token 进度条、美元成本、model chip。

### 3.5 Shop（商店面板，planned 改造）

- 当前整面板为 mock 占位，不接任何真实 store。(planned) 如引擎未来支持插件市场/宝石经济时改接真数据。

### 3.6 Currency 完成数（planned）

- (planned) 在 HUD Currency 区与 §9 用量并列展示 agent 完成的任务数（`todos.completed` 计数），为游戏化进度感知提供量化锚点。

---

## 4. 交互边界★

### 上游（依赖 §2 事件协议、§7 面板宿主）

| 依赖方 | 依赖点 | 契约 |
|---|---|---|
| **§2 事件协议** | `todos.updated` 事件 → `Session.todos` | engine 归一化 TodoWrite 后广播；payload 含 `agentId + todos[]`；store reducer 对齐写入 `session.todos[agentId]` |
| **§2 事件协议** | `loot.dropped` 事件 → `session.loot` | engine 产出工件时广播；payload 含 loot item；store reducer append |
| **§7 HUD Shell** | `activePanel` 状态（`tasks` / `backpack` / `leaderboard` / `shop`）| 面板 gate 读 `useUiStore(s => s.activePanel === "xxx")`；TaskWindow gate 读 `view !== "overworld"`；打开靠 `openPanel()` |
| **§7 HUD Shell** | `openPanel("tasks")` | TaskWindow 点击待办行时触发，跳转到 Tasks 面板 |

### 下游（向其他面板提供数据）

本节面板为纯消费型，不向其他面板暴露状态。TaskWindow 的点击通过 `openPanel("tasks")` 向 §7 注入面板切换指令。

### Related

| 相关方 | 关联点 |
|---|---|
| **§5 会话与聊天** | Leaderboard 排行基于 `sessions` map；会话聚合颗粒度与 §5 的 `currentSessionId` / session 生命周期一致 |
| **§9 用量与限额** | (planned) Currency 完成数与 §9 用量指标并列显示；两者共用 HUD 底部区域 |

---

## 5. 数据流与关键约定

### TaskWindow / Tasks 数据流

```
engine: TodoWrite hook
  → normalize.ts: todos.updated { sessionId, agentId, todos[] }
  → Sequencer: 打 seq
  → WsGateway broadcast
  → store.ts reduce: session.todos[agentId] = payload.todos
  → todos-view.ts: sessionTodos(session) 展平 → TodoRow[]
  → TaskWindow / Tasks 渲染
```

- `sessionTodos` 展平规则：主控（`ORCHESTRATOR_ID`）优先，其余 agentId 升序；各 agent 内部顺序=写入顺序。
- `todoCounts` 按状态归计；`todoProgress` 对三态给固定宽度（完成=100%、进行中=60%、待办=0%）。
- TaskWindow 的 key 用 `${agentId}:${index}` 规避 content 重复问题（todos 表整体覆盖可能产生相同内容）。

### LootPanel 数据流

```
engine: loot.dropped { sessionId, loot: LootItem }
  → store.ts reduce: session.loot.push(item)
  → LootPanel: useRoomStore(s => sess?.loot ?? EMPTY_LOOT)
  → [...loot].reverse() 倒序渲染(最新产出在前)
```

- selector 只返回稳定引用（loot 数组引用或模块级 `EMPTY_LOOT` 常量），遵守 zustand 铁律，不在 selector 内构造新数组。
- gate 的 `return null` 放在所有 hooks 之后（React hooks 规则）。

### Leaderboard 数据流

```
store.ts: sessions map (含 usage.tokens / usage.cost / model / archived)
  → leaderboard-rows.ts 纯函数（render 体内调用,不在 selector 里）:
      leaderboardRows        → 按会话列表
      leaderboardByModel     → Map<model, AggRow>
      leaderboardByRuntime   → [claude真, codex占位]
  → Leaderboard 渲染
```

- `leaderboardByRuntime` 的 Codex 行硬编码 `tokens=0 / cost=0`，在面板内置灰并附底部注释，不造假成本。

---

## 6. 现状与边界（partial）

| 面板 | 真/mock | 说明 |
|---|---|---|
| **TaskWindow** | **真数据** | 读 `useRoomStore` → `session` → `sessionTodos()`，来自 `Session.todos`（引擎捕获 TodoWrite）；注释明确标注「真数据」；无 mock banner。 |
| **Tasks 主体** | **真数据** | 同上，读 `session.todos` 展开三组清单 + 详情；归属 agent 取真实 session.agents 的 role。 |
| **Tasks 信箱区** | **局部 mock** | 底部 inter-agent 信箱用 `MOCK_MAILBOX` + `MOCK_OWNERS`，以 `.task-mock-banner` 显式标注「信箱为示例 · 引擎暂无 inter-agent 信箱」，绝不冒充真实。 |
| **LootPanel** | **真数据** | 读 `session.loot`，gate 在 `activePanel === "backpack"`；文件顶部注释明确「这是真数据面板,不是 mock」；空槽为纯装饰，不造假 loot。 |
| **Leaderboard（按会话）** | **真数据** | `leaderboardRows(sessions)` 取真实 `usage.tokens` 降序。 |
| **Leaderboard（按模型）** | **真聚合** | `leaderboardByModel` 对真实会话 tokens/cost 按 model 求和。 |
| **Leaderboard（按 runtime Codex 行）** | **占位** | Codex 行 tokens/cost 恒为 0，面板置灰并底部标注「Codex 为占位 · 引擎暂未接入」。 |
| **信箱** | **mock（局部）** | 仅存在于 Tasks 面板底部，显式 banner 标注，引擎不具备 inter-agent 信箱能力。 |
| **Shop / gems** | **全 mock** | 整面板读本地 `shop-data.ts` 常量，不接任何真实 store；顶部 `.task-mock-banner` 显示「示例数据 · 引擎无插件市场 / 宝石经济」；「安装」/「购买」/宝石余额均为视觉占位，无任何真实逻辑。 |

**取舍说明**：inter-agent 信箱与插件市场的 mock 标注是刻意为之——让用户感受到原型的完整面貌，同时保持对真实数据的透明边界。待引擎具备对应能力时，逐步改接真数据并移除 mock banner。

---

## 7. 代码锚点

| 文件 | 关键行/函数 | 说明 |
|---|---|---|
| `src/web/hud/TaskWindow.tsx` | :15–18 注释；:24–26 selector；:31–32 `sessionTodos` / `todoCounts` | 真数据任务窗；selector 取稳定 session 引用 |
| `src/web/hud/Tasks.tsx` | :34–36 注释；:41–43 selector；:145–177 信箱 mock banner | 真数据任务面板 + 局部信箱 mock |
| `src/web/hud/todos-view.ts` | :15 `sessionTodos`；:34 `todoCounts`；:47 `TODO_META`；:54 `todoProgress` | 纯函数：展平 TodoRow、计数、元数据 |
| `src/web/hud/LootPanel.tsx` | :11–14 注释（真数据声明）；:44 gate；:47–51 selector；:57 `[...loot].reverse()` | 真数据背包面板；gate 在 hooks 之后 |
| `src/web/hud/Leaderboard.tsx` | :21–27 注释（真假分明声明）；:37 `sessions` selector；:44–52 render 体内纯函数调用；:187–191 Codex 占位标注 | 排行榜三页签；聚合在 render 体非 selector |
| `src/web/hud/leaderboard-rows.ts` | :13 `leaderboardRows`；:41 `leaderboardByModel`；:67 `leaderboardByRuntime`（含 Codex 占位注释） | 排行榜纯函数；Codex 占位逻辑在此 |
| `src/web/hud/Shop.tsx` | :12–17 注释；:52–54 顶部 mock banner | 全 mock 商店面板 |
| `src/web/hud/shop-data.ts` | :4–15 注释；:197 gems mock 常量 | 全 mock 数据源 |

---

## 8. 验收

### 单元测试

- `src/web/hud/todos-view.test.ts`：覆盖 `sessionTodos`（主控优先、多 agent 展平、空会话返回 `[]`）、`todoCounts`（三态计数）、`todoProgress`（三态固定宽度）。
- `src/web/hud/leaderboard.test.ts`：覆盖 `leaderboardRows`（tokens 降序）、`leaderboardByModel`（同模型求和）、`leaderboardByRuntime`（Claude 真聚合、Codex 恒 0）。

### 集成/E2E

- **todos.updated e2e**：引擎播出 `todos.updated` 事件 → store reducer 写入 `session.todos` → `sessionTodos` 展平后 TaskWindow / Tasks 渲染出对应行；回放 fixture 验证零额度可触发。
- **loot.dropped e2e**：引擎播出 `loot.dropped` → `session.loot` 追加 → LootPanel 渲染对应工件格；`activePanel !== "backpack"` 时面板不渲染（gate 验证）。
- **Leaderboard 聚合**：多会话场景下三页签数据与 `leaderboardRows` / `leaderboardByModel` / `leaderboardByRuntime` 纯函数输出一致。

### 人工验收标准

- **真假分明目视检查**：任何真数据面板（TaskWindow、Tasks 主体、LootPanel、Leaderboard 按会话/模型）不出现 mock banner；mock 区域（信箱、Shop、Leaderboard Codex 行）必须有显著标注，不得与真实数据混淆。
- **空态友好**：无 TodoWrite 数据时 TaskWindow 显示「暂无任务（agent 调 TodoWrite 后同步）」；无 loot 时 LootPanel 显示至少 8 个空槽；无会话时 Leaderboard 显示「暂无会话」。
- **zustand 铁律**：selector 不在内部构造新对象/数组（可用 React DevTools Profiler 验证不产生不必要重渲染）。
- **React hooks 规则**：LootPanel / Tasks / Leaderboard 的 `return null` gate 必须在所有 hooks 调用之后（可用 eslint-plugin-react-hooks 或代码审查验证）。
