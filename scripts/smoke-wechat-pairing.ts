import {
  WeChatConnector,
  WeChatConnectorError,
} from "../src/engine/integrations/wechat";

type SmokeResult = {
  target: "wechat-pairing";
  status: "passed" | "blocked";
  qrUrl?: string;
  blockers: string[];
  blockerCodes?: string[];
  node22FallbackRecommended?: boolean;
};

const timeoutMs = Number(Bun.env.ROGUENT_WECHAT_SMOKE_TIMEOUT_MS ?? 15_000);
const connector = new WeChatConnector();

const result = await Promise.race<SmokeResult>([
  connector
    .startPairing("smoke-wechat")
    .then((qr) => ({
      target: "wechat-pairing" as const,
      status: "passed" as const,
      qrUrl: qr.url,
      blockers: [],
    }))
    .catch((error: unknown) => ({
      target: "wechat-pairing" as const,
      status: "blocked" as const,
      blockers: [error instanceof Error ? error.message : String(error)],
      ...(error instanceof WeChatConnectorError
        ? {
            blockerCodes: [error.code],
            node22FallbackRecommended: error.code === "wechat_bun_incompatible",
          }
        : {}),
    })),
  new Promise<SmokeResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          target: "wechat-pairing",
          status: "blocked",
          blockers: [`Timed out waiting for QR after ${timeoutMs}ms`],
        }),
      timeoutMs,
    ),
  ),
]);

await connector.stopPairing("smoke-wechat");
console.log(JSON.stringify(result, null, 2));
process.exit(0);
