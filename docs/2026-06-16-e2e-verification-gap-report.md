---
title: Roguent 全功能 e2e 体检 · 缺口报告
date: 2026-06-16
baseline_commit: 32cf30a(本地 main,领先 origin/main 9)
gates: bun test 873 pass / 0 fail(133 文件) · bunx tsc --noEmit 干净 · bun run check(biome 385 文件)干净
method: 命令可达性交叉核对(UI sendCommand ↔ ws-gateway 实际处理)+ 4 子系统证据化静态审计(file:line)+ 绿色测试基线
status: 待用户过目 → 逐项实现
---

# 全功能 e2e 体检 · 缺口报告

> **用途**:本轮 `/goal`(全功能端到端验证 + 补齐配对/聊天等缺口)第一阶段产物。
> 用户决策:**先全量体检 → 产出本报告 → 过目 → 再自上而下实现**(每块独立 spec→plan→build)。
> **证据等级标注**:`[静态]` = 读代码溯源确证;`[测试]` = 单测覆盖;`[需运行时]` = 结论靠代码路径推断,建议实现阶段用 live engine 浏览器复证。

---

## 0. 体检方法与可信度

- **命令可达性全图**:枚举 web 端所有 `sendCommand({cmd})`,与 `ws-gateway.ts:262-330` 实际 if/else 处理的命令集交叉核对。任何「UI 发了、网关没接」= 静默丢弃 bug(`else` 分支回 `commandError`)。
- **网关实际处理的 top-level 命令**(`ws-gateway.ts:262-330`):`newSession / sendMessage / setModel / interrupt / rollback / retryFrom / deleteSession / listLocalSessions / importSession / respondPermission / respondQuestion / setPermissionMode / setRuntimeConfig / mailbox / scheduler / settings / economy / plugins`。
- **4 份子系统审计**(聊天、经济/定时/信箱/订阅、设置/限额/会话/导入、大厅/房间/彩蛋)均要求 file:line 证据,并显式纠正了一份旧自动盘点「100% live」的过度声称。

---

## 1. 健康面(真实可达,无需动)

这些经审计确认**真接真数据、链路完整、UI 可达**,本轮只验不改:

- **聊天主链路** `[静态][测试]`:发消息 / quick-reply / 停止 / slash / 新建会话 / 切模型·模式·sandbox·network·reasoning(`setRuntimeConfig` 运行时真生效)/ 权限卡 allow-deny / 问题卡 / 复制消息·代码块 / 展开 thinking·tool。
- **会话管理** `[静态]`:archive/unarchive(客户端 LRU≤10)、delete(引擎端结束 Driver)、imported 豁免 cap;入口在 NpcCard/ChatHeader/SessionGrid。
- **导入/回放** `[静态]`:`listLocalSessions`(真扫盘)→ `importSession` → 合成 `session.created{imported}` + 重放事件 → 会话进总览。端到端真。
- **账号限额** `[静态]`:5h/Weekly/plan/reset 来自 `UsagePoller` 打 `api.anthropic.com/api/oauth/usage`;context 利用率来自 `session.context`。(Lv/名/handle 是标注 mock)
- **定时任务** `[静态]`:`createTask/runTask/updateTask/deleteTask` + 运行历史真;`SchedulerRunner` 生产环境已启动(`server.ts:101-102`),60s 轮询、到点起会话发 prompt。(入口仅在 SessionGrid「Scheduled Tasks」页签,无独立 PanelId,较隐蔽)
- **信箱** `[静态]`:事件溯源真;markRead/archive/resend 真;未读徽标真。
- **GitHub/X 订阅** `[静态]`:**确为真**——Settings「integrations」组配置 → `settings` 命令落盘 → `applySubscriptionSettings` 真注册 webhook(GitHub repo hook / X filtered-stream)→ ingress 验签 → 信箱「GitHub 监控 / X 博主动态」文件夹。前提:operator 配 `ROGUENT_INGRESS_PORT` + 公网 HTTPS `webhookBaseUrl` + token/secret(缺则 UI 显式报 blocked,非 bug)。
- **美术包/皮肤** `[静态]`:4 个非默认包真换 atlas png(各自 reskin 的 `dungeon.png`,共用默认 frame 坐标);`localStorage` 持久化;skin(dungeon/holo)真。
- **大厅 11 个结构物** `[静态]`:tower→sessiongrid / shop / market / gacha / board / mailbox / altar→settings / achievements / leaderboard / cdoor·xdoor→newSession,E 键 + 点击全部可达真面板/动作。
- **彩蛋**(撸猫/宝箱怪/许愿池/台词气泡)`[静态]`:均已挂载、触发真。
- **Market(插件市场)** `[静态]`:真接本机插件目录 + CLI 操作。(注:`Hud.tsx:167` 注释把它标 mock 是**过时错误**)

---

## 2. 缺口清单(按优先级 + 用户三大点名)

### 🔴 A. 微信/飞书扫码配对 —— 端到端断裂(旗舰缺口)

| 层 | 现状 `[静态]` |
|---|---|
| npm 包 | 微信用**非官方** `@wechatbot/wechatbot@2.1.1`(Bun 不兼容→需 Node≥22 子进程 `wechat-node-host.mjs` 回退);飞书用**官方** `@larksuiteoapi/node-sdk`(与参考项目 Kun 同款) |
| 连接器 | `WeChatConnector.startPairing()` / `FeishuConnector` 代码真能出二维码,但**从未被任何东西调用**(除测试) |
| **命令断裂** | 协议**根本没有 `generateQr`/`startPairing` 命令**;配对面板「生成 QR」按钮发的是 `createPairing`,而 `createPairing`/`updatePairing` **在 `ws-gateway.ts` 无处理分支** → 落 `else` → `commandError`「Command not implemented」。「转发开关 / 解绑」同样死 |
| 后果 | 配对面板永远停在「NO QR / 等待引擎生成配对码」;`IntegrationManager` 只会自启连接器(无凭据直接 error 态)+ 收发路由,**没有任何路径把「生成 QR」动作接到 `startPairing()`** |

