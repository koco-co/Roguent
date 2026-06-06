---
id: "§8"
title: 模型·权限模式·技能控制
status: partial
layer: cross
updated: 2026-06-06
depends_on: ["§1", "§2", "§7"]
related: ["§5"]
code_refs:
  - src/web/hud/ModelPicker.tsx
  - src/web/hud/Skills.tsx
  - src/engine/ws-gateway.ts
  - src/engine/driver.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---

# §8 模型·权限模式·技能控制

## 1. 定位

本子系统负责三件事:

1. **运行时切换模型**:用户在 ModelPicker 面板选择目标模型,向引擎下发 `setModel` 命令,热切换当前会话的运行模型,无需销毁重建 Driver。
2. **权限模式管理**:展示并(将来)切换当前会话的 `permissionMode`(`default`/`plan`/`acceptEdits` 等)。当前 permissionMode 由 SDK `system:init` 下发后经 `session.created` 事件传递到前端,只读可见,运行时切换尚未实现。
3. **技能触发**:Skills 法术书面板从当前会话的 `slashCommands`(由 SDK init 的 `slash_commands` 字段传入)读取真实可用命令,点击即以 `sendMessage` 命令把 `/<name>` 注入该会话。

本子系统是 streaming-input 架构(方案 A)的**专属能力**:setModel 必须在已建立的 Query 实例上调用,不销毁历史上下文;permissionMode 的运行时切换若要实现也必须基于 streaming-input 驱动。

## 2. 为什么

Agent SDK 两种模式对比:

| 能力 | 单次 query | streaming-input(方案 A) |
|------|------------|------------------------|
| 运行时 `setModel` | 不支持(每次 query 重建) | **支持**:Query 实例暴露 `setModel()` |
| 运行时 `setPermissionMode` | 不支持 | 理论可支持(当前 SDK 未暴露,需销毁重建 Driver 绕行) |
| 连续对话 | 每轮重建,需手动拼 history | **原生**:同一 Query 持久持有 session |
| skill/slash 注入 | 重建时设 settingSources | **运行时注入**:已有 settingSources 加载,随时 sendMessage |

架构选型时,`setModel` 的运行时支持是方案 A(streaming-input)的**决定性理由之一**。

## 3. 功能点

- **ModelPicker 运行时切模型**（已实现）:面板展示三档模型(Opus 4.8 / Sonnet 4.6 / Haiku 4.5),点击触发 `sendCommand({cmd:"setModel", sessionId, model})`,当前选中高亮展示 `session.model`。
- **权限模式选择器**（planned）:运行时切换 `permissionMode`。当前 permissionMode 从 SDK init 经 `session.created` payload 传入前端并显示,但 Driver 无 `setPermissionMode` 方法,引擎侧尚未实现运行时切换。
- **技能格展示与触发**（部分实现）:Skills 法术书从 `session.slashCommands` 加载真实可用命令,点击以 `sendMessage`(`/<name>`)注入会话；图标/稀有度/锁定格均为 mock 装饰。
- **settingSources 驱动 skill 加载**（已实现）:Driver 初始化时 `settingSources:["user","project"]` 加载 CLAUDE.md 和 project 级 skill 定义,SDK init 返回的 `slash_commands` 作为 `slashCommands` 随 `session.created` 下发。

## 4. 交互边界

### 上游

| 依赖 | 交互内容 |
|------|----------|
| **§1 核心 Driver** | `Driver.setModel(model)` 代理 `Query.setModel(model)`;`Driver` 构造时 `settingSources:["user","project"]` 加载 skill；Driver 无 `setPermissionMode` 方法(planned) |
| **§2 事件协议** | 命令上行通道:`parseCommand` 识别 `setModel` 命令;`session.created` payload 携带 `permissionMode`/`slashCommands` 下发前端 |
| **§7 HUD 面板宿主** | `activePanel:"model"` 激活 ModelPicker;`activePanel:"skills"` 激活 Skills;两面板均通过 `closePanel()` 关闭 |

### 下游

| 依赖 | 交互内容 |
|------|----------|
| **§5 会话·对话** | 会话独立持有 `model`/`permissionMode`/`slashCommands`；ModelPicker 读 `session.model` 显示当前选中态；Skills 读 `session.slashCommands` 枚举可用命令 |

### 契约

- `setModel` 命令格式:`{ cmd:"setModel", sessionId:string, model:string }`;ws-gateway `parseCommand` case `"setModel"` 校验两字段均为字符串后转发。
- `session.created` payload 中 `permissionMode` 字段必须存在(synthesized 默认为 `"default"`,SDK init 后幂等合并为真实值)。
- `slashCommands` 字段为 `string[]`(可为空数组),来自 SDK `system:init.slash_commands`;前端只读取,不写回。
- skill 触发走 `sendMessage` 命令(`{ cmd:"sendMessage", sessionId, text:"/<name>" }`),不新增专用命令。

## 5. 数据流与关键约定

### setModel 流程

```
ModelPicker 点击
  → sendCommand({cmd:"setModel", sessionId, model})        [ws-client]
  → WS 上行
  → ws-gateway.parseCommand → case "setModel"              [ws-gateway.ts:43-46]
  → SessionManager.setModel(sessionId, model)              [session.ts:170]
  → Driver.setModel(model)                                 [driver.ts:159]
  → Query.setModel(model)                                  [SDK 内部,热切换]
```

model 切换后下一轮 LLM 推理生效;**不**产生 `session.updated` 事件下发前端——前端当前以 `session.created` 中的 `model` 字段为初始真相源,`setModel` 调用后的模型切换反映在前端靠乐观更新(点击即高亮所选卡,下次 session.created/updated 覆盖校正)。

