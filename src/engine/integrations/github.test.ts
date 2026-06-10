import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { MemorySecretStore } from "../secrets/memory-store";
import {
  githubSubscriptionMode,
  normalizeGitHubEvent,
  registerGitHubRepositoryWebhook,
  resolveGitHubWebhookSecret,
  storeGitHubWebhookSecret,
} from "./github";
import { IntegrationRouter } from "./router";
import type { IntegrationAuditInput, IntegrationRouterEvent } from "./types";

test("normalizeGitHubEvent maps push fixture to subscription event", () => {
  const fixture = readFixture("github-push.json");

  expect(normalizeGitHubEvent("push", fixture)).toMatchObject({
    channel: "github",
    direction: "inbound",
    from: "poco",
    metadata: expect.objectContaining({
      eventName: "push",
      repository: "poco/roguent",
      sourceUrl: "https://github.com/poco/roguent/compare/abc...def",
      url: "https://github.com/poco/roguent/compare/abc...def",
    }),
    summary: expect.stringContaining("push"),
  });
  expect(normalizeGitHubEvent("push", fixture).bodyText).toContain(
    "def1234 Add dungeon webhook",
  );
});

test("normalizeGitHubEvent maps workflow fixture with source URL", () => {
  const fixture = readFixture("github-workflow.json");

  expect(normalizeGitHubEvent("workflow_run", fixture)).toMatchObject({
    channel: "github",
    metadata: expect.objectContaining({
      eventName: "workflow_run",
      repository: "poco/roguent",
      sourceUrl: "https://github.com/poco/roguent/actions/runs/42",
    }),
    summary: "workflow_run success: CI in poco/roguent",
  });
});

test("normalizeGitHubEvent maps pull_request and check_suite summaries with URLs", () => {
  const pullRequest = normalizeGitHubEvent(
    "pull_request",
    {
      action: "opened",
      number: 12,
      pull_request: {
        body: "Implements the room overlay.",
        html_url: "https://github.com/poco/roguent/pull/12",
        title: "Room overlay",
      },
      repository: { full_name: "poco/roguent" },
      sender: { login: "poco" },
    },
    { deliveryId: "pr-delivery" },
  );
  const checkSuite = normalizeGitHubEvent(
    "check_suite",
    {
      action: "completed",
      check_suite: {
        conclusion: "failure",
        url: "https://api.github.com/repos/poco/roguent/check-suites/1",
      },
      repository: { full_name: "poco/roguent" },
    },
    { deliveryId: "check-delivery" },
  );

  expect(pullRequest).toMatchObject({
    deliveryId: "pr-delivery",
    metadata: expect.objectContaining({
      sourceUrl: "https://github.com/poco/roguent/pull/12",
    }),
    summary: "pull_request opened #12 in poco/roguent: Room overlay",
  });
  expect(checkSuite).toMatchObject({
    deliveryId: "check-delivery",
    metadata: expect.objectContaining({
      sourceUrl: "https://api.github.com/repos/poco/roguent/check-suites/1",
    }),
    summary: "check_suite failure in poco/roguent",
  });
});

test("webhook secret is stored in SecretStore by ref", async () => {
  const store = new MemorySecretStore();

  await expect(
    storeGitHubWebhookSecret(store, "secret:github:webhook", "hook-secret"),
  ).resolves.toEqual({ ref: "secret:github:webhook", source: "manual" });

  expect(await resolveGitHubWebhookSecret(store, "secret:github:webhook")).toBe(
    "hook-secret",
  );
  expect(await store.listRefs("secret:github")).toEqual([
    "secret:github:webhook",
  ]);
});

test("missing GitHub token keeps manual webhook mode", () => {
  expect(githubSubscriptionMode({})).toBe("manual-webhook");
  expect(githubSubscriptionMode({ ROGUENT_GITHUB_TOKEN: "  " })).toBe(
    "manual-webhook",
  );
  expect(githubSubscriptionMode({ ROGUENT_GITHUB_TOKEN: "ghp_token" })).toBe(
    "api",
  );
});

test("registerGitHubRepositoryWebhook returns manual mode when token is missing", async () => {
  const store = new MemorySecretStore();

  await expect(
    registerGitHubRepositoryWebhook({
      owner: "poco",
      repo: "roguent",
      secretRef: "secret:github:webhook",
      secretStore: store,
      webhookUrl: "https://example.com/webhooks/github",
    }),
  ).resolves.toEqual({
    mode: "manual-webhook",
    reason: "missing-token",
    secretRef: "secret:github:webhook",
  });
});

