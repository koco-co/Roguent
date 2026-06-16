---
title: 聊天 Claude-Desktop 级可交互性 · 设计 spec(子项 B)
date: 2026-06-16
status: 待用户评审(随做随给)→ 逐阶段实现
parent_goal: 全功能 e2e 验证 + 补齐缺口(见 docs/2026-06-16-e2e-verification-gap-report.md §2.B)
user_decision: 编辑/重发 + 附件(图片/文件)+ 消息搜索/置顶(2026-06-16 AskUserQuestion 多选)
---

# 聊天 Claude-Desktop 级可交互性 · 设计 spec

> 把聊天从「发送/流式/停止/复制/slash/权限卡」补到 Claude Desktop 级:**重发、编辑、附件、搜索、置顶** + markdown 渲染增强。纯前端为主,少量引擎协议扩展。
> 体检结论:`retryFrom`/`rollback` 引擎已实现且有测试,缺前端按钮(重发近乎白送);编辑/附件/搜索/置顶全链路缺;`markdown.ts` 缺表格/高亮/图片/任务列表/删除线/嵌套列表。

## 现状关键事实(已核实)

- `retryFrom{sessionId, timelineItemId}` 引擎完整(`session.ts` 重发原 user 文本)+ 有测试;`timelineItemId` == `MessageBubble` 的 `item.id` == `String(seq)`(已对齐)。仅 **user** 消息可重发(有 live driver 时)。
- `rollback{sessionId, checkpointId}` 引擎可截断 timeline 到检查点(driver 可选实现)。
- `markdown.ts` 手写零依赖渲染器(XSS 转义 + 链接 scheme 过滤),仅用于 `MessageBubble`。支持:标题 1–4 / 代码块(无高亮)/ 行内代码 / 粗斜体 / 链接(过滤 js:/data:)/ 引用 / hr / 有序无序列表。
- `SendMessageCommand` 仅 `{cmd, sessionId, text}`;`MessagePayload` 仅 `{text, role?}`——附件需新协议。

## 分阶段(每阶段 spec→Workflow 实现+对抗校验→合 main→浏览器 e2e)

### B1 · 重发 + markdown 增强(零协议改动,先做)
- **重发**:`MessageBubble` 对 **user** 消息加「重发」按钮 → `sendCommand({cmd:"retryFrom", sessionId, timelineItemId: item.id})`。无引擎改动(引擎已支持)。i18n。
- **markdown 增强**(`markdown.ts`,保持零依赖 + XSS 安全):新增 ① 表格(`| a | b |` + 分隔行)② 任务列表(`- [ ]`/`- [x]` → checkbox,禁用态)③ 删除线(`~~x~~`)④ 图片(`![alt](url)`,**仅放行 http/https/data:image**,其余降级为文本)⑤ 嵌套列表(缩进跟踪)⑥ 代码块语言标签 + `language-xxx` class(CSS 着色,不引入高亮库)⑦ 裸链接自动识别(可选)。全部带 XSS 单测(尖括号转义、危险 scheme 降级)。
- **e2e**:扩 `fixtures/md-verify.local.jsonl` 覆盖新语法 + 一条 user 消息;浏览器验:富 markdown(表格/任务/图片/删除线)正确渲染、user 消息有「重发」按钮、EN 零中文泄漏。

### B2 · 编辑消息(小协议扩展)
- **设计决策**:`MessageBubble` 对 user 消息加「编辑」→ 行内可编辑 → 确认时 `sendCommand({cmd:"retryFrom", sessionId, timelineItemId, text?})`,**给 `retryFrom` 加可选 `text` 覆盖**(引擎:有 `text` 则用新文本重发,否则用存储原文)。改三处:`commands.ts`(RetryFromCommand 加 `text?`)、`ws-gateway`(透传)、`session.ts retryFrom`(用 override text)。前端编辑 UI + i18n。
- **e2e**:编辑 user 消息 → 改文 → 确认 → 断言发出带新 text 的 retryFrom。

### B3 · 搜索 + 置顶(前端为主)
- **搜索**:聊天头部加搜索框,过滤当前会话 `timeline` 的 message 文本(高亮命中);纯前端、无协议。
- **置顶**:`store` 加 per-session `pinnedIds: Set<string>`(客户端持久化到 localStorage,**标注为客户端本地状态、不入引擎**——无源不造);`MessageBubble` 加「置顶」切换 + 一个「已置顶」聚合区。
- **e2e**:搜索过滤可见、置顶留存(reload 后仍在)。

### B4 · 附件:图片 / 文件上传(最大,跨层 + SDK 多模态)
- **前置调研**:Claude Agent SDK streaming-input 的 user 消息是否支持 content blocks(image base64 / document)?(查 claude-api / SDK)。确定后定协议。
- **协议扩展**(三处 + driver):`SendMessageCommand` 加 `attachments?: {kind:"image"|"file", name, mediaType, dataBase64|path}[]`;`MessagePayload`/timeline message item 加 attachments 展示;`Driver.send` 把附件转成 SDK content blocks。前端 Composer 加拖拽/选择/粘贴上传 + 缩略图 + 大小限制。
- **e2e**:拖入图片 → 缩略图 → 发送 → timeline 显示附件;真连冒烟(少量额度)发一张图给 Claude。
- **风险**:SDK 多模态支持度、大文件、base64 体积;先只做图片,文件次之。

## 真/假边界
重发/编辑/搜索 **接真**(真命令/真 timeline);置顶 **客户端本地状态**(标注、不声称引擎源);附件 **接真**(真 SDK 多模态送达)。markdown 增强纯渲染 + XSS 安全。

## 门禁
每阶段:`bun test` + `bunx tsc --noEmit` + `bun run check` 全绿 + EN i18n 零泄漏 + 合 main 后浏览器 e2e + 证据。
