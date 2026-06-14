# Roguent 端到端验证清单(E2E Checklist)

> `/goal` 的迭代账本。**单测 / tsc / check 绿 ≠ 功能好用**——本清单只认「在真实运行的 app 里走通用户实际路径 + 截图」。
> 每行:界面 → 入口 → 操作 / 预期终态 → 真 or mock → 状态 → 证据。
> 状态:`⬜` 未验证 · `✅` 通过 · `❌` 失败(记现象) · `🔧` 修复中。
> 证据 = 日期 + commit(若修了) + 一句话(截图看到什么 / DOM 断言)。**填 ✅ 必须有截图或 DOM 断言**。
> 真 / mock 取自 [CLAUDE.md](../CLAUDE.md) + ROADMAP §1.1:**真**数据面板要看到真数据;**mock** 面板只需渲染正常 + 无报错 + mock 标注在位。

---

## A. 大厅 / Overworld

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| avatar 移动 | 大厅 | WASD / 点击 → 主角直线移动到目标 | 真 | ⬜ | |
| 中央任务台 | 走到结构按 E / 点 | → 打开 SessionGrid(会话总览) | 真 | ⬜ | |
| 装饰商店结构 | 走到按 E | → 打开 Shop 面板 | mock | ⬜ | |
| 插件市场结构 | 走到按 E | → 打开 Market 面板 | mock | ⬜ | |
| 扭蛋机结构 | 走到按 E | → 打开 Gacha 面板 | 真(economy) | ⬜ | |
| 公告板结构 | 走到按 E | → 打开 Board 面板 | mock | ⬜ | |
| 邮箱结构 | 走到按 E | → 打开 Mailbox 面板 | mock | ⬜ | |
| 设置祭坛结构 | 走到按 E | → 打开 Settings 面板 | mock | ⬜ | |
| 成就殿结构 | 走到按 E | → 打开 Achievements 面板 | 真 | ⬜ | |
| 排行榜结构 | 走到按 E | → 打开 Leaderboard 面板 | 真 | ⬜ | |
| Claude / Codex 项目结构 | 走到按 E | → 对应项目入口 | 真 | ⬜ | |
| 装饰 / 黑猫 / 漫步小人 | 大厅 | 自动巡游 / 动效正常 | mock(视觉) | ⬜ | |
| 大厅彩蛋 | 触发条件 | → 彩蛋浮层出现 | mock(视觉) | ⬜ | |

## B. 视图 / 全局控件

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ViewSwitch 内景/大厅 | 左上 | 有会话时「内景」可点 → 进当前会话内景;「大厅」→ 回大厅 | 真 | ⬜ | 无会话时「内景」置灰(已知行为,见 ViewSwitch.tsx) |
| runtime chip Claude/Codex | 左上 | 切换 runtime;Codex 为占位 | 真/占位 | ⬜ | |
| skin 地牢/全息 | 左上 | 切换房间皮肤 | mock(视觉) | ⬜ | |
| 语言切换 中/EN | 顶 | 全 UI 中英切换 | 真 | ⬜ | |
| LimitBars 限额 | PlayerCard / Account | 5h / Weekly 用量(真 rate_limit_event) | 真 | ⬜ | |
| 登录 Start / login gate | 首屏 | 未登录态 → Start;订阅态正常进入 | 真 | ⬜ | |
| ESC 关面板链 | 任意面板 | ESC 逐层关闭 | 真 | ⬜ | |

## C. ButtonDock(顶右,两视图都有)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 信箱 Mailbox | dock | → Mailbox 面板;未读徽标 | mock | ⬜ | |
| 公告 Board | dock | → Board 面板 | mock | ⬜ | |
| 账号 Account | dock | → Account(订阅 plan + 5h/周用量) | 真 | ⬜ | |
| 配对 Pairing | dock | → Pairing 面板 | mock | ⬜ | |
| 设置 Settings | dock | → Settings 面板 | mock | ⬜ | |
| 菜单 SystemMenu | dock | → 菜单(继续/账号/runtime管理/保存导出/导入会话/活动/外观/关于/退出) | 混 | ⬜ | |

