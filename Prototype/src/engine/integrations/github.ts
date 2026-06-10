import type { SecretStore } from "../secrets/types";
import type { IntegrationEvent } from "./types";

export interface GitHubNormalizeOptions {
  deliveryId?: string;
  rawBodyHash?: string;
  receivedAt?: number;
}

export interface GitHubWebhookSecretConfig {
  ref: string;
  source: "manual";
}

export interface GitHubWebhookRegistrationInput {
  events?: string[];
  fetch?: typeof fetch;
  owner: string;
  repo: string;
  secretRef: string;
  secretStore: SecretStore;
  token?: string;
  webhookUrl: string;
}

export type GitHubWebhookRegistrationResult =
  | {
      mode: "manual-webhook";
      reason: "missing-token";
      secretRef: string;
    }
  | {
      hookId: number;
      mode: "api";
      secretRef: string;
      url: string;
    };

const DEFAULT_WEBHOOK_EVENTS = [
  "ping",
  "push",
  "pull_request",
  "check_suite",
  "check_run",
  "workflow_run",
];

export async function storeGitHubWebhookSecret(
  secretStore: SecretStore,
  ref: string,
  value: string,
): Promise<GitHubWebhookSecretConfig> {
  await secretStore.put(ref, value);
  return { ref, source: "manual" };
}

export async function resolveGitHubWebhookSecret(
  secretStore: SecretStore,
  ref: string,
): Promise<string | undefined> {
  return secretStore.get(ref);
}

export function githubSubscriptionMode(
  env: Record<string, string | undefined>,
): "api" | "manual-webhook" {
  return env.ROGUENT_GITHUB_TOKEN?.trim() ? "api" : "manual-webhook";
}

