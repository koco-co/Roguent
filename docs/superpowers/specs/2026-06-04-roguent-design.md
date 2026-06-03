---
title: Roguent — 赛博朋克/元气骑士风 Claude Code Agent 房间可视化平台
date: 2026-06-04
status: design-approved
authors: [koco-co]
---

# Roguent · 设计文档

> 一个赛博朋克 / 《元气骑士》(Soul Knight)画风的平台:在一个 top-down 像素地牢房间里,把 **Claude Code 的真实 agent 活动**可视化成"一屋子小人在干活"。底层用**订阅模式**(非 API key)驱动 Claude Code,从 UI 发消息、触发 `/skill`、切模型、切模式;subagent 的出生 / 干活 / 离场由真实事件驱动,不靠猜。

---

## 1. 概述

### 1.1 定位
Roguent 是 Claude Code 的一个**游戏化前端 + 实时可视化平台**:

- **驱动**:从 UI 把消息直接传给本机已登录的 Claude Code(订阅 OAuth,不走 API key),可 `/` 触发 skill、运行时切模型、切权限模式。
- **可视化**:把每个 subagent 渲染成房间里的"小人",用真实的 `SubagentStart / PreToolUse / PostToolUse / SubagentStop` 事件驱动它们的进场、干活、离场。
- **画风**:《元气骑士》式 top-down 像素 roguelike —— Q 版大头小人、霓虹高饱和、地牢瓦片、粒子辉光、头顶能量条 HUD。
- **叙事皮**:轻量"闯关"换皮(触发 skill = 进入一波、subagent = 入场英雄、跑工具 = 战斗动作、完成 = 清房间掉战利品),**只换皮,不改真实功能、不加真游戏机制**。

### 1.2 目标(本次范围)
1. 打通核心主链路:**UI 发消息 → 真驱动 Claude Code 订阅模式 → subagent 活动实时映射成房间小人**。
2. 游戏化 HUD:图标按钮代替文字(设置/技能/背包/模型/模式/房间/聊天),点小人弹窗交互。
3. 多会话:💬 聊天抽屉管理多个并行会话,**切会话联动整屋小人状态**。
4. 先交付**原型(MVP)**,再逐步精修(见 §12)。

### 1.3 非目标(明确不做)
- 不做真正的 roguelike 游戏机制(随机房间、数值、解锁、战斗规则)。
- 不做 API-key 计费模式(只走订阅;API-key 作为未来可选,不在本设计内)。
- 不做托管/云端代登录(ToS 风险);Roguent **本地自托管**,驱动用户自己机器上已登录的 CLI/SDK。
- MVP 不做桌面壳、完整背包/历史、音效、精修帧动画。

---

## 2. 关键决策(brainstorm 结论)

| 维度 | 决策 |
| --- | --- |
| 北极星 | **驱动 + 可视化主链路**优先(原型先验证可行性,视觉先够味不追精致) |
| 平台形态 | **本地 Web 优先**(浏览器 + 后端进程);核心逻辑后续可套 Tauri/Electron |
| 小人映射 | **常驻"主控★" + 每个 subagent 动态进场分身**;并行 N 个 = 同时 N 个在忙 |
| 状态粒度 | **分阶段**:核心态(idle/thinking/working/done)+ 工作态用头顶图标按 `tool_name` 细分 |
| 视觉风格 | **《元气骑士》像素 roguelike** + CC0 合规替身素材 |
| roguelike 深度 | **画风 + 轻闯关叙事皮**(换皮不改功能) |
| 交互模型 | **纯游戏化 HUD**:图标按钮代替文字;点小人弹窗交互;主屏零正文 |
| 输入/会话 | **💬 聊天抽屉 + 多会话**:每条聊天 = 一个 session 窗口;切会话联动房间 |
| 集成方案 | **A:Claude Agent SDK(streaming-input)+ 进程内 hooks**(见 §3) |

