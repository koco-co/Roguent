import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomStore } from "../../store";

/**
 * A single announcement derived from real store state.
 */
export interface Announcement {
  id: string;
  text: string;
  /** Source hint for styling. */
  kind: "mailbox" | "achievement" | "ledger" | "settings";
}

/**
 * Derive the most recent announcement-worthy item from the room store.
 * Sources checked (in priority order):
 *  1. Most recent unread high-priority / alert mailbox item.
 *  2. Most recently completed achievement (not yet claimed).
 *  3. Most recent ledger reward entry.
 *  4. Settings updated (if settings are present).
 *
 * Returns null when nothing announcement-worthy is found.
 */
function deriveAnnouncement(
  mailboxItems: ReturnType<typeof useRoomStore.getState>["mailbox"],
  achievements: ReturnType<typeof useRoomStore.getState>["achievements"],
  ledger: ReturnType<typeof useRoomStore.getState>["ledger"],
  settings: ReturnType<typeof useRoomStore.getState>["settings"],
): Announcement | null {
  // 1. High-priority / alert unread mailbox item
  const urgentMailbox = mailboxItems.order
    .map((id) => mailboxItems.items[id])
    .filter(
      (item) =>
        item !== undefined &&
        item.status === "unread" &&
        (item.kind === "alert" || item.priority === "high"),
    )
    .sort((a, b) => {
      if (!a || !b) return 0;
      return b.ts - a.ts;
    })[0];

  if (urgentMailbox) {
    return {
      id: `mailbox:${urgentMailbox.id}`,
      text: urgentMailbox.title,
      kind: "mailbox",
    };
  }

  // 2. Completed but unclaimed achievement
  const completedAchievement = Object.values(achievements)
    .filter((a) => a.completed && !a.claimed)
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  if (completedAchievement) {
    return {
      id: `achievement:${completedAchievement.id}`,
      text: `Achievement unlocked: ${completedAchievement.title}`,
      kind: "achievement",
    };
  }

  // 3. Most recent ledger reward with positive amount
  const rewardEntry = [...ledger.entries]
    .reverse()
    .find((e) => e.amount > 0 && e.reason);

  if (rewardEntry) {
    return {
      id: `ledger:${rewardEntry.id}`,
      text: `+${rewardEntry.amount} ${rewardEntry.currency} — ${rewardEntry.reason}`,
      kind: "ledger",
    };
  }

  // 4. Settings present — low-priority, only show once on initial load
  if (settings) {
    return {
      id: "settings:loaded",
      text: "Settings loaded",
      kind: "settings",
    };
  }

  return null;
}

const KIND_LABELS: Record<Announcement["kind"], string> = {
  mailbox: "ALERT",
  achievement: "ACHIEVEMENT",
  ledger: "REWARD",
  settings: "SETTINGS",
};

/**
 * AnnouncementPopup — always-mounted at App root. Shows a transient banner
 * for the most recent notable event derived from real store state.
 *
 * Auto-dismisses after 6 seconds. User can also dismiss manually. Once
 * dismissed, the same announcement id is suppressed until it changes.
 */
export function AnnouncementPopup() {
  const mailbox = useRoomStore((s) => s.mailbox);
  const achievements = useRoomStore((s) => s.achievements);
  const ledger = useRoomStore((s) => s.ledger);
  const settings = useRoomStore((s) => s.settings);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announcement = deriveAnnouncement(
    mailbox,
    achievements,
    ledger,
    settings,
  );
  const isNewAnnouncement =
    announcement !== null && !dismissedIds.has(announcement.id);

  // Show when a new announcement arrives; auto-dismiss after 6 s.
  useEffect(() => {
    if (isNewAnnouncement) {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        if (announcement) {
          setDismissedIds((prev) => new Set(prev).add(announcement.id));
        }
      }, 6000);
    } else {
      setVisible(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isNewAnnouncement, announcement]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (announcement) {
      setDismissedIds((prev) => new Set(prev).add(announcement.id));
    }
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [announcement]);

  if (!visible || !announcement) return null;

  const kindLabel = KIND_LABELS[announcement.kind];

  return (
    <output
      className="announcement-popup"
      aria-live="polite"
      data-kind={announcement.kind}
    >
      <span className="announcement-kind px">{kindLabel}</span>
      <span className="announcement-text">{announcement.text}</span>
      <button
        type="button"
        className="announcement-dismiss pxbtn sm"
        aria-label="Dismiss announcement"
        onClick={dismiss}
      >
        ×
      </button>
    </output>
  );
}
