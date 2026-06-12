import { useState } from "react";
import type { Session, TimelineMessageItem } from "../../shared/domain";
import { titleCase } from "../../shared/strings";
import { useT } from "../i18n";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
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

export function MessageBubble({ item, session }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const { name, roleTag } = author(item, session, t);

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
      className={`cmsg ${item.role === "user" ? "me" : "agent"}`}
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

function copyText(text: string): Promise<boolean> {
  const writeText = navigator.clipboard?.writeText;
  if (typeof writeText !== "function") return Promise.resolve(false);
  return writeText.call(navigator.clipboard, text).then(
    () => true,
    () => false,
  );
}
