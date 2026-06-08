import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import type { IntegrationChannel } from "../../shared/integrations";
import { appendAuditRecord } from "../audit/log";
import type { IntegrationRouter } from "../integrations/router";
import type { IntegrationEvent } from "../integrations/types";
import {
  verifyGitHubSignature,
  verifyHmacBase64Signature,
  xCrcResponseToken,
} from "./signatures";

const CHANNELS = new Set<IntegrationChannel>([
  "wechat",
  "feishu",
  "github",
  "x",
  "relay",
]);

export interface IngressServerOptions {
  currentSessionId?: () => string | null | undefined;
  db: Database;
  env?: Record<string, string | undefined>;
  port?: number | null;
  router: Pick<IntegrationRouter, "route">;
}

export interface IngressRuntime {
  port: number;
  stop(): void;
}

export function createIngressHandler(options: IngressServerOptions) {
  const env = options.env ?? Bun.env;
  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/webhooks/github") {
      return handleGitHubWebhook(request, options, env);
    }

    if (request.method === "GET" && url.pathname === "/webhooks/x") {
      return handleXCrc(url, options, env);
    }

    if (request.method === "POST" && url.pathname === "/webhooks/x") {
      return handleSignedJsonWebhook(request, options, {
        channel: "x",
        env,
        eventNameHeader: "x-twitter-webhooks-event",
        secretName: "ROGUENT_X_WEBHOOK_SECRET",
        signatureHeader: "x-twitter-webhooks-signature",
        verifier: verifyHmacBase64Signature,
      });
    }

    if (request.method === "POST" && url.pathname === "/webhooks/feishu") {
      return handleFeishuWebhook(request, options, env);
    }

    const relayMatch = url.pathname.match(/^\/webhooks\/relay\/([^/]+)$/);
    if (request.method === "POST" && relayMatch) {
      const channel = parseChannel(relayMatch[1]);
      if (!channel) return json({ error: "invalid channel" }, 400);
      return handleRelayWebhook(request, options, env, channel);
    }

    return json({ error: "not found" }, 404);
  };
}

export function resolveIngressPort(
  env: Record<string, string | undefined> = Bun.env,
): number | null {
  const raw = env.ROGUENT_INGRESS_PORT?.trim();
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
  return port;
}

export function startIngressServer(
  options: IngressServerOptions,
): IngressRuntime | null {
  const port = options.port ?? resolveIngressPort(options.env);
  if (port === null) return null;
  const server = Bun.serve({
    port,
    fetch: createIngressHandler(options),
  });
  return {
    port: server.port ?? port,
    stop() {
      server.stop(true);
    },
  };
}

async function handleGitHubWebhook(
  request: Request,
  options: IngressServerOptions,
  env: Record<string, string | undefined>,
): Promise<Response> {
  return handleSignedJsonWebhook(request, options, {
    channel: "github",
    env,
    eventNameHeader: "x-github-event",
    secretName: "ROGUENT_GITHUB_WEBHOOK_SECRET",
    signatureHeader: "x-hub-signature-256",
    verifier: verifyGitHubSignature,
  });
}

async function handleSignedJsonWebhook(
  request: Request,
  options: IngressServerOptions,
  config: {
    channel: IntegrationChannel;
    env: Record<string, string | undefined>;
    eventNameHeader: string;
    secretName: string;
    signatureHeader: string;
    verifier: (
      rawBody: Uint8Array,
      secret: string,
      header: string | null | undefined,
    ) => boolean;
  },
): Promise<Response> {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const eventName = request.headers.get(config.eventNameHeader) ?? "webhook";
  const deliveryId = deliveryIdFor(config.channel, request, eventName);
  const secret = config.env[config.secretName] ?? "";
  const signature = request.headers.get(config.signatureHeader);
  if (!config.verifier(rawBody, secret, signature)) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: config.channel,
      deliveryId,
      eventName,
      rawBody,
      reason: "invalid_signature",
    });
    return json({ error: "invalid signature" }, 401);
  }

  const parsed = parseJson(rawBody);
  if (!parsed.ok) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: config.channel,
      deliveryId,
      eventName,
      rawBody,
      reason: "invalid_json",
    });
    return json({ error: "invalid json" }, 400);
  }

  const event = normalizeWebhookEvent({
    channel: config.channel,
    deliveryId,
    eventName,
    payload: parsed.value,
    rawBody,
  });
  appendIngressAudit(options.db, {
    accepted: true,
    channel: config.channel,
    deliveryId,
    eventName,
    rawBody,
    reason: "accepted",
  });
  await options.router.route(event, {
    currentSessionId: options.currentSessionId?.() ?? null,
  });
  return json({ ok: true, id: event.id });
}

