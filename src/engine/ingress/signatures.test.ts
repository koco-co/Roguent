import { expect, test } from "bun:test";
import {
  hmacSha256Base64,
  hmacSha256Hex,
  timingSafeEqualText,
  verifyGitHubSignature,
  verifyHmacBase64Signature,
  xCrcResponseToken,
} from "./signatures";

test("verifyGitHubSignature accepts matching sha256 HMAC", () => {
  const rawBody = Buffer.from('{"zen":"Keep it logically awesome."}');
  const signature = `sha256=${hmacSha256Hex("hook-secret", rawBody)}`;

  expect(verifyGitHubSignature(rawBody, "hook-secret", signature)).toBe(true);
  expect(verifyGitHubSignature(rawBody, "wrong-secret", signature)).toBe(false);
});

test("verifyGitHubSignature rejects missing, malformed, and wrong-length headers", () => {
  const rawBody = Buffer.from("{}");
  const signature = `sha256=${hmacSha256Hex("hook-secret", rawBody)}`;

  expect(verifyGitHubSignature(rawBody, "hook-secret", null)).toBe(false);
  expect(verifyGitHubSignature(rawBody, "hook-secret", "sha1=abc")).toBe(false);
  expect(verifyGitHubSignature(rawBody, "hook-secret", `${signature}00`)).toBe(
    false,
  );
});

test("timingSafeEqualText returns false instead of throwing on length mismatch", () => {
  expect(timingSafeEqualText("abc", "abcd")).toBe(false);
});

test("verifyHmacBase64Signature and X CRC token use sha256 base64", () => {
  const rawBody = Buffer.from('{"tweet_create_events":[]}');
  const signature = `sha256=${hmacSha256Base64("consumer-secret", rawBody)}`;

  expect(verifyHmacBase64Signature(rawBody, "consumer-secret", signature)).toBe(
    true,
  );
  expect(xCrcResponseToken("consumer-secret", "crc-token")).toBe(
    `sha256=${hmacSha256Base64("consumer-secret", Buffer.from("crc-token"))}`,
  );
});
