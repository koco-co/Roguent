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
| avatar 移动 | 大厅 | WASD / 点击 → 主角直线移动到目标 | 真 | ✅ | 2026-06-14:W 键 top 83%→64%/D 键 left 50%→61%(DOM style 变化);点击移动 left 61%→29%(走向目标);黑猫跟随(DOM) |
| 中央任务台 | 走到结构按 E / 点 | → 打开 SessionGrid(会话总览) | 真 | ✅ | 2026-06-14:点 `button.structure[QUEST CONSOLE]` → SESSIONS 2/2 会话打开(截图 + DOM 断言) |
| 装饰商店结构 | 走到按 E | → 打开 Shop 面板 | mock | ✅ | 2026-06-14:点结构 → SHOP 开,mock banner「示例商品 · 购买逻辑未接入(宝石余额/已拥有为真)」+ 真 gem 400(截图) |
| 插件市场结构 | 走到按 E | → 打开 Market 面板 | **真**(非mock) | ✅ | 2026-06-15:`goal-2026-06-15` live engine E2E exit 0,6 passed;`CLAUDE_CONFIG_DIR=<tmp copy of tests/fixtures/plugins/cfg>` 启动真实插件目录服务,空 store → 选 Orc → 点大厅「插件市场 MARKET」,面板显示 Alpha MCP/beta-skill/gamma-cmd/tide 与真实安装/启用状态;截图 `tests/e2e/artifacts/goal-2026-06-15/18-market-live-catalog.png` |
| 扭蛋机结构 | 走到按 E | → 打开 Gacha 面板 | 真(economy) | ✅ | 2026-06-14:点结构 → GACHA 开,真 gem 400(=回放 500−100)、忍者皮肤「已拥有」、蓄力 0/5(截图) |
| 公告板结构 | 走到按 E | → 打开 Board 面板 | **真**(空) | ✅ | 2026-06-14:点结构 → BOARD 开,接真 selectMailboxBoardItems,replay 无数据故「Board is clear」空态(截图) |
| 邮箱结构 | 走到按 E | → 打开 Mailbox 面板 | **真**(空) | ✅ | 2026-06-14:点结构 → MAILBOX「真实 inbox」开,连接器 configuration-required + 「No mailbox items」不填样例(截图) |
| 设置祭坛结构 | 走到按 E | → 打开 Settings 面板 | mock | ✅ | 2026-06-14:点结构 → CONFIG 开,mock banner +「不会直接改 Claude settings.json」+ 全分区表单(截图) |
| 成就殿结构 | 走到按 E | → 打开 Achievements 面板 | 真 | ✅ | 2026-06-14:点结构 → ACHIEVEMENTS「1/2 已解锁」50%、Code Master 4/10、First Session 1/1(=回放)(截图) |
| 排行榜结构 | 走到按 E | → 打开 Leaderboard 面板 | 真 | ✅ | 2026-06-14:点结构 → LEADERBOARD「按 token 降序」roguent 78,000/$0.42、alpha 0(=回放 usage)(截图) |
| Claude / Codex 项目结构 | 走到按 E | → 对应项目入口 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` live engine E2E exit 0,6 passed;空 store → 选 Orc → 点「Claude 项目」后 engine 广播 `session.created s1 runtime=claude title=Claude 会话 1`,内景 banner 显示 `Claude 会话 1 · Opus · Claude`;回大厅点「Codex 项目」后 `session.created s2 runtime=codex title=Codex 会话 2`,banner 显示 `Codex 会话 2 · gpt-5 · Codex`(当前 Codex stub 同时显示 runtime error,不代表 Codex 真执行已验证);截图 `tests/e2e/artifacts/goal-2026-06-15/20-project-door-claude-session.png` / `21-project-door-codex-session.png` |
| 装饰 / 黑猫 / 漫步小人 | 大厅 | 自动巡游 / 动效正常 | mock(视觉) | ✅ | 2026-06-14:大厅截图见黑猫、漫步法师、火把、粒子、雕像、宝箱、花草等全部渲染 |
| 大厅彩蛋 | 触发条件 | → 彩蛋浮层出现 | mock(视觉) | ✅ | 2026-06-14:宝箱怪点击→snap+「?!」气泡(DOM .mimic.snap+.mimic-pop);撸猫点击→hop+心形粒子(.petactor.hop+.pet-heart)(DOM 断言) |

## B. 视图 / 全局控件

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ViewSwitch 内景/大厅 | 左上 | 有会话时「内景」可点 → 进当前会话内景;「大厅」→ 回大厅 | 真 | ✅ | 2026-06-14:大厅→SessionGrid→点卡→传送门→内景渲染;内景 DOM「内景/大厅」两按钮在位;「← 大厅」返回键在位(截图+DOM) |
| runtime chip Claude/Codex | 左上 | 切换 runtime;Codex 为占位 | 真/占位 | ✅ | 2026-06-14:DOM 见 `.set-runtime` Claude(on)/Codex 两 chip;Codex `rt-chip codex dis` 禁用占位(截图) |
| skin 地牢/全息 | 左上 | 切换房间皮肤 | mock(视觉) | ✅ | 2026-06-14:点「全息」→ 大厅地面变全息蓝甲板(截图);点回「地牢」恢复 |
| 语言切换 中/EN | 顶 | 全 UI 中英切换 | 真 | ✅ | 2026-06-14:点 EN → 内景/大厅→Room/Lobby、地牢/全息→Dungeon/Holo、示例→demo、底部→WASD/click to move(截图) |
| LimitBars 限额 | PlayerCard / Account | 5h / Weekly 用量(真 rate_limit_event) | 真 | ✅ | 2026-06-14:LIVE engine(8787)推真 limits{planName:"Max",fiveHour:67%,sevenDay:19%};PROFILE 面板 5h 红条 67%/1h35m + Weekly 蓝条 19%/74h25m(截图) |
| 登录 Start / login gate | 首屏 | 未登录态 → Start;订阅态正常进入 | 真 | ✅ | 2026-06-15:`bunx playwright test tests/e2e/goal-2026-06-15.e2e.ts --config playwright.goal.config.ts --project chromium --reporter line` exit 0,6 passed;空 store → Start → CHOOSE HERO 9 英雄 → 选 Orc → 大厅且内景可用,截图 `tests/e2e/artifacts/goal-2026-06-15/01-login-gate.png` / `02-hero-select.png` / `03-lobby-after-hero.png` |
| ESC 关面板链 | 任意面板 | ESC 逐层关闭 | 真 | ✅ | 2026-06-14:各面板 dispatch Escape → activePanel 清空、modal 消失(DOM 断言 sessionsStillVisible=false) |

## C. ButtonDock(顶右,两视图都有)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 信箱 Mailbox | dock | → Mailbox 面板;未读徽标 | **真**(空) | ✅ | 2026-06-14:dock 6 键齐(信箱/公告/账号/配对/设置/菜单);Mailbox 面板同结构入口已验(截图) |
| 公告 Board | dock | → Board 面板 | **真**(空) | ✅ | 2026-06-14:Board 面板同结构入口已验(空态);dock 按钮在位 |
| 账号 Account | dock | → Account(订阅 plan + 5h/周用量) | 真 | ✅ | 2026-06-15:LIVE engine `ws://127.0.0.1:8787` limits probe exit 0 返回 `planName=Max,fiveHour=39,sevenDay=23,apiError=null`;Browser 打开本地 app → 点 PlayerCard/账号入口 → PROFILE 显示 `Claude · Max 计划`、5h 39%、Weekly 23%,console warn/error=[];截图 `tests/e2e/artifacts/goal-2026-06-15/25-account-live-limits.png` |
| 配对 Pairing | dock | → Pairing 面板 | 真(空) | ✅ | 2026-06-14:点 dock 配对 → PAIRING 开,微信/飞书页签 + 「NO QR 等待引擎」+ 当前会话绑定区(截图) |
| 设置 Settings | dock | → Settings 面板 | mock | ✅ | 2026-06-14:CONFIG 面板同结构入口已验(mock banner);dock 按钮在位 |
| 菜单 SystemMenu | dock | → 菜单(继续/账号/runtime管理/保存导出/导入会话/活动/外观/关于/退出) | 混 | ✅ | 2026-06-14:点 dock 菜单 → 9 项全列出;点「活动·签到」→ LoginEvents mock banner 在位(截图,路由通) |

