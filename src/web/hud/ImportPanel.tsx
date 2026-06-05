import { useEffect } from "react";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

/**
 * 导入本地 Claude Code 会话历史:列出 ~/.claude/projects 下的会话,
 * 点一条即把整段对话(用户 + 助手轮次)零额度同步进聊天抽屉——「云存档同步」式回看。
 */
export function ImportPanel() {
  const open = useUiStore((s) => s.importOpen);
  const items = useUiStore((s) => s.localSessions);
  const error = useUiStore((s) => s.importError);

  // 面板打开时拉一次本地会话列表(请求/响应:engine 定向回 control 消息)。
  useEffect(() => {
    if (open) sendCommand({ cmd: "listLocalSessions" });
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="px-panel px-pop px-scroll"
      style={{
        position: "absolute",
        top: 120,
        right: 12,
        width: 300,
        maxHeight: 420,
        padding: 12,
      }}
    >
      <div className="px-title">📂 导入本地会话</div>
      {error && (
        <div style={{ color: "var(--pink)", fontSize: 11, padding: "6px 0" }}>
          ⚠ {error}
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 11 }}>没有本地会话</div>
      ) : (
        items.map((m) => (
          <button
            key={m.path}
            type="button"
            className="px-row"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
            }}
            onClick={() => sendCommand({ cmd: "importSession", path: m.path })}
          >
            <div style={{ fontSize: 11, color: "var(--cyan)" }}>
              {m.project}
            </div>
            <div style={{ fontSize: 11, wordBreak: "break-all" }}>
              {m.firstMessage || m.sessionId}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {m.msgCount} 行
            </div>
          </button>
        ))
      )}
    </div>
  );
}
