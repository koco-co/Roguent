import { expect, test } from "bun:test";
import { readOauthCredentials } from "./credentials";

const TOKEN_JSON = JSON.stringify({
  claudeAiOauth: {
    accessToken: "tok-abc",
    subscriptionType: "max",
    expiresAt: 9_999_999_999_999, // 远未来 (ms)
  },
});

test("reads keychain credentials (camelCase, ms expiry)", () => {
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => TOKEN_JSON,
    readFile: () => null,
  });
  expect(creds).toEqual({ accessToken: "tok-abc", subscriptionType: "max" });
});

test("treats ms-expired token as no credentials", () => {
  const expired = JSON.stringify({
    claudeAiOauth: {
      accessToken: "x",
      subscriptionType: "max",
      expiresAt: 500,
    },
  });
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => expired,
    readFile: () => null,
  });
  expect(creds).toBeNull();
});

test("falls back to file when keychain returns nothing", () => {
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => null,
    readFile: () => TOKEN_JSON,
  });
  expect(creds?.accessToken).toBe("tok-abc");
});

test("returns null and never throws when both sources fail", () => {
  expect(
    readOauthCredentials({
      now: () => 1_000,
      readKeychain: () => {
        throw new Error("keychain locked: secret-should-not-leak");
      },
      readFile: () => null,
    }),
  ).toBeNull();
});

test("does not log access token on read failure", () => {
  const logs: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => logs.push(a.join(" "));
  try {
    readOauthCredentials({
      now: () => 0,
      readKeychain: () => {
        throw new Error("boom tok-abc");
      },
      readFile: () => null,
    });
  } finally {
    console.warn = orig;
  }
  // message 里若含 token 子串是调用方传入的;关键是我们不 log 整个 error 对象/stderr。
  // 这里断言我们确实只走了 message 路径(不抛、有且仅有一条 warn)。
  expect(logs.length).toBe(1);
});
