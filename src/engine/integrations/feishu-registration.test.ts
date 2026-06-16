import { expect, test } from "bun:test";
import {
  encodeForm,
  pollRegistration,
  startRegistration,
} from "./feishu-registration";

const FEISHU_BASE = "https://accounts.feishu.cn";
const LARK_BASE = "https://accounts.larksuite.com";
const REGISTRATION_PATH = "/oauth/v1/app/registration";

interface RecordedCall {
  url: string;
  method: string;
  contentType: string;
  form: URLSearchParams;
}

/**
 * A scripted fetch double for the device-code registration endpoint. Queue one
 * response per call; records the form-encoded body so tests can assert the
 * exact `action`/`device_code` we POST. Throws on an empty queue so tests fail
 * loudly instead of hanging.
 */
class ScriptedFetch {
  readonly calls: RecordedCall[] = [];
  private readonly responses: unknown[] = [];

  queue(...responses: unknown[]): this {
    this.responses.push(...responses);
    return this;
  }

  readonly fetch: typeof fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = init?.headers as Record<string, string> | undefined;
    const bodyText = init?.body ? String(init.body) : "";
    this.calls.push({
      url,
      method: init?.method ?? "GET",
      contentType: headers?.["Content-Type"] ?? "",
      form: new URLSearchParams(bodyText),
    });
    if (this.responses.length === 0) {
      throw new Error(`ScriptedFetch: no queued response for ${url}`);
    }
    const next = this.responses.shift();
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

// --- encodeForm ---------------------------------------------------------------

test("encodeForm produces application/x-www-form-urlencoded pairs", () => {
  const encoded = encodeForm({ action: "begin", archetype: "PersonalAgent" });
  const params = new URLSearchParams(encoded);
  expect(params.get("action")).toBe("begin");
  expect(params.get("archetype")).toBe("PersonalAgent");
});

// --- startRegistration --------------------------------------------------------

test("startRegistration POSTs begin to accounts.feishu.cn and returns the QR url", async () => {
  const scripted = new ScriptedFetch().queue({
    verification_uri_complete: "https://applink.feishu.cn/client/qrlogin/x",
    device_code: "dev-code-123",
    user_code: "USER-1",
    interval: 5,
    expire_in: 300,
  });

  const result = await startRegistration({ fetchImpl: scripted.fetch });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  expect(result.url).toBe("https://applink.feishu.cn/client/qrlogin/x");
  expect(result.deviceCode).toBe("dev-code-123");
  expect(result.userCode).toBe("USER-1");
  expect(result.interval).toBe(5);
  expect(result.expireIn).toBe(300);
  expect(result.domain).toBe("feishu");

  // Always begins on the feishu accounts base, even for lark callers.
  const [call] = scripted.calls;
  expect(call?.url).toBe(`${FEISHU_BASE}${REGISTRATION_PATH}`);
  expect(call?.method).toBe("POST");
  expect(call?.contentType).toContain("application/x-www-form-urlencoded");
  expect(call?.form.get("action")).toBe("begin");
  expect(call?.form.get("archetype")).toBe("PersonalAgent");
  expect(call?.form.get("auth_method")).toBe("client_secret");
  expect(call?.form.get("request_user_info")).toBe("open_id tenant_brand");
});

test("startRegistration begins on feishu even when isLark is true", async () => {
  const scripted = new ScriptedFetch().queue({
    verification_uri_complete: "https://applink.larksuite.com/client/x",
    device_code: "lark-dev",
    user_code: "LARK-1",
  });

  const result = await startRegistration({
    isLark: true,
    fetchImpl: scripted.fetch,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  // domain we will END on follows isLark, begin still hits feishu base.
  expect(result.domain).toBe("lark");
  expect(scripted.calls[0]?.url).toBe(`${FEISHU_BASE}${REGISTRATION_PATH}`);
  // interval/expireIn fall back to protocol defaults when omitted.
  expect(result.interval).toBe(5);
  expect(result.expireIn).toBe(300);
});

test("startRegistration reports a failure when the begin response has no device_code", async () => {
  const scripted = new ScriptedFetch().queue({
    error: "invalid_request",
    error_description: "bad archetype",
  });

  const result = await startRegistration({ fetchImpl: scripted.fetch });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected failure");
  expect(result.message).toContain("bad archetype");
});

// --- pollRegistration ---------------------------------------------------------

test("pollRegistration treats authorization_pending as not-done/pending", async () => {
  const scripted = new ScriptedFetch().queue({
    error: "authorization_pending",
  });

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(false);
  if (result.done) throw new Error("expected pending");
  expect(result.pending).toBe(true);

  const [call] = scripted.calls;
  expect(call?.url).toBe(`${FEISHU_BASE}${REGISTRATION_PATH}`);
  expect(call?.form.get("action")).toBe("poll");
  expect(call?.form.get("device_code")).toBe("dev-code-123");
});

test("pollRegistration treats slow_down as not-done/pending", async () => {
  const scripted = new ScriptedFetch().queue({ error: "slow_down" });

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(false);
  if (result.done) throw new Error("expected pending");
  expect(result.pending).toBe(true);
});

test("pollRegistration switches to lark when tenant_brand is lark without a secret yet", async () => {
  const scripted = new ScriptedFetch().queue({
    user_info: { tenant_brand: "lark" },
  });

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(false);
  if (result.done) throw new Error("expected switch");
  expect(result.switchTo).toBe("lark");
  // It polled the feishu base for this turn.
  expect(scripted.calls[0]?.url).toBe(`${FEISHU_BASE}${REGISTRATION_PATH}`);
});

test("pollRegistration polls the lark base once the domain is lark", async () => {
  const scripted = new ScriptedFetch().queue({
    error: "authorization_pending",
  });

  const result = await pollRegistration("dev-code-123", "lark", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(false);
  expect(scripted.calls[0]?.url).toBe(`${LARK_BASE}${REGISTRATION_PATH}`);
});

test("pollRegistration returns appId/appSecret on success", async () => {
  const scripted = new ScriptedFetch().queue({
    client_id: "cli_app_id_999",
    client_secret: "secret_888",
    user_info: { tenant_brand: "lark", open_id: "ou_x" },
  });

  const result = await pollRegistration("dev-code-123", "lark", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(true);
  if (!result.done) throw new Error("expected success");
  expect(result.appId).toBe("cli_app_id_999");
  expect(result.appSecret).toBe("secret_888");
  expect(result.domain).toBe("lark");
});

test("pollRegistration does NOT switch when tenant_brand is lark but a secret is already present", async () => {
  // Edge: success payload carries tenant_brand lark; we must take the success
  // branch, not loop forever asking to switch.
  const scripted = new ScriptedFetch().queue({
    client_id: "cli_app_id_111",
    client_secret: "secret_222",
    user_info: { tenant_brand: "lark" },
  });

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(true);
  if (!result.done) throw new Error("expected success");
  expect(result.appId).toBe("cli_app_id_111");
  // domain reflects where the secret was finally minted.
  expect(result.domain).toBe("feishu");
});

test("pollRegistration surfaces an unexpected error verbatim", async () => {
  const scripted = new ScriptedFetch().queue({
    error: "access_denied",
    error_description: "user rejected",
  });

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl: scripted.fetch,
  });

  expect(result.done).toBe(false);
  if (result.done) throw new Error("expected error");
  expect(result.pending).toBeUndefined();
  expect(result.error).toContain("user rejected");
});

test("pollRegistration tolerates a non-JSON body and surfaces an error", async () => {
  const fetchImpl = (async () =>
    new Response("<html>gateway error</html>", {
      status: 502,
    })) as unknown as typeof fetch;

  const result = await pollRegistration("dev-code-123", "feishu", {
    fetchImpl,
  });

  expect(result.done).toBe(false);
  if (result.done) throw new Error("expected error");
  expect(typeof result.error).toBe("string");
});
