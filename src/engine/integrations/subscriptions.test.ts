import { expect, test } from "bun:test";
import type { IntegrationConnectorStatus } from "../../shared/integrations";
import { MemorySecretStore } from "../secrets/memory-store";
import type { GitHubWebhookRegistrationInput } from "./github";
import {
  type XFilteredStreamRegistrationInput,
  applySubscriptionSettings,
  normalizeGitHubRepo,
  normalizeXHandle,
  subscriptionWebhookUrl,
} from "./subscriptions";

test("normalizes GitHub and X subscription targets", () => {
  expect(normalizeGitHubRepo("koco-co/Roguent")).toEqual({
    owner: "koco-co",
    repo: "Roguent",
  });
  expect(normalizeGitHubRepo("https://github.com/koco-co/Roguent.git")).toEqual(
    {
      owner: "koco-co",
      repo: "Roguent",
    },
  );
  expect(normalizeGitHubRepo("git@github.com:koco-co/Roguent.git")).toEqual({
    owner: "koco-co",
    repo: "Roguent",
  });
  expect(normalizeGitHubRepo("not-a-repo")).toBeNull();
  expect(normalizeXHandle("SugerQvQ")).toBe("@SugerQvQ");
  expect(normalizeXHandle("@SugerQvQ")).toBe("@SugerQvQ");
  expect(normalizeXHandle("")).toBeNull();
  expect(subscriptionWebhookUrl("https://hooks.example.com/", "github")).toBe(
    "https://hooks.example.com/webhooks/github",
  );
});

test("applies enabled GitHub subscription by registering webhook and publishing connected status", async () => {
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "settings/user.integrations.github.metadata.webhookSecret",
    "github-secret",
  );
  const statuses: IntegrationConnectorStatus[] = [];
  const githubInputs: GitHubWebhookRegistrationInput[] = [];

  const result = await applySubscriptionSettings({
    env: {
      ROGUENT_GITHUB_TOKEN: "ghp_test",
      ROGUENT_PUBLIC_WEBHOOK_BASE_URL: "https://hooks.example.com/",
    },
    registerGitHubWebhook: async (input) => {
      githubInputs.push(input);
      return {
        hookId: 42,
        mode: "api",
        secretRef: input.secretRef,
        url: "https://api.github.com/repos/koco-co/Roguent/hooks/42",
      };
    },
    secretStore,
    settings: {
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "https://github.com/koco-co/Roguent.git",
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
    },
    publishStatus: (status) => {
      statuses.push(status);
    },
  });

  expect(githubInputs).toMatchObject([
    {
      owner: "koco-co",
      repo: "Roguent",
      secretRef: "settings/user.integrations.github.metadata.webhookSecret",
      token: "ghp_test",
      webhookUrl: "https://hooks.example.com/webhooks/github",
    },
  ]);
  expect(statuses).toEqual(result.statuses);
  expect(statuses).toContainEqual(
    expect.objectContaining({
      account: "koco-co/Roguent",
      channel: "github",
      id: "github",
      metadata: expect.objectContaining({
        hookId: 42,
        mode: "api",
        repo: "koco-co/Roguent",
        webhookUrl: "https://hooks.example.com/webhooks/github",
      }),
      state: "connected",
    }),
  );
});

test("applies GitHub subscription with token and public callback from settings", async () => {
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "settings/user.integrations.github.metadata.webhookSecret",
    "github-secret",
  );
  await secretStore.put(
    "settings/user.integrations.github.metadata.token",
    "ghp_from_settings",
  );
  const githubInputs: GitHubWebhookRegistrationInput[] = [];

  await applySubscriptionSettings({
    env: {},
    registerGitHubWebhook: async (input) => {
      githubInputs.push(input);
      return {
        hookId: 43,
        mode: "api",
        secretRef: input.secretRef,
        url: "https://api.github.com/repos/koco-co/Roguent/hooks/43",
      };
    },
    secretStore,
    settings: {
      metadata: {
        webhookBaseUrl: "https://settings-callback.example",
      },
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "koco-co/Roguent",
            token: {
              secretRef: "settings/user.integrations.github.metadata.token",
            },
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
    },
  });

  expect(githubInputs).toMatchObject([
    {
      owner: "koco-co",
      repo: "Roguent",
      secretRef: "settings/user.integrations.github.metadata.webhookSecret",
      token: "ghp_from_settings",
      webhookUrl: "https://settings-callback.example/webhooks/github",
    },
  ]);
});