**用户决策**:换官方 `@tencent-weixin/openclaw-weixin@2.4.x`(Kun 同款)。
**要做**:① 换微信包(核 API);② 新增 `pairing`/`generateQr` 命令 + 网关处理器 + `IntegrationManager` 配对编排;③ 接 `createPairing`/`updatePairing` 处理器(调 `PairingService`);④ UI 出真二维码(`qrcode.react` 风格)+ 扫码→绑定→收发闭环。**最大、最独立,优先做。**

### 🟠 B. 聊天「Claude Desktop 可交互性」(用户点名:编辑/重发 + 附件 + 搜索/置顶)

| 交互 | 现状 `[静态]` | 工作量 |
|---|---|---|
| **重发/retry** | 引擎 `retryFrom` 完整且有测试,只缺前端按钮;`timelineItemId` 与 `MessageBubble` 的 `item.id` 本就同为 `String(seq)` | **极小**(user 消息加一个按钮 → `{cmd:"retryFrom",sessionId,timelineItemId:item.id}`) |
| **编辑消息** | 全链路缺失(无 `editMessage` 命令、无可编辑 UI) | 中(需新命令 + 协议 + UI;或用 retryFrom 语义做「改了重发」) |
| **附件(图/文件)** | 全链路缺失(`SendMessageCommand` 只有 `{text}`,`MessagePayload` 只有 `{text,role}`,无上传/拖拽/粘贴) | 大(跨 commands/events/normalize/store/UI + SDK 多模态送法) |
| **消息搜索** | 缺(现有 search 只过滤归档会话列表,非消息) | 中(纯前端 timeline 过滤可起步) |
| **消息置顶** | 缺(`TimelineMessageItem` 无 pin 字段,无命令、无 store) | 中 |
| **markdown 增强** | `markdown.ts` 缺:表格 / 删除线 / 任务列表 / 代码高亮 / 图片 `![]()` / 嵌套列表 / h5-h6 / 裸链接自动识别 | 中(自研渲染器扩展或引入库,注意 XSS) |

### 🟠 C. 经济系统生产环境是死的(重大过度声称纠正)

`[静态]` `server.ts:89-100` 构造 `WsGateway` **只传 `mailbox/scheduler/settings/plugins`**,**没传 `gacha/achievements`** 服务。后果:
- 抽卡 `purchaseItem` → `ws-gateway.ts:441-445`「Gacha service unavailable」;
- 领成就 `claimAchievement` → 「Achievements service unavailable」;
- 成就进度永不推进(`publishAchievementUpdatesFor` 无服务直接 no-op);
- 宝石余额恒为 0(生产无任何 `economy.ledger.appended` 写入源)→ 抽卡按钮恒 disabled。

服务代码(`createGachaService`/`createAchievementsService`/`createEconomyLedgerService`)都实现了且有单测,**就差 server.ts 最后一公里接线**。修复小但影响大。需用户拍板:**接线让经济真跑**,还是**维持「引擎暂无经济」并把面板标注对齐**(ROADMAP 历来把 gems/Shop 标 mock)。

### 🟡 D. 小缺口 / 死路径清理

| 项 | 现状 `[静态]` |
|---|---|
| Konami 彩蛋效果死 | `KonamiListener` 触发写 `easter-store.lastEffect`,但 `lastEffect`/`clearLastEffect` **零消费**,彩虹永不渲染 |
| 大厅 atlas 失败静默 | `HubCanvas.tsx:27-30` 失败只 console + 绿底,无可见错误层(房间有);宜对齐房间的可见错误态 |
| `equipItem`/`unequipItem` 死命令 | `commands.ts` 解析,但无 UI 发、网关无处理 |
| `scheduler cancelRun` 死命令 | 解析了,无 UI 发、网关无 `cancelRun` 分支(若发会报错) |
| Settings CONFIG 惰性/死按钮 | general/perm/team/mcp/skills/hooks 写盘但引擎不消费;`+添加/✕/+Hook/自定义配置` 无绑定;compaction 阈值纯本地 mock |
| 信箱「转发到配对 IM」 | 故意置灰(协议无单条转发命令)——**A 做完后可补真**(有了配对链路就能转发) |
| Account `/login·登出` | 无 onClick 占位 |
| `Hud.tsx:167` 注释 | 把 Market 标 mock 是过时错误,顺手订正 |

---

## 3. 建议实现顺序(自上而下,每块 spec→plan→build,符合本仓 subagent-driven 纪律)

1. **A · 配对**(最大最独立,用户旗舰诉求)→ 单独 brainstorming/spec(因换官方包,需先核 `@tencent-weixin/openclaw-weixin` API)。完成后顺带激活信箱「转发到配对 IM」。
2. **B · 聊天交互**:先做**重发**(近乎白送,立竿见影)→ 再 markdown 增强 → 编辑 → 搜索/置顶 → 附件(最大,放最后或按需)。
3. **C · 经济接线**:需用户先定「真跑 vs 维持 mock」。若真跑,接线 + e2e。
4. **D · 死路径清理**:可零散穿插或集中一轮。

> 每块实现合并前**强制浏览器 e2e**(真实运行应用走完整用户路径 + 证据),符合 CLAUDE.md 测试纪律。配对/经济的「命令丢弃 / 服务不可用」运行时复证需 **live engine**(回放模式忽略命令,证不了)。