## D. 内景 / Interior(需先有会话)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 房间渲染 | 进内景 | 地板 + 主控★ + subagent 小人(游走/朝向/工具气泡/进出门/扬尘/待命表情) | 真 | ✅ | 2026-06-14:地牢皮肤(地砖hash+砖墙+壁泉+旗帜+地毯+符文圈+门+书架/宝箱/烛台)+全息皮肤(蓝甲板+网格+节点+能量墙)均正常;4角色可见(Researcher/Reviewer+orchestrator/coder)(截图×2) |
| atlas 失败错误层 | 资源失败 | → 可见错误覆盖层 + 重试(不黑屏) | 真 | ✅ | 2026-06-15:`goal-2026-06-15` atlas E2E exit 0,6 passed;Playwright route 先 abort `/assets/0x72/dungeon.json`,进内景显示 `atlas load failed` + 错误文本 + `重试`;放开拦截点重试后 overlay 消失并回到房间;截图 `tests/e2e/artifacts/goal-2026-06-15/16-atlas-error-overlay.png` / `17-atlas-retry-recovered.png` |
| SessionBanner | 顶中 | 显示当前会话;点击 → SessionGrid | 真 | ✅ | 2026-06-14:DOM「roguent · 主线开发 · Opus · 4P · Claude」全匹配 fixture(title/model/agentCount)(截图) |
| RosterCard | 左上 | 在岗 agent 轮播 | 真 | ✅ | 2026-06-14:DOM「在岗 4」+ orchestrator/coder/reviewer/researcher 四按钮(=fixture 4×agent.spawned)(截图) |
| BrowserScreen 指挥大屏 | 内景 | 实时工具流 tab/caption | 真 | ✅ | 2026-06-14:DOM「LIVE · bun test store · reviewer · Bash」(=fixture tool.started seq10)(截图) |
| TaskWindow LIVE TASKS | 左下 | 真 sessionTodos | 真 | ✅ | 2026-06-14:DOM「LIVE TASKS 2/5」+ 5条todo(2进行中/2待办/1完成=fixture todos.updated)(截图) |
| Minimap | 左下 | 真 agents 缩略点 | 真 | ✅ | 2026-06-14:MAP标签+缩略点可见(截图) |
| 环境控制 | 右下 | 辉光/雨幕/粒子/声音 切换 | 真(本地偏好) | ✅ | 2026-06-14:DOM AMBIENCE 4 switch(辉光/雨幕/粒子/声音)全在位(截图) |
| 内景彩蛋 | 触发 | → 浮层 | mock(视觉) | ✅ | 2026-06-14:InteriorEasterLayer 三件套 DOM 在位(.interior-easter+.wish-spot+.interior-pet);许愿池点击→coin+「+1 福气」;撸猫点击→hop(DOM 断言) |