test("publishes blocked GitHub status instead of registering when public URL or token is missing", async () => {
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "settings/user.integrations.github.metadata.webhookSecret",
    "github-secret",
  );
  const statuses: IntegrationConnectorStatus[] = [];
  const githubInputs: GitHubWebhookRegistrationInput[] = [];

  await applySubscriptionSettings({
    env: {},
    registerGitHubWebhook: async (input) => {
      githubInputs.push(input);
      throw new Error("should not register without prerequisites");
    },
    secretStore,
    settings: {
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "koco-co/Roguent",
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
    },
    publishStatus: (status) => {
      statuses.push(status);
    },
  });

  await applySubscriptionSettings({
    env: { ROGUENT_PUBLIC_WEBHOOK_BASE_URL: "https://example.test" },
    registerGitHubWebhook: async (input) => {
      githubInputs.push(input);
      throw new Error("should not register without token");
    },
    secretStore,
    settings: {
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "koco-co/Roguent",
            webhookSecret: {
              secretRef:
                "settings/user.integrations.github.metadata.webhookSecret",
            },
          },
        },
      },
    },
    publishStatus: (status) => {
      statuses.push(status);
    },
  });

  expect(githubInputs).toEqual([]);
  expect(statuses).toContainEqual(
    expect.objectContaining({
      channel: "github",
      metadata: expect.objectContaining({
        reason: "missing_public_webhook_url",
      }),
      state: "blocked",
    }),
  );
  expect(statuses).toContainEqual(
    expect.objectContaining({
      channel: "github",
      metadata: expect.objectContaining({
        reason: "missing_token",
      }),
      state: "blocked",
    }),
  );
});

test("applies enabled X subscription for a handle with filtered-stream webhook registration", async () => {
  const secretStore = new MemorySecretStore();
  await secretStore.put(
    "settings/user.integrations.x.metadata.webhookSecret",
    "consumer-secret",
  );
  await secretStore.put(
    "settings/user.integrations.x.metadata.bearerToken",
    "x-bearer",
  );
  const statuses: IntegrationConnectorStatus[] = [];
  const xInputs: XFilteredStreamRegistrationInput[] = [];

  await applySubscriptionSettings({
    env: { ROGUENT_PUBLIC_WEBHOOK_BASE_URL: "https://hooks.example.com" },
    registerXFilteredStreamWebhook: async (input) => {
      xInputs.push(input);
      return {
        mode: "filtered-stream-webhook",
        provisioned: true,
        ruleIds: ["rule-1"],
        webhookId: "1952390923729424384",
      };
    },
    secretStore,
    settings: {
      integrations: {
        x: {
          enabled: true,
          metadata: {
            bearerToken: {
              secretRef: "settings/user.integrations.x.metadata.bearerToken",
            },
            handle: "@SugerQvQ",
            webhookSecret: {
              secretRef: "settings/user.integrations.x.metadata.webhookSecret",
            },
          },
        },
      },
    },
    publishStatus: (status) => {
      statuses.push(status);
    },
  });

  expect(xInputs).toEqual([
    {
      bearerToken: "x-bearer",
      handle: "@SugerQvQ",
      ruleValue: "from:SugerQvQ",
      webhookUrl: "https://hooks.example.com/webhooks/x",
    },
  ]);
  expect(statuses).toContainEqual(
    expect.objectContaining({
      account: "@SugerQvQ",
      channel: "x",
      metadata: expect.objectContaining({
        handle: "@SugerQvQ",
        mode: "filtered-stream-webhook",
        ruleValue: "from:SugerQvQ",
        webhookId: "1952390923729424384",
        webhookUrl: "https://hooks.example.com/webhooks/x",
      }),
      state: "connected",
    }),
  );
});

test("publishes blocked X status when credentials are absent", async () => {
  const statuses: IntegrationConnectorStatus[] = [];

  await applySubscriptionSettings({
    env: { ROGUENT_PUBLIC_WEBHOOK_BASE_URL: "https://example.test" },
    secretStore: new MemorySecretStore(),
    settings: {
      integrations: {
        x: {
          enabled: true,
          metadata: { handle: "@SugerQvQ" },
        },
      },
    },
    publishStatus: (status) => {
      statuses.push(status);
    },
  });

  expect(statuses).toContainEqual(
    expect.objectContaining({
      account: "@SugerQvQ",
      channel: "x",
      metadata: expect.objectContaining({
        handle: "@SugerQvQ",
        reason: "missing_webhook_secret",
      }),
      state: "blocked",
    }),
  );
});
