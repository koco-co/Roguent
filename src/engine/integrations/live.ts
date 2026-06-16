import type { Database } from "bun:sqlite";
import type {
  IntegrationChannel,
  PairingBinding,
  RoguentSettings,
} from "../../shared/events";
import { defaultRuntimeConfig } from "../../shared/runtime";
import { appendAuditRecord } from "../audit/log";
import { createRepositories } from "../persistence/repositories";
import { KeychainSecretStore } from "../secrets/keychain";
import type { SecretStore } from "../secrets/types";
import type { SessionManager } from "../session";
import type { GatewayPairingService } from "../ws-gateway";
import { FeishuConnector } from "./feishu";
import { IntegrationManager } from "./manager";
import { PairingService } from "./pairing";
import { relayConnectorStatus } from "./relay";
import { IntegrationRouter } from "./router";
import {
  type ApplySubscriptionSettingsOptions,
  applySubscriptionSettings as applySubscriptionSettingsToConnectors,
} from "./subscriptions";
import { createWeChatConnector } from "./wechat-ilink";
import type { ImConnector } from "./wechat-types";
import { xConnectorStatus } from "./x";

export interface LiveIntegrationRuntime {
  applySubscriptionSettings(settings: RoguentSettings): Promise<void>;
  manager: IntegrationManager;
  router: IntegrationRouter;
  pairing: GatewayPairingService;
  stop(): void;
}

export interface LiveIntegrationOptions {
  db: Database;
  sessions: SessionManager;
  env?: Record<string, string | undefined>;
  imConnectors?: Partial<Record<IntegrationChannel, ImConnector>>;
  secretStore?: SecretStore;
  subscriptionRegistrars?: Pick<
    ApplySubscriptionSettingsOptions,
    "registerGitHubWebhook" | "registerXFilteredStreamWebhook"
  >;
}

export function startLiveIntegrations(
  options: LiveIntegrationOptions,
): LiveIntegrationRuntime {
  const env = options.env ?? Bun.env;
  const secretStore = options.secretStore ?? new KeychainSecretStore();
  const pairing = new PairingService(options.db);
  const router = createLiveIntegrationRouter(
    options.db,
    options.sessions,
    pairing,
  );
  const manager = new IntegrationManager({
    imConnectors:
      options.imConnectors ??
      createDefaultImConnectors(options.db, env, secretStore),
    router,
    pairingBind: (scanned) =>
      pairing.bind({
        channel: scanned.channel,
        externalChatId: scanned.externalChatId,
        sessionId: scanned.sessionId,
        ...(scanned.externalUserId !== undefined
          ? { externalUserId: scanned.externalUserId }
          : {}),
        ...(scanned.displayName !== undefined
          ? { displayName: scanned.displayName }
          : {}),
      }),
  });
  const unsubscribe = options.sessions.subscribe((event) => {
    void manager.handleRoomEventSafely(event);
  });
  manager.start();
  void publishWebhookConnectorStatuses(router, env, secretStore).catch(
    () => {},
  );

  const applySubscriptionSettings = async (settings: RoguentSettings) => {
    await applySubscriptionSettingsToConnectors({
      env,
      publishStatus: (status) => router.publishStatus(status),
      secretStore,
      settings,
      ...options.subscriptionRegistrars,
    });
  };

  const pairingService: GatewayPairingService = {
    generateQr: (sessionId, channel) =>
      manager.startPairing(channel, sessionId),
    cancelQr: (sessionId, channel) => manager.cancelPairing(channel, sessionId),
    submitVerifyCode: (sessionId, channel, code) =>
      manager.submitVerifyCode(channel, sessionId, code),
    async createBinding(input) {
      // A1 no-op-safe stub: createPairing may carry no chat id yet (manual bind
      // before a chat is known). Skip persisting until there is a real chat id.
      if (!input.externalChatId.trim()) return;
      const binding = await pairing.bind({
        channel: input.channel,
        externalChatId: input.externalChatId,
        sessionId: input.sessionId,
        ...(input.forwardingEnabled !== undefined
          ? { forwardingEnabled: input.forwardingEnabled }
          : {}),
      });
      await router.publishPairingBinding(binding, "created", {
        sessionId: input.sessionId,
      });
    },
    async updateBinding(bindingId, changes) {
      if (changes.status === "revoked") {
        const binding = await pairing.revoke(bindingId);
        if (binding) {
          await router.publishPairingBinding(binding, "revoked", {
            sessionId: binding.sessionId,
          });
        }
        return;
      }
      if (changes.forwardingEnabled === undefined) return;
      const existing = await pairing.getById(bindingId);
      if (!existing) return;
      const binding = await pairing.setForwarding(
        existing.channel,
        existing.externalChatId,
        changes.forwardingEnabled,
      );
      if (binding) {
        await router.publishPairingBinding(binding, "updated", {
          sessionId: binding.sessionId,
        });
      }
    },
  };

  return {
    applySubscriptionSettings,
    manager,
    router,
    pairing: pairingService,
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
  pairing: PairingService = new PairingService(db),
) {
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
        const now = Date.now();
        const runtime = defaultRuntimeConfig("claude");
        repositories.sessions.upsert({
          id: input.id,
          runtime: runtime.runtime,
          title: input.title,
          model: runtime.model,
          cwd: null,
          permissionMode: runtime.permissionMode,
          sandboxMode: runtime.sandboxMode,
          reasoningEffort: runtime.reasoningEffort ?? null,
          networkAccess: runtime.networkAccess,
          approvalPolicy: runtime.approvalPolicy ?? null,
          metadataJson: JSON.stringify({ source: input.source }),
          createdAt: now,
          updatedAt: now,
        });
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
