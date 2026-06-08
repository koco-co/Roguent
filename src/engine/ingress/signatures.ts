import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, rawBody: Uint8Array): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function hmacSha256Base64(secret: string, rawBody: Uint8Array): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function timingSafeEqualText(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyGitHubSignature(
  rawBody: Uint8Array,
  secret: string,
  header: string | null | undefined,
): boolean {
  if (!secret.trim() || !header) return false;
  const expected = `sha256=${hmacSha256Hex(secret, rawBody)}`;
  return timingSafeEqualText(expected, header.trim());
}

export function verifyHmacBase64Signature(
  rawBody: Uint8Array,
  secret: string,
  header: string | null | undefined,
): boolean {
  if (!secret.trim() || !header) return false;
  const expected = `sha256=${hmacSha256Base64(secret, rawBody)}`;
  return timingSafeEqualText(expected, header.trim());
}

export function xCrcResponseToken(secret: string, crcToken: string): string {
  return `sha256=${hmacSha256Base64(secret, Buffer.from(crcToken))}`;
}

export function buildXChallengeResponse(
  crcToken: string,
  consumerSecret: string,
): { response_token: string } {
  return { response_token: xCrcResponseToken(consumerSecret, crcToken) };
}

export function verifyXWebhookSignature(
  rawBody: Uint8Array,
  consumerSecret: string,
  header: string | null | undefined,
): boolean {
  return verifyHmacBase64Signature(rawBody, consumerSecret, header);
}
