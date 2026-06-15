import type { RoguentSettings } from "../../shared/events";
import type {
  IntegrationChannel,
  IntegrationConnectorStatus,
} from "../../shared/integrations";
import type { SecretStore } from "../secrets/types";
import {
  type GitHubWebhookRegistrationInput,
  type GitHubWebhookRegistrationResult,
  registerGitHubRepositoryWebhook,
} from "./github";

export interface ApplySubscriptionSettingsOptions {
  env?: Record<string, string | undefined>;
  publishStatus?: (status: IntegrationConnectorStatus) => void | Promise<void>;
  registerGitHubWebhook?: (
    input: GitHubWebhookRegistrationInput,
  ) => Promise<GitHubWebhookRegistrationResult>;
  secretStore: SecretStore;
  settings: RoguentSettings;
}

export interface ApplySubscriptionSettingsResult {
  statuses: IntegrationConnectorStatus[];
}

interface GitHubRepoTarget {
  owner: string;
  repo: string;
}

interface ResolvedSecretRef {
  ref: string;
  secretStore: SecretStore;
}

export async function applySubscriptionSettings(
  options: ApplySubscriptionSettingsOptions,
): Promise<ApplySubscriptionSettingsResult> {
  const statuses: IntegrationConnectorStatus[] = [];
  const publish = async (status: IntegrationConnectorStatus) => {
    statuses.push(status);
    await options.publishStatus?.(status);
  };

  await applyGitHubSubscription(options, publish);

  return { statuses };
}

export function normalizeGitHubRepo(input: unknown): GitHubRepoTarget | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return cleanRepoTarget(sshMatch[1], sshMatch[2]);
  }

  if (/^https?:\/\//.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.hostname !== "github.com") return null;
      const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
      return cleanRepoTarget(owner, repo);
    } catch {
      return null;
    }
  }

  const [owner, repo] = trimmed.split("/");
  return cleanRepoTarget(owner, repo);
}

