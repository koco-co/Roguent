---
id: "§0"
title: 索引
updated: 2026-06-06
---

# Roguent PRD 索引

## 这是什么 / 怎么读

`docs/prds/` 是以子系统为单位的**工程产品真相源**:每篇 PRD 记录「做什么、为什么、功能点、交互边界」,所有描述都可以在代码里核实。

与同仓其它文档的分工:

- `docs/superpowers/specs/` — 设计取舍文档,描述「应该是什么样」,是 PRD 的上游输入。
- `docs/superpowers/plans/` — 历史实现记录,描述「当时怎么做到的」。
- `docs/ROADMAP.md` — 现状 + backlog 真相源,记录已知 bug、P1/P2 待办、里程碑进度。

frontmatter 字段含义:

| 字段 | 含义 |
|---|---|
| `status` | `implemented` 已实现可验证 / `partial` 部分实现(含 mock 或 planned 子项) / `mock` 整体为占位 / `planned` 尚未开始 |
| `layer` | `engine` 后端 / `web` 前端 / `cross` 跨层 / `tauri` 桌面壳 |
| `depends_on` | 本子系统强依赖的其它 PRD;被依赖方必须先就绪 |
| `related` | 弱关联的 PRD;双向引用,无强依赖顺序 |

## 13 篇一览

| § | 子系统 | layer | status | 一句话定位 |
|---|---|---|---|---|
| [§1](§1-core-driver.md) | 核心驱动与订阅模式 | engine | implemented | 用 Claude Agent SDK `query()` streaming-input 模式驱动订阅 OAuth 会话的引擎底座。 |
| [§2](§2-event-protocol.md) | 事件协议与归一化主链路 | cross | implemented | 连接引擎与前端的单一事件契约枢纽:将 SDK 消息与 hooks 归一化为带权威序号的 `RoomEvent` 信封,经 WebSocket 广播到前端折叠成渲染源状态。 |
| [§3](§3-room-render.md) | 房间可视化(内景) | web | implemented | PixiJS v8 内景渲染——把当前会话的 agent 树渲染成「一屋子小人在干活」。 |
| [§4](§4-overworld.md) | 总览世界与导航 | web | implemented | 双层视图切换枢纽:顶层可操控的广场大厅(overworld)与底层进入某个会话后的内景(interior),每个运行中的会话对应大厅里一个可交互 NPC。 |
| [§5](§5-sessions-chat.md) | 多会话与聊天抽屉 | cross | implemented | 按 `sessionId` 并行管理多个独立 Claude Agent 会话,聊天抽屉(ChatDrawer)提供多会话切换、消息输入与归档复活入口。 |
| [§6](§6-lifecycle-reconcile.md) | 会话生命周期与重连对账 | cross | implemented | 描述会话从建立到消亡的完整生命周期管理,以及 WebSocket 断连重连后客户端与引擎的状态对账机制。 |
| [§7](§7-hud-shell.md) | 游戏化 HUD 外壳与面板路由 | web | implemented | 覆盖在 PixiJS 画布上方的全局 React HUD 外壳,承载图标栏(ButtonDock/Hotbar)与各功能面板(Modal)的路由调度。 |
| [§8](§8-model-mode-skills.md) | 模型·权限模式·技能控制 | cross | partial | 运行时切换模型(setModel)、展示 permissionMode、Skills 面板加载真实 slash commands——权限模式运行时切换尚未实现。 |
| [§9](§9-usage-limits.md) | 用量与限额 | cross | implemented | HUD 左上角三条 LimitBars,展示 5h 滚动窗口、CTX 上下文窗口、会话级用量,源自 OAuth poll 与 rate_limit_event。 |
| [§10](§10-output-panels.md) | 任务·背包·排行榜(产出与计量) | web | partial | 展示 agent 产出与计量的四类面板:TaskWindow(真实 TodoWrite)、LootPanel(真实 tool 产出)、Leaderboard(真实用量排行)、Shop(mock 占位)。 |
| [§11](§11-import.md) | 本地会话导入 | cross | implemented | 扫描 `~/.claude/projects/` 的历史会话 JSONL,以「静态存档」方式导入为 Roguent 可视化会话,无需 SDK、零消耗账户额度。 |
| [§12](§12-visual-theme.md) | 视觉系统·主题·设置 | web | partial | 全站视觉基础设施:暖木 RPG 主题 token、像素图标、中文像素字体、固定逻辑舞台等比缩放及外观偏好持久化——Settings CONFIG 面板为 mock 占位。 |
| [§13](§13-desktop-packaging.md) | 桌面打包(Tauri sidecar) | tauri | partial | 把三层架构包成原生 macOS `.app`:Tauri 2 宿主壳 + engine sidecar + claude CLI 资源包,当前仅 Apple Silicon,端到端验证尚有若干 P1 待确认。 |