---

## 3. 整体架构

三层:浏览器前端 / Engine 后端 / 真实 Claude Code(订阅)。前后端走 WebSocket。

```
┌──────────────────────────────────────────────────────────────┐
│ FRONTEND · 浏览器   React + PixiJS v8 + @pixi/react + Zustand   │
│  🏰 房间渲染器(精灵/动画/粒子/辉光)                           │
│  🎮 图标 HUD + 💬多会话抽屉 + 点小人弹窗                        │
│  🗃 Store(按 session;当前会话 = 渲染源)                       │
└───────────────▲──────────────────────────────┬────────────────┘
   房间事件(spawn/tool/idle/done/loot)         命令(发消息/切会话/切模型/点小人)
                │            WebSocket           ▼
┌───────────────┴──────────────────────────────────────────────┐
│ ENGINE · 后端 Bun/Node   驱动 + 捕获 + 归一化                   │
│  🧭 Session Manager(N 个并行会话,每个 = 一个 Agent SDK 实例)  │
│  🛰 事件归一化器(SDK 消息 + hooks → 房间事件,(sid,seq) 定序) │
│  💰 用量/成本计量(ccusage 式;空闲不空转;节流/预算)          │
└───────────────▲──────────────────────────────────────────────┘
        Agent SDK query()(streaming-input) + 进程内 hooks
                │
┌───────────────┴──────────────────────────────────────────────┐
│ CLAUDE CODE · 订阅   本机已登录 OAuth(无 API key)             │
│  ★ Orchestrator(主)  🧩 Subagents(真实)  🪝 Hooks 信号       │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 集成方案选型

| 方案 | 驱动 | 观测 | 结论 |
| --- | --- | --- | --- |
| **A · Agent SDK(streaming-input)+ 进程内 hooks** | `query()` 发消息 / `/skill` / 运行时 `setModel`·`setPermissionMode` | SDK 消息流(`parent_tool_use_id` 分 subagent)+ 进程内 hooks(`SubagentStart/Stop`、`Pre/PostToolUse` 带 `agent_id`) | ✅ **选用**。驱动与观测都最强;hooks 是进程内回调,无需改 settings.json、无外部 HTTP |
| B · `claude -p` 子进程 stream-json + settings.json HTTP hooks | 向常开 stdin 写 NDJSON 消息 | stream-json + HTTP/command hooks(`async:true`) | 🔸 **Fallback**。非 Node 编排时退用;切模型/skill 更绕 |
| C · 只读 transcript JSONL 轮询 | ✗ 基本不能驱动(ToS 受限) | 轮询 transcript,状态常误判 | ❌ 不用 |

**选 A 的硬理由**:`setModel` / `setPermissionMode` **只在 streaming-input 模式**(prompt 为 `AsyncIterable<SDKUserMessage>`)可用 —— 这是"运行时切模型/模式"这个需求的决定性约束。详见 §8。

---

## 4. 领域模型

| 实体 | 字段 |
| --- | --- |
| **Session** | `id, title, status(idle/busy/done/error), model, permissionMode, agents[], loot[], usage{tokens,cost}, createdAt` |
| **Agent** | `id(=agent_id), kind(orchestrator\|subagent), role(agentType 或 skill 派生), status(状态机), currentTool, skin(外观), parentId, pos` |
| **ToolActivity** | `agentId, toolName, inputSummary(脱敏), phase(start/end/fail), toolUseId, t0, t1` |
| **Loot(战利品=产物)** | `id, sessionId, kind(file/diff/report/answer), label, sourceRef(路径/产物引用), t` → 进 🎒 背包 |

- **渲染源 = 当前选中 Session 的 `agents[]`**;切会话即换渲染源。
- `sourceRef` 是结构化引用(路径/产物 id),**不把结构化证据泄漏进人类可读正文**(沿用 kata 的产物规范习惯)。

---

## 5. 房间事件协议(归一化后,前后端共用)

统一信封:`{ seq, ts, sessionId, type, agentId?, payload }`
其中 `seq` = **服务端单调序号**,用于解决 hooks 并行到达的乱序(见 §10)。

| 事件 type | 来源 | 房间表现 |
| --- | --- | --- |
| `session.created/updated/cleared/error` | SDK `system:init` / 状态变化 / `Stop` | 建/清房间、校验 `apiKeySource`、填技能面板 `slash_commands` |
| `agent.spawned` | hook **`SubagentStart`**(`agent_id, agent_type, prompt` 摘要) | 传送门进场 |
| `agent.thinking` | SDK assistant delta(无 tool 推理) | 思考态 |
| `tool.started` | hook **`PreToolUse`**(`agentId, tool_name, tool_input` 摘要) | 头顶图标 + 干活动画 |
| `tool.ended` / `tool.failed` | hook **`PostToolUse`** / **`PostToolUseFailure`** | 完成微光 / 红灯 |
| `agent.idle` / `agent.done` | 无活 / hook **`SubagentStop`**(`stop_reason`) | 退休闲 / 离场 |
| `loot.dropped` | 主 agent 产出 / 关键产物 | 掉落 + 入背包 |
| `message.delta` / `message.final` | SDK assistant 流(按 `parent_tool_use_id` 归到对应 agent) | **只进抽屉会话窗口,不进房间**(主屏零正文) |
| `usage.updated` | SDK `result` / 计量 | HUD/背包 token·成本 |

**双通道互补**:**hooks** 给确定的"出生/工具/结束"时刻信号;**SDK 消息流**给文字内容与 `parent_tool_use_id` 归属。检测 subagent 工具名要**同时认 `Task` 和 `Agent`**(版本改名,见 §8)。

---

## 6. 映射规则(事件 → 小人 → 叙事皮)

### 6.1 小人状态机
`spawning → (thinking ⇄ working) → idle → done/leaving`
- 分阶段:核心态(idle/thinking/working/done)+ 工作态用**头顶图标**按 `tool_name` 细分。

### 6.2 `tool_name` → 头顶图标/动作(可配置 map,默认值)
| 图标 | 含义 | 触发 tool |
| --- | --- | --- |
| 📖 | 查阅 | `Read/Glob/Grep` |
| ⌨️ | 写代码 | `Edit/Write/NotebookEdit` |
| 🧪 | 跑命令/测试 | `Bash`(含 `test` → 🧪,否则 ⚙) |
| 🔍 | 搜索 | `WebSearch/WebFetch` |
| 🪄 | 召唤分身 | `Task/Agent` |
| 📋 | 列清单 | `TodoWrite/TaskCreate` |
| 🔌 | 外接 | MCP 工具 |
| ⚡ | 默认工作 | 未知 tool |
| 🚨 | 受击/红灯 | tool 失败 |

### 6.3 角色皮肤
`agentType` / skill 名 → 外观与配色(researcher/coder/tester…),默认按 `agentType` 上色;映射可配置。

### 6.4 闯关叙事皮(换皮,不改功能)
| 真实事件 | 游戏叙事 |
| --- | --- |
| `UserPromptSubmit` / skill 触发 | 进入房间 · 开始一波(boss 门亮、能量条起) |
| `SubagentStart` | 英雄从传送门入场 |
| `Pre/PostToolUse` | 战斗动作(头顶图标即"技能") |
| `PostToolUseFailure` | 受击 · 头顶红灯 |
| `SubagentStop` | 英雄退场 |
| `Stop`(主 agent 一波结束) | 清空房间 + 掉战利品(产物)→ 🎒背包 |
| 多个 session | 多个地牢房间;切会话 = 切房间 |

---

## 7. 交互 & UI

**总原则:主屏永远零正文。**所有文字(消息/日志/设置项)只存在于抽屉、弹窗、面板里;HUD 全图标化,hover 才显名。

### 7.1 图标 HUD 按钮
| 按钮 | 行为 |
| --- | --- |
| ⚙ 设置 | 外观皮肤(素材包切换)/动画密度/音效/**额度预算与告警**/默认模型·模式/节流策略 |
| 💎 模型 | 模型图标选择器 → 运行时 `setModel` 切当前会话;小人换装/闪光反馈 |
| 🛡 模式 | permissionMode 选择器(default/plan/acceptEdits/bypass…)→ `setPermissionMode`;可染房间氛围色 |
| 📜 技能 | 技能图标格(来源:`system:init.slash_commands` + 已装 skills)→ 触发到当前会话 |
| 🎒 背包 | 战利品/产物(loot)+ 历史产物;点击 → 看/打开 `sourceRef` |
| 🗺 房间 | 多会话/房间快速跳转(与 💬 抽屉同源) |
| 💬 聊天 | 抽屉:多会话列表 + 当前会话窗口(消息流+输入框);**切会话联动整屋** |

### 7.2 点小人 → 弹窗
- **内容**:头像 + 角色名、当前状态/动作、该 agent 的迷你实时日志(它的 tool 活动)、能量条。
- **图标动作**:👁 看完整输出(跳到抽屉里该 agent 的 swimlane)· 📦 收产物 · ⏸ 打断。
- **诚实的技术边界**(CC 限制):
  - 运行中的 subagent **不能中途插话**(subagent 自治跑完,无消息通道)。subagent 弹窗以**查看**为主;"💬" = 就该子任务**对主控追问**,不是发给 subagent。
  - ⏸ 打断 = 中断**整一波**(SDK `interrupt()`),**不是**单独叫停一个 subagent(粒度受 CC 限制)。
  - 只有**主控★**弹窗能发新消息(等价于在抽屉里对该会话发言)。

### 7.3 多会话抽屉
- 左 = 会话列表(状态点 + 名 + 忙碌数),右 = 选中会话窗口(气泡 user/assistant + tool chips + 输入框),＋新会话。
- **每个会话完全独立**:独立 Agent SDK 实例、独立 agent 树、独立 model/mode、独立 usage。
- **切会话 = 切渲染源**:房间整屏换成该会话的小人/状态。

### 7.4 技能 / 模型 / 模式弹层
- 技能:headless 下部分 `/命令` 受限 → **优先让模型 model-invoke skills**(`settingSources:['user','project']` + `skills:'all'` + `allowedTools` 含 `'Skill'`);`/name` 直发仅限 `init.slash_commands` 列出的。
- 模型/模式:**仅 streaming-input 模式支持运行时切**(架构选 A 的核心原因)。

---

## 8. 集成技术细节(已核对官方文档)

### 8.1 订阅模式认证
- 把 `ANTHROPIC_API_KEY` **和** `ANTHROPIC_AUTH_TOKEN` 都留空 → 回落到本机 `/login` 的订阅 OAuth;或用 `claude setup-token` 生成 `CLAUDE_CODE_OAUTH_TOKEN`(一年期、仅推理)。
- 在非交互(`-p`)下 `ANTHROPIC_API_KEY` 一旦存在就**总是优先**,故必须 unset。
- 启动时读 `system:init` 的 `apiKeySource` **校验**确实走的订阅 OAuth。
- **禁用 `--bare`**:它会跳过 OAuth/keychain,**并关掉 hooks / skills / plugins / MCP / CLAUDE.md** —— 与本设计的订阅+hooks 目标都冲突。

### 8.2 Agent SDK(`@anthropic-ai/claude-agent-sdk`)
- 用 **streaming-input 模式**(`prompt` = `AsyncIterable<SDKUserMessage>`),才能多轮发消息 + 运行时 `setModel` / `setPermissionMode`。一次性 string prompt 不能中途切模型。
- `query()` 产出 typed `SDKMessage` 联合:`system:init`(含 `apiKeySource`、`session_id`、`slash_commands`)、assistant(含 `tool_use` 块)、`result`,以及 `includePartialMessages` 的 `stream_event` token 增量。
- subagent 消息带 `parent_tool_use_id` → 用于归属到对应小人。
- skills:`settingSources` + `skills:'all'` + `allowedTools` 含 `'Skill'`,让模型可调;`/name` 直发仅限 init 列出的可用命令。

### 8.3 Hooks(进程内回调)
观测用,注册在 SDK 进程内,**全部 `async:true`、永不 `exit 2`**:
| Hook | 关键字段 | 用途 |
| --- | --- | --- |
| `SubagentStart` | `agent_id, agent_type, prompt` | 出生 → spawn 小人(**确定的 spawn-time 信号**) |
| `SubagentStop` | `+ stop_reason` | 离场 |
| `PreToolUse` | `tool_name, tool_input` | 工具开始 |
| `PostToolUse` | `+ tool_response` | 工具完成 |
| `PostToolUseFailure` | `error` | 工具失败 → 红灯 |
| (公共信封) | `session_id, transcript_path, cwd, hook_event_name, permission_mode`,在 subagent 内还带 `agent_id/agent_type` | 关联/归属 |

### 8.4 版本敏感点(启动时实测,别只信文档)
- `SubagentStart` / `agent_id`、`Task`→`Agent` 改名(v2.1.63)、SDK `/clear`(v2.1.117)、stdin 10MB 上限(v2.1.128)等都 gate 在具体版本。
- **启动先打一条 logging hook,抓真实 stdin JSON 形状**再依赖字段。
- 工具名检测**同时认 `Task` 和 `Agent`**(`Agent` 出现在 `tool_use` 块,但 `Task` 仍出现在 init 工具列表与 `permission_denials`)。

---

## 9. 成本 & 节流

> **背景**:2026-06-15 起,用 Agent SDK / `claude -p` 跑订阅会消耗一份**独立的月度 Agent SDK 额度**(指示性:Pro ~$20 / Max5x ~$100 / Max20x ~$200,**发布前需对最新支持页复核**)。一个持续跑的房间会烧得较快。

- **可视化本身不烧额度**:hooks 观测 + PixiJS 渲染都是本地零成本;烧额度的只有你本来就要跑的 Claude Code 推理 → "房间"是白送的。
- **空闲不空转**:无活跃 query 时会话进 idle,房间降帧/停动画;**绝不做心跳式自动调用**。
- **按需驱动**:只有用户发消息/触发 skill 才起 query。
- **内置用量计量**:借 ccusage 的 token/cost 归集;HUD/背包显示当前+累计;设置里可配**月度预算 + 告警阈值**,接近上限提醒 / 可自动暂停。

---

## 10. 健壮性 & 错误处理

- **乱序**:服务端单调 `seq`,按 `(sessionId, seq)` 定序;不信 hooks 到达顺序(并行、会去重)。
- **不阻塞**:观测 hooks 全 `async:true`,永不 `exit 2`(否则卡住真实操作)。
- **auth 校验**:启动验 `system:init.apiKeySource` = 订阅 OAuth;禁用 `--bare`。
- **版本漂移**:启动打 logging hook 抓真实 JSON 形状;`Task/Agent` 双名检测。
- **断连/崩溃**:WS 重连 + 事件缓冲补发;会话 query 崩溃 → 标 error 态(房间显示故障),可 `--resume`(用捕获的 `session_id`)。
- **隐私**:`tool_input/tool_response/prompt` 可能含文件内容/密钥 → collector 只绑 localhost、不持久化原始 payload、日志脱敏。
- **Fallback B 专属**:HTTP hooks 非 2xx 静默丢 → 加客户端 buffer/retry;主路径 A(进程内回调)无此问题。

---

## 11. 测试策略(核心:回放,不烧额度)

- **录制 fixture**:真跑一次,把 SDK 消息 + hook 事件录成脱敏 JSONL。
- **纯函数单测**:事件归一化器(hooks+SDK → 房间事件)、`(sessionId,seq)` 定序、`tool→图标`映射、状态机转移、loot 归集。
- **前端 store 单测**:reducer(事件流 → agent 树/状态);切会话 → 渲染源切换。
- **端到端冒烟**:回放 fixture 驱动房间,断言 `spawn→work→done→loot` 全链路(零成本,可进 CI)。
- **真连冒烟**(手动 / CI 外):真发一条消息,验订阅 auth + 真 subagent 出现(花少量额度)。
- 纪律(沿用 kata):**改后即测**,失败先修;不把局部通过说成全量通过。

---

## 12. 原型(MVP)范围与阶段

### 12.1 MVP(先做原型再开始)
1. **Engine**:用 Agent SDK streaming-input 起一个会话,发一条消息,订阅消息流 + 注册观测 hooks。
2. **捕获**:`SubagentStart / PreToolUse / PostToolUse / SubagentStop` → 归一化房间事件(带录制/回放)。
3. **房间**:PixiJS v8 渲染主控★ + 传送门 spawn subagent + 干活动画 + 离场 + 1 个 loot 掉落;CC0 占位素材。
4. **HUD**:💬 抽屉(≥1 会话可切)+ 💎 切模型(验 `setModel`)+ 📜 触发 1 个 skill。
5. **验证**:回放冒烟绿 + 一次真连冒烟看到真 subagent。

### 12.2 后续阶段(MVP 之后)
- 多会话完善、点小人弹窗全功能、📜技能格 / 🛡模式 / 🎒背包 / ⚙设置 全量。
- 精修像素美术与帧动画、音效、模式染色、额度预算 UI。
- Fallback CLI 模式(方案 B)。
- 桌面壳(Tauri 优先;参考 opcode 的进程注册/会话 resume)。

---

## 13. 技术栈 & 素材

### 13.1 技术栈
- **渲染**:**PixiJS v8 + @pixi/react v8**(均 MIT)。一块常驻 `Application` 画布;每个小人是包了 `AnimatedSprite` 的 React 组件,按 entity id 从 store(Zustand)取状态;spawn/despawn = 挂载/卸载(由 WS 事件驱动)。
- **性能**:每套角色共享一张 texture atlas 以批合并 draw call;sprite 池化。
- **特效**:`@pixi/particle-emitter` 做粒子;`GlowFilter` 做逐精灵霓虹;`AdvancedBloomFilter` 仅作一次场景 pass(`resolution=0.5`)。
- **前后端**:React + Bun/Node;WebSocket 传事件/命令。
- 备选:Phaser(若以后要物理/tilemap/相机);**不用** Kaboom/KAPLAY(性能差、无 React)与纯 Canvas/CSS(规模化吃力)。

### 13.2 素材(CC0 / 合规;《元气骑士》本体美术是版权的,用替身)
| 素材包 | 用途 | License |
| --- | --- | --- |
| **Pixel Frog · Tiny Swords** | 胖胖角色 Idle/Run/Attack,**最接近元气骑士手感** | CC0 |
| **0x72 · DungeonTileset II + Robot Tileset** | 动画英雄/敌人、地牢瓦片、武器、霓虹机器人角色 | CC0 |
| **Kenney · Tiny Dungeon / Tiny Battle / 1-Bit** | 16×16 top-down 角色/怪/瓦片/道具 | CC0 1.0 |
| **Ansimuz · Warped Top-Down Tech Lab** | 科幻实验室瓦片 + 霓虹道具 | CC0 |
> 避开 Anokolisa / Penzilla / Sprout Lands / Mystic Woods 的免费档(**非 CC0**);每个素材下载时复核 License。

---

## 14. 开源参考(借鉴点)

| 项目 | 借鉴 |
| --- | --- |
| **paulrobello/claude-office** | **最接近**:真 CC hooks → PixiJS 房间;主 agent=boss、subagent=employee。直接当蓝本 |
| **gukosowa/agents-in-the-office** | 最清晰的 **hook 驱动**架构:tool→家具映射、subagent=带 badge 的 NPC + 连父线 |
| **pixel-agents-hq/pixel-agents**(8k★) | Task subagent → 子角色;**教训:transcript 启发式状态常误判 → 用 hooks** |
| **GreenSheep01201/claw-empire** | PixiJS8 + React19;按 **git worktree** 跟踪任务(与本项目工作流契合) |
| **disler/...multi-agent-observability** · **simple10/agents-observe**(MIT) | hooks 事件管线蓝本(settings.json → 转发 → server → WS → UI) |
| **siteboon/claudecodeui**(11k★,AGPL) | 订阅模式 web wrapper 范本(CLI spawn stream-json → WS → React) |
| **a16z-infra/ai-town** | PixiJS 房间渲染管线 + Tiled→JSON 地图 + 服务端权威 sprite 状态 |
| **winfunc/opcode**(22k★,Tauri,AGPL) | 桌面壳:进程注册、会话 resume(后续阶段参考) |
| **ryoppippi/ccusage**(15k★) | token/cost 归集算法(用量计量) |

> 注意 License:opcode / claudecodeui 是 **AGPL**(copyleft);借**思路**为主,复用代码需评估传染性。优先参考 MIT 的 agents-observe / ai-town / claw-empire。

---

## 15. 工作流约定(沿用 kata)

- 独立仓库 `~/Projects/Roguent`(remote `github.com/koco-co/Roguent`)。
- **detached worktree 里实现、不建分支**;验证通过 → 记 HEAD SHA → `git merge --no-ff <sha>` 回 `main` → 再验证 → `git push origin main` → `git worktree remove`。
- Conventional Commits:`type: emoji description`,**英文标题**(type/emoji 照映射:feat 🧩 / fix 🩹 / refactor ✨ / docs 📝 / test 🧪 / chore 🧹 / ci 👷 / merge 🔀 …);body 可中文。
- **改后即测**:动了代码/配置/runtime 就跑相关测试,失败先修。

---

## 16. 风险 & 未决问题

- **额度成本**:持续运行烧独立 Agent SDK 额度(§9);需节流 + 用量可视化;$ 数字发布前复核。
- **版本耦合**:`SubagentStart`/`agent_id`/`Task↔Agent` 等 gate 在具体版本;老版本可能只有 `SubagentStop`(则从"首个带新 `agent_id` 的工具事件"推断出生)。
- **ToS**:仅驱动用户**本机**已登录的 CLI/SDK(支持路径);**不做**托管代登录 claude.ai。
- **subagent 交互粒度**:不能给运行中 subagent 发消息、不能单独叫停(§7.2);UI 已据实表达。
- **未决**:素材最终风格(占位 CC0 vs 自绘像素)、房间布局是否随 subagent 数量自适应、loot→产物的具体取材规则,留待原型迭代。

---

## 17. 研究来源(关键)

- 认证 / 优先级:`https://code.claude.com/docs/en/authentication`
- Headless / stream-json:`https://code.claude.com/docs/en/headless`
- Agent SDK(TS):`https://code.claude.com/docs/en/agent-sdk/typescript`
- Subagents:`https://code.claude.com/docs/en/agent-sdk/subagents`
- Hooks:`https://code.claude.com/docs/en/hooks`
- 订阅计费变更:`https://support.claude.com/en/articles/15036540`
- 栈/素材/参考项目:见 §13–§14 各条目链接。

> 本文档由 brainstorm(superpowers)产出并经多 agent 研究交叉验证;落地实现见后续 implementation plan(writing-plans)。
