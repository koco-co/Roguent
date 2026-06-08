import type { Database } from "bun:sqlite";
import type {
  MailboxAction,
  MailboxItem,
  MailboxItemKind,
  MailboxItemPriority,
  MailboxItemStatus,
  MailboxSource,
} from "../../shared/events";
import type { SchedulerRun, SchedulerTask } from "../../shared/scheduler";

export interface StoredSession {
  id: string;
  runtime: string;
  title: string;
  model: string;
  cwd: string | null;
  permissionMode: string;
  sandboxMode: string;
  reasoningEffort: string | null;
  networkAccess: boolean;
  approvalPolicy: string | null;
  metadataJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredPairingBinding {
  id: string;
  channel: string;
  externalChatId: string;
  sessionId: string;
  status: string;
  forwardingEnabled: boolean;
  boundAt: number;
  updatedAt: number;
  externalUserId: string | null;
  displayName: string | null;
  secretRef: string | null;
  metadataJson: string | null;
}

export interface StoredAuditRecord {
  id: string;
  source: string;
  action: string;
  sessionId: string | null;
  deliveryId: string | null;
  payloadHash: string;
  summary: string;
  createdAt: number;
}

export interface InboxBoardQueryOptions {
  now?: number;
  limit?: number;
}

type SessionRow = {
  id: string;
  runtime: string;
  title: string;
  model: string;
  cwd: string | null;
  permission_mode: string;
  sandbox_mode: string;
  reasoning_effort: string | null;
  network_access: number;
  approval_policy: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
};

type PairingBindingRow = {
  id: string;
  channel: string;
  external_chat_id: string;
  session_id: string;
  status: string;
  forwarding_enabled: number;
  bound_at: number;
  updated_at: number;
  external_user_id: string | null;
  display_name: string | null;
  secret_ref: string | null;
  metadata_json: string | null;
};

type AuditRecordRow = {
  id: string;
  source: string;
  action: string;
  session_id: string | null;
  delivery_id: string | null;
  payload_hash: string;
  summary: string;
  created_at: number;
};

type InboxItemRow = {
  id: string;
  source: string;
  title: string;
  summary: string;
  ts: number;
  status: string;
  kind: string | null;
  priority: string | null;
  channel: string | null;
  session_id: string | null;
  agent_id: string | null;
  related_event_id: string | null;
  actions_json: string | null;
  metadata_json: string | null;
};

type SchedulerTaskRow = {
  id: string;
  title: string;
  prompt_ref: string;
  status: string;
  created_at: number;
  updated_at: number;
  next_run_at: number | null;
  cwd: string | null;
  runtime_json: string | null;
  schedule_json: string | null;
  metadata_json: string | null;
};

type SchedulerRunRow = {
  id: string;
  task_id: string;
  status: string;
  queued_at: number | null;
  started_at: number | null;
  finished_at: number | null;
  session_id: string | null;
  summary: string | null;
  error: string | null;
  metadata_json: string | null;
};

const SCHEDULER_TARGET_SESSION_METADATA_KEY = "__targetSessionId";

function mapSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    runtime: row.runtime,
    title: row.title,
    model: row.model,
    cwd: row.cwd,
    permissionMode: row.permission_mode,
    sandboxMode: row.sandbox_mode,
    reasoningEffort: row.reasoning_effort,
    networkAccess: row.network_access === 1,
    approvalPolicy: row.approval_policy,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPairingBinding(row: PairingBindingRow): StoredPairingBinding {
  return {
    id: row.id,
    channel: row.channel,
    externalChatId: row.external_chat_id,
    sessionId: row.session_id,
    status: row.status,
    forwardingEnabled: row.forwarding_enabled === 1,
    boundAt: row.bound_at,
    updatedAt: row.updated_at,
    externalUserId: row.external_user_id,
    displayName: row.display_name,
    secretRef: row.secret_ref,
    metadataJson: row.metadata_json,
  };
}

function mapAuditRecord(row: AuditRecordRow): StoredAuditRecord {
  return {
    id: row.id,
    source: row.source,
    action: row.action,
    sessionId: row.session_id,
    deliveryId: row.delivery_id,
    payloadHash: row.payload_hash,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseJsonObject(
  value: string | null,
): Record<string, unknown> | undefined {
  const parsed = parseJson(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}

function parseActions(value: string | null): MailboxAction[] | undefined {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? (parsed as MailboxAction[]) : undefined;
}

function mapInboxItem(row: InboxItemRow): MailboxItem {
  return {
    id: row.id,
    source: row.source as MailboxSource,
    title: row.title,
    summary: row.summary,
    ts: row.ts,
    status: row.status as MailboxItemStatus,
    kind: (row.kind ?? undefined) as MailboxItemKind | undefined,
    priority: (row.priority ?? undefined) as MailboxItemPriority | undefined,
    channel: (row.channel ?? undefined) as MailboxItem["channel"],
    sessionId: row.session_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    relatedEventId: row.related_event_id ?? undefined,
    actions: parseActions(row.actions_json),
    metadata: parseJsonObject(row.metadata_json),
  };
}

function mapSchedulerTask(row: SchedulerTaskRow): SchedulerTask {
  const metadata = parseJsonObject(row.metadata_json);
  const targetSessionIdValue =
    metadata?.[SCHEDULER_TARGET_SESSION_METADATA_KEY];
  if (metadata) delete metadata[SCHEDULER_TARGET_SESSION_METADATA_KEY];
  const runtime = parseJson(row.runtime_json);
  const schedule = parseJson(row.schedule_json);
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt_ref,
    status: row.status as SchedulerTask["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextRunAt: row.next_run_at,
    ...(row.cwd !== null ? { cwd: row.cwd } : {}),
    ...(runtime !== undefined
      ? { runtime: runtime as SchedulerTask["runtime"] }
      : {}),
    ...(schedule !== undefined
      ? { schedule: schedule as SchedulerTask["schedule"] }
      : {}),
    ...(typeof targetSessionIdValue === "string"
      ? { targetSessionId: targetSessionIdValue }
      : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function mapSchedulerRun(row: SchedulerRunRow): SchedulerRun {
  const metadata = parseJsonObject(row.metadata_json);
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status as SchedulerRun["status"],
    ...(row.queued_at !== null ? { queuedAt: row.queued_at } : {}),
    ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
    ...(row.finished_at !== null ? { finishedAt: row.finished_at } : {}),
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function schedulerTaskMetadataJson(task: SchedulerTask): string | null {
  const metadata = { ...(task.metadata ?? {}) };
  if (task.targetSessionId !== undefined) {
    metadata[SCHEDULER_TARGET_SESSION_METADATA_KEY] = task.targetSessionId;
  }
  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
}

function startOfLocalDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isBoardInboxItem(item: MailboxItem, now: number): boolean {
  if (item.status === "archived") return false;
  if (item.metadata?.board === true && isSameLocalDay(item.ts, now)) {
    return true;
  }
  return (
    item.status === "unread" &&
    (item.kind === "alert" || item.priority === "high")
  );
}

function isSameLocalDay(left: number, right: number): boolean {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

export function createRepositories(db: Database) {
  return {
    sessions: {
      upsert(session: StoredSession): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            string,
            string | null,
            string,
            string,
            string | null,
            number,
            string | null,
            string | null,
            number,
            number,
          ]
        >(`
          INSERT INTO sessions (
            id,
            runtime,
            title,
            model,
            cwd,
            permission_mode,
            sandbox_mode,
            reasoning_effort,
            network_access,
            approval_policy,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            runtime = excluded.runtime,
            title = excluded.title,
            model = excluded.model,
            cwd = excluded.cwd,
            permission_mode = excluded.permission_mode,
            sandbox_mode = excluded.sandbox_mode,
            reasoning_effort = excluded.reasoning_effort,
            network_access = excluded.network_access,
            approval_policy = excluded.approval_policy,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `).run(
          session.id,
          session.runtime,
          session.title,
          session.model,
          session.cwd,
          session.permissionMode,
          session.sandboxMode,
          session.reasoningEffort,
          session.networkAccess ? 1 : 0,
          session.approvalPolicy,
          session.metadataJson,
          session.createdAt,
          session.updatedAt,
        );
      },

      get(id: string): StoredSession | null {
        const row = db
          .query<SessionRow, [string]>(
            "SELECT * FROM sessions WHERE id = ? LIMIT 1",
          )
          .get(id);
        return row ? mapSession(row) : null;
      },
    },

    pairingBindings: {
      upsert(binding: StoredPairingBinding): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            string,
            string,
            number,
            number,
            number,
            string | null,
            string | null,
            string | null,
            string | null,
          ]
        >(`
          INSERT INTO pairing_bindings (
            id,
            channel,
            external_chat_id,
            session_id,
            status,
            forwarding_enabled,
            bound_at,
            updated_at,
            external_user_id,
            display_name,
            secret_ref,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(channel, external_chat_id) DO UPDATE SET
            id = excluded.id,
            session_id = excluded.session_id,
            status = excluded.status,
            forwarding_enabled = excluded.forwarding_enabled,
            bound_at = excluded.bound_at,
            updated_at = excluded.updated_at,
            external_user_id = excluded.external_user_id,
            display_name = excluded.display_name,
            secret_ref = excluded.secret_ref,
            metadata_json = excluded.metadata_json
        `).run(
          binding.id,
          binding.channel,
          binding.externalChatId,
          binding.sessionId,
          binding.status,
          binding.forwardingEnabled ? 1 : 0,
          binding.boundAt,
          binding.updatedAt,
          binding.externalUserId,
          binding.displayName,
          binding.secretRef,
          binding.metadataJson,
        );
      },

      getByExternalKey(
        channel: string,
        externalChatId: string,
      ): StoredPairingBinding | null {
        const row = db
          .query<PairingBindingRow, [string, string]>(
            "SELECT * FROM pairing_bindings WHERE channel = ? AND external_chat_id = ? LIMIT 1",
          )
          .get(channel, externalChatId);
        return row ? mapPairingBinding(row) : null;
      },
    },

    auditRecords: {
      append(record: StoredAuditRecord): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            string | null,
            string | null,
            string,
            string,
            number,
          ]
        >(`
          INSERT INTO audit_records (
            id,
            source,
            action,
            session_id,
            delivery_id,
            payload_hash,
            summary,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id,
          record.source,
          record.action,
          record.sessionId,
          record.deliveryId,
          record.payloadHash,
          record.summary,
          record.createdAt,
        );
      },

      get(id: string): StoredAuditRecord | null {
        const row = db
          .query<AuditRecordRow, [string]>(
            "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
          )
          .get(id);
        return row ? mapAuditRecord(row) : null;
      },
    },

    inboxItems: {
      upsert(item: MailboxItem): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            string,
            number,
            string,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
          ]
        >(`
          INSERT INTO inbox_items (
            id,
            source,
            title,
            summary,
            ts,
            status,
            kind,
            priority,
            channel,
            session_id,
            agent_id,
            related_event_id,
            actions_json,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            source = excluded.source,
            title = excluded.title,
            summary = excluded.summary,
            ts = excluded.ts,
            status = excluded.status,
            kind = excluded.kind,
            priority = excluded.priority,
            channel = excluded.channel,
            session_id = excluded.session_id,
            agent_id = excluded.agent_id,
            related_event_id = excluded.related_event_id,
            actions_json = excluded.actions_json,
            metadata_json = excluded.metadata_json
        `).run(
          item.id,
          item.source,
          item.title,
          item.summary,
          item.ts,
          item.status,
          item.kind ?? null,
          item.priority ?? null,
          item.channel ?? null,
          item.sessionId ?? null,
          item.agentId ?? null,
          item.relatedEventId ?? null,
          item.actions ? JSON.stringify(item.actions) : null,
          item.metadata ? JSON.stringify(item.metadata) : null,
        );
      },

      get(id: string): MailboxItem | null {
        const row = db
          .query<InboxItemRow, [string]>(
            "SELECT * FROM inbox_items WHERE id = ? LIMIT 1",
          )
          .get(id);
        return row ? mapInboxItem(row) : null;
      },

      list(limit = 100): MailboxItem[] {
        return db
          .query<InboxItemRow, [number]>(
            "SELECT * FROM inbox_items ORDER BY ts DESC, id DESC LIMIT ?",
          )
          .all(limit)
          .map(mapInboxItem);
      },

      updateStatus(id: string, status: MailboxItemStatus): MailboxItem | null {
        db.query<unknown, [string, string]>(
          "UPDATE inbox_items SET status = ? WHERE id = ?",
        ).run(status, id);
        return this.get(id);
      },

      assignSession(itemId: string, sessionId: string): MailboxItem | null {
        db.query<unknown, [string, string]>(
          "UPDATE inbox_items SET session_id = ? WHERE id = ?",
        ).run(sessionId, itemId);
        return this.get(itemId);
      },

      boardItems(options: InboxBoardQueryOptions = {}): MailboxItem[] {
        const now = options.now ?? Date.now();
        const limit = options.limit ?? 20;
        return db
          .query<InboxItemRow, []>(
            `
              SELECT * FROM inbox_items
              WHERE status != 'archived'
              ORDER BY ts DESC, id DESC
            `,
          )
          .all()
          .map(mapInboxItem)
          .filter((item) => isBoardInboxItem(item, now))
          .slice(0, limit);
      },
    },

    schedulerTasks: {
      upsert(task: SchedulerTask): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            string,
            number,
            number,
            number | null,
            string | null,
            string | null,
            string | null,
            string | null,
          ]
        >(`
          INSERT INTO scheduler_tasks (
            id,
            title,
            prompt_ref,
            status,
            created_at,
            updated_at,
            next_run_at,
            cwd,
            runtime_json,
            schedule_json,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            prompt_ref = excluded.prompt_ref,
            status = excluded.status,
            updated_at = excluded.updated_at,
            next_run_at = excluded.next_run_at,
            cwd = excluded.cwd,
            runtime_json = excluded.runtime_json,
            schedule_json = excluded.schedule_json,
            metadata_json = excluded.metadata_json
        `).run(
          task.id,
          task.title,
          task.prompt,
          task.status,
          task.createdAt,
          task.updatedAt ?? task.createdAt,
          task.nextRunAt ?? null,
          task.cwd ?? null,
          task.runtime ? JSON.stringify(task.runtime) : null,
          task.schedule ? JSON.stringify(task.schedule) : null,
          schedulerTaskMetadataJson(task),
        );
      },

      get(id: string): SchedulerTask | null {
        const row = db
          .query<SchedulerTaskRow, [string]>(
            "SELECT * FROM scheduler_tasks WHERE id = ? LIMIT 1",
          )
          .get(id);
        return row ? mapSchedulerTask(row) : null;
      },

      list(limit = 100): SchedulerTask[] {
        return db
          .query<SchedulerTaskRow, [number]>(
            "SELECT * FROM scheduler_tasks ORDER BY updated_at DESC, id DESC LIMIT ?",
          )
          .all(limit)
          .map(mapSchedulerTask);
      },
    },

    schedulerRuns: {
      upsert(run: SchedulerRun): void {
        db.query<
          unknown,
          [
            string,
            string,
            string,
            number | null,
            number | null,
            number | null,
            string | null,
            string | null,
            string | null,
            string | null,
          ]
        >(`
          INSERT INTO scheduler_runs (
            id,
            task_id,
            status,
            queued_at,
            started_at,
            finished_at,
            session_id,
            summary,
            error,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id = excluded.task_id,
            status = excluded.status,
            queued_at = excluded.queued_at,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            session_id = excluded.session_id,
            summary = excluded.summary,
            error = excluded.error,
            metadata_json = excluded.metadata_json
        `).run(
          run.id,
          run.taskId,
          run.status,
          run.queuedAt ?? null,
          run.startedAt ?? null,
          run.finishedAt ?? null,
          run.sessionId ?? null,
          run.summary ?? null,
          run.error ?? null,
          run.metadata ? JSON.stringify(run.metadata) : null,
        );
      },

      get(id: string): SchedulerRun | null {
        const row = db
          .query<SchedulerRunRow, [string]>(
            "SELECT * FROM scheduler_runs WHERE id = ? LIMIT 1",
          )
          .get(id);
        return row ? mapSchedulerRun(row) : null;
      },

      listByTask(taskId: string, limit = 100): SchedulerRun[] {
        return db
          .query<SchedulerRunRow, [string, number]>(
            "SELECT * FROM scheduler_runs WHERE task_id = ? ORDER BY COALESCE(started_at, queued_at, finished_at, 0) DESC, id DESC LIMIT ?",
          )
          .all(taskId, limit)
          .map(mapSchedulerRun);
      },
    },
  };
}
