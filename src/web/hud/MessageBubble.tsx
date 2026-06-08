import { useState } from "react";
import type { Session, TimelineMessageItem } from "../../shared/domain";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
}

const authorName = (item: TimelineMessageItem, session: Session): string => {
  if (item.role === "user") return "你";
  return (
    (item.agentId ? session.agents[item.agentId]?.role : undefined) ??
    item.agentId ??
    item.role
  );
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function MessageBubble({ item, session }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(item.text).then(() => {
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
    void navigator.clipboard.writeText(button.dataset.code ?? "").then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    });
  };

  return (
    <div
      className={`cmsg ${item.role === "user" ? "me" : "agent"}`}
      style={{ position: "relative" }}
    >
      <div
        className="cmsg-author px"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {authorName(item, session)}
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
          title="复制消息"
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
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: markdown HTML is inert; code-copy button clicks are delegated from this container, keyboard activation on the real button still emits click */}
      <div
        className="cmsg-bubble md"
        onClick={copyCode}
        data-code-copied={copiedCode ? "true" : "false"}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染
        dangerouslySetInnerHTML={{ __html: mdToHtml(item.text) }}
      />
    </div>
  );
}
