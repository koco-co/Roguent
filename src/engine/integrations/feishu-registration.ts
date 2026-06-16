/**
 * Lean, standalone client for Feishu/Lark device-code app self-registration.
 *
 * This is the official accounts-domain flow (NO openclaw): a "PersonalAgent"
 * app is minted on the fly by walking a device-code grant, after which we hold
 * a `client_id` (appId) / `client_secret` (appSecret) pair good for bringing up
 * the Lark long connection.
 *
 * Protocol (verified against Kun's claw-platform-install device-code flow):
 *  - Endpoint: POST {base}/oauth/v1/app/registration, body form-encoded.
 *  - Bases: ALWAYS begin on accounts.feishu.cn — even for Lark, because minting
 *    on larksuite.com yields a rejected open.larksuite.com link. During poll, if
 *    the authenticated user's tenant_brand is "lark", switch the base to
 *    accounts.larksuite.com and keep polling there.
 *  - begin → { verification_uri_complete (QR url), device_code, user_code,
 *    interval (default 5), expire_in/expires_in (default 300) }.
 *  - poll → authorization_pending|slow_down keep polling; tenant_brand "lark"
 *    without a secret yet → switch to lark; client_id+client_secret → success.
 *
 * Designed for testability: `fetchImpl` and `now` are injected.
 */

export type RegistrationDomain = "feishu" | "lark";

const FEISHU_BASE = "https://accounts.feishu.cn";
const LARK_BASE = "https://accounts.larksuite.com";
const REGISTRATION_PATH = "/oauth/v1/app/registration";

const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_EXPIRE_SECONDS = 300;

const PENDING_ERRORS = new Set(["authorization_pending", "slow_down"]);

export interface FeishuRegistrationOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type StartRegistrationResult =
  | {
      ok: true;
      url: string;
      deviceCode: string;
      userCode: string;
      interval: number;
      expireIn: number;
      domain: RegistrationDomain;
    }
  | { ok: false; message: string };

export type PollRegistrationResult =
  | { done: true; appId: string; appSecret: string; domain: RegistrationDomain }
  | {
      done: false;
      pending?: true;
      switchTo?: "lark";
      error?: string;
    };

interface BeginResponse {
  verification_uri_complete?: string;
  device_code?: string;
  user_code?: string;
  interval?: number;
  expire_in?: number;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface PollResponse {
  client_id?: string;
  client_secret?: string;
  user_info?: {
    tenant_brand?: string;
    open_id?: string;
  };
  error?: string;
  error_description?: string;
}

/**
 * Encode a flat record as `application/x-www-form-urlencoded` (per the protocol,
 * the registration endpoint rejects JSON bodies).
 */
export function encodeForm(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, value);
  }
  return params.toString();
}

/**
 * POST `action=begin` to accounts.feishu.cn (always) and return the QR url plus
 * the device-code grant parameters. `isLark` does NOT change the begin base; it
 * only records which domain a Lark caller expects to END on, so the connector
 * can poll the right base after the user authenticates.
 */
export async function startRegistration(
  opts: FeishuRegistrationOptions & { isLark?: boolean } = {},
): Promise<StartRegistrationResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const domain: RegistrationDomain = opts.isLark ? "lark" : "feishu";

  let response: BeginResponse;
  try {
    response = await postForm<BeginResponse>(fetchImpl, FEISHU_BASE, {
      action: "begin",
      archetype: "PersonalAgent",
      auth_method: "client_secret",
      request_user_info: "open_id tenant_brand",
    });
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  const url = response.verification_uri_complete;
  const deviceCode = response.device_code;
  if (!url || !deviceCode) {
    return {
      ok: false,
      message:
        response.error_description ??
        response.error ??
        "Feishu registration did not return a device code",
    };
  }

  return {
    ok: true,
    url,
    deviceCode,
    userCode: response.user_code ?? "",
    interval: positiveOr(response.interval, DEFAULT_INTERVAL_SECONDS),
    expireIn: positiveOr(
      response.expire_in ?? response.expires_in,
      DEFAULT_EXPIRE_SECONDS,
    ),
    domain,
  };
}

/**
 * POST `action=poll` to the base matching `domain`. Maps the protocol's three
 * non-terminal cases (pending, switch-to-lark) and the success case; any other
 * error is surfaced verbatim.
 */
export async function pollRegistration(
  deviceCode: string,
  domain: RegistrationDomain,
  opts: FeishuRegistrationOptions = {},
): Promise<PollRegistrationResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = domain === "lark" ? LARK_BASE : FEISHU_BASE;

  let response: PollResponse;
  try {
    response = await postForm<PollResponse>(fetchImpl, base, {
      action: "poll",
      device_code: deviceCode,
    });
  } catch (error) {
    return { done: false, error: errorMessage(error) };
  }

  // Success: a freshly-minted client_id + client_secret.
  if (response.client_id && response.client_secret) {
    return {
      done: true,
      appId: response.client_id,
      appSecret: response.client_secret,
      domain,
    };
  }

  // Still waiting on the user to scan / confirm.
  if (response.error && PENDING_ERRORS.has(response.error)) {
    return { done: false, pending: true };
  }

  // Authenticated as a Lark tenant but no secret yet: re-mint on the Lark base.
  if (response.user_info?.tenant_brand === "lark" && domain !== "lark") {
    return { done: false, switchTo: "lark" };
  }

  // Any other error.
  if (response.error || response.error_description) {
    return {
      done: false,
      error: response.error_description ?? response.error,
    };
  }

  // No secret, no error, no recognizable signal: treat as still pending so the
  // caller keeps polling rather than failing on an empty intermediate body.
  return { done: false, pending: true };
}

// --- internals ----------------------------------------------------------------

async function postForm<T>(
  fetchImpl: typeof fetch,
  base: string,
  fields: Record<string, string>,
): Promise<T> {
  const res = await fetchImpl(`${base}${REGISTRATION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: encodeForm(fields),
  });
  return readJson<T>(res);
}

/**
 * Read a JSON response, tolerating a non-JSON body (gateway HTML, empty 5xx).
 * On a non-2xx status the parsed `error`/`error_description` is preferred; if the
 * body was not JSON we synthesize an error from the status.
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new Error(
        `Feishu registration ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    throw new Error("Feishu registration returned a non-JSON body");
  }
  return parsed as T;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
