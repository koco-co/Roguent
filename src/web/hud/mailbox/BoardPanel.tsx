import { useMemo } from "react";
import { useT } from "../../i18n";
import { selectMailboxBoardItemsFromMailbox, useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { Modal } from "../Modal";
import { InboxItemRow } from "./InboxItemRow";

export function BoardPanel() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "board");
  const closePanel = useUiStore((s) => s.closePanel);
  const openPanel = useUiStore((s) => s.openPanel);
  const mailbox = useRoomStore((s) => s.mailbox);
  const sessions = useRoomStore((s) => s.sessions);
  const switchSession = useRoomStore((s) => s.switchSession);
  const items = useMemo(
    () => selectMailboxBoardItemsFromMailbox(mailbox, { limit: 12 }),
    [mailbox],
  );

  if (!active) return null;

  return (
    <Modal
      title="BOARD"
      sub="今日公告板 · 未读告警"
      icon="trophy"
      width={980}
      onClose={closePanel}
    >
      <div className="board-panel">
        <div className="board-toolbar">
          <div>
            <div className="board-count px">{items.length} ITEMS</div>
            <div className="faint">
              {t("今日关键事件与未读告警会自动钉到这里。")}
            </div>
          </div>
          <button
            type="button"
            className="pxbtn gold"
            onClick={() => openPanel("mailbox")}
          >
            Open Mailbox
          </button>
        </div>
        <div className="board-list scroll">
          {items.length === 0 ? (
            <div className="empty-center">
              <div className="empty-title">Board is clear</div>
              <div className="empty-sub">
                {t("暂无今日关键事件或未读告警。")}
              </div>
            </div>
          ) : (
            items.map((item) => (
              <InboxItemRow
                key={item.id}
                item={item}
                compact
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
    </Modal>
  );
}
