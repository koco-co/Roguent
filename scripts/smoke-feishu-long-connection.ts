import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FeishuConnector } from "../src/engine/integrations/feishu";
import { KeychainSecretStore } from "../src/engine/secrets/keychain";

type SmokeResult = {
  target: "feishu-long-connection";
  status: "passed" | "blocked";
  blockers: string[];
  artifacts: string[];
};

const appIdSecretRef = Bun.env.ROGUENT_FEISHU_APP_ID_SECRET_REF;
const appSecretSecretRef = Bun.env.ROGUENT_FEISHU_APP_SECRET_SECRET_REF;
const timeoutMs = Number(Bun.env.ROGUENT_FEISHU_SMOKE_TIMEOUT_MS ?? 15_000);
const statuses: unknown[] = [];

if (!appIdSecretRef || !appSecretSecretRef) {
  printWithArtifact({
    target: "feishu-long-connection",
    status: "blocked",
    blockers: [
      "ROGUENT_FEISHU_APP_ID_SECRET_REF and ROGUENT_FEISHU_APP_SECRET_SECRET_REF are required",
    ],
    artifacts: [],
  });
}

const connector = new FeishuConnector({
  config: {
    appIdSecretRef,
    appSecretRef: appSecretSecretRef,
  },
  secretStore: new KeychainSecretStore(),
});
connector.onEvent((event) => {
  if (event.type === "status") statuses.push(event.status);
});

const result = await Promise.race<SmokeResult>([
  connector
    .start()
    .then(() => ({
      target: "feishu-long-connection" as const,
      status: "passed" as const,
      blockers: [],
      artifacts: [],
    }))
    .catch((error: unknown) => ({
      target: "feishu-long-connection" as const,
      status: "blocked" as const,
      blockers: [error instanceof Error ? error.message : String(error)],
      artifacts: [],
    })),
  new Promise<SmokeResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          target: "feishu-long-connection",
          status: "blocked",
          blockers: [
            `Timed out waiting for long connection after ${timeoutMs}ms`,
          ],
          artifacts: [],
        }),
      timeoutMs,
    ),
  ),
]);

await connector.stop();
printWithArtifact(result);

function printWithArtifact(result: SmokeResult): never {
  const artifact = writeArtifact(result);
  const withArtifact: SmokeResult = {
    ...result,
    artifacts: [...result.artifacts, artifact],
  };
  console.log(JSON.stringify(withArtifact, null, 2));
  process.exit(0);
}

function writeArtifact(result: SmokeResult): string {
  mkdirSync("test-results", { recursive: true });
  const path = resolve(
    "test-results",
    `feishu-long-connection-${Date.now()}.json`,
  );
  writeFileSync(
    path,
    JSON.stringify(
      {
        result,
        statuses,
        env: {
          hasAppIdSecretRef: Boolean(appIdSecretRef),
          hasAppSecretSecretRef: Boolean(appSecretSecretRef),
        },
      },
      null,
      2,
    ),
  );
  return path;
}
