import type { Database } from "bun:sqlite";
import type { MailboxItem, MailboxItemStatus } from "../../shared/events";
import { appendAuditRecord } from "../audit/log";
import type { StoredAuditRecord } from "../persistence/repositories";
import { createRepositories } from "../persistence/repositories";

export interface MailboxServiceOptions {
  now?: () => number;
}

export interface MailboxBoardItemsOptions {
  now?: number;
  limit?: number;
}

export interface MailboxResendOptions {
  targetSessionId?: string;
}

export interface MailboxResendResult {
  item: MailboxItem;
  targetSessionId: string;
  text: string;
  auditRecord: StoredAuditRecord;
}

export class MailboxService {
  private readonly repositories: ReturnType<typeof createRepositories>;

  constructor(
    private readonly db: Database,
    private readonly options: MailboxServiceOptions = {},
  ) {
    this.repositories = createRepositories(db);
  }

  createOrUpdate(item: MailboxItem): MailboxItem {
    this.repositories.inboxItems.upsert(item);
    return this.requireItem(item.id);
  }

  get(itemId: string): MailboxItem | null {
    return this.repositories.inboxItems.get(itemId);
  }

  list(limit?: number): MailboxItem[] {
    return this.repositories.inboxItems.list(limit);
  }

  markRead(itemId: string): MailboxItem {
    return this.updateStatus(itemId, "read");
  }

  archive(itemId: string): MailboxItem {
    return this.updateStatus(itemId, "archived");
  }

  boardItems(options: MailboxBoardItemsOptions = {}): MailboxItem[] {
    return this.repositories.inboxItems.boardItems(options);
  }

  resend(
    itemId: string,
    options: MailboxResendOptions = {},
  ): MailboxResendResult {
    const item = this.requireItem(itemId);
    const targetSessionId =
      options.targetSessionId?.trim() || item.sessionId?.trim();
    if (!targetSessionId) {
      throw new Error(`Mailbox item ${itemId} has no routed session`);
    }

    const text = resendText(item);
    const auditRecord = appendAuditRecord(this.db, {
      source: "mailbox",
      action: "mailbox.resend",
      sessionId: targetSessionId,
      deliveryId: item.relatedEventId,
      payload: {
        itemId: item.id,
        source: item.source,
        originalSessionId: item.sessionId,
        targetSessionId,
      },
      summary: `resend mailbox item ${item.id}`,
      createdAt: this.now(),
    });

    return { item, targetSessionId, text, auditRecord };
  }

  private updateStatus(itemId: string, status: MailboxItemStatus): MailboxItem {
    const item = this.repositories.inboxItems.updateStatus(itemId, status);
    if (!item) throw new Error(`Mailbox item ${itemId} not found`);
    return item;
  }

  private requireItem(itemId: string): MailboxItem {
    const item = this.get(itemId);
    if (!item) throw new Error(`Mailbox item ${itemId} not found`);
    return item;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

export function createMailboxService(
  db: Database,
  options?: MailboxServiceOptions,
): MailboxService {
  return new MailboxService(db, options);
}

function sourceUrl(item: MailboxItem): string | undefined {
  const value = item.metadata?.sourceUrl ?? item.metadata?.url;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function resendText(item: MailboxItem): string {
  const lines = [`[${item.source}] ${item.title}`, "", item.summary];
  const url = sourceUrl(item);
  if (url) lines.push("", url);
  return lines.join("\n");
}
