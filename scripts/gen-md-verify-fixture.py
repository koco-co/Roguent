#!/usr/bin/env python3
"""生成富 markdown + 全 timeline 类型的 E2E 验证 fixture(本地、不提交)。
覆盖:session.created(带 slashCommands 供 slash 菜单)/ 多 agent / context / todos /
thinking / tool ok+failed / 富 markdown message / prompt(question) / loot / usage / done。
输出 legacy RoomEvent JSONL(seq+type),与 fixtures/e2e-full.jsonl 同格式,replay 直接消费。"""
import json

# 富 markdown 正文 —— 逐项覆盖 markdown.ts 支持的语法 + XSS 过滤验证
md = "\n".join([
    "# 端到端验证报告",
    "",
    "这是一段 **加粗**、*斜体*、还有 `行内代码` 的混排正文,带一个 [示例链接](https://example.com)。",
    "",
    "## 渲染矩阵 (H2)",
    "",
    "### 子级标题 (H3)",
    "",
    "无序列表:",
    "- 第一项",
    "- 第二项 含 `code`",
    "- 第三项 **重点**",
    "",
    "有序列表:",
    "1. 克隆仓库",
    "2. 安装依赖",
    "3. 跑门禁",
    "",
    "> 这是一段引用 blockquote,用于核对样式。",
    "",
    "---",
    "",
    "代码块(带复制按钮):",
    "```ts",
    "function verify(x: number): boolean {",
    "  // 注释:边界检查",
    "  return x > 0 && x < 100;",
    "}",
    "```",
    "",
    "安全性:链接 [危险](javascript:alert(1)) 应降级为纯文本;尖括号 <script> 应被转义。",
])

