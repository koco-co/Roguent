import type { MailboxItem, MailboxSource } from "../../../shared/events";
import { sendCommand } from "../../ws-client";
import { Icon, type IconName } from "../icons";

const SOURCE_LABELS: Record<MailboxSource, string> = {
  wechat: "WeChat",
  feishu: "Feishu",
  github: "GitHub",
  x: "X",
  relay: "Relay",
  scheduler: "Scheduler",
  runtime: "Runtime",
  system: "System",
};

const SOURCE_ICONS: Record<MailboxSource, IconName> = {
  wechat: "chat",
  feishu: "chat",
  github: "quest",
  x: "chat",
  relay: "mcp",
  scheduler: "quest",
  runtime: "error",
  system: "gear",
};

function sourceUrl(item: MailboxItem): string | undefined {
  const url = item.metadata?.sourceUrl ?? item.metadata?.url;
  if (typeof url !== "string") return undefined;
  return safeHttpUrl(url);
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function timeLabel(ts: number): string {
  if (!Number.isFinite(ts)) return "--";
  const d = new Date(ts);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

export function mailboxSourceLabel(source: MailboxSource): string {
  return SOURCE_LABELS[source] ?? source;
}

export function InboxItemRow({
  item,
  sessionTitle,
  compact = false,
  onOpenSession,
}: {
  item: MailboxItem;
  sessionTitle?: string;
  compact?: boolean;
  onOpenSession?: (sessionId: string) => void;
}) {
  const url = sourceUrl(item);
  const unread = item.status === "unread";
  const archived = item.status === "archived";
  const priority = item.priority ?? "normal";
  const canOpenSession = Boolean(item.sessionId && onOpenSession);
  return (
    <div
      className={`inbox-row priority-${priority}${unread ? " unread" : ""}${archived ? " archived" : ""}`}
    >
      <div className="inbox-source">
        <Icon name={SOURCE_ICONS[item.source] ?? "chat"} size={20} />
        <span>{mailboxSourceLabel(item.source)}</span>
      </div>
      <div className="inbox-main">
        <div className="inbox-titleline">
          <span className="inbox-title">{item.title}</span>
          <span className={`inbox-status ${item.status}`}>{item.status}</span>
        </div>
        <div className="inbox-summary">{item.summary}</div>
        <div className="inbox-meta">
          <span>{timeLabel(item.ts)}</span>
          {sessionTitle ? <span>{sessionTitle}</span> : null}
          {item.kind ? <span>{item.kind}</span> : null}
        </div>
      </div>
      {!compact ? (
        <div className="inbox-actions">
          <button
            type="button"
            className="pxbtn sm"
            disabled={!url}
            onClick={() => {
              if (url) globalThis.open?.(url, "_blank", "noopener,noreferrer");
            }}
          >
            Open Source
          </button>
          <button
            type="button"
            className="pxbtn sm"
            disabled={!canOpenSession}
            onClick={() => {
              if (item.sessionId) onOpenSession?.(item.sessionId);
            }}
          >
            Open Session
          </button>
          <button
            type="button"
            className="pxbtn sm"
            onClick={() =>
              sendCommand({
                cmd: "mailbox",
                action: "invokeAction",
                itemId: item.id,
                actionId: "resend",
              })
            }
          >
            Resend
          </button>
          <button
            type="button"
            className="pxbtn sm"
            disabled={item.status !== "unread"}
            onClick={() =>
              sendCommand({
                cmd: "mailbox",
                action: "markRead",
                itemId: item.id,
              })
            }
          >
            Mark Read
          </button>
          <button
            type="button"
            className="pxbtn sm danger"
            disabled={archived}
            onClick={() =>
              sendCommand({
                cmd: "mailbox",
                action: "archive",
                itemId: item.id,
              })
            }
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
}
