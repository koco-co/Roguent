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

export interface XFilteredStreamRegistrationInput {
  bearerToken: string;
  fetch?: typeof fetch;
  handle: string;
  ruleValue: string;
  webhookUrl: string;
}

export interface XFilteredStreamRegistrationResult {
  mode: "filtered-stream-webhook";
  provisioned: boolean;
  ruleIds: string[];
  webhookId: string;
}

export interface ApplySubscriptionSettingsOptions {
  env?: Record<string, string | undefined>;
  publishStatus?: (status: IntegrationConnectorStatus) => void | Promise<void>;
  registerGitHubWebhook?: (
    input: GitHubWebhookRegistrationInput,
  ) => Promise<GitHubWebhookRegistrationResult>;
  registerXFilteredStreamWebhook?: (
    input: XFilteredStreamRegistrationInput,
  ) => Promise<XFilteredStreamRegistrationResult>;
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

class XApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "XApiError";
  }
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
  await applyXSubscription(options, publish);

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

export function normalizeXHandle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) return null;
  return `@${value}`;
}

export function subscriptionWebhookUrl(
  publicBaseUrl: string,
  channel: Extract<IntegrationChannel, "github" | "x">,
): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/webhooks/${channel}`;
}

export async function registerXFilteredStreamWebhook(
  input: XFilteredStreamRegistrationInput,
): Promise<XFilteredStreamRegistrationResult> {
  const request = input.fetch ?? fetch;
  const webhook = await ensureXWebhook(request, input);
  const ruleIds = await ensureXRule(request, input);
  const linked = await linkXWebhookToFilteredStream(
    request,
    input.bearerToken,
    webhook.id,
  );
  return {
    mode: "filtered-stream-webhook",
    provisioned: linked,
    ruleIds,
    webhookId: webhook.id,
  };
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
      blockedStatus("github", "invalid_repo", "GitHub repo must be owner/repo"),
    );
    return;
  }

  const publicBaseUrl = publicWebhookBaseUrl(options, "github");
  if (!publicBaseUrl) {
    await publish(
      blockedStatus(
        "github",
        "missing_public_webhook_url",
        "Public webhook base URL is required",
        { repo: repoName(repo) },
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
        "github",
        "missing_webhook_secret",
        "GitHub webhook secret is required",
        { repo: repoName(repo) },
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
        "github",
        "missing_token",
        "GitHub token is required to register repository webhook",
        { mode: "api", repo: repoName(repo) },
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
        blockedStatus(
          "github",
          result.reason,
          "GitHub webhook requires manual setup",
          {
            mode: result.mode,
            repo: repoName(repo),
            secretRef: result.secretRef,
          },
        ),
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
    await publish(
      errorStatus("github", "GitHub webhook registration failed", error, {
        repo: repoName(repo),
        webhookUrl,
      }),
    );
  }
}

async function applyXSubscription(
  options: ApplySubscriptionSettingsOptions,
  publish: (status: IntegrationConnectorStatus) => Promise<void>,
): Promise<void> {
  const config = options.settings.integrations?.x;
  if (!config?.enabled) return;

  const handle = normalizeXHandle(config.metadata?.handle);
  if (!handle) {
    await publish(blockedStatus("x", "missing_handle", "X handle is required"));
    return;
  }

  const publicBaseUrl = publicWebhookBaseUrl(options, "x");
  if (!publicBaseUrl) {
    await publish(
      blockedStatus(
        "x",
        "missing_public_webhook_url",
        "Public webhook base URL is required",
        { handle },
      ),
    );
    return;
  }

  const webhookSecret = await resolveSecretValue({
    envSecret: options.env?.ROGUENT_X_WEBHOOK_SECRET,
    envSecretRef: options.env?.ROGUENT_X_WEBHOOK_SECRET_REF,
    secretStore: options.secretStore,
    value: config.metadata?.webhookSecret,
  });
  if (!webhookSecret) {
    await publish(
      blockedStatus(
        "x",
        "missing_webhook_secret",
        "X webhook secret is required",
        {
          handle,
        },
      ),
    );
    return;
  }

  const bearerToken = await resolveSecretValue({
    envSecret: firstNonEmpty(
      options.env?.X_BEARER_TOKEN,
      options.env?.ROGUENT_X_BEARER_TOKEN,
    ),
    secretStore: options.secretStore,
    value: config.metadata?.bearerToken,
  });
  if (!bearerToken) {
    await publish(
      blockedStatus("x", "missing_bearer_token", "X bearer token is required", {
        handle,
      }),
    );
    return;
  }

  const entitlementBlocker = options.env?.ROGUENT_X_ENTITLEMENT_BLOCKER?.trim();
  if (entitlementBlocker) {
    await publish(
      blockedStatus("x", "entitlement_blocked", entitlementBlocker, {
        handle,
      }),
    );
    return;
  }

  const webhookUrl = subscriptionWebhookUrl(publicBaseUrl, "x");
  const ruleValue = `from:${handle.slice(1)}`;
  try {
    const register =
      options.registerXFilteredStreamWebhook ?? registerXFilteredStreamWebhook;
    const result = await register({
      bearerToken,
      handle,
      ruleValue,
      webhookUrl,
    });
    await publish({
      account: handle,
      channel: "x",
      id: "x",
      label: "X filtered stream webhooks",
      metadata: {
        handle,
        mode: result.mode,
        provisioned: result.provisioned,
        ruleIds: result.ruleIds,
        ruleValue,
        webhookId: result.webhookId,
        webhookUrl,
      },
      state: "connected",
    });
  } catch (error) {
    const status = error instanceof XApiError ? error.status : undefined;
    const reason =
      status === 401
        ? "auth_failed"
        : status === 403
          ? "entitlement_blocked"
          : "registration_failed";
    await publish(
      blockedStatus("x", reason, errorMessage(error), {
        handle,
        ruleValue,
        webhookUrl,
      }),
    );
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
  channel: Extract<IntegrationChannel, "github" | "x">,
): string | undefined {
  const integrations = options.settings.integrations;
  const channelMeta = integrations?.[channel]?.metadata;
  const metadata = metadataRecord(options.settings.metadata);
  return validPublicBaseUrl(
    firstNonEmpty(
      stringMetadata(channelMeta?.webhookBaseUrl),
      stringMetadata(channelMeta?.publicWebhookBaseUrl),
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
  channel: Extract<IntegrationChannel, "github" | "x">,
  reason: string,
  message: string,
  metadata: Record<string, unknown> = {},
): IntegrationConnectorStatus {
  return {
    channel,
    error: message,
    id: channel,
    label: channel === "github" ? "GitHub webhooks" : "X webhooks",
    metadata: {
      ...metadata,
      reason,
    },
    ...(typeof metadata.handle === "string"
      ? { account: metadata.handle }
      : typeof metadata.repo === "string"
        ? { account: metadata.repo }
        : {}),
    state: "blocked",
  };
}

function errorStatus(
  channel: Extract<IntegrationChannel, "github" | "x">,
  prefix: string,
  error: unknown,
  metadata: Record<string, unknown>,
): IntegrationConnectorStatus {
  return {
    channel,
    error: `${prefix}: ${errorMessage(error)}`,
    id: channel,
    label: channel === "github" ? "GitHub webhooks" : "X webhooks",
    metadata: {
      ...metadata,
      reason: "registration_failed",
    },
    state: "error",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureXWebhook(
  fetchImpl: typeof fetch,
  input: XFilteredStreamRegistrationInput,
): Promise<{ id: string }> {
  const existing = await xJsonRequest(
    fetchImpl,
    "/2/webhooks",
    input.bearerToken,
  );
  const matching = arrayField(existing, "data").find((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    return (
      stringField(entry as Record<string, unknown>, "url") === input.webhookUrl
    );
  });
  if (matching && typeof matching === "object" && !Array.isArray(matching)) {
    const id = stringField(matching as Record<string, unknown>, "id");
    if (id) return { id };
  }

  const created = await xJsonRequest(
    fetchImpl,
    "/2/webhooks",
    input.bearerToken,
    {
      body: { url: input.webhookUrl },
      method: "POST",
    },
  );
  const id = stringField(created, "id");
  if (!id) throw new Error("X webhook registration response missing id");
  return { id };
}

async function ensureXRule(
  fetchImpl: typeof fetch,
  input: XFilteredStreamRegistrationInput,
): Promise<string[]> {
  const existing = await xJsonRequest(
    fetchImpl,
    "/2/tweets/search/stream/rules",
    input.bearerToken,
  );
  const existingRuleIds = arrayField(existing, "data")
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      return stringField(record, "value") === input.ruleValue
        ? stringField(record, "id")
        : null;
    })
    .filter((id): id is string => Boolean(id));
  if (existingRuleIds.length > 0) return existingRuleIds;

  const created = await xJsonRequest(
    fetchImpl,
    "/2/tweets/search/stream/rules",
    input.bearerToken,
    {
      body: {
        add: [
          {
            tag: `roguent:${input.handle.slice(1)}`,
            value: input.ruleValue,
          },
        ],
      },
      method: "POST",
    },
  );
  const ids = arrayField(created, "data")
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      return stringField(entry as Record<string, unknown>, "id");
    })
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    throw new Error("X rule registration response missing rule id");
  }
  return ids;
}

async function linkXWebhookToFilteredStream(
  fetchImpl: typeof fetch,
  bearerToken: string,
  webhookId: string,
): Promise<boolean> {
  const response = await xJsonRequest(
    fetchImpl,
    `/2/tweets/search/webhooks/${webhookId}?expansions=author_id&tweet.fields=created_at,author_id&user.fields=username,name,id`,
    bearerToken,
    { method: "POST" },
  );
  const data = metadataRecord(response.data);
  return data?.provisioned === true;
}

async function xJsonRequest(
  fetchImpl: typeof fetch,
  path: string,
  bearerToken: string,
  options: { body?: unknown; method?: string } = {},
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`https://api.x.com${path}`, {
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    method: options.method ?? "GET",
  });
  if (!response.ok) {
    throw new XApiError(
      `X API request failed: HTTP ${response.status}`,
      response.status,
    );
  }
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("X API response was not a JSON object");
  }
  return payload as Record<string, unknown>;
}

function arrayField(value: Record<string, unknown>, key: string): unknown[] {
  const nested = value[key];
  return Array.isArray(nested) ? nested : [];
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const nested = value[key];
  return typeof nested === "string" && nested.trim()
    ? nested.trim()
    : undefined;
}
