import { useMemo, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function ChatDrawer() {
  const open = useUiStore((s) => s.drawerOpen);
  const toggle = useUiStore((s) => s.toggle);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const switchSession = useRoomStore((s) => s.switchSession);
  const unarchiveSession = useRoomStore((s) => s.unarchiveSession);
  const appendUserMessage = useRoomStore((s) => s.appendUserMessage);
  const messages = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId]?.messages : undefined,
  );
  const [text, setText] = useState("");
  const [cwd, setCwd] = useState("");
  const [search, setSearch] = useState("");

  const list = useMemo(() => Object.values(sessions), [sessions]);
  const activeList = list.filter((s) => !s.archived);
  const q = search.trim().toLowerCase();
  const archivedList = list
    .filter((s) => s.archived)
    .filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.project ?? "").toLowerCase().includes(q),
    );

  if (!open) return null;

  const send = () => {
    const t = text.trim();
    if (currentId && t) {
      appendUserMessage(currentId, t); // 乐观回显用户气泡
      sendCommand({ cmd: "sendMessage", sessionId: currentId, text: t });
      setText("");
    }
  };

  const newSession = () => {
    // 取已有 s<n> 的最大编号 +1,避免删除后 id 复用碰撞。
    const nums = Object.keys(sessions)
      .map((id) => Number(id.replace(/^s/, "")))
      .filter((n) => Number.isFinite(n));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const dir = cwd.trim();
    sendCommand({
      cmd: "newSession",
      sessionId: `s${n}`,
      title: `会话 ${n}`,
      model: "claude-opus-4-8",
      ...(dir ? { cwd: dir } : {}),
    });
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
          width: 196,
          borderRight: "3px solid var(--edge-dark)",
          padding: 10,
        }}
      >
        <div className="px-title">会话</div>
        {activeList.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`px-row${s.id === currentId ? " sel" : ""}`}
            onClick={() => switchSession(s.id)}
          >
            <div style={{ fontSize: 11 }}>{s.title}</div>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>
              {s.project ? `${s.project} · ` : ""}
              {s.status}
            </div>
          </button>
        ))}

        {/* 新建会话:可选目录(cwd) → 服务端据此派生 project(房间)。 */}
        <input
          className="px-input"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="目录 cwd(默认服务端)"
          style={{ width: "100%", marginBottom: 6, fontSize: 9, padding: 6 }}
        />
        <button
          type="button"
          className="px-btn"
          style={{ width: "100%", padding: 8, fontSize: 10 }}
          onClick={newSession}
        >
          ＋ 新会话
        </button>

        {/* 已归档:从大厅退场但仍可搜可复活的会话(spec §生命周期)。 */}
        {list.some((s) => s.archived) ? (
          <>
            <div className="px-title" style={{ marginTop: 14 }}>
              已归档
            </div>
            <input
              className="px-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索已归档…"
              style={{
                width: "100%",
                marginBottom: 6,
                fontSize: 9,
                padding: 6,
              }}
            />
            {archivedList.map((s) => (
              <button
                key={s.id}
                type="button"
                className="px-row"
                style={{ opacity: 0.7 }}
                title="点击复活到大厅"
                onClick={() => unarchiveSession(s.id)}
              >
                <div style={{ fontSize: 11 }}>{s.title}</div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>
                  {s.project ? `${s.project} · ` : ""}↺ 复活
                </div>
              </button>
            ))}
          </>
        ) : null}
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
