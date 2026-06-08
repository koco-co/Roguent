import type { Database } from "bun:sqlite";
import type { IntegrationChannel, PairingBinding } from "../../shared/events";
import { appendAuditRecord } from "../audit/log";
import { createRepositories } from "../persistence/repositories";
import { KeychainSecretStore } from "../secrets/keychain";
import type { SecretStore } from "../secrets/types";
import type { SessionManager } from "../session";
import { FeishuConnector } from "./feishu";
import { IntegrationManager } from "./manager";
import { PairingService } from "./pairing";
import { relayConnectorStatus } from "./relay";
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
  secretStore?: SecretStore;
}

export function startLiveIntegrations(
  options: LiveIntegrationOptions,
): LiveIntegrationRuntime {
  const env = options.env ?? Bun.env;
  const secretStore = options.secretStore ?? new KeychainSecretStore();
  const router = createLiveIntegrationRouter(options.db, options.sessions);
  const manager = new IntegrationManager({
    imConnectors:
      options.imConnectors ??
      createDefaultImConnectors(options.db, env, secretStore),
    router,
  });
  const unsubscribe = options.sessions.subscribe((event) => {
    void manager.handleRoomEventSafely(event);
  });
  manager.start();
  void publishWebhookConnectorStatuses(router, env, secretStore).catch(
    () => {},
  );

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
  secretStore: SecretStore,
): Promise<void> {
  await router.publishStatus(xConnectorStatus(env));
  await router.publishStatus(await relayConnectorStatus(env, secretStore));
}

export function createLiveIntegrationRouter(
  db: Database,
  sessions: SessionManager,
) {
  const pairing = new PairingService(db);
  const repositories = createRepositories(db);
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
        repositories.inboxItems.upsert(item);
      },
      assignSession(itemId, sessionId) {
        repositories.inboxItems.assignSession(itemId, sessionId);
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
  secretStore: SecretStore,
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
      secretStore,
    });
  }
  return connectors;
}
