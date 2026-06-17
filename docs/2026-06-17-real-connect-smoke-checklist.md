---
title: 真连冒烟清单 · 微信/飞书扫码配对 + 聊天图片附件
date: 2026-06-17
purpose: A(配对)/ B4(附件)的逻辑已被注入式单测 + 对抗校验覆盖;真扫码 / 真发图需真实账号+少量额度,只能人工跑。本清单照着做即可。
status: 待用户执行
---

# 真连冒烟清单(人工,少量额度)

> 单测/对抗校验已覆盖逻辑;这里验**真实外部连接**:真二维码能被手机扫、真消息双向、真图片送达 Claude。
> **环境前提**(所有项共用):本机已 `claude` 订阅登录(`/login` 态);能联网到 `ilinkai.weixin.qq.com`(微信)/ `accounts.feishu.cn`(飞书)/ `api.anthropic.com`(聊天)。若在代理后,`dev:engine` 继承 shell 代理变量(打包 .app 走 `src/engine/proxy.ts` 注入,dev 不需要)。

## 0. 起真实引擎(非回放)

```bash
# 终端 A:真引擎(连真 SDK,固定 8787)
bun run dev:engine
# 终端 B:前端
bun run dev:web      # http://localhost:5173
```

打开 `http://localhost:5173` → 选英雄过登录门 → 大厅。**不要**带 `?engine=` 或 `localStorage roguent:engineUrl` 覆盖(那是回放用)。

---

## 1. 微信扫码配对

**前提**:一个能扫码的微信(手机)。

**步骤**:
1. 大厅点「内景」进任一会话(没有就先「召唤小队/新建」),或走任务台 → SessionGrid → 进一个会话。
2. 底部 dock 点「配对」→ 配对面板 → **微信** tab。
3. 点「生成 QR」。**预期**:QR 框出现**可扫二维码**(状态 `pending`,下方有 `ilinkai.weixin.qq.com/...` 链接;倒计时 expires)。
4. 手机微信扫该二维码 → 手机上确认授权。
   - **若提示输入数字**(`need_verifycode`):面板会出现「输入手机微信显示的数字」输入框 → 填手机上显示的数字 → 提交验证码。
5. **预期**:状态转 `scanned` → `confirmed`;右侧「已绑定 · 微信」出现一条**绑定**(显示你的微信标识,状态 active)。
6. **双向收发**:从手机微信给这个 bot 发一条文本 → **预期**该消息进入当前 Claude 会话(聊天 timeline 出现一条来自微信的消息);Claude 回复 → **预期**回复转发回微信(手机收到)。

**证据**:截图(QR / 绑定 / timeline 里的微信消息 / 手机收到的 Claude 回复)。
**排查**:QR 不出 → 看 `dev:engine` 终端日志(连接器 status error?网络到 ilinkai?);`wechat_bun_incompatible` 不应再出现(已换纯 Bun fetch 实现)。

---

## 2. 飞书 / Lark 扫码配对

**前提**:飞书(国内)或 Lark(国际)账号,能扫码并在飞书内授权创建/选择一个 PersonalAgent 应用。

**步骤**:
1. 同上进会话内景 → dock「配对」→ **飞书** tab。
2. 点「生成 QR」。**预期**:QR 框出现可扫二维码(内容是 `accounts.feishu.cn/oauth/v1/app/registration?...` 的 `verification_uri_complete`;Lark 国际版会在轮询时切到 `accounts.larksuite.com`)。
3. 用飞书 App 扫码 → 在飞书内**选择或创建一个 PersonalAgent 应用并授权**。
4. **预期**:引擎轮询拿到 `appId`/`appSecret`(免手动复制),落 keychain → 飞书长连接(`@larksuiteoapi/node-sdk` WSClient)就绪;面板出现「飞书已连接」态。
5. **双向收发**:把该 bot 拉进一个飞书群 / 私聊它发一条文本 → **预期**消息进 Claude 会话;Claude 回复 → 转发回该飞书 chat。
   - 绑定:首条 inbound 的 `chat_id` 即与当前会话绑定(或面板「绑定此 chat」)。

**降级路径**(已有自建 Lark 应用者):去 Settings 的 integrations 组直接填 appId/appSecret,跳过扫码。
**证据**:截图(QR / 已连接 / 飞书群里的 Claude 回复)。

---

## 3. 聊天图片附件(花少量额度)

**前提**:真引擎在跑(会真发给 Claude,消耗额度)。

**步骤**:
1. 进会话内景 → 打开聊天(Hotbar「聊天」)。
2. Composer:三种方式之一附图——点 🖼 选图 / 拖图进输入区 / 粘贴剪贴板图片(jpg/png/gif/webp,≤4MB,≤4 张)。
3. **预期**:出现缩略图 chip(可点 × 移除);可只发图(空文本)也可图文一起。
4. 发送 → **预期**:你的消息气泡显示附件 chip;图片作为多模态 content block 真发给 Claude;**Claude 的回复能描述/回应这张图**(证明多模态真送达)。

**证据**:截图(带图的消息气泡 + Claude 针对图片的回复)。
**排查**:若 Claude 说看不到图 → 看 `dev:engine` 日志确认 content blocks 发出;media_type 须是 4 类之一。

---

## 备注
- 微信/飞书扫码主要消耗**外部平台**配额(非 Anthropic 额度);聊天发图消耗 **Anthropic 额度**(一张图很少)。
- 跑完把结果告诉我(哪条通过/卡在哪),卡住我接着排查修。
