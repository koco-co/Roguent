---
title: 微信 / 飞书扫码配对端到端 · 设计 spec(子项 A)
date: 2026-06-16
status: 待用户评审 → writing-plans
parent_goal: 全功能 e2e 验证 + 补齐配对/聊天等缺口(见 docs/2026-06-16-e2e-verification-gap-report.md §2.A)
decisions_locked:
  - 微信集成:精简自实现 Tencent 官方文档化 iLink HTTP 协议(零 openclaw 依赖),参照 @tencent-weixin/openclaw-weixin 源码 1:1 对齐端点与状态机
  - 飞书:扫码配对走飞书官方 device-code 应用自注册流(`accounts.feishu.cn|accounts.larksuite.com` 的 `/oauth/v1/app/registration`,RFC8628 风格,纯 fetch、零 openclaw,参照 Kun `claw-platform-install.ts`)→ 扫码授权后返回 appId/appSecret → 喂现有 `@larksuiteoapi/node-sdk` 长连接连接器
  - 真/假分明:配对全链路接真;无真实命令源的占位一律标注,不造数据
---

# 微信 / 飞书扫码配对端到端 · 设计 spec

> 把「脚手架齐全但命令链路断裂」的配对子系统,补成**用户能在 Roguent 自己 UI 里扫码 → 绑定 → 与 Claude 会话双向收发**的真功能。
> 纯净化原则:微信换成精简自实现的官方 iLink 协议(移除非官方 `@wechatbot/wechatbot` + `wechat-node-host.mjs`);飞书沿用官方 Lark SDK。

## 1. 目标与范围

**做**:
1. **微信**:Roguent 配对面板点「生成 QR」→ 引擎调官方 iLink 网关取登录二维码 → 面板渲染可扫二维码 → 用户手机微信扫码确认 → 引擎拿到 `bot_token` + `ilink_bot_id` → 持久化凭据 + 写 `PairingBinding` → 该微信会话与当前 Roguent 会话绑定 → 微信来消息进 Claude 会话、Claude 回复转发回微信。
2. **飞书**(真扫码,机制经 Kun `claw-platform-install.ts` 核实):配对面板点「生成 QR」→ 引擎 `POST accounts.feishu.cn/oauth/v1/app/registration` 取 device-code + `verification_uri_complete` → 面板把该 URL 渲染成二维码 → 用户飞书扫码、选/建一个 PersonalAgent 应用授权 → 引擎轮询同端点拿到 **appId/appSecret**(免手动复制)→ 落 keychain + 喂 `FeishuConnector` 长连接 → 把对应 Lark chat 绑到当前会话 → 群/私聊消息进 Claude、Claude 回复发回飞书。Lark 国际版走 `accounts.larksuite.com`。**手动回退**:已有自建应用者仍可在 Settings 直填 appId/appSecret(现有字段)。
3. **命令链路**:补 `pairing` 命令(`generateQr`/`cancelQr`)+ 修 `createPairing`/`updatePairing` 网关处理器;`IntegrationManager` 增配对编排 + **发射 `pairing.qr.updated`/`pairing.binding.updated` RoomEvent**(当前被忽略)。
4. **UI**:`PairingPanel` 渲染真二维码(URL→QR 图像编码)、状态机(idle/pending/scanned/confirmed/expired/error)、绑定列表(转发开关/解绑接真)、收发闭环;**激活信箱「转发到配对 IM」**(有了单条转发能力后)。

**不做(本子项外)**:聊天附件/编辑(子项 B);经济接线(子项 C);微信媒体消息(图片/语音/文件)收发——**首版只做文本**,媒体留 A2+;飞书富文本卡片。

## 2. 现状(已核实,缺口报告 §2.A + 本轮深挖)

