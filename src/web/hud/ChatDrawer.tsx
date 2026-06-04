import { useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function ChatDrawer() {
  const open = useUiStore((s) => s.drawerOpen);
  const toggle = useUiStore((s) => s.toggle);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const switchSession = useRoomStore((s) => s.switchSession);
  const appendUserMessage = useRoomStore((s) => s.appendUserMessage);
  const messages = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId]?.messages : undefined,
  );
  const [text, setText] = useState("");
  if (!open) return null;
  const list = Object.values(sessions);
  const send = () => {
    const t = text.trim();
    if (currentId && t) {
      appendUserMessage(currentId, t); // 乐观回显用户气泡
      sendCommand({ cmd: "sendMessage", sessionId: currentId, text: t });
      setText("");
    }
  };
  return (
    <div
      className="px-panel px-pop"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(52%, 560px)",
        display: "flex",
        padding: 0,
      }}
    >
      <div
        className="px-scroll"
        style={{
          width: 180,
          borderRight: "3px solid var(--edge-dark)",
          padding: 10,
        }}
      >
        <div className="px-title">会话</div>
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`px-row${s.id === currentId ? " sel" : ""}`}
            onClick={() => switchSession(s.id)}
          >
            <div style={{ fontSize: 11 }}>{s.title}</div>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>{s.status}</div>
          </button>
        ))}
        <button
          type="button"
          className="px-btn"
          style={{ width: "100%", padding: 8, fontSize: 10 }}
          onClick={() =>
            sendCommand({
              cmd: "newSession",
              sessionId: `s${list.length + 1}`,
              title: "new",
              model: "claude-opus-4-8",
            })
          }
        >
          ＋ 新会话
        </button>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 12,
        }}
      >
        <button
          type="button"
          title="关闭"
          className="px-btn"
          style={{ alignSelf: "flex-end", width: 26, height: 26, fontSize: 12 }}
          onClick={() => toggle("drawerOpen")}
        >
          ✕
        </button>
        <div
          className="px-scroll"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
            paddingTop: 8,
          }}
        >
          {!currentId && (
            <span style={{ color: "var(--muted)" }}>选一个会话</span>
          )}
          {currentId && (messages?.length ?? 0) === 0 && (
            <span style={{ color: "var(--muted)" }}>
              还没有消息,发一条开始…
            </span>
          )}
          {messages?.map((m) => (
            <div
              key={m.id}
              className={`px-bubble ${m.role}`}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="px-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="发消息…"
          />
          <button
            type="button"
            className="px-btn"
            style={{ width: 44, fontSize: 14, color: "var(--cyan)" }}
            onClick={send}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
