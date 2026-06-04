import { useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function ChatDrawer() {
  const open = useUiStore((s) => s.drawerOpen);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const switchSession = useRoomStore((s) => s.switchSession);
  const [text, setText] = useState("");
  if (!open) return null;
  const list = Object.values(sessions);
  const send = () => {
    if (currentId && text.trim()) {
      sendCommand({ cmd: "sendMessage", sessionId: currentId, text });
      setText("");
    }
  };
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "55%",
        background: "#0d1726",
        borderLeft: "2px solid #ff3ea5",
        display: "flex",
      }}
    >
      <div
        style={{
          width: "38%",
          borderRight: "1px solid #21303f",
          padding: 8,
          overflow: "auto",
        }}
      >
        <div style={{ color: "#86c7d6", fontSize: 11, padding: 4 }}>会话</div>
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => switchSession(s.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginBottom: 6,
              padding: 8,
              borderRadius: 8,
              background: s.id === currentId ? "#181226" : "#101c2e",
              border: `1px solid ${s.id === currentId ? "#ff3ea5" : "#21303f"}`,
              color: "#d7e6ef",
              cursor: "pointer",
            }}
          >
            {s.title} · {s.status}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            sendCommand({
              cmd: "newSession",
              sessionId: `s${list.length + 1}`,
              title: "new",
              model: "claude-opus-4-8",
            })
          }
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            border: "1px dashed #2a4a5e",
            background: "transparent",
            color: "#86c7d6",
            cursor: "pointer",
          }}
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
        <div style={{ flex: 1, color: "#9bb3c2", fontSize: 12 }}>
          {currentId ? `会话 ${currentId}` : "选一个会话"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="发消息…"
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 18,
              background: "#10202e",
              border: "2px solid #00ffe7",
              color: "#cffcf7",
            }}
          />
          <button
            type="button"
            onClick={send}
            style={{
              padding: "8px 14px",
              borderRadius: 18,
              background: "#00ffe7",
              border: "none",
              cursor: "pointer",
            }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