| # | 断点 | 证据 |
|---|---|---|
| 1 | 无 `generateQr`/`pairing` 命令 | `commands.ts` 仅 `createPairing`/`updatePairing`(均为绑定操作,非出码) |
| 2 | `createPairing`/`updatePairing` 网关不处理 | `ws-gateway.ts:262-330` if/else 链无此分支 → `else` 回 `commandError` |
| 3 | 无 命令→`connector.startPairing()` 路径 | `IntegrationManager` 只 `start()` 连接器 + 收发路由,无配对编排 |
| 4 | 连接器配对事件被丢弃 | `IntegrationManager.handleConnectorEvent` 只处理 `message`/`status`,**忽略 `pairing.qr`/`pairing.scanned`/`pairing.expired`/`outbound.ack`** |
| 5 | 无 扫码→`PairingService.bind()`→`pairing.binding.updated` 路径 | 同上;`PairingService` 真(SQLite),但无人调 |
| 6 | UI 不会把 URL 编码成二维码 | `PairingQr.tsx` 只 `<img src=imageDataUrl>` 或把 `url` 当文本显示;iLink 给的是**待编码 URL 字符串** |
| 7 | 微信用非官方包 | `wechat.ts` import `@wechatbot/wechatbot`,Bun 不兼容→`wechat-node-host.mjs` 子进程 |
| 8 | 飞书 `startPairing` 是错误占位 | `FeishuConnector.startPairing()` 直接返回 error「configure the bot instead」——**未接飞书官方 device-code 扫码流**(该流真实存在,见 §3.2,Kun 已实现);现有连接器只会消费已配好的 appId/appSecret,缺「扫码→拿凭据」前半段 |

**已就绪、可复用**:`pairing.qr.updated`/`pairing.binding.updated` 事件类型 + store reduce(`store.ts` `qrByChannel`/`byId`/`byExternalKey`)**都已存在**;`PairingService.bind/resolve/setForwarding`(SQLite)真;`PairingPanel`/`BindingList` UI 骨架在。**所以工作量集中在「引擎编排 + 命令处理器 + 微信连接器重写 + UI 出码」,不是从零。**

## 3. 自实现依据:两渠道的官方协议(均参照 Kun 已落地实现)

### 3.1 微信 iLink 协议(参照 @tencent-weixin/openclaw-weixin 源码 + Kun `weixin-bridge-runtime.ts`)

- **固定网关** `https://ilinkai.weixin.qq.com`;`bot_type="3"`;通用头 `Content-Type: application/json` + `AuthorizationType: ilink_bot_token` + `Authorization: Bearer <token>` + `X-WECHAT-UIN: <base64(随机 uint32)>`。
- **出码** `POST ilink/bot/get_bot_qrcode?bot_type=3`,body `{local_token_list:[]}` → `{qrcode, qrcode_img_content}`。`qrcode_img_content` = **待编码成二维码的 URL**;`qrcode` = 后续轮询凭据。
- **轮询** `GET ilink/bot/get_qrcode_status?qrcode=<qrcode>[&verify_code=<code>]`(长轮询 ~35s)→ `{status, bot_token?, ilink_bot_id?, baseurl?, ilink_user_id?, redirect_host?}`。状态机:`wait`→`scaned`→(可选 `need_verifycode`)→`confirmed`(拿 token);`expired`(刷新,≤3 次);`scaned_but_redirect`(切 `redirect_host`);`binded_redirect`(已绑过,视为成功);`verify_code_blocked`。
- **收消息** `POST getupdates` body `{get_updates_buf}` → `{ret, msgs: WeixinMessage[], get_updates_buf}`(长轮询,游标续传)。
- **发消息** `POST sendmessage` body `{msg:{to_user_id, context_token, item_list:[{type:1, text_item:{text}}]}}`。
- **媒体**(本子项不做):`getuploadurl` + AES-128-ECB + CDN PUT;`getconfig`/`sendtyping`。
- ⚠️ **验证码褶子**:官方源 `need_verifycode` 从 **stdin** 读码。Roguent 不能用 stdin(无交互终端)——改为:引擎发 `pairing.qr.updated{status:"need_verifycode"}`,UI 弹输入框,用户输入经新命令 `pairing/submitVerifyCode` 回传,引擎带 `verify_code` 续轮询。

