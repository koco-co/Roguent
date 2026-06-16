import { useState } from "react";
import type {
  Session,
  TimelineMessageAttachment,
  TimelineMessageItem,
} from "../../shared/domain";
import { titleCase } from "../../shared/strings";
import { useT } from "../i18n";
import { selectPinnedIds, usePinnedStore } from "../pinned-store";
import { sendCommand } from "../ws-client";
import { attachmentDataUrl, isAllowedImageType } from "./attachments";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
  sessionId: string;
}

// 作者 = 名(role 的 Title Case)+ role 徽(agent kind 派生)。
// user 消息只有名 `你`、无徽。
const author = (
  item: TimelineMessageItem,
  session: Session,
  t: (s: string) => string,
): { name: string; roleTag?: string } => {
  if (item.role === "user") return { name: t("你") };
  const agent = item.agentId ? session.agents[item.agentId] : undefined;
  const rawName = agent?.role ?? item.agentId ?? item.role;
  const name = titleCase(rawName) || rawName;
  const kind =
    agent?.kind ??
    (agent?.role === "orchestrator" ? "orchestrator" : "subagent");
  const roleTag = kind === "orchestrator" ? t("主控") : t("分身");
  return { name, roleTag };
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function MessageBubble({ item, session, sessionId }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // 编辑态:本地草稿,不改 store item;保存时把新文本作为 retryFrom 的 text 覆盖回放。
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const { name, roleTag } = author(item, session, t);
  // 只有 user 消息可重发/编辑:engine 的 retryFrom 按同一 String(seq)=item.id 检索原文回放。
  const canRetry = item.role === "user";

  // 置顶:客户端本地 UI 状态(不入引擎,见 pinned-store.ts)。取稳定的 id 数组引用
  // (守 zustand 铁律,绝不在 selector 里造新数组),再在组件里派生布尔与回调。
  const pinnedIds = usePinnedStore((s) => selectPinnedIds(s, sessionId));
  const togglePin = usePinnedStore((s) => s.togglePin);
  const pinned = pinnedIds.includes(item.id);

  const retry = () => {
    sendCommand({ cmd: "retryFrom", sessionId, timelineItemId: item.id });
  };

  const startEdit = () => {
    setDraft(item.text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(item.text);
  };

  const saveEdit = () => {
    const next = draft.trim();
    // 仅在非空且与原文不同的情况下才发命令;否则等同取消。
    if (next.length > 0 && next !== item.text) {
      sendCommand({
        cmd: "retryFrom",
        sessionId,
        timelineItemId: item.id,
        text: next,
      });
    }
    setEditing(false);
  };

  const copy = () => {
    void copyText(item.text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const copyCode = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("[data-code]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void copyText(button.dataset.code ?? "").then((ok) => {
      if (!ok) return;
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    });
  };

  return (
    <div
      className={`cmsg ${item.role === "user" ? "me" : "agent"}${
        pinned ? " pinned" : ""
      }`}
      style={{ position: "relative" }}
    >
      <div
        className="cmsg-author px"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <span>{name}</span>
        {roleTag && <span className="cmsg-role px">{roleTag}</span>}
        <span
          className="faint"
          style={{ fontSize: 9, opacity: 0.5 }}
          title={new Date(item.ts).toLocaleString("zh-CN")}
        >
          {formatTime(item.ts)}
        </span>
        <button
          type="button"
          onClick={copy}
          title={t("复制消息")}
          style={{
            fontSize: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: copied ? "var(--green, #3c3)" : "var(--text)",
            opacity: 0.6,
            padding: 0,
          }}
        >
          {copied ? "✓" : "⎘"}
        </button>
        {/* 置顶切换:user 与 assistant 消息都可置顶(客户端本地,见 pinned-store.ts)。 */}
        <button
          type="button"
          onClick={() => togglePin(sessionId, item.id)}
          title={pinned ? t("取消置顶") : t("置顶")}
          aria-label={pinned ? t("取消置顶") : t("置顶")}
          aria-pressed={pinned}
          style={{
            fontSize: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: pinned ? "var(--gold, #e0b000)" : "var(--text)",
            opacity: pinned ? 0.9 : 0.6,
            padding: 0,
          }}
        >
          📌
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={retry}
            title={t("重发")}
            aria-label={t("重发")}
            style={{
              fontSize: 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text)",
              opacity: 0.6,
              padding: 0,
            }}
          >
            ↻
          </button>
        )}
        {canRetry && !editing && (
          <button
            type="button"
            onClick={startEdit}
            title={t("编辑")}
            aria-label={t("编辑")}
            style={{
              fontSize: 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text)",
              opacity: 0.6,
              padding: 0,
            }}
          >
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="cmsg-edit">
          <textarea
            className="cmsg-edit-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: focus the editor the user just opened
            autoFocus
          />
          <div className="cmsg-edit-actions">
            <button type="button" className="cmsg-edit-btn" onClick={saveEdit}>
              {t("保存")}
            </button>
            <button
              type="button"
              className="cmsg-edit-btn"
              onClick={cancelEdit}
            >
              {t("取消")}
            </button>
          </div>
        </div>
      ) : (
        // biome-ignore lint/a11y/useKeyWithClickEvents: markdown HTML is inert; code-copy button clicks are delegated from this container, keyboard activation on the real button still emits click
        <div
          className="cmsg-bubble md"
          onClick={copyCode}
          data-code-copied={copiedCode ? "true" : "false"}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染
          dangerouslySetInnerHTML={{
            __html: mdToHtml(item.text, { copyLabel: t("复制代码") }),
          }}
        />
      )}
      {item.attachments && item.attachments.length > 0 && (
        <div className="cmsg-attachments" aria-label="Attachments">
          {item.attachments.map((att, i) => (
            <AttachmentChip key={`${att.name}-${i}`} attachment={att} />
          ))}
        </div>
      )}
    </div>
  );
}

// 安全渲染:只有 4 类已知图片类型 + 带 base64 时才注入内联 <img>(data: URL);
// 否则降级为「图片图标 + 文件名」chip,绝不把任意 data: URL 塞进 HTML。
function AttachmentChip({
  attachment,
}: {
  attachment: TimelineMessageAttachment;
}) {
  const canPreview =
    isAllowedImageType(attachment.mediaType) &&
    typeof attachment.dataBase64 === "string" &&
    attachment.dataBase64.length > 0;
  return (
    <span className="cmsg-attach">
      {canPreview ? (
        <img
          className="cmsg-attach-thumb"
          src={attachmentDataUrl({
            mediaType: attachment.mediaType,
            dataBase64: attachment.dataBase64 ?? "",
          })}
          alt={attachment.name}
        />
      ) : (
        <span className="cmsg-attach-icon" aria-hidden="true">
          🖼
        </span>
      )}
      <span className="cmsg-attach-name cjk">{attachment.name}</span>
    </span>
  );
}

function copyText(text: string): Promise<boolean> {
  const writeText = navigator.clipboard?.writeText;
  if (typeof writeText !== "function") return Promise.resolve(false);
  return writeText.call(navigator.clipboard, text).then(
    () => true,
    () => false,
  );
}