export function subscriptionWebhookUrl(
  publicBaseUrl: string,
  channel: Extract<IntegrationChannel, "github">,
): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/webhooks/${channel}`;
}

async function applyGitHubSubscription(
  options: ApplySubscriptionSettingsOptions,
  publish: (status: IntegrationConnectorStatus) => Promise<void>,
): Promise<void> {
  const config = options.settings.integrations?.github;
  if (!config?.enabled) return;

  const repo = normalizeGitHubRepo(config.metadata?.repo);
  if (!repo) {
    await publish(
      blockedStatus("invalid_repo", "GitHub repo must be owner/repo"),
    );
    return;
  }

  const publicBaseUrl = publicWebhookBaseUrl(options);
  if (!publicBaseUrl) {
    await publish(
      blockedStatus(
        "missing_public_webhook_url",
        "Public webhook base URL is required",
        {
          repo: repoName(repo),
        },
      ),
    );
    return;
  }

  const secret = resolveSecretRef({
    defaultRef: "settings/user.integrations.github.metadata.webhookSecret",
    envSecret: options.env?.ROGUENT_GITHUB_WEBHOOK_SECRET,
    envSecretRef: options.env?.ROGUENT_GITHUB_WEBHOOK_SECRET_REF,
    secretStore: options.secretStore,
    value: config.metadata?.webhookSecret,
  });
  if (!secret) {
    await publish(
      blockedStatus(
        "missing_webhook_secret",
        "GitHub webhook secret is required",
        {
          repo: repoName(repo),
        },
      ),
    );
    return;
  }

  const token = await resolveSecretValue({
    envSecret: firstNonEmpty(
      options.env?.ROGUENT_GITHUB_TOKEN,
      options.env?.GITHUB_TOKEN,
      options.env?.GH_TOKEN,
    ),
    secretStore: options.secretStore,
    value: config.metadata?.token,
  });
  if (!token) {
    await publish(
      blockedStatus(
        "missing_token",
        "GitHub token is required to register repository webhook",
        { repo: repoName(repo) },
      ),
    );
    return;
  }

  const webhookUrl = subscriptionWebhookUrl(publicBaseUrl, "github");
  try {
    const register =
      options.registerGitHubWebhook ?? registerGitHubRepositoryWebhook;
    const result = await register({
      owner: repo.owner,
      repo: repo.repo,
      secretRef: secret.ref,
      secretStore: secret.secretStore,
      token,
      webhookUrl,
    });
    if (result.mode === "manual-webhook") {
      await publish(
        blockedStatus(result.reason, "GitHub webhook requires manual setup", {
          repo: repoName(repo),
          secretRef: result.secretRef,
        }),
      );
      return;
    }
    await publish({
      account: repoName(repo),
      channel: "github",
      id: "github",
      label: "GitHub webhooks",
      metadata: {
        hookId: result.hookId,
        mode: result.mode,
        repo: repoName(repo),
        url: result.url,
        webhookUrl,
      },
      state: "connected",
    });
  } catch (error) {
    await publish({
      channel: "github",
      error: `GitHub webhook registration failed: ${errorMessage(error)}`,
      id: "github",
      label: "GitHub webhooks",
      metadata: {
        reason: "registration_failed",
        repo: repoName(repo),
        webhookUrl,
      },
      state: "error",
    });
  }
}

function cleanRepoTarget(
  owner: string | undefined,
  repo: string | undefined,
): GitHubRepoTarget | null {
  const cleanOwner = owner?.trim();
  const cleanRepo = repo?.trim().replace(/\.git$/, "");
  if (!cleanOwner || !cleanRepo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(cleanOwner)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(cleanRepo)) return null;
  return { owner: cleanOwner, repo: cleanRepo };
}

function publicWebhookBaseUrl(
  options: ApplySubscriptionSettingsOptions,
): string | undefined {
  const githubMeta = options.settings.integrations?.github?.metadata;
  const metadata = metadataRecord(options.settings.metadata);
  return validPublicBaseUrl(
    firstNonEmpty(
      stringMetadata(githubMeta?.webhookBaseUrl),
      stringMetadata(githubMeta?.publicWebhookBaseUrl),
      stringMetadata(metadata?.webhookBaseUrl),
      stringMetadata(metadata?.publicWebhookBaseUrl),
      options.env?.ROGUENT_PUBLIC_WEBHOOK_BASE_URL,
      options.env?.ROGUENT_WEBHOOK_BASE_URL,
    ),
  );
}

function resolveSecretRef(input: {
  defaultRef: string;
  envSecret?: string;
  envSecretRef?: string;
  secretStore: SecretStore;
  value: unknown;
}): ResolvedSecretRef | null {
  const ref = secretRef(input.value) ?? firstNonEmpty(input.envSecretRef);
  if (ref) return { ref, secretStore: input.secretStore };

  const secret = stringMetadata(input.value) ?? firstNonEmpty(input.envSecret);
  if (!secret) return null;
  return {
    ref: input.defaultRef,
    secretStore: overlaySecretStore(
      input.secretStore,
      input.defaultRef,
      secret,
    ),
  };
}

async function resolveSecretValue(input: {
  envSecret?: string;
  envSecretRef?: string;
  secretStore: SecretStore;
  value: unknown;
}): Promise<string | undefined> {
  const direct = stringMetadata(input.value) ?? firstNonEmpty(input.envSecret);
  if (direct) return direct;
  const ref = secretRef(input.value) ?? firstNonEmpty(input.envSecretRef);
  return ref ? input.secretStore.get(ref) : undefined;
}

function overlaySecretStore(
  store: SecretStore,
  ref: string,
  value: string,
): SecretStore {
  return {
    delete(target) {
      return store.delete(target);
    },
    get(target) {
      return target === ref ? Promise.resolve(value) : store.get(target);
    },
    listRefs(prefix) {
      return store.listRefs(prefix);
    },
    put(target, secret) {
      return store.put(target, secret);
    },
  };
}

function secretRef(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const ref = (value as { secretRef?: unknown }).secretRef;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function validPublicBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      return undefined;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function repoName(repo: GitHubRepoTarget): string {
  return `${repo.owner}/${repo.repo}`;
}

function blockedStatus(
  reason: string,
  message: string,
  metadata: Record<string, unknown> = {},
): IntegrationConnectorStatus {
  return {
    channel: "github",
    error: message,
    id: "github",
    label: "GitHub webhooks",
    metadata: {
      ...metadata,
      reason,
    },
    ...(typeof metadata.repo === "string" ? { account: metadata.repo } : {}),
    state: "blocked",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
