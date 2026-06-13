import { useEffect, useMemo, useState } from "react";
import type {
  IntegrationConnectorStatus,
  MailboxItem,
  MailboxSource,
} from "../../../shared/events";
import { useT } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { Modal } from "../Modal";
import { InboxItemRow, mailboxSourceLabel } from "./InboxItemRow";

/**
 * 取信件的原始载荷(meta code 块用)。
 * 只在 metadata 带原始字段(raw / payload)时返回格式化 JSON;否则返回 undefined,
 * 阅读器不渲染 code 块(不造数据)。
 */
function metaPayload(item: MailboxItem): string | undefined {
  const meta = item.metadata;
  if (!meta) return undefined;
  const raw = meta.raw ?? meta.payload;
  if (raw === undefined || raw === null) return undefined;
  try {
    return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  } catch {
    return undefined;
  }
}

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
                  {t(
                    "外部平台未配置时只显示 configuration state，不填充样例消息。",
                  )}
                </div>
              </div>
            ) : (
              items.map((item) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: 行内 InboxItemRow 自带可聚焦按钮;此包裹层仅做选中,Esc 关闭由 App 集中处理
                <div
                  key={item.id}
                  className={`inbox-select${selected?.id === item.id ? " on" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <InboxItemRow
                    item={item}
                    sessionTitle={
                      item.sessionId
                        ? sessions[item.sessionId]?.title
                        : undefined
                    }
                    onOpenSession={(sessionId) => {
                      switchSession(sessionId);
                      closePanel();
                    }}
                  />
                </div>
              ))
            )}
          </div>
          <div className="mbx-read scroll">
            {selected ? (
              <MailboxReader
                item={selected}
                hasActiveForwarding={hasActiveForwarding}
              />
            ) : (
              <div className="faint" style={{ padding: 24 }}>
                {t("选择一封信件")}
              </div>
            )}
          </div>
        </div>
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
}: {
  item: MailboxItem;
  hasActiveForwarding: boolean;
}) {
  const t = useT();
  const meta = metaPayload(item);
  return (
    <div className="mbx-read-body-wrap">
      <div className="mbx-read-hd">
        <span className="chip px" style={{ fontSize: 8 }}>
          {mailboxSourceLabel(item.source)}
        </span>
        <span className={`inbox-status ${item.status}`}>{item.status}</span>
      </div>
      <div className="mbx-read-title">{item.title}</div>
      <div className="mbx-read-body">{item.summary}</div>
      {meta ? (
        <pre className="mbx-read-code">
          <code>{meta}</code>
        </pre>
      ) : null}
      <div className="mbx-read-act">
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