### permissionMode 传递流程

```
SessionManager.createSession 合成 session.created { permissionMode:"default" }
  → broadcast → 前端 reducer                              初始化显示 "default"

SDK system:init → normalize → session.created { permissionMode:<real> }
  → broadcast → 前端 reducer 幂等合并(不重建会话)        覆盖为真实值
```

permissionMode **只读可见**,前端无法主动修改(planned:需 Driver 新增 `setPermissionMode` 或销毁重建 Driver 并透传新 Options)。

### skill 触发流程

```
session.slashCommands (来自 SDK init slash_commands)
  → Skills 面板 render 枚举
  → 点击 → sendCommand({cmd:"sendMessage", sessionId, text:"/<name>"})
  → ws-gateway → SessionManager.sendMessage → Driver.send(text)
  → 注入 streaming-input AsyncIterable → SDK 执行 slash 命令
```

**settingSources 的作用**:Driver 构造时 `settingSources:["user","project"]` 让 SDK 加载本地 CLAUDE.md 和项目级 skills 定义,这决定了 `slash_commands` 中哪些命令可用。settingSources 在 Driver 构造时固定,运行时不可更改。

## 6. 现状与边界

| 功能 | 状态 | 说明 |
|------|------|------|
| ModelPicker `setModel` | **真实** | `Driver.setModel` → `Query.setModel`,热切换无需重建;前端面板已实现(三档模型硬编码) |
| `permissionMode` 只读展示 | **真实(部分)** | `session.created` payload 携带,前端 store 已存储并经 store.test 验证;面板展示 TBD |
| 运行时 `setPermissionMode` | **(planned)** | Driver 无此方法(`driver.ts:108` permissionMode 在 Options 构造时固定为 `"default"`);SDK Query 未暴露运行时切换接口;切换需销毁重建 Driver,会丢失当前对话上下文 |
| Skills 真实命令触发 | **真实** | `session.slashCommands` 来自 SDK init,点击走 `sendMessage` 通道注入 |
| Skills 图标/稀有度/锁定格 | **mock 装饰** | SKILL_DECOR / MOCK_LOCKED 为忠实原型外观的示例装饰,面板顶部有 `.skill-mock-note` 显式标注 |
| `set_permission_mode` 命令 | **不存在** | `parseCommand` 仅支持:`newSession`/`sendMessage`/`setModel`/`interrupt`/`deleteSession`/`listLocalSessions`/`importSession`——无 `set_permission_mode` case |

**取舍说明**:`setPermissionMode` 运行时切换被标为 planned 的根本原因:SDK `Query` 当前未暴露 `setPermissionMode()` 方法,`permissionMode` 仅作为 `Options` 的初始化参数在 Query 构建时传入。若要在运行时切换,必须销毁当前 Driver(丢弃 Query 实例)并以新 Options 重建,代价是丢失当前对话上下文和内存中的 agent 状态。这一代价需要产品层决策(是否值得,或等 SDK 暴露接口)。

## 7. 代码锚点

| 位置 | 说明 |
|------|------|
| `src/web/hud/ModelPicker.tsx:82-86` | `sendCommand({cmd:"setModel", sessionId, model})` 触发点 |
| `src/web/hud/ModelPicker.tsx:23-47` | MODELS 硬编码三档模型列表 |
| `src/web/hud/Skills.tsx:101-102` | `session.slashCommands` 读取入口 |
| `src/web/hud/Skills.tsx:136-141` | 技能触发:`sendCommand({cmd:"sendMessage", text:"/<name>"})` |
| `src/web/hud/Skills.tsx:54-90` | MOCK_LOCKED 锁定占位格(mock 装饰) |
| `src/engine/ws-gateway.ts:17` | `Command` 联合类型含 `setModel` |
| `src/engine/ws-gateway.ts:43-46` | `parseCommand` case `"setModel"` 解析 |
| `src/engine/ws-gateway.ts:115` | `onCommand` dispatch → `mgr.setModel(...)` |
| `src/engine/driver.ts:106-116` | Driver `start()` 构造 Options,`permissionMode:"default"` 固定写死处 |
| `src/engine/driver.ts:109` | `settingSources:["user","project"]` skill 加载配置 |
| `src/engine/driver.ts:159-161` | `Driver.setModel(model)` → `Query.setModel(model)` |
| `src/engine/session.ts:84` | `createSession` 合成 `session.created` 含 `permissionMode:"default"` |
| `src/engine/session.ts:170-171` | `SessionManager.setModel` → `Driver.setModel` |
| `src/shared/events.ts:32-45` | `SessionCreatedPayload` 含 `permissionMode`/`slashCommands` 字段定义 |

## 8. 验收

### 已覆盖

- `src/engine/ws-gateway.test.ts` — `parseCommand` 接受 `setModel` 命令(sessionId + model 均为字符串)并返回正确 cmd 字段;拒绝未知命令。
- `src/web/store.test.ts:462-499` — `permissionMode` 经两次 `session.created` 幂等合并:synthesized 默认 `"default"` → SDK init 真实值覆盖;已有非 default 值不被后续 default 覆盖。
- `src/web/store.test.ts:33-61` — `slashCommands` 经第二条 `session.created`(SDK init)幂等合并填充。

### 待补充验收(配合 planned 功能)

- `setPermissionMode` 实现后:`parseCommand` 需新增 `set_permission_mode` case 测试;store 需测试前端命令发出路径。
- ModelPicker 乐观更新:setModel 命令发出后前端 `session.model` 应立即反映新模型(当前无对应 store 测试)。
- skill 触发 E2E:回放 fixture 验证 `/<name>` 进入 Driver 的 userStream 并触发对应命令执行。