async function handleRelayWebhook(
  request: Request,
  options: IngressServerOptions,
  env: Record<string, string | undefined>,
  channel: IntegrationChannel,
): Promise<Response> {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const deliveryId = deliveryIdFor(channel, request, "relay");
  const token = env.ROGUENT_RELAY_TOKEN?.trim();
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel,
      deliveryId,
      eventName: "relay",
      rawBody,
      reason: "invalid_relay_token",
    });
    return json({ error: "invalid relay token" }, 401);
  }

  const parsed = parseJson(rawBody);
  if (!parsed.ok) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel,
      deliveryId,
      eventName: "relay",
      rawBody,
      reason: "invalid_json",
    });
    return json({ error: "invalid json" }, 400);
  }

  const event = normalizeWebhookEvent({
    channel,
    deliveryId,
    eventName: stringField(parsed.value, "eventName") ?? "relay",
    payload: parsed.value,
    rawBody,
  });
  appendIngressAudit(options.db, {
    accepted: true,
    channel,
    deliveryId,
    eventName: "relay",
    rawBody,
    reason: "accepted",
  });
  await options.router.route(event, {
    currentSessionId: options.currentSessionId?.() ?? null,
  });
  return json({ ok: true, id: event.id });
}

async function handleFeishuWebhook(
  request: Request,
  options: IngressServerOptions,
  env: Record<string, string | undefined>,
): Promise<Response> {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const deliveryId = deliveryIdFor("feishu", request, "feishu");
  const token = env.ROGUENT_FEISHU_WEBHOOK_TOKEN?.trim();
  if (!token) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: "feishu",
      deliveryId,
      eventName: "feishu",
      rawBody,
      reason: "missing_feishu_token",
    });
    return json({ error: "missing feishu token" }, 401);
  }

  const parsed = parseJson(rawBody);
  if (!parsed.ok) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: "feishu",
      deliveryId,
      eventName: "feishu",
      rawBody,
      reason: "invalid_json",
    });
    return json({ error: "invalid json" }, 400);
  }

  if (stringField(parsed.value, "token") !== token) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: "feishu",
      deliveryId,
      eventName: "feishu",
      rawBody,
      reason: "invalid_feishu_token",
    });
    return json({ error: "invalid feishu token" }, 401);
  }

  const challenge = stringField(parsed.value, "challenge");
  if (challenge && stringField(parsed.value, "type") === "url_verification") {
    appendIngressAudit(options.db, {
      accepted: true,
      channel: "feishu",
      deliveryId,
      eventName: "feishu.challenge",
      rawBody,
      reason: "accepted",
    });
    return json({ challenge });
  }

  if (
    typeof parsed.value.encrypt === "string" &&
    !env.ROGUENT_FEISHU_WEBHOOK_ENCRYPT_KEY?.trim()
  ) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: "feishu",
      deliveryId,
      eventName: "feishu",
      rawBody,
      reason: "missing_feishu_encrypt_key",
    });
    return json({ error: "missing feishu encrypt key" }, 501);
  }

  const event = normalizeWebhookEvent({
    channel: "feishu",
    deliveryId,
    eventName: feishuEventName(parsed.value),
    payload: parsed.value,
    rawBody,
  });
  appendIngressAudit(options.db, {
    accepted: true,
    channel: "feishu",
    deliveryId,
    eventName: "feishu",
    rawBody,
    reason: "accepted",
  });
  await options.router.route(event, {
    currentSessionId: options.currentSessionId?.() ?? null,
  });
  return json({ ok: true, id: event.id });
}

