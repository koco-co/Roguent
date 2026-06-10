import { useMemo, useState } from "react";
import type {
  IntegrationConnectorStatus,
  MailboxItem,
  MailboxSource,
} from "../../../shared/events";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { Modal } from "../Modal";
import { InboxItemRow } from "./InboxItemRow";

type MailboxFilter = "all" | "im" | "github" | "x" | "scheduler" | "runtime";

const FILTERS: { id: MailboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "im", label: "IM" },
  { id: "github", label: "GitHub" },
  { id: "x", label: "X" },
  { id: "scheduler", label: "Scheduler" },
  { id: "runtime", label: "Runtime" },
];

const CONFIG_CHANNELS: MailboxSource[] = ["wechat", "feishu", "github", "x"];

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
  if (filter === "im")
    return item.source === "wechat" || item.source === "feishu";
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

export function MailboxPanel() {
  const active = useUiStore((s) => s.activePanel === "mailbox");
  const closePanel = useUiStore((s) => s.closePanel);
  const mailbox = useRoomStore((s) => s.mailbox);
  const sessions = useRoomStore((s) => s.sessions);
  const connectorStatus = useRoomStore((s) => s.connectorStatus);
  const switchSession = useRoomStore((s) => s.switchSession);
  const [filter, setFilter] = useState<MailboxFilter>("all");

  const allItems = useMemo(() => mailboxItems(mailbox), [mailbox]);
  const items = useMemo(
    () => allItems.filter((item) => matchesFilter(item, filter)),
    [allItems, filter],
  );

  if (!active) return null;

  return (
    <Modal
      title="MAILBOX"
      sub="真实 inbox · IM / GitHub / X / runtime"
      icon="vault"
      width={1240}
      onClose={closePanel}
    >
      <div className="mailbox-panel">
        <div
          className="mailbox-filters"
          role="tablist"
          aria-label="Mailbox filters"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`tab${filter === f.id ? " on" : ""}`}
              onClick={() => setFilter(f.id)}
              role="tab"
              aria-selected={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mailbox-layout">
          <div className="connector-strip">
            {CONFIG_CHANNELS.map((source) => {
              const status = connectorFor(connectorStatus, source);
              return (
                <div key={source} className="connector-state">
                  <span className="connector-name">{source}</span>
                  <span
                    className={`connector-pill ${status?.state ?? "blocked"}`}
                  >
                    {connectorStateLabel(status)}
                  </span>
                  {status?.error ? (
                    <span className="connector-error">{status.error}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="inbox-list scroll">
            {items.length === 0 ? (
              <div className="empty-center">
                <div className="empty-title">No mailbox items</div>
                <div className="empty-sub">
                  外部平台未配置时只显示 configuration state，不填充样例消息。
                </div>
              </div>
            ) : (
              items.map((item) => (
                <InboxItemRow
                  key={item.id}
                  item={item}
                  sessionTitle={
                    item.sessionId ? sessions[item.sessionId]?.title : undefined
                  }
                  onOpenSession={(sessionId) => {
                    switchSession(sessionId);
                    closePanel();
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
