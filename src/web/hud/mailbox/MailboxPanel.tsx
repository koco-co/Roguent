import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type {
  IntegrationConnectorStatus,
  MailboxItem,
  MailboxSource,
} from "../../../shared/events";
import { useT } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { sendCommand } from "../../ws-client";
import { Modal } from "../Modal";
import { Icon, type IconName } from "../icons";
import { mailboxSourceLabel } from "./InboxItemRow";

/**
 * 取信件的原始载荷(meta code 块用)。
 * 只在 metadata 带原始字段(raw / payload)时返回格式化 JSON;否则返回 undefined,
 * 阅读器不渲染 code 块(不造数据)。
 */
function metaPayload(item: MailboxItem): string | undefined {
  const meta = item.metadata;
  const raw = meta?.raw ?? meta?.payload ?? parseJsonObject(item.summary);
  if (raw === undefined || raw === null) return undefined;
  try {
    return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  } catch {
    return undefined;
  }
}

type MailboxFilter = "all" | "im" | "github" | "x" | "runtime" | "subs";

const FOLDERS: {
  id: MailboxFilter;
  icon: IconName;
  label: string;
  count?: (items: MailboxItem[]) => number;
}[] = [
  {
    id: "all",
    icon: "chat",
    label: "全部信件",
    count: (items) => items.length,
  },
  {
    id: "im",
    icon: "chat",
    label: "IM",
    count: (items) =>
      items.filter((item) =>
        ["wechat", "feishu", "relay"].includes(item.source),
      ).length,
  },
  {
    id: "github",
    icon: "import",
    label: "GitHub 监控",
    count: (items) => items.filter((item) => item.source === "github").length,
  },
  {
    id: "x",
    icon: "chat",
    label: "X 博主动态",
    count: (items) => items.filter((item) => item.source === "x").length,
  },
  {
    id: "runtime",
    icon: "gear",
    label: "Runtime",
    count: (items) =>
      items.filter((item) =>
        ["scheduler", "runtime", "system"].includes(item.source),
      ).length,
  },
  { id: "subs", icon: "mcp", label: "订阅源管理" },
];

const CONFIG_CHANNELS: MailboxSource[] = ["wechat", "feishu", "github", "x"];

const SOURCE_ACCENT: Record<MailboxSource, string> = {
  wechat: "#5fd35f",
  feishu: "#36c5e0",
  github: "#a06cd5",
  x: "#36c5e0",
  relay: "#36c5e0",
  scheduler: "#f2c84b",
  runtime: "#f2c84b",
  system: "#f2c84b",
};

const SOURCE_ICONS: Record<MailboxSource, IconName> = {
  wechat: "chat",
  feishu: "chat",
  github: "import",
  x: "chat",
  relay: "mcp",
  scheduler: "quest",
  runtime: "gear",
  system: "error",
};

function mailboxItems(
  mailbox: ReturnType<typeof useRoomStore.getState>["mailbox"],
) {
  return mailbox.order
    .map((id) => mailbox.items[id])
    .filter((item): item is MailboxItem => Boolean(item))
    .toSorted((a, b) => b.ts - a.ts || b.id.localeCompare(a.id));
}

function matchesFilter(item: MailboxItem, filter: MailboxFilter): boolean {
  if (filter === "all") return true;
  if (filter === "subs") return false;
  if (filter === "im")
    return (
      item.source === "wechat" ||
      item.source === "feishu" ||
      item.source === "relay"
    );
  if (filter === "runtime")
    return (
      item.source === "scheduler" ||
      item.source === "runtime" ||
      item.source === "system"
    );
  return item.source === filter;
}

function connectorFor(
  statuses: Record<string, IntegrationConnectorStatus>,
  source: MailboxSource,
): IntegrationConnectorStatus | undefined {
  return Object.values(statuses).find((s) => s.channel === source);
}

function connectorStateLabel(status: IntegrationConnectorStatus | undefined) {
  if (!status) return "configuration-required";
  return status.state;
}