function handleXCrc(
  url: URL,
  options: IngressServerOptions,
  env: Record<string, string | undefined>,
): Response {
  const crcToken = url.searchParams.get("crc_token");
  const secret = env.ROGUENT_X_WEBHOOK_SECRET?.trim();
  const rawBody = Buffer.from(crcToken ?? "");
  if (!crcToken || !secret) {
    appendIngressAudit(options.db, {
      accepted: false,
      channel: "x",
      deliveryId: `x:crc:${crcToken ?? "missing"}`,
      eventName: "crc",
      rawBody,
      reason: "missing_crc_token",
    });
    return json({ error: "missing crc token" }, 400);
  }
  appendIngressAudit(options.db, {
    accepted: true,
    channel: "x",
    deliveryId: `x:crc:${crcToken}`,
    eventName: "crc",
    rawBody,
    reason: "accepted",
  });
  return json({ response_token: xCrcResponseToken(secret, crcToken) });
}

function appendIngressAudit(
  db: Database,
  input: {
    accepted: boolean;
    channel: IntegrationChannel;
    deliveryId: string;
    eventName: string;
    rawBody: Uint8Array;
    reason: string;
  },
): void {
  appendAuditRecord(db, {
    source: `ingress.${input.channel}`,
    action: input.accepted ? "webhook.accepted" : "webhook.rejected",
    deliveryId: input.deliveryId,
    payload: {
      channel: input.channel,
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      rawBodyHash: rawBodyHash(input.rawBody),
      validation: {
        accepted: input.accepted,
        reason: input.reason,
      },
    },
    summary: `${input.channel} webhook ${input.reason}`,
  });
}

function normalizeWebhookEvent(input: {
  channel: IntegrationChannel;
  deliveryId: string;
  eventName: string;
  payload: Record<string, unknown>;
  rawBody: Uint8Array;
}): IntegrationEvent {
  const explicitSummary = stringField(input.payload, "summary");
  const repository = nestedString(input.payload, ["repository", "full_name"]);
  const summary =
    explicitSummary ??
    (repository
      ? `${input.channel} ${input.eventName}: ${repository}`
      : `${input.channel} ${input.eventName}`);
  return {
    id:
      stringField(input.payload, "id") ??
      `${input.channel}:${input.deliveryId}`,
    channel: input.channel,
    direction: "inbound",
    externalChatId: stringField(input.payload, "externalChatId"),
    deliveryId: input.deliveryId,
    summary,
    bodyText: stringField(input.payload, "bodyText") ?? bodyText(input.payload),
    from: stringField(input.payload, "from"),
    displayName: stringField(input.payload, "displayName"),
    metadata: {
      eventName: input.eventName,
      rawBodyHash: rawBodyHash(input.rawBody),
      url:
        stringField(input.payload, "html_url") ??
        nestedString(input.payload, ["repository", "html_url"]),
    },
    receivedAt: Date.now(),
  };
}

function deliveryIdFor(
  channel: IntegrationChannel,
  request: Request,
  eventName: string,
): string {
  return (
    request.headers.get("x-github-delivery") ??
    request.headers.get("x-roguent-delivery") ??
    request.headers.get("x-lark-request-id") ??
    `${channel}:${eventName}:${randomUUID()}`
  );
}

function rawBodyHash(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function parseJson(
  rawBody: Uint8Array,
): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(rawBody));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function parseChannel(value: string | undefined): IntegrationChannel | null {
  if (!value || !CHANNELS.has(value as IntegrationChannel)) return null;
  return value as IntegrationChannel;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const nested = value[field];
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}

function nestedString(
  value: Record<string, unknown>,
  path: string[],
): string | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor : undefined;
}

function feishuEventName(payload: Record<string, unknown>): string {
  const header = payload.header;
  if (header && typeof header === "object" && !Array.isArray(header)) {
    const eventType = stringField(
      header as Record<string, unknown>,
      "event_type",
    );
    if (eventType) return eventType;
  }
  return stringField(payload, "type") ?? "feishu";
}

function bodyText(payload: Record<string, unknown>): string {
  const text = JSON.stringify(payload);
  return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}
