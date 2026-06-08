import type { Database } from "bun:sqlite";
import type {
  IntegrationChannel,
  PairingBinding,
  PairingBindingStatus,
} from "../../shared/integrations";
import { appendAuditRecord } from "../audit/log";
import {
  type StoredPairingBinding,
  createRepositories,
} from "../persistence/repositories";

export interface PairingBindInput {
  channel: IntegrationChannel;
  externalChatId: string;
  sessionId: string;
  forwardingEnabled?: boolean;
  externalUserId?: string;
  displayName?: string;
  secretRef?: string;
  metadata?: Record<string, unknown>;
  boundAt?: number;
}

export class PairingService {
  constructor(private readonly db: Database) {}

  async bind(input: PairingBindInput): Promise<PairingBinding> {
    const repositories = createRepositories(this.db);
    const previous = repositories.pairingBindings.getByExternalKey(
      input.channel,
      input.externalChatId,
    );
    const now = input.boundAt ?? Date.now();
    const stored: StoredPairingBinding = {
      id: bindingId(input.channel, input.externalChatId, input.sessionId),
      channel: input.channel,
      externalChatId: input.externalChatId,
      sessionId: input.sessionId,
      status: "active",
      forwardingEnabled: input.forwardingEnabled ?? true,
      boundAt: now,
      updatedAt: now,
      externalUserId: input.externalUserId ?? null,
      displayName: input.displayName ?? null,
      secretRef: input.secretRef ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    };

    repositories.pairingBindings.upsert(stored);
    if (previous && previous.sessionId !== stored.sessionId) {
      appendAuditRecord(this.db, {
        source: "integration.pairing",
        action: "pairing.binding.overwritten",
        sessionId: stored.sessionId,
        payload: {
          channel: stored.channel,
          externalChatId: stored.externalChatId,
          previousSessionId: previous.sessionId,
          nextSessionId: stored.sessionId,
        },
        summary: `${stored.channel} ${stored.externalChatId} rebound from ${previous.sessionId} to ${stored.sessionId}`,
        createdAt: now,
      });
    }

    return toPairingBinding(stored);
  }

  async resolve(
    channel: IntegrationChannel,
    externalChatId: string,
  ): Promise<PairingBinding | null> {
    const stored = createRepositories(this.db).pairingBindings.getByExternalKey(
      channel,
      externalChatId,
    );
    return stored ? toPairingBinding(stored) : null;
  }

  async setForwarding(
    channel: IntegrationChannel,
    externalChatId: string,
    forwardingEnabled: boolean,
  ): Promise<PairingBinding | null> {
    const repositories = createRepositories(this.db);
    const previous = repositories.pairingBindings.getByExternalKey(
      channel,
      externalChatId,
    );
    if (!previous) return null;

    const updated: StoredPairingBinding = {
      ...previous,
      forwardingEnabled,
      updatedAt: Date.now(),
    };
    repositories.pairingBindings.upsert(updated);
    return toPairingBinding(updated);
  }
}

function toPairingBinding(stored: StoredPairingBinding): PairingBinding {
  return {
    id: stored.id,
    channel: stored.channel as IntegrationChannel,
    status: stored.status as PairingBindingStatus,
    externalChatId: stored.externalChatId,
    sessionId: stored.sessionId,
    forwardingEnabled: stored.forwardingEnabled,
    boundAt: stored.boundAt,
    updatedAt: stored.updatedAt,
    externalUserId: stored.externalUserId ?? undefined,
    displayName: stored.displayName ?? undefined,
    metadata: parseMetadata(stored.metadataJson),
  };
}

function parseMetadata(
  value: string | null,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function bindingId(
  channel: IntegrationChannel,
  externalChatId: string,
  sessionId: string,
): string {
  return `binding:${channel}:${slug(externalChatId)}:${slug(sessionId)}`;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}