### 3.2 飞书 device-code 应用自注册流(飞书官方,RFC8628 风格;参照 Kun `claw-platform-install.ts`)
- **账号域**:飞书 `https://accounts.feishu.cn`;Lark 国际版 `https://accounts.larksuite.com`(按 `domain` 选)。
- **Start**:`POST {accountsBase}/oauth/v1/app/registration`(`application/x-www-form-urlencoded`)→ `{verification_uri_complete, device_code, user_code, interval(默认 5s), expire_in(默认 300s)}`。把 `verification_uri_complete` **渲染成二维码**(同一 URL 也可作降级链接;注意 Kun 注释:某些 `open.larksuite.com` 链接会被 Lark app 判 "Link expired",故用 `verification_uri_complete` 原值)。
- **Poll**:`POST {accountsBase}/oauth/v1/app/registration`(form,带 `device_code`)→ 轮询;就绪时返回 **`{appId(app_id), appSecret(app_secret), domain}`**;未就绪返回 pending,按 `interval` 重试至 `expire_in`。
- 拿到 appId/appSecret 后:落 keychain(`SecretStore`,沿用 `appIdSecretRef`/`appSecretRef` 机制)+ 启 `FeishuConnector` 长连接;扫码者授权的 chat 经后续 inbound 或显式选择绑定到会话。
- **降级**:已有自建应用者跳过 device-code,直接在 Settings 填 appId/appSecret(现有字段链路)。

## 4. 架构

### 4.1 微信连接器(重写为 Bun-native 精简 iLink)
新 `src/engine/integrations/wechat-ilink.ts`(替换 `wechat.ts` + `wechat-node-host.{ts,mjs}` + 移除 `@wechatbot/wechatbot` 依赖):
- 纯 `fetch` + `node:crypto`(Bun 原生支持),**无子进程、无 85MB openclaw**。
- 实现 `ImConnector` 接口:`startPairing(sessionId)`(get_bot_qrcode → emit `pairing.qr{url}` → 后台 `waitForLogin` 轮询 → `confirmed` 时 emit `pairing.scanned{externalChatId=ilink_user_id, botToken,...}`)、`start()`(已登录则起 getupdates 长轮询)、`sendMessage`、`onEvent`、`submitVerifyCode(sessionId, code)`。
- 凭据:`bot_token` 经 `SecretStore`(keychain)持久化,键含 `ilink_bot_id`;重启后 `start()` 复用。
- 保留 `wechat-fake.ts` 作单测 double(接口不变)。

### 4.2 飞书(device-code 扫码注册 → 现有 Lark SDK 连接器)
- 新 `src/engine/integrations/feishu-registration.ts`(纯 `fetch`,§3.2 协议):`startRegistration(domain)`(POST 取 device-code + `verification_uri_complete`)、`pollRegistration(deviceCode, domain)`(轮询取 appId/appSecret),零 openclaw。
- `FeishuConnector`:`start`/`sendMessage`/`handleMessage` **基本不变**(WSClient 长连接 + `im.message.receive_v1` + `message.create`);`startPairing` 改为驱动 device-code 流:emit `pairing.qr{url: verification_uri_complete}` → 后台轮询 → 拿到 appId/appSecret 后落 keychain + (重)启长连接 + emit `pairing.scanned`。
- 绑定:扫码授权方首次 inbound 的 `chat_id` → `PairingService.bind{channel:feishu, externalChatId:chat_id}`;或面板「绑定此 chat 到当前会话」。
- 降级:Settings 已填 appId/appSecret 时跳过 device-code,直接长连接(现状路径)。

### 4.3 命令协议(三处改:commands / events / store)
- **commands.ts**:新增 `PairingCommand`(`{cmd:"pairing", action:"generateQr"|"cancelQr"|"submitVerifyCode", sessionId, channel, code?}`)+ 解析;`createPairing`/`updatePairing` 形状不变。
- **events.ts**:复用现有 `pairing.qr.updated` / `pairing.binding.updated`(无需新增类型)。
- **store.ts**:reduce 已就绪;UI 侧补 `need_verifycode` 状态渲染。

### 4.4 网关 + 编排
- `ws-gateway.ts`:加 `c.cmd === "pairing"` → `IntegrationManager.startPairing/cancelPairing/submitVerifyCode`;加 `createPairing` → `PairingService.bind` + 发 `pairing.binding.updated`;加 `updatePairing` → `setForwarding`/`revoke` + 发事件。
- `IntegrationManager`:① 新增 `startPairing(channel, sessionId)` 调对应 connector;② `handleConnectorEvent` **扩展**:`pairing.qr`→publish `pairing.qr.updated`;`pairing.scanned`→`PairingService.bind` + publish `pairing.binding.updated` + 持久化凭据;`pairing.expired`→publish `pairing.qr.updated{status:expired}`。
- `live.ts`/`server.ts`:微信连接器换成 `wechat-ilink`;`IntegrationRouter` 的 `publish` 已接 `sessions.publishIntegrationEvent`,复用。

