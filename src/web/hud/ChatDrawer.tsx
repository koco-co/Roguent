import { useMemo, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";

/**
 * 聊天面板 Chat(对标设计原型 panels2.jsx 的 Chat,T3.8 由右侧抽屉重构为居中 Modal):
 * 左会话侧栏(列表 / 新建 / 归档复活)+ 右对话区(对话流 + 输入)。
 *
 * **这是真数据面板,不是 mock**:会话列表 / 消息 / 发送 / 新建 / 归档复活全是真功能,
 * 连真实引擎或回放——只换 chrome(右抽屉→居中 Modal)+ 迁触发到 activePanel 路由,
 * 一个真实功能都没丢,不加任何 mock banner / 造假。导出名仍是 ChatDrawer(Hud 不改)。
 *
 * activePanel gate 的 return null 放在所有 hooks(含 useMemo)之后(React hooks 规则)。
 * selector 守 zustand 铁律:sessions 取 store map 的稳定引用(Object.values 在 render
 * 体 / useMemo 里做,绝不在 selector 里构造新值);其余取基元 / 单值 / 稳定函数引用。
 */
export function ChatDrawer() {
  const active = useUiStore((s) => s.activePanel === "chat");
  const closePanel = useUiStore((s) => s.closePanel);
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

  // sessions 的 Object.values 在 useMemo 里做(不在 selector 里,守 zustand 铁律)。
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

  if (!active) return null;

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
    <Modal
      title="CHAT"
      sub="与会话对话"
      icon="chat"
      accent="#36c5e0"
      width={1100}
      height={680}
      onClose={closePanel}
    >
      <div className="chat-layout">
        {/* 左侧会话侧栏:active 列表 / 新建 / 归档复活——全部真功能,暖木风格重绘。 */}
        <div className="chat-side scroll">
          <div className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
            会话
          </div>
          {activeList.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chat-sess${s.id === currentId ? " sel" : ""}`}
              onClick={() => switchSession(s.id)}
            >
              <div style={{ fontSize: 12, color: "var(--text)" }}>
                {s.title}
              </div>
              <div className="faint" style={{ fontSize: 10 }}>
                {s.project ? `${s.project} · ` : ""}
                {s.status}
              </div>
            </button>
          ))}

          {/* 新建会话:可选目录(cwd) → 服务端据此派生 project(房间)。 */}
          <input
            className="pxinput"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="目录 cwd(默认服务端)"
            style={{ marginTop: 8, fontSize: 10 }}
          />
          <button
            type="button"
            className="pxbtn sm cjk"
            style={{ width: "100%", marginTop: 6 }}
            onClick={newSession}
          >
            ＋ 新会话
          </button>

          {/* 已归档:从大厅退场但仍可搜可复活的会话(spec §生命周期)。 */}
          {list.some((s) => s.archived) ? (
            <>
              <div
                className="px"
                style={{ fontSize: 10, color: "var(--gold)", marginTop: 14 }}
              >
                已归档
              </div>
              <input
                className="pxinput"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索已归档…"
                style={{ marginTop: 6, fontSize: 10 }}
              />
              {archivedList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chat-sess"
                  style={{ opacity: 0.7 }}
                  title="点击复活到大厅"
                  onClick={() => unarchiveSession(s.id)}
                >
                  <div style={{ fontSize: 12, color: "var(--text)" }}>
                    {s.title}
                  </div>
                  <div className="faint" style={{ fontSize: 10 }}>
                    {s.project ? `${s.project} · ` : ""}↺ 复活
                  </div>
                </button>
              ))}
            </>
          ) : null}
        </div>

        {/* 右侧对话区:对话流(气泡按 role)+ 输入。 */}
        <div className="chat-wrap">
          <div className="chat-thread scroll">
            {!currentId && <span className="faint">选一个会话</span>}
            {currentId && (messages?.length ?? 0) === 0 && (
              <span className="faint">还没有消息,发一条开始…</span>
            )}
            {messages?.map((m) => (
              // user → out(右、青色气泡);assistant / system → in(左、面板色气泡)。
              <div
                key={m.id}
                className={`chat-msg ${m.role === "user" ? "out" : "in"}`}
              >
                <div className="chat-role faint">{m.role}</div>
                <div className="chat-bubble">{m.text}</div>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              className="pxinput"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="发消息…"
            />
            <button
              type="button"
              className="pxbtn primary sm cjk"
              onClick={send}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
