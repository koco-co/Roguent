import {
  WeChatNodeHostConnector,
  parseNodeMajorVersion,
} from "../src/engine/integrations/wechat-node-host";

type SmokeResult = {
  target: "wechat-node-host";
  status: "passed" | "blocked";
  nodeVersion?: string;
  qrUrl?: string;
  blockers: string[];
};

const nodeVersion =
  Bun.spawnSync(["node", "--version"]).stdout.toString().trim() || undefined;
const nodeMajor = nodeVersion ? parseNodeMajorVersion(nodeVersion) : null;
const timeoutMs = Number(Bun.env.ROGUENT_WECHAT_SMOKE_TIMEOUT_MS ?? 15_000);

if (nodeMajor === null || nodeMajor < 22) {
  console.log(
    JSON.stringify(
      {
        target: "wechat-node-host",
        status: "blocked",
        nodeVersion,
        blockers: [
          nodeMajor === null
            ? "Node.js unavailable"
            : `Node.js >=22 required, got ${nodeVersion}`,
        ],
      } satisfies SmokeResult,
      null,
      2,
    ),
  );
  process.exit(0);
}

const connector = new WeChatNodeHostConnector({ nodeVersion });

const result = await Promise.race<SmokeResult>([
  connector
    .startPairing("smoke-wechat-node-host")
    .then((qr) => ({
      target: "wechat-node-host" as const,
      status: "passed" as const,
      nodeVersion,
      qrUrl: qr.url,
      blockers: [],
    }))
    .catch((error: unknown) => ({
      target: "wechat-node-host" as const,
      status: "blocked" as const,
      nodeVersion,
      blockers: [error instanceof Error ? error.message : String(error)],
    })),
  new Promise<SmokeResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          target: "wechat-node-host",
          status: "blocked",
          nodeVersion,
          blockers: [`Timed out waiting for QR after ${timeoutMs}ms`],
        }),
      timeoutMs,
    ),
  ),
]);

await connector.close();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