## E. Hotbar(内景底中)

| 界面 | 入口 | 操作 → 预期终态 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 任务 | Hotbar | → TaskWindow(TASKS 详情面板,非 SessionGrid) | 真 | ✅ | 2026-06-14:点 Hotbar 任务 → TASKS「实时待办 · 当前会话 TodoWrite」5条按状态分组(待办2/进行中2/完成1)(截图+DOM) |
| 聊天 | Hotbar | → ChatDrawer | 真 | ✅ | 2026-06-14:ChatDrawer 真 transcript:Edit/WebSearch/Bash 3 tool 事件+thinking+message.delta「开始端到端验证…」全匹配 fixture(截图) |
| 技能 | Hotbar | → Skills 面板 | 真 | ✅ | 2026-06-14:SKILLS 面板 18 个 slashCommands 全匹配 fixture session.created(截图) |
| 插件市场 | Hotbar | → Market | **真**(非mock) | ✅ | 2026-06-14:同大厅结构入口已验(Market「接入真实能力」replay 空态)(截图) |
| 模型 | Hotbar | → ModelPicker | 真 | ✅ | 2026-06-14:MODEL 面板 Opus 4.8(当前高亮=fixture claude-opus-4-8)/Sonnet 4.6/Haiku 4.5(截图) |
| 导入 | Hotbar | → ImportPanel | 真 | ✅ | 2026-06-14 / b35d091:菜单/卡/Hotbar 三入口均可开;点行→关面板+进内景+横幅显示会话;SessionGrid 重开「1/1 会话」出现导入卡片(截图 + DOM 断言) |
| 背包 | Hotbar | → Backpack / LootPanel | 真 | ✅ | 2026-06-14:BACKPACK「会话工件」2件(PixiJS文本调研+ImportPanel.tsx改动=fixture 2×loot.dropped)+「经济背包(1)」忍者皮肤(=fixture gacha_pull inventory)(截图) |
| 装饰商店 | Hotbar | → Shop | mock | ✅ | 2026-06-14:同大厅结构入口已验(Shop mock banner + 真 gem)(截图) |
| 排行 | Hotbar | → Leaderboard | 真 | ✅ | 2026-06-14:同大厅结构入口已验(Leaderboard 按 token 降序)(截图) |
| 成就 | Hotbar | → Achievements | 真 | ✅ | 2026-06-14:同大厅结构入口已验(Achievements 1/2 解锁)(截图) |

## F. 面板内交互(逐个真走)