### 4.5 UI(PairingPanel / PairingQr）
- `PairingQr`:`qr.url` 非空时用**前端 QR 编码**(轻量:新增 `qrcode` 依赖或自带 ~3KB 纯函数编码器,生成 `<svg>`/data-URL)渲染可扫码;保留 url 文本兜底。状态徽:idle/pending/scanned/**need_verifycode(出输入框)**/confirmed/expired/error + 倒计时。
- 「生成 QR」改发 `pairing/generateQr`(非 `createPairing`)。
- 飞书 tab:未配凭据 → 引导去 Settings;已配 → 显示 bot 添加指引 + 「绑定此 chat」。
- `BindingList` 转发开关/解绑:`updatePairing` 现在真生效。
- **信箱**:`MailboxPanel` 的「转发到配对 IM」由置灰改为真——新增 `mailbox/forwardToIm` 命令(或复用 `pairing` 出站)调 `connector.sendMessage`。

## 5. 端到端数据流

**入站**:微信用户发消息 → iLink `getupdates` → connector emit `message` → `IntegrationRouter.route`(按 `byExternalKey` 找绑定会话,无则建订阅会话)→ `sessions.sendMessage` → Claude → timeline。
**出站**:Claude `message.final{role:assistant}` → `IntegrationManager.handleRoomEvent` → 取该会话 pending outbound target → `connector.sendMessage` → iLink `sendmessage` → emit `outbound.ack` → publish outbound delivery(信箱可见)。
**配对**:UI `pairing/generateQr` → manager → connector.startPairing → `pairing.qr.updated`(出码)→ 用户扫 → `pairing.scanned` → `PairingService.bind` + 凭据落 keychain → `pairing.binding.updated`(绑定出现在列表)。

## 6. 测试策略

- **单测**(零额度):`wechat-ilink.test.ts` 用注入的 fake fetch 跑完整状态机(wait→scaned→confirmed / expired 刷新 / need_verifycode);`IntegrationManager` 配对编排 + 事件发射;网关 `pairing`/`createPairing`/`updatePairing` 处理;store reduce(已有)。沿用 `FakeWeChatConnector`。
- **e2e 回放**:扩 fixture,断言 `pairing.qr.updated`→`qrByChannel` / `pairing.binding.updated`→绑定列表 / 入站→timeline。
- **浏览器 e2e**(强约束):replay engine 驱动配对面板渲染真二维码图像 + 状态流转 + 绑定列表;截图 + DOM 断言。
- **真连冒烟**(放最后、少量人工):微信——手机微信扫 Roguent 出的码 → 确认绑定 → 互发一条文本。飞书——面板扫 device-code 码、飞书内授权 PersonalAgent 应用 → 引擎拿到 appId/appSecret → 长连接就绪 → 互发一条文本(降级路径:Settings 手填凭据)。

## 7. 风险与缓解

- **iLink 协议为非公开稳定契约**:以官方包 2.4.4 源码为准实现;集中在单文件便于跟版;失败有可见错误态(不静默)。
- **验证码 stdin 褶子**:改走 UI 输入(§3)。
- **Bun crypto/fetch 边界**:文本路径纯 `fetch`+随机数,Bun 原生 OK;媒体 AES 留到 A2 再评估。
- **凭据安全**:`bot_token` 只进 keychain,日志 redact(沿用 `redactToken` 思路)。
- **打包**:移除子进程 + 非官方包后,Tauri sidecar 不再需要 Node≥22 旁路,更简单。

## 8. 子项 A 内部分阶段(供 writing-plans 细化)

- **A1**:命令协议 + 网关处理器 + `IntegrationManager` 配对编排 + 事件发射(协议骨架,fake connector 即可端到端 e2e)。
- **A2**:微信 `wechat-ilink` 连接器(真协议)+ 移除 `@wechatbot/wechatbot`/node-host + 凭据持久化。
- **A3**:UI 出码(QR 编码)+ 状态机 + need_verifycode 输入 + 绑定列表接真 + 浏览器 e2e。
- **A4**:飞书 `feishu-registration` device-code 扫码流(取 appId/appSecret)+ 凭据落 keychain + 长连接 + chat↔会话绑定 + 信箱「转发到配对 IM」激活;保留 Settings 手填降级。
- **A5**:真连冒烟(微信 + 飞书各一条),回写 ROADMAP。
