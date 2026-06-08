import type { Database } from "bun:sqlite";
import type {
  IntegrationChannel,
  MailboxItem,
  PairingBinding,
} from "../../shared/events";
import { appendAuditRecord } from "../audit/log";
import { KeychainSecretStore } from "../secrets/keychain";
import type { SessionManager } from "../session";
import { FeishuConnector } from "./feishu";
import { IntegrationManager } from "./manager";
import { PairingService } from "./pairing";
import { IntegrationRouter } from "./router";
import { createWeChatConnector } from "./wechat-node-host";
import type { ImConnector } from "./wechat-types";
import { xConnectorStatus } from "./x";

export interface LiveIntegrationRuntime {
  manager: IntegrationManager;
  router: IntegrationRouter;
  stop(): void;
}

export interface LiveIntegrationOptions {
  db: Database;
  sessions: SessionManager;
  env?: Record<string, string | undefined>;
  imConnectors?: Partial<Record<IntegrationChannel, ImConnector>>;
}

export function startLiveIntegrations(
  options: LiveIntegrationOptions,
): LiveIntegrationRuntime {
  const env = options.env ?? Bun.env;
  const router = createLiveIntegrationRouter(options.db, options.sessions);
  const manager = new IntegrationManager({
    imConnectors:
      options.imConnectors ?? createDefaultImConnectors(options.db, env),
    router,
  });
  const unsubscribe = options.sessions.subscribe((event) => {
    void manager.handleRoomEventSafely(event);
  });
  manager.start();
  void publishWebhookConnectorStatuses(router, env).catch(() => {});

  return {
    manager,
    router,
    stop() {
      unsubscribe();
      manager.stop();
    },
  };
}

async function publishWebhookConnectorStatuses(
  router: IntegrationRouter,
  env: Record<string, string | undefined>,
): Promise<void> {
  await router.publishStatus(xConnectorStatus(env));
}

export function createLiveIntegrationRouter(
  db: Database,
  sessions: SessionManager,
) {
  const pairing = new PairingService(db);
  return new IntegrationRouter({
    pairingBindings: {
      getByExternalKey(
        channel,
        externalChatId,
      ): Promise<PairingBinding | null> {
        return pairing.resolve(channel, externalChatId);
      },
    },
    inbox: {
      create(item) {
        upsertInboxItem(db, item);
      },
      assignSession(itemId, sessionId) {
        db.query("UPDATE inbox_items SET session_id = ? WHERE id = ?").run(
          sessionId,
          itemId,
        );
      },
    },
    audit: {
      append(input) {
        appendAuditRecord(db, input);
      },
    },
    sessions: {
      createSubscriptionSession(input) {
        sessions.createSession(input.id, { title: input.title });
      },
      forwardToRuntime(sessionId, text) {
        return sessions.sendMessage(sessionId, text);
      },
    },
    publish(event) {
      sessions.publishIntegrationEvent(event);
    },
  });
}

function createDefaultImConnectors(
  _db: Database,
  env: Record<string, string | undefined>,
): Partial<Record<IntegrationChannel, ImConnector>> {
  const connectors: Partial<Record<IntegrationChannel, ImConnector>> = {};
  if (env.ROGUENT_WECHAT_DISABLED !== "1") {
    connectors.wechat = createWeChatConnector();
  }
  const appIdSecretRef = env.ROGUENT_FEISHU_APP_ID_SECRET_REF?.trim();
  const appSecretRef = env.ROGUENT_FEISHU_APP_SECRET_SECRET_REF?.trim();
  if (appIdSecretRef && appSecretRef) {
    connectors.feishu = new FeishuConnector({
      config: { appIdSecretRef, appSecretRef },
      secretStore: new KeychainSecretStore(),
    });
  }
  return connectors;
}

function upsertInboxItem(db: Database, item: MailboxItem): void {
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
}