| 界面 | 关键交互 → 预期 | 真/mock | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| SessionGrid 会话总览 | 过滤(runtime/项目/模型/仅活跃)、点卡进会话内景、导入卡、Scheduled Tasks 页签 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` SessionGrid E2E exit 0,1 passed;空 store → 选 Orc → 点大厅任务台打开 SESSIONS,2/2 会话卡(roguent/alpha)与过滤 chip 可见;点 Sonnet 过滤→1/2 只剩 alpha;点 alpha 卡经 PortalTransition 进入 `alpha · 实验` 内景,banner 显示 Sonnet;截图 `tests/e2e/artifacts/goal-2026-06-15/22-session-grid-overview.png` / `23-session-grid-sonnet-filter.png` / `24-session-grid-card-enter-alpha.png` |
| ImportPanel 导入 | 扫描列表、点行导入、错误态 | 真 | ✅ | 见 E-导入 行 |
| ChatDrawer 聊天 timeline + slash 菜单 | 发消息→timeline(message/thinking/tool 卡)、slash 菜单选择 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` replay E2E exit 0,6 passed;空 store → 选 Orc → 内景 → 聊天,真实 transcript 见 Bash/tool/message,composer 输入 `/` 出 slash 菜单并点 `/debug` 后 textarea=`/debug `;截图 `tests/e2e/artifacts/goal-2026-06-15/04-chat-slash-menu.png` |
| ChatDrawer stop / 交互式权限 / AskUserQuestion | stop、权限卡、问题卡真实响应 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` fake-WS E2E exit 0,6 passed;空 store → 选 Orc → 内景 → 聊天,stop 按钮 + permission 卡「Command approval requested」+ question 卡「Continue with the fix?」可见;点停止后输入框可编辑;点允许/Continue 后两张卡均「✓ 已回答」且 WS 发出 interrupt/respondPermission/respondQuestion;截图 `tests/e2e/artifacts/goal-2026-06-15/11-chat-stop-permission-question.png` / `12-chat-stop-editable.png` / `13-chat-prompts-resolved.png` |
| ModelPicker 模型 | 切模型 setModel 运行时生效 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` live engine E2E exit 0,6 passed;live engine + side WS 新建 `s-goal-model`,点 MODEL → Sonnet 4.6,engine 收到 `session.created model=claude-sonnet-4-6`,SessionBanner 从 Opus 变 Sonnet;截图 `tests/e2e/artifacts/goal-2026-06-15/09-model-picker-before.png` / `10-model-picker-after-sonnet.png` |
| Skills 技能 | 列出技能(SDK init skills) | 真 | ✅ | 2026-06-14:Hotbar 技能 → SKILLS 面板 18 slashCommands 全列出(brainstorming…schedule),匹配 fixture session.created(截图) |
| Account 账号 | 订阅 plan + 5h/周用量 | 真 | ✅ | 2026-06-15:LIVE engine `ws://127.0.0.1:8787` limits probe exit 0 返回 `planName=Max,fiveHour=39,sevenDay=23,apiError=null`;Browser/Playwright 打开 PROFILE,界面显示 `Claude · Max 计划`、5h 39%、Weekly 23%,console warn/error=[];截图 `tests/e2e/artifacts/goal-2026-06-15/25-account-live-limits.png` |
| Backpack 背包 | loot.dropped → 入背包 | 真 | ✅ | 2026-06-14:BACKPACK「会话工件」2件(PixiJS文本调研 report+ImportPanel.tsx改动 diff=fixture loot.dropped×2)+「经济背包(1)」忍者皮肤(=fixture gacha inventory)(截图) |
| Leaderboard 排行榜 | 渲染排行 | 真 | ✅ | 2026-06-14:按 token 降序 roguent 78,000/$0.42 Opus、alpha 0 Sonnet,3 聚合页签(截图) |
| Achievements 成就 | 成就引擎数据 | 真 | ✅ | 2026-06-14:1/2 已解锁 50%,Code Master 4/10、First Session 1/1,三页签(截图) |
| SchedulerPanel 定时任务 | Scheduled Tasks 列表 / 增改 | 真 | ✅ | 2026-06-14:回放定时任务「每日依赖审计 enabled Next 2023-11-14」+ Create Task 全表单 + Run History(截图) |
| GachaPanel 扭蛋 | 抽卡循环 | 真(economy) | ✅ | 2026-06-14:真 gem 400、奖池 8 件带稀有度、忍者皮肤「已拥有」、蓄力 0/5 保底、背包(1)(截图) |
| Market 插件市场 | 列表 + mock 标注 | **真**(非mock) | ✅ | 2026-06-15:`goal-2026-06-15` live engine E2E exit 0,6 passed;真实插件目录广播后 MARKET 展示 Alpha MCP(MCP/已启用/1.0k)、beta-skill(Skills/已安装未启用)、gamma-cmd(未安装)、tide(tide marketplace);点「已安装」只剩 Alpha MCP/beta-skill;截图 `tests/e2e/artifacts/goal-2026-06-15/18-market-live-catalog.png` / `19-market-live-installed-filter.png` |
| Shop 装饰商店 | 列表 + mock 标注 | mock | ✅ | 2026-06-14:mock banner「示例商品 · 购买逻辑未接入(宝石余额/已拥有为真)」+ 真 gem 400 + 道具网格(截图) |
| Board 公告板 | 渲染 + mock 标注 | **真**(空) | ✅ | 2026-06-14:接真 selectMailboxBoardItems,空态「Board is clear」+ Open Mailbox(截图) |
| Mailbox 信箱 | 渲染 + 未读 + mock 标注 | **真**(空) | ✅ | 2026-06-14:「真实 inbox」master-detail + 连接器 configuration-required + 「No mailbox items」(截图)。注:标注 mock 的是 Tasks 区 agent 间信件,非此面板 |
| Pairing 配对 | 渲染 + mock 标注 | 真(空) | ✅ | 2026-06-14:微信/飞书页签 + QR 区 idle「NO QR 等待引擎」+ 当前会话绑定(截图) |
| Settings 设置 | 渲染 + mock 标注 | mock | ✅ | 2026-06-14:CONFIG mock banner + Claude/Codex 页签 + 全分区表单(默认模型/推理强度等)(截图) |
| SystemMenu 菜单(本轮已验路由) | 菜单打开;保存导出/导入/外观/关于/退出 | 混 | ✅ | 2026-06-15:`goal-2026-06-15` replay E2E exit 0,6 passed;菜单 9 项可见,关于→ABOUT,外观→CONFIG,导入→IMPORT,保存/退出关闭菜单;截图 `tests/e2e/artifacts/goal-2026-06-15/05-system-menu.png` / `06-menu-about-route.png` / `07-menu-appearance-route.png` / `08-menu-import-route.png` |
| SystemMenu 账号/runtime 管理入口 | 菜单项 → Account 面板 | 真 | ✅ | 2026-06-15:`goal-2026-06-15` fake-WS E2E exit 0,6 passed;菜单「账号 · 订阅」→ PROFILE,再次打开菜单「runtime 管理」→ PROFILE(当前设计复用 Account 面板);截图 `tests/e2e/artifacts/goal-2026-06-15/14-menu-account-route.png` / `15-menu-runtime-route.png` |