test("registerGitHubRepositoryWebhook creates repository hook with secret from SecretStore", async () => {
  const store = new MemorySecretStore();
  await store.put("secret:github:webhook", "hook-secret");
  const requests: Array<{ body?: unknown; method: string; url: string }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      method: init?.method ?? "GET",
      url: String(url),
    });
    if (!init?.method) return Response.json([]);
    return Response.json({
      id: 42,
      url: "https://api.github.com/repos/poco/roguent/hooks/42",
    });
  };

  await expect(
    registerGitHubRepositoryWebhook({
      fetch: fakeFetch as typeof fetch,
      owner: "poco",
      repo: "roguent",
      secretRef: "secret:github:webhook",
      secretStore: store,
      token: "ghp_token",
      webhookUrl: "https://example.com/webhooks/github",
    }),
  ).resolves.toEqual({
    hookId: 42,
    mode: "api",
    secretRef: "secret:github:webhook",
    url: "https://api.github.com/repos/poco/roguent/hooks/42",
  });
  expect(requests).toEqual([
    {
      method: "GET",
      url: "https://api.github.com/repos/poco/roguent/hooks",
    },
    {
      body: expect.objectContaining({
        active: true,
        config: expect.objectContaining({
          content_type: "json",
          secret: "hook-secret",
          url: "https://example.com/webhooks/github",
        }),
        events: expect.arrayContaining([
          "push",
          "pull_request",
          "check_suite",
          "check_run",
          "workflow_run",
        ]),
        name: "web",
      }),
      method: "POST",
      url: "https://api.github.com/repos/poco/roguent/hooks",
    },
  ]);
});

test("registerGitHubRepositoryWebhook updates an existing matching hook", async () => {
  const store = new MemorySecretStore();
  await store.put("secret:github:webhook", "hook-secret");
  const requests: Array<{ method: string; url: string }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ method: init?.method ?? "GET", url: String(url) });
    if (!init?.method) {
      return Response.json([
        {
          config: { url: "https://example.com/webhooks/github" },
          id: 7,
        },
      ]);
    }
    return Response.json({
      id: 7,
      url: "https://api.github.com/repos/poco/roguent/hooks/7",
    });
  };

  await registerGitHubRepositoryWebhook({
    fetch: fakeFetch as typeof fetch,
    owner: "poco",
    repo: "roguent",
    secretRef: "secret:github:webhook",
    secretStore: store,
    token: "ghp_token",
    webhookUrl: "https://example.com/webhooks/github",
  });

  expect(requests).toEqual([
    {
      method: "GET",
      url: "https://api.github.com/repos/poco/roguent/hooks",
    },
    {
      method: "PATCH",
      url: "https://api.github.com/repos/poco/roguent/hooks/7",
    },
  ]);
});

test("local GitHub fixture routes to inbox, audit, and selected session", async () => {
  const fixture = readFixture("github-push.json");
  const event = normalizeGitHubEvent("push", fixture, {
    deliveryId: "delivery-push-1",
    receivedAt: 1_717_452_000_000,
  });
  const inboxItems: MailboxItem[] = [];
  const auditRecords: IntegrationAuditInput[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];
  const router = new IntegrationRouter({
    pairingBindings: {
      getByExternalKey(): PairingBinding | null {
        return null;
      },
    },
    inbox: {
      create(item) {
        inboxItems.push(item);
      },
      assignSession() {},
    },
    audit: {
      append(input) {
        auditRecords.push(input);
      },
    },
    sessions: {
      createSubscriptionSession() {},
      forwardToRuntime(sessionId, text) {
        forwarded.push({ sessionId, text });
        return true;
      },
    },
    publish(event) {
      published.push(event);
    },
  });

  const result = await router.route(event, { currentSessionId: "s1" });

  expect(result.sessionId).toBe("s1");
  expect(inboxItems).toEqual([
    expect.objectContaining({
      channel: "github",
      kind: "event",
      relatedEventId: "github:delivery-push-1",
      sessionId: "s1",
      title: expect.stringContaining("push"),
    }),
  ]);
  expect(auditRecords).toContainEqual(
    expect.objectContaining({
      deliveryId: "delivery-push-1",
      source: "integration.github",
    }),
  );
  expect(published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "integration.event.received",
      payload: expect.objectContaining({
        channel: "github",
        deliveryId: "delivery-push-1",
      }),
    }),
  );
  expect(forwarded[0]?.text).toContain("[github]");
});

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "integrations", name), "utf8"),
  ) as Record<string, unknown>;
}
