import type { Database } from "bun:sqlite";

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
  };
}