function accentStyle(accent: string): CSSProperties {
  return { "--ac": accent } as CSSProperties;
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (
    (!trimmed.startsWith("{") || !trimmed.endsWith("}")) &&
    (!trimmed.startsWith("[") || !trimmed.endsWith("]"))
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function isRawJsonText(value: string): boolean {
  return Boolean(parseJsonObject(value));
}

function sourceUrl(item: MailboxItem): string | undefined {
  const url = item.metadata?.sourceUrl ?? item.metadata?.url;
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function timeAgo(ts: number): string {
  if (!Number.isFinite(ts)) return "--";
  const delta = Math.max(0, Date.now() - ts);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "now";
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  return `${Math.floor(delta / day)}d`;
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function recordString(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function rawRecord(item: MailboxItem): Record<string, unknown> | undefined {
  const raw = item.metadata?.raw ?? item.metadata?.payload;
  const parsed = raw ?? parseJsonObject(item.summary);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

function nestedRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function githubCommitLines(record: Record<string, unknown> | undefined) {
  const commits = record?.commits;
  if (!Array.isArray(commits)) return [];
  return commits
    .map((commit) => {
      if (!commit || typeof commit !== "object" || Array.isArray(commit)) {
        return null;
      }
      const item = commit as Record<string, unknown>;
      const id = recordString(item, "id")?.slice(0, 7);
      const message = recordString(item, "message")?.split("\n")[0];
      if (!message) return null;
      return id ? `${id} ${message}` : message;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 3);
}

function displayAuthor(item: MailboxItem): string {
  const raw = rawRecord(item);
  const sender = nestedRecord(raw, "sender");
  const pusher = nestedRecord(raw, "pusher");
  const repository = nestedRecord(raw, "repository");
  return (
    metadataString(item.metadata, ["from", "actor", "repository"]) ??
    recordString(sender, "login") ??
    recordString(pusher, "name") ??
    recordString(repository, "full_name") ??
    mailboxSourceLabel(item.source)
  );
}

function displayHandle(item: MailboxItem): string {
  const raw = rawRecord(item);
  const repository = nestedRecord(raw, "repository");
  return (
    metadataString(item.metadata, ["handle", "deliveryId", "eventName"]) ??
    recordString(repository, "full_name") ??
    item.kind ??
    item.source
  );
}

function displayBody(item: MailboxItem): string {
  const raw = rawRecord(item);
  if (item.source === "github") {
    const commits = githubCommitLines(raw);
    if (commits.length > 0) return commits.join("\n");
    const pull = nestedRecord(raw, "pull_request");
    const pullTitle = recordString(pull, "title");
    if (pullTitle) return pullTitle;
    const run = nestedRecord(raw, "workflow_run");
    const runTitle = recordString(run, "display_title");
    if (runTitle) return runTitle;
  }
  if (isRawJsonText(item.summary)) {
    return `${mailboxSourceLabel(item.source)} webhook payload received. Expand Raw Payload for transport details.`;
  }
  return item.summary;
}

function displayTags(item: MailboxItem): string[] {
  const tags = [
    mailboxSourceLabel(item.source),
    item.kind,
    item.priority && item.priority !== "normal" ? item.priority : undefined,
    metadataString(item.metadata, ["eventName", "action"]),
  ].filter((tag): tag is string => Boolean(tag));
  return Array.from(new Set(tags)).slice(0, 4);
}

export function MailboxPanel() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "mailbox");
  const closePanel = useUiStore((s) => s.closePanel);
  const mailbox = useRoomStore((s) => s.mailbox);
  const sessions = useRoomStore((s) => s.sessions);
  const connectorStatus = useRoomStore((s) => s.connectorStatus);
  const switchSession = useRoomStore((s) => s.switchSession);
  // 配对绑定(真实):稳定引用,派生「是否有可用转发通道」放 useMemo。
  const pairings = useRoomStore((s) => s.pairings);
  const [filter, setFilter] = useState<MailboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allItems = useMemo(() => mailboxItems(mailbox), [mailbox]);
  const items = useMemo(
    () => allItems.filter((item) => matchesFilter(item, filter)),
    [allItems, filter],
  );
  const unread = allItems.filter((item) => item.status === "unread").length;

  // 是否存在「活跃且开启转发」的配对绑定 —— 决定转发按钮注脚措辞,但即便存在,
  // 也没有「转发单条 mailbox item」的真实 relay 命令,按钮仍保持置灰。
  const hasActiveForwarding = useMemo(
    () =>
      Object.values(pairings.byId).some(
        (b) => b.status === "active" && b.forwardingEnabled,
      ),
    [pairings],
  );

  // 选中项跟随过滤后的列表;当前选中项被过滤掉则回落到列表首项。
  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? items[0],
    [items, selectedId],
  );
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  if (!active) return null;

  return (
    <Modal
      title="MAILBOX"
      sub="真实信箱 · IM / GitHub / X / runtime"
      icon="vault"
      width={1240}
      onClose={closePanel}
    >
      <div className="mbx-wrap">
        <div className="mbx-nav">
          <div className="mbx-unread">
            <Icon name="chat" size={18} />
            <span className="px">
              {unread} {t("未读")}
            </span>
          </div>
          {FOLDERS.map((f) => {
            const count = f.count?.(allItems);
            return (
              <button
                key={f.id}
                type="button"
                className={`mbx-folder${filter === f.id ? " on" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                <span aria-hidden="true" className="mbx-folder-ic">
                  <Icon name={f.icon} size={16} />
                </span>
                {t(f.label)}
                {count !== undefined ? (
                  <span className="mbx-count px">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {filter === "subs" ? (
          <div className="mbx-subs scroll">
            <div className="mbx-subs-h">
              {t(
                "管理真实订阅源状态。未配置的外部平台只显示 configuration state，不填充样例消息。",
              )}
            </div>
            {CONFIG_CHANNELS.map((source) => {
              const status = connectorFor(connectorStatus, source);
              return (
                <div key={source} className="mbx-sub-row">
                  <div
                    className="mbx-sub-av"
                    style={accentStyle(SOURCE_ACCENT[source])}
                    aria-hidden="true"
                  >
                    <Icon name={SOURCE_ICONS[source]} size={22} />
                  </div>
                  <div className="mbx-sub-meta">
                    <div className="mbx-sub-name">
                      {mailboxSourceLabel(source)}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {status?.error ?? "subscription connector"}
                    </div>
                  </div>
                  <span
                    className={`connector-pill ${status?.state ?? "blocked"}`}
                  >
                    {connectorStateLabel(status)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="mbx-list scroll">
              {items.length === 0 ? (
                <div className="empty-center">
                  <div className="empty-title">{t("暂无信件")}</div>
                  <div className="empty-sub">
                    {t(
                      "外部平台未配置时只显示 configuration state，不填充样例消息。",
                    )}
                  </div>
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`mbx-item${selected?.id === item.id ? " sel" : ""}${item.status === "unread" ? " unread" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div
                      className="mbx-av"
                      style={accentStyle(SOURCE_ACCENT[item.source])}
                      aria-hidden="true"
                    >
                      <Icon name={SOURCE_ICONS[item.source]} size={21} />
                      <div className="mbx-av-badge">
                        <Icon name={SOURCE_ICONS[item.source]} size={10} />
                      </div>
                    </div>
                    <div className="mbx-item-c">
                      <div className="mbx-item-top">
                        <span className="mbx-item-author">
                          {displayAuthor(item)}
                        </span>
                        <span className="mbx-item-time faint">
                          {timeAgo(item.ts)}
                        </span>
                      </div>
                      <div className="mbx-item-title">{item.title}</div>
                      <div className="mbx-item-body">{displayBody(item)}</div>
                    </div>
                    {item.status === "unread" ? (
                      <div
                        className="mbx-dot"
                        style={{ background: SOURCE_ACCENT[item.source] }}
                      />
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div className="mbx-read scroll">
              {selected ? (
                <MailboxReader
                  item={selected}
                  hasActiveForwarding={hasActiveForwarding}
                  sessionTitle={
                    selected.sessionId
                      ? sessions[selected.sessionId]?.title
                      : undefined
                  }
                  onOpenSession={(sessionId) => {
                    switchSession(sessionId);
                    closePanel();
                  }}
                />
              ) : (
                <div className="faint" style={{ padding: 24 }}>
                  {t("选择一封信件")}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * 阅读器 —— 单条信件的详情(照 Prototype panels3.jsx:122-139)。
 *
 * meta code 块:仅当 metadata.raw / metadata.payload 存在才渲染(metaPayload),
 * 无原始载荷则不渲染、不造。
 *
 * 「转发到配对 IM」按钮:**置灰**。本仓没有「转发单条 mailbox item 到 IM」的真实
 * relay 命令(commands.ts 仅有 mailbox markRead/archive/invokeAction,转发只是
 * 每绑定的 forwardingEnabled 总开关,不是针对单条消息的 action)。即便存在活跃且
 * 开启转发的绑定,也没有可调用的单条转发命令,故按钮恒置灰,注脚如实标注状态。
 */
function MailboxReader({
  item,
  hasActiveForwarding,
  sessionTitle,
  onOpenSession,
}: {
  item: MailboxItem;
  hasActiveForwarding: boolean;
  sessionTitle?: string;
  onOpenSession: (sessionId: string) => void;
}) {
  const t = useT();
  const meta = metaPayload(item);
  const url = sourceUrl(item);
  const canOpenSession = Boolean(item.sessionId);
  const tags = displayTags(item);
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <div className="mbx-read-body-wrap">
      <div className="mbx-read-hd">
        <div
          className="mbx-read-av"
          style={accentStyle(SOURCE_ACCENT[item.source])}
        >
          <Icon name={SOURCE_ICONS[item.source]} size={28} />
        </div>
        <div className="mbx-read-meta">
          <div className="mbx-read-author">{displayAuthor(item)}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {displayHandle(item)} · {timeAgo(item.ts)}
            {sessionTitle ? ` · ${sessionTitle}` : ""}
          </div>
        </div>
        <span
          className="chip px"
          style={{
            color: SOURCE_ACCENT[item.source],
            fontSize: 8,
            marginLeft: "auto",
          }}
        >
          {mailboxSourceLabel(item.source)}
        </span>
        <span className={`inbox-status ${item.status}`}>{item.status}</span>
      </div>
      <div className="mbx-read-title">{item.title}</div>
      <div className="mbx-read-body">{displayBody(item)}</div>
      {tags.length > 0 ? (
        <div className="mbx-tags">
          {tags.map((tag) => (
            <span key={tag} className="chip px" style={{ fontSize: 8 }}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {meta ? (
        <details
          className="mbx-raw"
          onToggle={(event) => setRawOpen(event.currentTarget.open)}
        >
          <summary className="px">Raw Payload</summary>
          {rawOpen ? (
            <pre className="mbx-read-code">
              <code>{meta}</code>
            </pre>
          ) : null}
        </details>
      ) : null}
      <div className="mbx-read-act">
        <button
          type="button"
          className="pxbtn sm cjk"
          disabled={!url}
          onClick={() => {
            if (url) globalThis.open?.(url, "_blank", "noopener,noreferrer");
          }}
        >
          {t("打开原文")}
        </button>
        <button
          type="button"
          className="pxbtn sm cjk"
          disabled={!canOpenSession}
          onClick={() => {
            if (item.sessionId) onOpenSession(item.sessionId);
          }}
        >
          {t("进入会话")}
        </button>
        <button
          type="button"
          className="pxbtn sm cjk"
          onClick={() =>
            sendCommand({
              cmd: "mailbox",
              action: "invokeAction",
              itemId: item.id,
              actionId: "resend",
            })
          }
        >
          {t("重发")}
        </button>
        <button
          type="button"
          className="pxbtn sm cjk"
          disabled={item.status !== "unread"}
          onClick={() =>
            sendCommand({
              cmd: "mailbox",
              action: "markRead",
              itemId: item.id,
            })
          }
        >
          {t("标记已读")}
        </button>
        <button
          type="button"
          className="pxbtn sm danger cjk"
          disabled={item.status === "archived"}
          onClick={() =>
            sendCommand({
              cmd: "mailbox",
              action: "archive",
              itemId: item.id,
            })
          }
        >
          {t("归档")}
        </button>
        <button
          type="button"
          className="pxbtn sm cjk dis"
          // 转发单条消息无真实 relay 命令,恒置灰。见上方组件注释。
          disabled
          aria-disabled="true"
          title={t("转发不可用 · 暂无单条转发命令")}
        >
          {t("转发到配对 IM")}
        </button>
        <span className="faint" style={{ fontSize: 10 }}>
          {hasActiveForwarding
            ? t("转发不可用 · 暂无单条转发命令")
            : t("未配对 · 在 PAIRING 扫码绑定后开启转发")}
        </span>
      </div>
    </div>
  );
}
