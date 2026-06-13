// i18n — 全局字符串翻译器。
// 产品/游戏术语(Claude、Codex、askuser、compact、Token、Context、Usage、Weekly、
// 模型名、slash 命令、runtime、MCP、diff、PR、CI 等)刻意不入典——两种语言下保持英文。
// DICT 全量搬自设计稿 Prototype/roguent/project/roguent/i18n.js,追加真实 app 独有文案。
import { useSettingsStore } from "./settings-store";

export type Lang = "cn" | "en";

export const DICT: Record<string, string> = {
  // ── view / nav ──────────────────────────────────────────────
  内景: "Room",
  大厅: "Lobby",
  // ── generic actions / buttons ───────────────────────────────
  进入: "Enter",
  技能: "Skills",
  背包: "Backpack",
  任务: "Tasks",
  信箱: "Mailbox",
  聊天: "Chat",
  归档: "Archive",
  删除: "Delete",
  "确认删除？": "Confirm delete?",
  安装: "Install",
  已拥有: "Owned",
  登出: "Log out",
  回应: "Reply",
  打开原文: "Open source",
  进入会话: "Open session",
  未读: "unread",
  "+ 添加 X 博主 / GitHub 仓库": "+ Add X author / GitHub repo",
  "转发到配对 IM": "Forward to IM",
  "转发不可用 · 暂无单条转发命令":
    "Forwarding unavailable · no per-message relay command",
  "未配对 · 在 PAIRING 扫码绑定后开启转发":
    "Not paired · bind in PAIRING to enable forwarding",
  "查看 diff": "View diff",
  拉取到本地: "Pull local",
  导入: "Import",
  保存: "Save",
  发送: "Send",
  返回: "Back",
  继续游戏: "Resume",
  "账号 · 订阅": "Account · Plan",
  "runtime 管理": "Manage runtime",
  "保存 / 导出会话": "Save / Export session",
  选择一封信件: "Select a message",
  当前: "Current",
  通用: "Universal",
  查看更新: "View update",
  还原: "Reset",
  未保存: "Unsaved",
  已保存: "Saved",
  "+ 添加自定义配置": "+ Add custom config",
  检查更新: "Check update",
  已安装: "Installed",
  "立即更新 v1.0": "Update to v1.0",
  已是最新: "Up to date",
  去做任务: "Open Tasks",
  打开公告板: "Open Board",
  领取今日奖励: "Claim today",
  今日不再提示: "Don't show today",
  一键领取: "Claim all",
  全部已领: "All claimed",
  今日: "Today",
  查看: "View",
  稍后: "Later",
  签到: "Check-in",
  公告: "Board",
  限时: "Limited",
  版本: "Release",
  "来自订阅源 · askuser · CI · 用量": "From feeds · askuser · CI · usage",
  打开邮箱: "Open Mailbox",
  "查看 askuser": "View askuser",
  掉落: "drop",
  已配对设备: "Paired devices",
  转发开: "Forwarding",
  已暂停: "Paused",
  进入房间: "Enter room",
  小队: "Squad",
  正在思考: "Thinking",
  主控: "Lead",
  分身: "Subagent",
  // ── modal subtitles ─────────────────────────────────────────
  会话档案: "Session profile",
  "共享任务清单 · agent teams": "Shared task list · agent teams",
  "法术书 · slash 命令 & skills": "Spellbook · slash commands & skills",
  "按 token 降序": "Sorted by token desc",
  "插件市场 + 道具店": "Plugin market + item shop",
  "本会话产出 loot": "This session's loot",
  切换会话模型: "Switch session model",
  导入本地会话: "Import local sessions",
  "个人详情 · 订阅与用量": "Profile · plan & usage",
  版本与更新日志: "Version & changelog",
  "关于 Roguent": "About Roguent",
  "成就殿 · vibe-coding 里程碑": "Achievements · vibe-coding milestones",
  "订阅信箱 · X 博主 + GitHub 仓库监控":
    "Subscriptions · X authors + GitHub repos",
  "商店旁的扭蛋机 · 纯外观彩蛋": "Gacha · cosmetic only",
  "扫码配对 · 微信 / 飞书消息互转": "Pairing · WeChat / Feishu relay",
  "大厅公告板 · 今日动态": "Board · today's activity",
  // ── section headers / small labels ──────────────────────────
  在岗: "On duty",
  会话产出: "Session loot",
  扭蛋记录: "Gacha log",
  项目: "Project",
  模型: "Model",
  模式: "Mode",
  状态: "Status",
  子智能体: "Subagents",
  花费: "Cost",
  待你回应: "Needs you",
  "继承全局 (20%)": "Inherit global (20%)",
  局部覆盖: "Override",
  "跟随设置面板的全局默认（Opus 20%）。":
    "Follows the global default (Opus 20%).",
  "此 NPC 单独生效，优先级高于全局。":
    "Applies to this NPC only — overrides global.",
  "滚动 5 小时窗口": "rolling 5-hour window",
  "每周一 00:00 重置": "resets Mon 00:00",
  剩余: "left",
  已用: "used",
  计划: "plan",
  已暂存: "Staged",
  已修改: "Modified",
  未跟踪: "Untracked",
  冲突: "Conflicts",
  相对: "vs",
  "stash 数量": "stashes",
  "扫描到的本地 Claude Code 项目:": "Local Claude Code projects found:",
  会话: "sessions",
  "选择一个角色 · 开始本地 vibe coding":
    "Pick a hero · start local vibe coding",
  // ── status words ────────────────────────────────────────────
  工作中: "Working",
  思考: "Thinking",
  待回应: "Needs you",
  待办: "To-do",
  待命: "Idle",
  完成: "Done",
  出错: "Error",
  压缩中: "Compacting",
  进行中: "In progress",
  进度中: "In progress",
  待领: "Pending",
  待领取: "Pending",
  待认领: "Unclaimed",
  阻塞中: "Blocked",
  等用户: "Awaiting user",
  归属: "Owner",
  依赖: "Deps",
  无: "none",
  状态时间线: "Status timeline",
  认领任务: "Claim task",
  认领: "Claim",
  选择一个任务: "Select a task",
  "信箱 · inter-agent": "Mailbox · inter-agent",
  阻塞: "Blocked",
  orchestrator: "orchestrator",
  subagent: "subagent",
  // ── tabs ────────────────────────────────────────────────────
  按会话: "By session",
  按模型: "By model",
  "按 runtime": "By runtime",
  插件市场: "Plugin market",
  道具店: "Item shop",
  插件: "Plugins",
  "搜索…": "Search…",
  导入会话: "Import session",
  "外观 / 主题": "Appearance / Theme",
  退出: "Exit",
  指挥台: "Command deck",
  点击任意处继续: "Click anywhere to continue",
  "扭蛋战利品 · 外观": "Gacha loot · cosmetic",
  全部信件: "All mail",
  "X 博主动态": "X feed",
  "GitHub 监控": "GitHub watch",
  订阅源管理: "Subscriptions",
  已解锁: "Unlocked",
  普通: "Common",
  稀有: "Rare",
  史诗: "Epic",
  传说: "Legendary",
  已解锁成就: "Unlocked",
  此分类暂无成就: "No achievements in this tab",
  系统: "System",
  全部: "All",
  // ── login / boot ────────────────────────────────────────────
  "像素指挥台 · 本地 Claude Code 双 runtime 调度":
    "Pixel command deck · local Claude Code dual-runtime",
  "‹ › 切换角色 · 点击角色框直接进入 · 随时可在设置中切换主角色":
    "‹ › switch hero · click frame to enter · change anytime in Settings",
  "正在召集小队…": "Summoning the squad…",
  普通模式下有一定概率遇到精英首领: "Elite bosses may appear in normal runs",
  "聚焦中…": "Focusing…",
  "暂停 · 点击继续": "Paused · click to resume",
  // ── menu items ──────────────────────────────────────────────
  设置祭坛: "Config Altar",
  成就: "Achievements",
  成就殿: "Achievements Hall",
  成就陈列: "Achievements",
  邮箱: "Mailbox",
  排行榜: "Ranking",
  公告板: "Board",
  任务台: "Quest Console",
  商店: "Shop",
  装饰商店: "Decoration shop",
  扭蛋机: "Gacha",
  "Claude 项目": "Claude projects",
  "Codex 项目": "Codex projects",
  活动: "Events",
  设置: "Settings",
  账号: "Account",
  菜单: "Menu",
  配对: "Pairing",
  暂停: "Pause",
  // ── hero names ──────────────────────────────────────────────
  骑士: "Knight",
  法师: "Wizard",
  精灵: "Elf",
  蜥蜴人: "Lizardman",
  女骑士: "Valkyrie",
  矮人: "Dwarf",
  女法师: "Sorceress",
  游侠: "Ranger",
  // ── misc chrome ─────────────────────────────────────────────
  召唤你的第一个小队: "Summon your first squad",
  空无一人: "No one here",
  "召唤你的第一个小队，开始 vibe coding":
    "Summon your first squad and start vibe coding",
  "召唤你的第一个小队,开始 vibe coding":
    "Summon your first squad and start vibe coding",
  召唤小队: "Summon squad",
  撸一下: "pet me",
  宝箱: "chest",
  许愿: "make a wish",
  福气: "luck",
  "查看个人详情 · 5h / Weekly 用量": "View profile · 5h / Weekly usage",
  "查看 5h / Weekly 用量": "View 5h / Weekly usage",
  // ── 真实 app 独有文案(设计字典未收录,后续 sweep 任务依赖) ──
  "任务台 · 选择会话进入": "Quest Console · pick a session",
  仅活跃: "Active only",
  清除筛选: "Clear filters",
  没有匹配的会话: "No matching sessions",
  "等待工具调用…": "Waiting for tool calls…",
  导入历史会话: "Import history",
  "+ 从本地扫描": "+ scan local",
  "还没有会话——按「＋ 新会话」或到聊天抽屉新建第一个":
    'No sessions yet — press "+ New session" or create one from the chat drawer',
  "插件市场 · MCP / Skills / 插件 · 接入真实能力":
    "Plugin market · MCP / Skills / plugins",
  "装饰商店 · 宝石消费 · 仅外观，不影响开发结果":
    "Decoration shop · gems · cosmetic only",
  去扭蛋机: "To Gacha",
  已启用: "Enabled",
  房间: "Room",
  皮肤: "Skin",
  宠物: "Pet",
  UI: "UI",
  "示例商品 · 购买逻辑未接入(宝石余额/已拥有为真)":
    "Demo items · purchase not wired (gem balance / owned are real)",
  次安装: "installs",
  目录未就绪: "Catalog not ready",
  无匹配结果: "No matching plugins",
  引擎还未广播插件目录: "Engine hasn't broadcast the plugin catalog yet",
  尝试调整搜索词或分类筛选: "Try adjusting your search or category filter",
  停用: "Disable",
  启用: "Enable",
  卸载: "Uninstall",
  "处理中…": "Working…",
  插件变更对新建会话生效: "Plugin changes apply to new sessions",
  // ── HUD chrome (sweep A) ─────────────────────────────────────
  暂无在岗: "No one on duty",
  同步中: "syncing",
  同步失败: "sync failed",
  示例: "demo",
  "示例数据(引擎暂未提供)": "Demo data (not yet provided by engine)",
  "Codex 占位,暂未接入": "Codex placeholder — not connected yet",
  // ── reinstated mock panels: update log / login events / inter-agent mail ──
  // UpdateModal(版本与更新日志,整面板 mock)
  "示例更新日志 · 检查/升级为模拟，不会真的改动你的本地 runtime":
    "Demo changelog · check/upgrade are simulated — won't touch your local runtime",
  "更新流程为模拟，不会真的改动你的本地 runtime":
    "Update flow is simulated — it won't actually change your local runtime",
  "v1.0 已就绪 · 订阅者可一键升级 runtime，会话进度不丢失（演示）":
    "v1.0 ready · subscribers upgrade the runtime in one click, sessions preserved (demo)",
  点击查看更新日志: "Click to view changelog",
  // LoginEvents(签到 / 活动弹窗,整面板 mock,不自动弹)
  "示例活动 · 引擎无登录活动源(演示用途，不自动弹、不发真实奖励)":
    "Demo events · the engine has no login-activity source (demo only — no auto-popup, no real rewards)",
  "✓ 已领取 · 1天 Max(演示)": "✓ Claimed · 1-day Max (demo)",
  连续登录奖励: "Daily login rewards",
  "第 3 天 · 今日可领": "Day 3 · claimable today",
  双倍宝石周末: "Double-gem weekend",
  "完成会话获得 2× 宝石": "Earn 2× gems per finished session",
  "本周末内，每完成一个会话或合并一次提交，奖励宝石翻倍。攒满去扭蛋机换限定皮肤。":
    "This weekend, every finished session or merged commit earns double gems. Save up for limited skins at the gacha.",
  "agent teams 稳定版上线": "agent teams stable release is live",
  "tmux 队友模式、/oracle 技能、1M 上下文阈值优化。订阅者可一键升级 runtime。":
    "tmux teammate mode, /oracle skill, 1M-context threshold tuning. Subscribers upgrade the runtime in one click.",
  // Tasks 信件区(inter-agent 邮箱,整块 mock)
  "示例信件 · 引擎无 inter-agent 信箱(演示用途，非真实 agent 通信)":
    "Demo letters · the engine has no inter-agent mailbox (demo only — not real agent traffic)",
  "信件区 · inter-agent": "Letters · inter-agent",
  "活动 · 签到(示例)": "Events · check-in (demo)",
  勘察: "Surveyor",
  测试: "Tester",
  "勘察完成，HERO_POOL 有 8 个稳定皮肤。":
    "Survey done — HERO_POOL has 8 stable skins.",
  "状态槽优先级按 §6.6，askuser 置顶。":
    "Status-slot priority per §6.6 — askuser pinned on top.",
  "测试套件 88% 上下文，接近阈值，请求压缩。":
    "Test suite at 88% context, near threshold — requesting compaction.",
  "bun.lock 无异常，依赖审计通过。":
    "bun.lock clean — dependency audit passed.",
  "暂无任务(agent 调 TodoWrite 后同步)":
    "No tasks yet (syncs after an agent calls TodoWrite)",
  // ── panels (sweep B) ─────────────────────────────────────────
  // modal subtitles
  "本会话产出 loot · 扭蛋/经济背包":
    "This session's loot · gacha / economy backpack",
  "实时待办 · 当前会话 TodoWrite": "Live to-dos · current session TodoWrite",
  "订阅 · 用量": "Plan · usage",
  "真实里程碑 · event / ledger 驱动": "Real milestones · event / ledger driven",
  "扭蛋抽卡 · 真实 gem 余额驱动": "Gacha pulls · real gem balance",
  "真实 inbox · IM / GitHub / X / runtime":
    "Real inbox · IM / GitHub / X / runtime",
  "今日公告板 · 未读告警": "Today's board · unread alerts",
  "扫码 · 微信 / 飞书消息互转": "Scan to pair · WeChat / Feishu relay",
  // AgentCard
  召唤中: "Spawning",
  思考中: "Thinking",
  类型: "Type",
  工具: "Tool",
  上级: "Parent",
  指挥官: "Commander",
  关闭: "Close",
  // NpcCard
  工作: "Working",
  启动: "Spawning",
  上下文压缩阈值: "Context compaction threshold",
  "跟随全局默认（Opus 20%）。示例 · 引擎暂未接入":
    "Follows the global default (Opus 20%). Demo · not connected yet",
  "此会话单独生效。示例 · 引擎暂未接入":
    "Applies to this session only. Demo · not connected yet",
  "订阅模式下 Opus 默认 1M 上下文，不设阈值易烧爆额度；达到该 % 自动 /compact 并续跑，循环直到任务完成。":
    "On subscription, Opus defaults to a 1M context; without a threshold you can burn through quota. At this %, it auto-/compacts and resumes, looping until the task is done.",
  // Tasks
  "当前会话暂无待办(agent 调 TodoWrite 后实时同步)":
    "No to-dos in this session (syncs live after an agent calls TodoWrite)",
  选择一个待办: "Select a to-do",
  // Skills
  "图标 / 稀有度 / 锁定为示例装饰;下方为当前会话":
    "Icons / rarity / locks are demo decoration; below are this session's",
  真实可用: "really available",
  "的 slash 命令,点击即运行。": "slash commands — click to run.",
  "当前会话无可用 slash 命令": "No slash commands available in this session",
  "未解锁 · 示例(占位,非真实命令)":
    "Locked · demo (placeholder, not a real command)",
  // Skills decor descriptions (demo decoration)
  压缩当前上下文并续跑: "Compact the current context and resume",
  "对当前 diff 做代码审查": "Review the current diff",
  运行测试套件并汇总失败: "Run the test suite and summarize failures",
  生成多步任务计划: "Generate a multi-step task plan",
  "召集 agent team 协作": "Summon an agent team to collaborate",
  生成或更新文档: "Generate or update docs",
  生成提交信息并提交: "Generate a commit message and commit",
  "连接 MCP 工具服务器": "Connect an MCP tool server",
  "内置 slash 命令": "Built-in slash command",
  跨文件安全重构: "Safe cross-file refactor",
  性能基准回归: "Performance benchmark regression",
  "数据/schema 迁移向导": "Data / schema migration wizard",
  调用更强模型做疑难推理: "Call a stronger model for hard reasoning",
  // Leaderboard / SessionGrid
  暂无会话: "No sessions yet",
  活跃: "Active",
  "Codex 为占位 · 引擎暂未接入(0)":
    "Codex is a placeholder · not connected yet (0)",
  // LootPanel
  会话工件: "Session artifacts",
  暂无掉落: "No drops yet",
  经济背包: "Economy backpack",
  "暂无物品 · 通过扭蛋或成就获得":
    "No items yet · earn them via gacha or achievements",
  // ModelPicker descriptions
  "最强推理 · 1M 上下文": "Top reasoning · 1M context",
  "均衡 · 默认队友": "Balanced · default teammate",
  "快速 · 低成本": "Fast · low cost",
  // Account
  "5h 与周限额已映射为左上血条 / 魔法条":
    "5h & weekly limits are mapped to the top-left HP / MP bars",
  "登录态由本机 Claude Code 订阅管理(终端 /login)":
    "Login is managed by the local Claude Code subscription (terminal /login)",
  // ImportPanel
  没有本地会话: "No local sessions",
  // About
  "本地 Claude Code agent 活动的游戏化实时可视化平台,把订阅模式驱动的真实 subagent 活动渲染成像素地牢。":
    "A gamified real-time visualizer for local Claude Code agent activity — rendering subscription-driven subagent work as a pixel dungeon.",
  "像素美术 0x72 DungeonTilesetII (CC0) · 像素字体 Fusion Pixel 12px (OFL-1.1, TakWolf) · Press Start 2P (OFL) · 致敬《元气骑士》":
    "Pixel art 0x72 DungeonTilesetII (CC0) · pixel fonts Fusion Pixel 12px (OFL-1.1, TakWolf) · Press Start 2P (OFL) · homage to Soul Knight",
  // SystemMenu
  "PAUSED · 指挥台": "PAUSED · Command deck",
  // Settings
  "保存会写入 Roguent 设置库；不会直接改 Claude settings.json / Codex config.toml":
    "Saving writes to the Roguent settings store; it won't directly modify Claude settings.json / Codex config.toml",
  "+ 添加": "+ Add",
  "+ 添加 Hook": "+ Add Hook",
  "阈值 %": "Threshold %",
  "为每个模型设“达到 X% 自动压缩续跑”的阈值。Auto = 不主动干预，走 SDK 原生压缩。":
    'Set a per-model "auto-compact and resume at X%" threshold. Auto = no intervention, uses the SDK\'s native compaction.',
  "自动编排循环 (util ≥ 阈值)": "Auto-orchestration loop (util ≥ threshold)",
  终止本轮: "End this turn",
  循环: "Loop",
  '发送"继续"': 'Send "continue"',
  "1M 上下文易烧额度，建议设阈值。":
    "1M context burns quota fast; setting a threshold is recommended.",
  "走 SDK 原生自动压缩。": "Uses the SDK's native auto-compaction.",
  // BoardPanel
  "今日关键事件与未读告警会自动钉到这里。":
    "Today's key events and unread alerts get pinned here automatically.",
  "暂无今日关键事件或未读告警。": "No key events or unread alerts today.",
  // MailboxPanel
  "外部平台未配置时只显示 configuration state，不填充样例消息。":
    "When external platforms aren't configured, only the configuration state shows — no sample messages.",
  // AchievementsPanel
  "创建 Codex 会话后，真实 runtime 事件会推进成就。":
    "Once you create a Codex session, real runtime events advance achievements.",
  // GachaPanel
  余额不足: "Insufficient balance",
  奖池: "Pool",
  "还没有物品 · 抽卡获得": "No items yet · pull to earn them",
  // PairingPanel
  当前会话: "Current session",
  未设置工作目录: "No working directory set",
  // ErrorOverlay
  命令失败: "Command failed",
  "runtime 离线": "runtime offline",
  "无法连接到该项目的 Claude Code engine。":
    "Couldn't connect to this project's Claude Code engine.",
  "资源/连接失败时显示可见错误层,绝不静默黑屏。":
    "A visible error layer shows on resource/connection failure — never a silent black screen.",
  重试连接: "Retry connection",
  // ── i18n sweep C-1 (previously-unswept components) ───────────
  // AmbientControls (Hud)
  辉光: "Glow",
  雨幕: "Rain",
  粒子: "Particles",
  声音: "Sound",
  // HeroSelect
  选择像素角色进入大厅: "Pick a pixel hero to enter the lobby",
  "进入后用 WASD 或点击移动 · 走到中央任务台按 E 打开会话":
    "Move with WASD or click after entering · walk to the central console and press E to open a session",
  // ChatHeader
  无会话: "No session",
  "目录 cwd(默认服务端)": "Directory cwd (server default)",
  "＋ 新会话": "＋ New session",
  已归档: "Archived",
  "搜索已归档…": "Search archived…",
  点击复活到大厅: "Click to revive into the lobby",
  "↺ 复活": "↺ Revive",
  // Composer
  "输入消息… (Enter 发送, Shift+Enter 换行)":
    "Type a message… (Enter to send, Shift+Enter for newline)",
  停止: "Stop",
  // Composer quick replies
  继续: "Continue",
  先跑测试再合并: "Run tests before merging",
  "给我看 diff": "Show me the diff",
  解释一下思路: "Explain your approach",
  // Timeline
  选一个会话: "Pick a session",
  "还没有消息,发一条开始…": "No messages yet — send one to start…",
  // PromptCard
  "✓ 已回答": "✓ Answered",
  "✕ 已忽略": "✕ Dismissed",
  允许: "Allow",
  拒绝: "Deny",
  // MessageBubble
  你: "You",
  复制消息: "Copy message",
  // ThinkingBlock
  思考过程: "Reasoning",
  // PairingQr
  微信: "WeChat",
  飞书: "Feishu",
  用微信扫码绑定本指挥台: "Scan with WeChat to bind this command deck",
  用飞书扫码或打开机器人配对: "Scan with Feishu or open the bot to pair",
  等待引擎生成配对码: "Waiting for the engine to generate a pairing code",
  "单个会话绑定,新绑定覆盖旧绑定":
    "One binding per session — a new binding replaces the old one",
  "生成 QR": "Generate QR",
  // BindingList
  已绑定: "Bound",
  扫码完成后会出现在这里: "Appears here once scanning completes",
  未命名会话: "Unnamed session",
  转发: "Forward",
  解绑: "Unbind",
  // PortalTransition
  返回大厅: "Back to lobby",
  // CatPet
  黑猫伙伴: "Black cat companion",
  // ── settings-schema (sweep C-2) ──────────────────────────────
  // group names
  "IM / 订阅": "IM / Subscriptions",
  "通用 General": "General",
  "界面 Interface": "Interface",
  "上下文压缩 Compaction": "Compaction",
  "权限 Permissions": "Permissions",
  "Agent / 团队": "Agent / Team",
  "MCP 服务器": "MCP Servers",
  "技能 / 插件": "Skills / Plugins",
  "审批 Approval": "Approval",
  "沙箱 Sandbox": "Sandbox",
  // integrations group — labels
  "微信扫码配对 WeChat": "WeChat QR pairing",
  "飞书长连接 Feishu": "Feishu long connection",
  "飞书 App ID": "Feishu App ID",
  "飞书 App Secret": "Feishu App Secret",
  "GitHub 订阅": "GitHub subscription",
  "GitHub webhookSecret": "GitHub webhookSecret",
  "X 订阅": "X subscription",
  "Relay 转发": "Relay forwarding",
  // integrations group — tips
  "允许微信单会话扫码配对并把 agent 回复转发回当前微信会话。":
    "Allow single-session WeChat QR pairing and forward agent replies back to the current WeChat chat.",
  "启用飞书/Lark bot 长连接收发消息。":
    "Enable Feishu/Lark bot long-connection messaging.",
  "飞书/Lark bot 的 app_id。": "The Feishu/Lark bot app_id.",
  "敏感字段,保存时只写入 SecretStore 引用。":
    "Sensitive field — only a SecretStore reference is written on save.",
  "接收 GitHub webhook 并路由到邮箱/公告板/会话。":
    "Receive GitHub webhooks and route them to mailbox / board / session.",
  "订阅仓库,格式 owner/repo。": "Subscribed repo, format owner/repo.",
  "GitHub webhook HMAC secret,保存时只写 SecretStore 引用。":
    "GitHub webhook HMAC secret — only a SecretStore reference is written on save.",
  "启用 X webhook/订阅事件接入。":
    "Enable X webhook / subscription event intake.",
  "X API bearer token,保存时只写 SecretStore 引用。":
    "X API bearer token — only a SecretStore reference is written on save.",
  "启用本地 tunnel 或生产 relay 转发 webhook。":
    "Enable a local tunnel or production relay to forward webhooks.",
  "Relay 服务地址。": "Relay service address.",
  "Relay capability token,保存时只写 SecretStore 引用。":
    "Relay capability token — only a SecretStore reference is written on save.",
  // general group
  "默认模型 model": "Default model",
  "新会话默认使用的模型。": "Model used by default for new sessions.",
  "输出风格 outputStyle": "Output style",
  "回复的详略与口吻。": "Verbosity and tone of replies.",
  "回复语言 language": "Reply language",
  跟随系统: "Follow system",
  中文: "Chinese",
  "模型回复使用的语言。": "Language used in model replies.",
  "推理强度 effortLevel": "Reasoning effort",
  "更高强度更慢但更准。": "Higher effort is slower but more accurate.",
  "默认深度思考 alwaysThinkingEnabled": "Always think by default",
  "每轮默认启用扩展思考。": "Enable extended thinking by default each turn.",
  // ui group
  "主题 theme": "Theme",
  地牢深青: "Dungeon Teal",
  城镇暖棕: "Town Warm Brown",
  暗夜: "Midnight",
  "面板与世界的整体配色。": "Overall color scheme for panels and the world.",
  "编辑模式 editorMode": "Editor mode",
  "输入框的键位模式。": "Keybinding mode for the input box.",
  "视图 viewMode": "View mode",
  "信息密度。": "Information density.",
  "自动滚动 autoScrollEnabled": "Auto-scroll",
  "新输出时自动滚到底部。": "Scroll to the bottom automatically on new output.",
  "减少动效 prefersReducedMotion": "Reduce motion",
  "关闭闪烁与粒子。": "Turn off flashing and particles.",
  // permissions group
  "默认模式 defaultMode": "Default mode",
  "工具调用的默认审批策略。": "Default approval policy for tool calls.",
  "附加目录 additionalDirectories": "Additional directories",
  "允许访问的额外目录。": "Extra directories allowed for access.",
  // team group
  "实验性团队 EXPERIMENTAL_AGENT_TEAMS": "Experimental teams",
  "开启 agent teams 协作机制。":
    "Enable the agent teams collaboration mechanism.",
  "队友模式 teammateMode": "Teammate mode",
  "队友进程的运行方式。": "How teammate processes run.",
  默认队友模型: "Default teammate model",
  "subagent 默认模型。": "Default model for subagents.",
  // mcp group
  "启用项目内全部 MCP": "Enable all project MCP",
  "自动启用 .mcp.json 中的服务器。": "Auto-enable servers from .mcp.json.",
  "已启用 enabledMcpjsonServers": "Enabled servers",
  "白名单服务器。": "Allowlisted servers.",
  // skills group
  "技能覆盖 skillOverrides": "Skill overrides",
  "技能注入策略。": "Skill injection policy.",
  "禁用技能 shell 执行": "Disable skill shell execution",
  "安全：禁止技能执行 shell。": "Security: forbid skills from running shell.",
  // hooks group
  生命周期事件: "Lifecycle events",
  "在事件触发时运行命令（含 agent teams 事件）。":
    "Run commands when events fire (including agent teams events).",
  // codex groups
  "模型 model": "Model",
  "Codex CLI 使用的模型。": "Model used by the Codex CLI.",
  "模型提供方 model_provider": "Model provider",
  "模型接入的 provider。": "Provider the model connects through.",
  "推理强度 reasoning_effort": "Reasoning effort",
  "推理链的深度。": "Depth of the reasoning chain.",
  "审批策略 approval_policy": "Approval policy",
  "什么时候需要人工批准命令。": "When commands require manual approval.",
  "沙箱模式 sandbox_mode": "Sandbox mode",
  "命令可访问的文件系统范围。": "Filesystem scope commands can access.",
  "网络访问 network_access": "Network access",
  "沙箱内是否允许联网。": "Whether networking is allowed inside the sandbox.",
  "config.toml 中配置的 MCP 服务器。": "MCP servers configured in config.toml.",
  "Roguent 保存的 Codex MCP 配置 profile。":
    "Codex MCP config profile saved by Roguent.",
};

export function translate(s: string, lang: Lang): string {
  if (lang !== "en") return s;
  const hit = DICT[s];
  if (hit != null) return hit;
  if (s.startsWith("进入 ")) return `Enter ${s.slice(3)}`;
  return s;
}

export function useT(): (s: string) => string {
  const lang = useSettingsStore((s) => s.uiLang);
  return (s: string) => translate(s, lang);
}

export function useTL(): (cn: string, en: string) => string {
  const lang = useSettingsStore((s) => s.uiLang);
  return (cn: string, en: string) => (lang === "en" ? en : cn);
}
