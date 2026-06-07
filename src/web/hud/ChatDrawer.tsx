import { useEffect, useMemo, useRef, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { TimelineItem } from "./TimelineItem";
import { Icon } from "./icons";
import { modelLabel } from "./model-label";

/**
 * 聊天抽屉 ChatDrawer(对标设计原型 panels2.jsx 的 Chat,由居中 Modal 改回右侧单栏抽屉):
 * 贴右满高玻璃抽屉,头部=当前会话名 + `claude · 模型 · NP` + 「会话」管理弹层;对话流按
 * markdown 渲染**真实整轮消息**,输入框发真 sendMessage。**真数据面板,不是 mock**。
 *
 * 原左侧会话侧栏删除,其独有的「新建会话 / 归档复活」收进头部「会话」弹层(真功能一个不丢)。
 * 不接 token 流式(引擎 includePartialMessages=false,整轮到达),不加假光标。导出名仍
 * ChatDrawer(Hud 不改)。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。selector 守
 * zustand 铁律:session/sessions 取 store 的稳定引用,Object.values 在 useMemo 里做,
 * 绝不在 selector 里构造新值。
 */
export function ChatDrawer() {
  const active = useUiStore((s) => s.activePanel === "chat");
  const closePanel = useUiStore((s) => s.closePanel);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const switchSession = useRoomStore((s) => s.switchSession);
  const unarchiveSession = useRoomStore((s) => s.unarchiveSession);
  const appendUserMessage = useRoomStore((s) => s.appendUserMessage);

  const [text, setText] = useState("");
  const [cwd, setCwd] = useState("");
  const [search, setSearch] = useState("");
  const [mgrOpen, setMgrOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // sessions 的 Object.values 在 useMemo 里做(不在 selector 里,守 zustand 铁律)。
  const list = useMemo(() => Object.values(sessions), [sessions]);
  const timeline = session?.timeline;

  // 新消息到达 / 切会话后自动滚到底(对标原型 threadRef)。timeline 引用变即触发。
  // biome-ignore lint/correctness/useExhaustiveDependencies: timeline 是触发条件,非回调内使用的值;threadRef.current 是 DOM ref,不加入 deps 是 React 惯例
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline]);

  if (!active) return null;

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

  const agentCount = session ? Object.keys(session.agents).length : 0;

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
      model: session?.model ?? "claude-opus-4-8",
      ...(dir ? { cwd: dir } : {}),
    });
    setCwd("");
  };

  const pickSession = (id: string) => {
    switchSession(id);
    setMgrOpen(false);
  };

  const handleClose = () => {
    setMgrOpen(false);
    closePanel();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是模态遮罩,点击空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="cdrawer-scrim" onClick={handleClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞冒泡,防点抽屉误触 scrim 关闭 */}
      <div className="cdrawer" onClick={(e) => e.stopPropagation()}>
        <div className="cdrawer-hd">
          <div className="cdrawer-hd-l">
            <Icon name="chat" size={22} glow="#36c5e0" />
            <div className="cdrawer-titles">
              <div className="cdrawer-name cjk">
                {session?.title ?? "无会话"}
              </div>
              <div className="cdrawer-meta px">
                claude · {modelLabel(session?.model)} · {agentCount}P
              </div>
            </div>
          </div>
          <button
            type="button"
            className="pxbtn sm cjk"
            onClick={() => setMgrOpen((v) => !v)}
          >
            会话
          </button>
          <button type="button" className="closex px" onClick={handleClose}>
            ✕
          </button>
        </div>

        {/* 头部「会话」管理弹层:活动会话(切换)/ 新建 / 归档复活——单栏下保功能。 */}
        {mgrOpen && (
          <div className="cdrawer-mgr scroll">
            <div className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
              会话
            </div>
            {activeList.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chat-sess${s.id === currentId ? " sel" : ""}`}
                onClick={() => pickSession(s.id)}
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
        )}

        <div className="cdrawer-thread scroll" ref={threadRef}>
          {!currentId && <span className="faint">选一个会话</span>}
          {currentId && (timeline?.length ?? 0) === 0 && (
            <span className="faint">还没有消息,发一条开始…</span>
          )}
          {timeline?.map((item) => (
            <TimelineItem
              key={item.id}
              item={item}
              session={session!}
              sessionId={currentId!}
            />
          ))}
        </div>

        <div className="cdrawer-input" style={{ position: "relative" }}>
          <textarea
            className="pxinput"
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
            style={{ resize: "none", overflowY: "auto" }}
          />
          {session?.status === "busy" ? (
            <button
              type="button"
              className="pxbtn sm cjk"
              style={{ color: "var(--red, #e05)" }}
              onClick={() =>
                currentId &&
                sendCommand({ cmd: "interrupt", sessionId: currentId })
              }
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              className="pxbtn primary sm cjk"
              onClick={send}
              disabled={!text.trim()}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
