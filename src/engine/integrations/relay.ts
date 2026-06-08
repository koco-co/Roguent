import type {
  IntegrationChannel,
  IntegrationConnectorStatus,
} from "../../shared/integrations";
import type { SecretStore } from "../secrets/types";

export const DEFAULT_RELAY_TOKEN_REF = "secret:relay:token";

export type RelayChannel = Extract<
  IntegrationChannel,
  "github" | "x" | "feishu"
>;

export interface RelayEnvelope {
  channel: RelayChannel;
  headers: Record<string, string>;
  rawBodyBase64: string;
}

export type ParsedRelayEnvelope =
  | {
      ok: true;
      envelope: RelayEnvelope;
      rawBody: Uint8Array;
    }
  | {
      ok: false;
      reason: "invalid_channel" | "invalid_headers" | "invalid_raw_body_base64";
    };

export async function storeRelayToken(
  secretStore: SecretStore,
  value: string,
  ref = DEFAULT_RELAY_TOKEN_REF,
): Promise<{ ref: string; source: "secret-store" }> {
  const token = value.trim();
  if (!token) throw new Error("Relay token must not be empty");
  await secretStore.put(ref, token);
  return { ref, source: "secret-store" };
}

export async function resolveRelayToken(
  env: Record<string, string | undefined>,
  secretStore?: SecretStore,
): Promise<string | undefined> {
  const ref = env.ROGUENT_RELAY_TOKEN_REF?.trim();
  if (ref) return secretStore?.get(ref);
  const direct = env.ROGUENT_RELAY_TOKEN?.trim();
  return direct || undefined;
}

export async function relayConnectorStatus(
  env: Record<string, string | undefined>,
  secretStore?: SecretStore,
): Promise<IntegrationConnectorStatus> {
  const blocker = env.ROGUENT_RELAY_BLOCKED_REASON?.trim();
  if (blocker) {
    return {
      id: "relay",
      channel: "relay",
      state: "blocked",
      label: "Relay tunnel",
      error: blocker,
      metadata: { reason: "blocked" },
    };
  }

  const token = await resolveRelayToken(env, secretStore);
  if (!token) {
    return {
      id: "relay",
      channel: "relay",
      state: "disconnected",
      label: "Relay tunnel",
      metadata: { reason: "missing_token" },
    };
  }

  const relayUrl = env.ROGUENT_RELAY_URL?.trim();
  const connectedFlag = env.ROGUENT_RELAY_CONNECTED?.trim().toLowerCase();
  const connected =
    Boolean(relayUrl) || connectedFlag === "1" || connectedFlag === "true";
  return {
    id: "relay",
    channel: "relay",
    state: connected ? "connected" : "disconnected",
    label: "Relay tunnel",
    metadata: {
      mode: relayUrl ? "relay" : "local-tunnel",
      status: "configured",
      url: relayUrl,
    },
  };
}

export function parseRelayEnvelope(
  value: Record<string, unknown>,
): ParsedRelayEnvelope {
  const channel = value.channel;
  if (channel !== "github" && channel !== "x" && channel !== "feishu") {
    return { ok: false, reason: "invalid_channel" };
  }

  const headers = parseHeaders(value.headers);
  if (!headers) return { ok: false, reason: "invalid_headers" };

  const rawBodyBase64 = value.rawBodyBase64;
  if (typeof rawBodyBase64 !== "string") {
    return { ok: false, reason: "invalid_raw_body_base64" };
  }
  const rawBody = decodeBase64(rawBodyBase64);
  if (!rawBody) return { ok: false, reason: "invalid_raw_body_base64" };

  return {
    ok: true,
    envelope: { channel, headers, rawBodyBase64 },
    rawBody,
  };
}

export function relayEnvelopeToRequest(
  envelope: RelayEnvelope,
  rawBody: Uint8Array,
  url = `http://relay.local/webhooks/${envelope.channel}`,
): Request {
  return new Request(url, {
    body: Buffer.from(rawBody),
    headers: envelope.headers,
    method: "POST",
  });
}

function parseHeaders(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") return null;
    if (!isValidHeader(key, headerValue)) return null;
    headers[key] = headerValue;
  }
  return headers;
}

function isValidHeader(key: string, value: string): boolean {
  try {
    new Headers([[key, value]]);
    return true;
  } catch {
    return false;
  }
}

function decodeBase64(value: string): Uint8Array | null {
  const compact = value.trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  if (compact.length % 4 === 1) return null;
  const rawBody = Buffer.from(compact, "base64");
  const normalizedInput = compact.replace(/=+$/, "");
  const normalizedOutput = rawBody.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedOutput) return null;
  return rawBody;
}