## D. 内景 / Interior(需先有会话)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 房间渲染 | 进内景 | 地板 + 主控★ + subagent 小人(游走/朝向/工具气泡/进出门/扬尘/待命表情) | 真 | ⬜ | |
| atlas 失败错误层 | 资源失败 | → 可见错误覆盖层 + 重试(不黑屏) | 真 | ⬜ | P1-1 已修,需复验 |
| SessionBanner | 顶中 | 显示当前会话;点击 → SessionGrid | 真 | ⬜ | |
| RosterCard | 左上 | 在岗 agent 轮播 | 真 | ⬜ | |
| BrowserScreen 指挥大屏 | 内景 | 实时工具流 tab/caption | 真 | ⬜ | |
| TaskWindow LIVE TASKS | 左下 | 真 sessionTodos | 真 | ⬜ | |
| Minimap | 左下 | 真 agents 缩略点 | 真 | ⬜ | |
| 环境控制 | 右下 | 辉光/雨幕/粒子/声音 切换 | 真(本地偏好) | ⬜ | |
| 内景彩蛋 | 触发 | → 浮层 | mock(视觉) | ⬜ | |

## E. Hotbar(内景底中)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 任务 | Hotbar | → SessionGrid | 真 | ⬜ | |
| 聊天 | Hotbar | → ChatDrawer | 真 | ⬜ | |
| 技能 | Hotbar | → Skills 面板 | 真 | ⬜ | |
| 插件市场 | Hotbar | → Market | mock | ⬜ | |
| 模型 | Hotbar | → ModelPicker | 真 | ⬜ | |
| 导入 | Hotbar | → ImportPanel | 真 | ✅ | 2026-06-14 / b35d091:菜单/卡/Hotbar 三入口均可开;点行→关面板+进内景+横幅显示会话;SessionGrid 重开「1/1 会话」出现导入卡片(截图 + DOM 断言) |
| 背包 | Hotbar | → Backpack / LootPanel | 真 | ⬜ | |
| 装饰商店 | Hotbar | → Shop | mock | ⬜ | |
| 排行 | Hotbar | → Leaderboard | 真 | ⬜ | |
| 成就 | Hotbar | → Achievements | 真 | ⬜ | |

## F. 面板内交互(逐个真走)

| 界面 | 关键交互 → 预期 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| SessionGrid 会话总览 | 过滤(runtime/项目/模型/仅活跃)、点卡进会话内景、导入卡、Scheduled Tasks 页签 | 真 | ⬜ | 导入→出现在列表 已随 D-导入验过 |
| ImportPanel 导入 | 扫描列表、点行导入、错误态 | 真 | ✅ | 见 E-导入 行 |
| ChatDrawer 聊天 | 发消息→timeline(message/thinking/tool/prompt 卡)、slash 菜单、stop、交互式权限 / AskUserQuestion | 真 | ⬜ | 真连冒烟放最后、少额度 |
| ModelPicker 模型 | 切模型 setModel 运行时生效 | 真 | ⬜ | |
| Skills 技能 | 列出技能(SDK init skills) | 真 | ⬜ | |
| Account 账号 | 订阅 plan + 5h/周用量 | 真 | ⬜ | |
| Backpack 背包 | loot.dropped → 入背包 | 真 | ⬜ | |
| Leaderboard 排行榜 | 渲染排行 | 真 | ⬜ | |
| Achievements 成就 | 成就引擎数据 | 真 | ⬜ | |
| SchedulerPanel 定时任务 | Scheduled Tasks 列表 / 增改 | 真 | ⬜ | |
| GachaPanel 扭蛋 | 抽卡循环 | 真(economy) | ⬜ | |
| Market 插件市场 | 列表 + mock 标注 | mock | ⬜ | |
| Shop 装饰商店 | 列表 + mock 标注 | mock | ⬜ | |
| Board 公告板 | 渲染 + mock 标注 | mock | ⬜ | |
| Mailbox 信箱 | 渲染 + 未读 + mock 标注 | mock | ⬜ | |
| Pairing 配对 | 渲染 + mock 标注 | mock | ⬜ | |
| Settings 设置 | 渲染 + mock 标注 | mock | ⬜ | |
| SystemMenu 菜单 | 各项点击路由(保存导出/导入/外观/关于…) | 混 | ⬜ | |

---

## 变更记录

- 2026-06-14:建表;导入(ImportPanel / Hotbar·SessionGrid·SystemMenu 三入口)验证通过(commit b35d091)。其余 ⬜ 待 `/goal` 续跑。