## 子系统依赖关系图

```
        §1 core-driver
        (engine 底座)
              │
              ▼
      §2 event-protocol  ◄─────────────────────────────────┐
      (归一化枢纽)                                          │
   ┌──┬──┬──┬──┬──┬──┬──┐                                  │
   ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼                                  │
  §3 §4 §5 §6 §9 §10 §11 §7(HUD 外壳)                     │
                           │                               │
                      ┌────┼──────┬────┬───┐               │
                      ▼   ▼      ▼    ▼   ▼               │
                     §8  §9     §10  §11 §12               │
               (model/    (usage) (output) (import) (visual)│
                mode/                                       │
               skills)                                      │
                 ▲                                          │
                 │(depends_on §1,§2,§7)                     │
                                                            │
  §12 visual(视觉基础设施,不依赖其它业务子系统)              │
        │ 被 §3/§4/§7 消费                                  │
        └──────────────────► §13 desktop-packaging ◄────(§1)┘
                             (仅 Apple Silicon)
```

依赖关系表(depends_on):

| PRD | 强依赖 |
|---|---|
| §1 | — |
| §2 | §1 |
| §3 | §2 |
| §4 | §2 |
| §5 | §1, §2 |
| §6 | §2, §5 |
| §7 | §2 |
| §8 | §1, §2, §7 |
| §9 | §1, §2, §7 |
| §10 | §2, §7 |
| §11 | §2, §7 |
| §12 | — |
| §13 | §1, §12 |

## 真假分明速查

以下为 `status: partial` 的四篇及其 mock / planned 子项:

**§8 模型·权限模式·技能控制**
- `setPermissionMode` 运行时切换:**(planned)** — Driver 无此方法,`permissionMode` 在 Options 构造时固定为 `"default"`,SDK Query 未暴露运行时切换接口;切换需销毁重建 Driver 并丢失对话上下文,待产品决策。
- Skills 图标/稀有度/锁定格:**(mock 装饰)** — `SKILL_DECOR` / `MOCK_LOCKED` 为原型外观示例,面板顶部有 `.skill-mock-note` 显式标注。

**§10 任务·背包·排行榜**
- TaskWindow / Tasks 主体 / LootPanel / Leaderboard(会话·模型):**(真数据)** — 直接读 `useRoomStore`。
- 底部 inter-agent 信箱:**(mock)** — `.task-mock-banner` 显式标注「信箱为示例 · 引擎暂无 inter-agent 信箱」。
- Shop / gems:**(整体 mock 占位)** — 不接任何真实 store。
- Currency 完成数(桂冠):**(真数据)** — 当前会话已完成 TodoWrite 计数;同栏 gems 为 **(mock 占位)**,带「示例」角标 + title 提示。

**§12 视觉系统·主题·设置**
- Settings CONFIG 面板:**(整体 mock 占位)** — 面板顶部 `.task-mock-banner` 标注「示例数据,引擎不读写真实配置」;控件中的模型列表/Hooks/自定义配置为静态 mock,增删按钮不绑真实逻辑,底部「还原/保存」不写盘。
- `hud-compact` / `no-motion` CSS:**(部分待完善)** — CSS 变量已定义,部分组件响应不完整。
- `--bg-*` 孤儿 token:**(待清理)** — 若干 `--bg-` 前缀变量未被任何组件引用,待删除。

**§13 桌面打包(Tauri sidecar)**
- 打包 `.app` 主画布黑屏未确认:**(P1-4 待验)** — atlas 资源路径在 `tauri://localhost` 协议下是否可达尚未验证。
- 端到端验收清单未固化:**(P1-5 待跑)** — 回放模式 + LIVE spawn 未完整跑通。
- DMG 打包失败:**(P1-6 待修)** — `bundle_dmg.sh` 报错,`rw.*.dmg` 残留;短期可收成 `bundle.targets: ["app"]`。
- 仅 Apple Silicon(darwin-arm64):第一阶段硬编码,Intel Mac 未测试、未列入 DoD。

其余 §1 / §2 / §3 / §4 / §5 / §6 / §7 / §9 / §11 均为 `implemented`。
注:§4 大厅核心为真实实现(传送门过场 / 方向键移动 / SessionGrid 进出会话);会话 NPC 在大厅自主走动为 planned 增强(当前进出会话经 SessionGrid 面板,非走近 NPC),已在 §4 §3 功能点 / §6 现状中标注。