export async function registerGitHubRepositoryWebhook(
  input: GitHubWebhookRegistrationInput,
): Promise<GitHubWebhookRegistrationResult> {
  const token = input.token?.trim();
  if (!token) {
    return {
      mode: "manual-webhook",
      reason: "missing-token",
      secretRef: input.secretRef,
    };
  }

  const secret = await input.secretStore.get(input.secretRef);
  if (!secret) {
    throw new Error("GitHub webhook secret ref is not configured");
  }

  const request = input.fetch ?? fetch;
  const hookConfig = {
    active: true,
    config: {
      content_type: "json",
      insecure_ssl: "0",
      secret,
      url: input.webhookUrl,
    },
    events: input.events ?? DEFAULT_WEBHOOK_EVENTS,
    name: "web",
  };
  const existing = await findExistingHook(input, token, request);
  const method = existing ? "PATCH" : "POST";
  const url = existing
    ? githubHookUrl(input.owner, input.repo, existing.id)
    : githubHooksUrl(input.owner, input.repo);
  const response = await request(url, {
    body: JSON.stringify(hookConfig),
    headers: githubHeaders(token),
    method,
  });
  if (!response.ok) {
    throw new Error(
      `GitHub webhook registration failed: HTTP ${response.status}`,
    );
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const hookId = numberField(payload, "id");
  if (hookId === undefined) {
    throw new Error("GitHub webhook registration response missing hook id");
  }
  return {
    hookId,
    mode: "api",
    secretRef: input.secretRef,
    url: stringField(payload, "url") ?? url,
  };
}

export function normalizeGitHubEvent(
  eventName: string,
  payload: Record<string, unknown>,
  options: GitHubNormalizeOptions = {},
): IntegrationEvent {
  const repository = objectField(payload, "repository");
  const repositoryName =
    stringField(repository, "full_name") ?? stringField(repository, "name");
  const receivedAt = options.receivedAt ?? Date.now();
  const deliveryId =
    options.deliveryId ??
    stringField(payload, "deliveryId") ??
    `${eventName}:${receivedAt}`;
  const sourceUrl = githubSourceUrl(eventName, payload, repository);

  return {
    id: `github:${deliveryId}`,
    channel: "github",
    direction: "inbound",
    deliveryId,
    summary: githubSummary(eventName, payload, repositoryName),
    bodyText: githubBodyText(eventName, payload),
    from: githubActor(payload),
    metadata: {
      action: stringField(payload, "action"),
      eventName,
      rawBodyHash: options.rawBodyHash,
      repository: repositoryName,
      sourceUrl,
      url: sourceUrl,
    },
    receivedAt,
  };
}

function githubSummary(
  eventName: string,
  payload: Record<string, unknown>,
  repositoryName: string | undefined,
): string {
  const repoSuffix = repositoryName ? ` in ${repositoryName}` : "";
  if (eventName === "push") {
    const ref = shortRef(stringField(payload, "ref"));
    const pusher = stringField(objectField(payload, "pusher"), "name");
    return `push${ref ? ` to ${ref}` : ""}${repoSuffix}${pusher ? ` by ${pusher}` : ""}`;
  }

  if (eventName === "pull_request") {
    const pullRequest = objectField(payload, "pull_request");
    const number = numberField(payload, "number");
    const action = stringField(payload, "action") ?? "updated";
    const title = stringField(pullRequest, "title");
    return `pull_request ${action}${number ? ` #${number}` : ""}${repoSuffix}${title ? `: ${title}` : ""}`;
  }

  if (eventName === "workflow_run") {
    const run = objectField(payload, "workflow_run");
    const name = stringField(run, "name") ?? "workflow";
    const conclusion = stringField(run, "conclusion");
    const status = conclusion ?? stringField(run, "status");
    return `workflow_run ${status ?? "updated"}: ${name}${repoSuffix}`;
  }

  if (eventName === "check_suite") {
    const suite = objectField(payload, "check_suite");
    const action = stringField(payload, "action") ?? "updated";
    const conclusion = stringField(suite, "conclusion");
    return `check_suite ${conclusion ?? action}${repoSuffix}`;
  }

  return `github ${eventName}${repoSuffix}`;
}

function githubBodyText(
  eventName: string,
  payload: Record<string, unknown>,
): string {
  if (eventName === "push") {
    const commits = arrayField(payload, "commits");
    const lines = commits
      .map((commit) => {
        if (!commit || typeof commit !== "object" || Array.isArray(commit)) {
          return null;
        }
        const record = commit as Record<string, unknown>;
        const id = stringField(record, "id")?.slice(0, 7);
        const message = stringField(record, "message")?.split("\n")[0];
        if (!message) return null;
        return id ? `${id} ${message}` : message;
      })
      .filter((line): line is string => Boolean(line));
    if (lines.length > 0) return lines.join("\n");
  }

  const explicitBody =
    stringField(objectField(payload, "pull_request"), "body") ??
    stringField(objectField(payload, "workflow_run"), "display_title") ??
    stringField(payload, "summary");
  return explicitBody ?? JSON.stringify(payload);
}

function githubSourceUrl(
  eventName: string,
  payload: Record<string, unknown>,
  repository: Record<string, unknown>,
): string | undefined {
  if (eventName === "push") {
    return (
      stringField(payload, "compare") ?? stringField(repository, "html_url")
    );
  }
  if (eventName === "pull_request") {
    return stringField(objectField(payload, "pull_request"), "html_url");
  }
  if (eventName === "workflow_run") {
    return stringField(objectField(payload, "workflow_run"), "html_url");
  }
  if (eventName === "check_suite") {
    return stringField(objectField(payload, "check_suite"), "url");
  }
  return (
    stringField(payload, "html_url") ?? stringField(repository, "html_url")
  );
}

function githubActor(payload: Record<string, unknown>): string | undefined {
  return (
    stringField(objectField(payload, "sender"), "login") ??
    stringField(objectField(payload, "pusher"), "name")
  );
}

async function findExistingHook(
  input: GitHubWebhookRegistrationInput,
  token: string,
  request: typeof fetch,
): Promise<{ id: number } | null> {
  const response = await request(githubHooksUrl(input.owner, input.repo), {
    headers: githubHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`GitHub webhook lookup failed: HTTP ${response.status}`);
  }
  const hooks = (await response.json()) as unknown;
  if (!Array.isArray(hooks)) return null;
  for (const hook of hooks) {
    if (!hook || typeof hook !== "object" || Array.isArray(hook)) continue;
    const record = hook as Record<string, unknown>;
    const config = objectField(record, "config");
    if (stringField(config, "url") !== input.webhookUrl) continue;
    const id = numberField(record, "id");
    if (id !== undefined) return { id };
  }
  return null;
}

function githubHooksUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`;
}

function githubHookUrl(owner: string, repo: string, id: number): string {
  return `${githubHooksUrl(owner, repo)}/${id}`;
}

function githubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "Roguent",
    "x-github-api-version": "2022-11-28",
  };
}

function shortRef(ref: string | undefined): string | undefined {
  return ref?.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}

function objectField(
  value: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const nested = value[field];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return {};
}

function arrayField(value: Record<string, unknown>, field: string): unknown[] {
  const nested = value[field];
  return Array.isArray(nested) ? nested : [];
}

function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const nested = value[field];
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}

function numberField(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  const nested = value[field];
  return typeof nested === "number" && Number.isFinite(nested)
    ? nested
    : undefined;
}
