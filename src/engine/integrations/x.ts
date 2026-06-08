import type { IntegrationConnectorStatus } from "../../shared/integrations";
import {
  buildXChallengeResponse,
  verifyXWebhookSignature,
} from "../ingress/signatures";
import type { IntegrationEvent } from "./types";

export { buildXChallengeResponse, verifyXWebhookSignature };

export interface XNormalizeOptions {
  deliveryId?: string;
  eventName?: string;
  rawBodyHash?: string;
  receivedAt?: number;
}

export function normalizeXEvent(
  payload: Record<string, unknown>,
  options: XNormalizeOptions = {},
): IntegrationEvent {
  const receivedAt = options.receivedAt ?? Date.now();
  const eventName = options.eventName ?? inferXEventName(payload);
  const deliveryId =
    options.deliveryId ??
    stringField(payload, "deliveryId") ??
    `${eventName}:${receivedAt}`;
  const primary = primaryXObject(payload, eventName);
  const sourceUrl = xSourceUrl(primary);
  const actor = xActor(primary);
  const text =
    stringField(primary, "text") ?? stringField(primary, "full_text");

  return {
    id: `x:${deliveryId}`,
    channel: "x",
    direction: "inbound",
    deliveryId,
    summary: xSummary(eventName, primary, actor),
    bodyText: text ?? JSON.stringify(payload),
    from: actor,
    metadata: {
      eventName,
      rawBodyHash: options.rawBodyHash,
      sourceUrl,
      url: sourceUrl,
      userId:
        stringField(payload, "for_user_id") ??
        stringField(primary, "user_id_str") ??
        stringField(objectField(primary, "user"), "id_str"),
    },
    receivedAt,
  };
}

export function xConnectorStatus(
  env: Record<string, string | undefined>,
): IntegrationConnectorStatus {
  if (!env.ROGUENT_X_WEBHOOK_SECRET?.trim()) {
    return blockedStatus(
      "missing_webhook_secret",
      "X webhook secret is required",
    );
  }
  const entitlementBlocker = env.ROGUENT_X_ENTITLEMENT_BLOCKER?.trim();
  if (entitlementBlocker) {
    return blockedStatus("entitlement_blocked", entitlementBlocker);
  }
  return {
    id: "x",
    channel: "x",
    state: "disconnected",
    label: "X webhooks",
    metadata: {
      mode: "webhook",
      status: "configured",
    },
  };
}

function blockedStatus(
  reason: string,
  message: string,
): IntegrationConnectorStatus {
  return {
    id: "x",
    channel: "x",
    state: "blocked",
    label: "X webhooks",
    error: message,
    metadata: {
      reason,
    },
  };
}

function inferXEventName(payload: Record<string, unknown>): string {
  if (arrayField(payload, "tweet_create_events").length > 0) {
    return "tweet_create_events";
  }
  if (arrayField(payload, "direct_message_events").length > 0) {
    return "direct_message_events";
  }
  if (arrayField(payload, "favorite_events").length > 0) {
    return "favorite_events";
  }
  return stringField(payload, "eventName") ?? "x_event";
}

function primaryXObject(
  payload: Record<string, unknown>,
  eventName: string,
): Record<string, unknown> {
  const event = arrayField(payload, eventName)[0];
  if (event && typeof event === "object" && !Array.isArray(event)) {
    return event as Record<string, unknown>;
  }
  return payload;
}

function xSummary(
  eventName: string,
  primary: Record<string, unknown>,
  actor: string | undefined,
): string {
  if (eventName === "tweet_create_events") {
    return actor ? `tweet from ${actor}` : "tweet_create_events";
  }
  if (eventName === "direct_message_events") {
    return actor ? `direct message from ${actor}` : "direct_message_events";
  }
  if (eventName === "favorite_events") {
    return actor ? `favorite from ${actor}` : "favorite_events";
  }
  return eventName;
}

function xSourceUrl(primary: Record<string, unknown>): string | undefined {
  const id = stringField(primary, "id_str") ?? stringField(primary, "id");
  const actor = xActor(primary)?.replace(/^@/, "");
  if (id && actor) return `https://x.com/${actor}/status/${id}`;
  return stringField(primary, "expanded_url") ?? stringField(primary, "url");
}

function xActor(primary: Record<string, unknown>): string | undefined {
  const user = objectField(primary, "user");
  const screenName =
    stringField(user, "screen_name") ??
    stringField(primary, "screen_name") ??
    stringField(primary, "sender_screen_name");
  return screenName ? `@${screenName.replace(/^@/, "")}` : undefined;
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
