#!/usr/bin/env python3
"""生成配对(微信/飞书)E2E 验证 fixture(本地、不提交)。
覆盖 pairing.qr.updated(pending→scanned)+ pairing.binding.updated(created)
微信 + 飞书各一条 QR,用于浏览器里验证 PairingPanel 的事件→store→渲染链路。
输出 legacy RoomEvent JSONL(seq+type),replay 直接消费(命令路径由单测覆盖,replay 不处理命令)。"""
import json

FAR_FUTURE = 4070908800000  # 2099,确保 QR 显示未来过期时间

events = [
    {"seq": 1, "ts": 100, "sessionId": "s1", "type": "session.created", "payload": {
        "title": "Roguent · 配对验证", "model": "claude-opus-4-8", "permissionMode": "default",
        "apiKeySource": "oauth", "cwd": "/Users/poco/Projects/Roguent", "project": "roguent",
        "slashCommands": ["/code-review", "/deep-research", "/verify"]}},
    {"seq": 2, "ts": 200, "sessionId": "s1", "type": "agent.spawned", "agentId": "orchestrator",
     "payload": {"role": "orchestrator", "promptSummary": "主控:配对验证", "parentId": ""}},
    # 微信 QR:pending(出码)
    {"seq": 3, "ts": 300, "sessionId": "s1", "type": "pairing.qr.updated", "payload": {"qr": {
        "id": "wechat-qr-s1-1", "channel": "wechat", "status": "pending",
        "url": "https://ilinkai.weixin.qq.com/bot/scan?token=FAKEQRDEMO123", "expiresAt": FAR_FUTURE}}},
    # 飞书 QR:pending(device-code verification_uri_complete)
    {"seq": 4, "ts": 400, "sessionId": "s1", "type": "pairing.qr.updated", "payload": {"qr": {
        "id": "feishu-qr-s1-1", "channel": "feishu", "status": "pending",
        "url": "https://accounts.feishu.cn/oauth/v1/app/registration?user_code=ABCD-1234",
        "expiresAt": FAR_FUTURE}}},
    # 微信 QR:scanned(扫码中)
    {"seq": 5, "ts": 600, "sessionId": "s1", "type": "pairing.qr.updated", "payload": {"qr": {
        "id": "wechat-qr-s1-1", "channel": "wechat", "status": "scanned",
        "url": "https://ilinkai.weixin.qq.com/bot/scan?token=FAKEQRDEMO123", "expiresAt": FAR_FUTURE}}},
    # 微信绑定:created(扫码完成 → 绑定出现在列表)
    {"seq": 6, "ts": 800, "sessionId": "s1", "type": "pairing.binding.updated", "payload": {
        "action": "created", "binding": {
            "id": "binding:wechat:demo-user:s1", "channel": "wechat", "status": "active",
            "externalChatId": "demo-wx-user-001", "sessionId": "s1", "forwardingEnabled": True,
            "boundAt": 800, "updatedAt": 800, "displayName": "测试微信用户",
            "externalUserId": "demo-wx-user-001"}}},
    # 微信 QR:need_verifycode(A2 用 status=pending + metadata.needVerifyCode 透出 → A3 出验证码输入框)
    {"seq": 7, "ts": 1000, "sessionId": "s1", "type": "pairing.qr.updated", "payload": {"qr": {
        "id": "wechat-qr-s1-1", "channel": "wechat", "status": "pending",
        "url": "https://ilinkai.weixin.qq.com/bot/scan?token=FAKEQRDEMO123", "expiresAt": FAR_FUTURE,
        "metadata": {"needVerifyCode": True, "ilinkStatus": "need_verifycode"}}}},
]

with open("fixtures/pairing-verify.local.jsonl", "w") as f:
    for e in events:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
print(f"wrote {len(events)} events to fixtures/pairing-verify.local.jsonl")
