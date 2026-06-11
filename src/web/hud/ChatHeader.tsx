import { useMemo, useState } from "react";
import { useT, useTL } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Icon } from "./icons";
import { modelLabel } from "./model-label";
import { runtimeMetaText } from "./runtime-display";

export function ChatHeader({ sessionId }: { sessionId: string }) {
  const t = useT();
  const tl = useTL();
  const closePanel = useUiStore((s) => s.closePanel);
  const sessions = useRoomStore((s) => s.sessions);
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const switchSession = useRoomStore((s) => s.switchSession);
  const unarchiveSession = useRoomStore((s) => s.unarchiveSession);
  const [cwd, setCwd] = useState("");
  const [search, setSearch] = useState("");
  const [mgrOpen, setMgrOpen] = useState(false);

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
  const agentCount = session ? Object.keys(session.agents).length : 0;

  const newSession = () => {
    // 取已有 s<n> 的最大编号 +1,避免删除后 id 复用碰撞。
    const nums = Object.keys(sessions)
      .map((id) => Number(id.replace(/^s/, "")))
      .filter((n) => Number.isFinite(n));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const dir = cwd.trim();
    const runtimeConfig = session
      ? {
          runtime: session.runtime,
          permissionMode: session.permissionMode,
          ...(session.approvalPolicy
            ? { approvalPolicy: session.approvalPolicy }
            : {}),
          sandboxMode: session.sandboxMode,
          ...(session.reasoningEffort
            ? { reasoningEffort: session.reasoningEffort }
            : {}),
          networkAccess: session.networkAccess,
        }
      : {};
    sendCommand({
      cmd: "newSession",
      sessionId: `s${n}`,
      title: tl(`会话 ${n}`, `Session ${n}`),
      model: session?.model ?? "claude-opus-4-8",
      ...runtimeConfig,
      ...(dir ? { cwd: dir } : {}),
    });
    setCwd("");
  };

  const pickSession = (id: string) => {
    switchSession(id);
    setMgrOpen(false);
  };

  const close = () => {
    setMgrOpen(false);
    closePanel();
  };

  return (
    <>
      <div className="cdrawer-hd">
        <div className="cdrawer-hd-l">
          <Icon name="chat" size={22} glow="#36c5e0" />
          <div className="cdrawer-titles">
            <div className="cdrawer-name cjk">
              {session?.title ?? t("无会话")}
            </div>
            <div className="cdrawer-meta px">
              {runtimeMetaText(session)} · {modelLabel(session?.model)} ·{" "}
              {agentCount}P
            </div>
          </div>
        </div>
        <button
          type="button"
          className="pxbtn sm cjk"
          onClick={() => setMgrOpen((v) => !v)}
        >
          {t("会话")}
        </button>
        <button type="button" className="closex px" onClick={close}>
          ✕
        </button>
      </div>

      {/* 头部「会话」管理弹层:活动会话(切换)/ 新建 / 归档复活——单栏下保功能。 */}
      {mgrOpen && (
        <div className="cdrawer-mgr scroll">
          <div className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
            {t("会话")}
          </div>
          {activeList.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chat-sess${s.id === sessionId ? " sel" : ""}`}
              onClick={() => pickSession(s.id)}
            >
              <div style={{ fontSize: 12, color: "var(--text)" }}>
                {s.title}
              </div>
              <div className="faint" style={{ fontSize: 10 }}>
                {s.project ? `${s.project} · ` : ""}
                {runtimeMetaText(s)} · {s.status}
              </div>
            </button>
          ))}

          <input
            className="pxinput"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder={t("目录 cwd(默认服务端)")}
            style={{ marginTop: 8, fontSize: 10 }}
          />
          <button
            type="button"
            className="pxbtn sm cjk"
            style={{ width: "100%", marginTop: 6 }}
            onClick={newSession}
          >
            {t("＋ 新会话")}
          </button>

          {list.some((s) => s.archived) ? (
            <>
              <div
                className="px"
                style={{ fontSize: 10, color: "var(--gold)", marginTop: 14 }}
              >
                {t("已归档")}
              </div>
              <input
                className="pxinput"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("搜索已归档…")}
                style={{ marginTop: 6, fontSize: 10 }}
              />
              {archivedList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chat-sess"
                  style={{ opacity: 0.7 }}
                  title={t("点击复活到大厅")}
                  onClick={() => unarchiveSession(s.id)}
                >
                  <div style={{ fontSize: 12, color: "var(--text)" }}>
                    {s.title}
                  </div>
                  <div className="faint" style={{ fontSize: 10 }}>
                    {s.project ? `${s.project} · ` : ""}
                    {runtimeMetaText(s)} · {t("↺ 复活")}
                  </div>
                </button>
              ))}
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