events = [
    {"seq": 1, "ts": 100, "sessionId": "s1", "type": "session.created", "payload": {
        "title": "Roguent · E2E 验证", "model": "claude-opus-4-8", "permissionMode": "default",
        "apiKeySource": "oauth", "cwd": "/Users/poco/Projects/Roguent", "project": "roguent",
        "slashCommands": ["/brainstorming", "/writing-plans", "/subagent-driven-development",
                          "/systematic-debugging", "/test-driven-development", "/code-review",
                          "/deep-research", "/frontend-design", "/security-review", "/simplify",
                          "/verify", "/compact", "/context", "/review", "/init", "/loop", "/schedule"]}},
    {"seq": 2, "ts": 200, "sessionId": "s1", "type": "agent.spawned", "agentId": "orchestrator",
     "payload": {"role": "orchestrator", "promptSummary": "主控:统筹端到端验证", "parentId": ""}},
    {"seq": 3, "ts": 300, "sessionId": "s1", "type": "agent.spawned", "agentId": "ag-impl",
     "payload": {"role": "coder", "promptSummary": "实现导入面板", "parentId": "orchestrator"}},
    {"seq": 4, "ts": 360, "sessionId": "s1", "type": "agent.spawned", "agentId": "ag-review",
     "payload": {"role": "reviewer", "promptSummary": "审查 store reducer", "parentId": "orchestrator"}},
    {"seq": 5, "ts": 420, "sessionId": "s1", "type": "context.updated", "agentId": "orchestrator",
     "payload": {"usedTokens": 92000, "windowSize": 200000, "utilization": 46}},
    {"seq": 6, "ts": 480, "sessionId": "s1", "type": "todos.updated", "agentId": "orchestrator",
     "payload": {"todos": [
        {"content": "验证聊天 markdown 渲染", "status": "in_progress"},
        {"content": "核对输入框交互", "status": "pending"},
        {"content": "扫一遍全部面板", "status": "pending"},
        {"content": "门禁全绿", "status": "completed"}]}},
    {"seq": 65, "ts": 540, "sessionId": "s1", "type": "message.final", "agentId": "orchestrator",
     "payload": {"text": "帮我跑一遍门禁,然后用 markdown 出一份端到端验证报告,带代码块和清单。", "role": "user"}},
    {"seq": 7, "ts": 560, "sessionId": "s1", "type": "thinking.final", "agentId": "orchestrator",
     "payload": {"text": "先核对聊天 timeline 的 markdown 渲染:标题、列表、代码块、引用、链接、XSS 过滤逐项看过去,再测输入框。"}},
    {"seq": 8, "ts": 640, "sessionId": "s1", "type": "tool.started", "agentId": "ag-impl",
     "payload": {"toolName": "Edit", "inputSummary": "src/web/hud/ImportPanel.tsx", "toolUseId": "t1"}},
    {"seq": 9, "ts": 720, "sessionId": "s1", "type": "tool.ended", "agentId": "ag-impl",
     "payload": {"toolUseId": "t1", "ok": True}},
    {"seq": 10, "ts": 800, "sessionId": "s1", "type": "tool.started", "agentId": "ag-review",
     "payload": {"toolName": "Bash", "inputSummary": "bun test", "toolUseId": "t2"}},
    {"seq": 11, "ts": 880, "sessionId": "s1", "type": "tool.failed", "agentId": "ag-review",
     "payload": {"toolUseId": "t2", "ok": False}},
    {"seq": 12, "ts": 980, "sessionId": "s1", "type": "message.final", "agentId": "orchestrator",
     "payload": {"text": md, "role": "assistant"}},
    {"seq": 13, "ts": 1080, "sessionId": "s1", "type": "prompt.requested", "agentId": "orchestrator",
     "payload": {"promptId": "p1", "promptKind": "question", "data": {"questions": [{
        "question": "是否继续切换到 synthwave 美术风格?", "header": "美术风格", "multiSelect": False,
        "options": [
            {"label": "继续切换", "description": "应用 synthwave 全局皮肤"},
            {"label": "保持像素奇幻", "description": "维持内置风格"}]}]}}},
    {"seq": 14, "ts": 1160, "sessionId": "s1", "type": "loot.dropped", "agentId": "ag-impl",
     "payload": {"kind": "report", "label": "results/verify-report.md", "sourceRef": "t1"}},
    {"seq": 15, "ts": 1240, "sessionId": "s1", "type": "usage.updated", "agentId": "orchestrator",
     "payload": {"tokens": 92000, "cost": 0.42}},
    {"seq": 16, "ts": 1320, "sessionId": "s1", "type": "agent.idle", "agentId": "ag-impl", "payload": {}},
    {"seq": 17, "ts": 1340, "sessionId": "s1", "type": "economy.ledger.appended", "payload": {"entry": {
        "id": "l1", "ts": 1340, "reason": "welcome_bonus", "amount": 500, "currency": "gem",
        "delta": {"gem": 500}, "balance": {"gem": 500}, "source": "system", "sourceEventId": "e1"}}},
    {"seq": 18, "ts": 1360, "sessionId": "s1", "type": "economy.ledger.appended", "payload": {"entry": {
        "id": "l2", "ts": 1360, "reason": "gacha_pull", "amount": -100, "currency": "gem",
        "delta": {"gem": -100}, "balance": {"gem": 400}, "source": "gacha", "sourceEventId": "e2",
        "metadata": {"inventory": {"action": "added", "item": {"id": "skin.ninja", "sku": "skin.ninja",
            "kind": "skin", "label": "忍者皮肤", "quantity": 1, "acquiredAt": 1360}}}}}},
    {"seq": 19, "ts": 1400, "sessionId": "s1", "type": "achievement.updated", "payload": {"achievement": {
        "id": "ach-first", "title": "First Session", "description": "创建第一个会话", "progress": 1,
        "target": 1, "completed": True, "claimed": False, "updatedAt": 1400, "reward": {"gem": 50}}}},
    {"seq": 20, "ts": 1440, "sessionId": "s1", "type": "achievement.updated", "payload": {"achievement": {
        "id": "ach-code", "title": "Code Master", "description": "完成 10 次代码审查", "progress": 4,
        "target": 10, "completed": False, "updatedAt": 1440, "reward": {"gem": 200}}}},
    {"seq": 21, "ts": 1480, "sessionId": "s1", "type": "scheduler.task.created", "payload": {"task": {
        "id": "sch1", "title": "每日依赖审计", "prompt": "运行 bun audit 并汇报结果", "status": "enabled",
        "createdAt": 1480, "nextRunAt": 1700000000000, "cwd": "/Users/poco/Projects/Roguent",
        "schedule": {"kind": "daily", "hour": 9, "minute": 0, "timezone": "Asia/Shanghai"}}}},
]

with open("fixtures/md-verify.local.jsonl", "w") as f:
    for e in events:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
print(f"wrote {len(events)} events to fixtures/md-verify.local.jsonl")