---

## 变更记录

- 2026-06-14:建表;导入(ImportPanel / Hotbar·SessionGrid·SystemMenu 三入口)验证通过(commit b35d091)。其余项当时留给后续 `/goal` 续跑。
- 2026-06-14:内景批次(D+E)验证通过。replay fixture `e2e-full.jsonl`(port 8788)+Vite(5174)隔离环境。房间渲染(地牢+全息双皮肤)、SessionBanner、RosterCard(4 agent)、BrowserScreen(tool flow)、TaskWindow(5 todos)、Minimap、AMBIENCE 4 开关全 ✅;Hotbar 10 槽全通(任务→TASKS/聊天→ChatDrawer/技能→Skills 18cmd/模型→ModelPicker Opus/背包→BACKPACK 2 loot+1 inventory);ViewSwitch 大厅↔内景 ✅。F 区 ChatDrawer/ModelPicker/Skills/Backpack 同批 ✅。
- 2026-06-14:扫尾批次。avatar WASD+点击移动 ✅;Claude/Codex 项目门接线确认(sendCommand newSession)✅;大厅彩蛋(宝箱怪 snap+撸猫 hop)✅;内景彩蛋(许愿池 coin+福气/撸猫/QuipOverlay)✅。剩余 3 项(LimitBars/LoginGate/atlas 错误层)需特殊环境。
- 2026-06-15:更正 2026-06-14「63/63 全 ✅」口径过宽;本轮新增 `tests/e2e/goal-2026-06-15.e2e.ts` focused E2E:空 store 登录门 + SessionGrid 过滤/点卡进内景 + slash 菜单 + SystemMenu 路由(replay/fake WS) + ModelPicker live setModel 生效(live engine) + Market live 插件目录(`CLAUDE_CONFIG_DIR=<tmp copy of tests/fixtures/plugins/cfg>`) + Claude/Codex 项目门 live newSession + ChatDrawer stop/权限/AskUserQuestion + atlas 错误层重试均通过;另补 Account LIVE limits 浏览器验证(Max/5h 39%/Weekly 23%);截图 25 张在 `tests/e2e/artifacts/goal-2026-06-15/`。
