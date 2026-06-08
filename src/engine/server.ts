import { WebSocketServer } from "ws";
import { readOauthCredentials } from "./credentials";
import { resolveIngressPort, startIngressServer } from "./ingress/server";
import { startLiveIntegrations } from "./integrations/live";
import { openDatabase, resolveDatabasePath } from "./persistence/db";
import { migrate } from "./persistence/migrations";
import { resolvePort } from "./port";
import { loadFixture, replayTimed } from "./record";
import { KeychainSecretStore } from "./secrets/keychain";
import { SessionManager } from "./session";
import { UsagePoller, defaultFetchUsage } from "./usage-poller";
import { WsGateway } from "./ws-gateway";

const port = resolvePort(process.env);
const replayArg = process.argv.indexOf("--replay");
// 回放 fixture 既可走 `--replay <path>`,也可走 env ROGUENT_REPLAY(便于 Tauri host 透传)。
const replayFixture =
  replayArg !== -1 ? process.argv[replayArg + 1] : process.env.ROGUENT_REPLAY;

if (replayArg !== -1 && !process.argv[replayArg + 1]) {
  throw new Error("--replay requires a fixture path argument");
}

if (replayFixture) {
  // Cost-free demo: replay a fixture to every client, ignore commands.
  const wss = new WebSocketServer({ port });
  wss.on("listening", () => {
    const addr = wss.address();
    if (addr && typeof addr === "object") console.log(`PORT=${addr.port}`);
  });
  console.log(`[server] REPLAY ${replayFixture}`);
  wss.on("connection", async (ws) => {
    const events = await loadFixture(replayFixture);
    await replayTimed(
      events,
      (e) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
      },
      1,
    );
  });
} else {
  const db = openDatabase(resolveDatabasePath());
  migrate(db);
  const mgr = new SessionManager(undefined, process.cwd(), { auditDb: db });
  const gateway = new WsGateway(port, mgr, (p) => console.log(`PORT=${p}`));
  const integrations = startLiveIntegrations({ db, sessions: mgr });
  const ingressPort = resolveIngressPort(process.env);
  if (ingressPort !== null && ingressPort === port && port !== 0) {
    console.warn(
      `[server] ingress disabled: ROGUENT_INGRESS_PORT=${ingressPort} conflicts with ROGUENT_PORT`,
    );
  } else {
    const ingress = startIngressServer({
      db,
      port: ingressPort,
      router: integrations.router,
      secretStore: new KeychainSecretStore(),
    });
    if (ingress) console.log(`INGRESS_PORT=${ingress.port}`);
  }
  // 限额两源都汇进 SessionManager 的 LimitsAggregator,合并后由它推 gateway:
  //   1) keychain 轮询 /api/oauth/usage(权威源、两窗口完整快照 + 唯一 planName 源)
  //      —— poller → applyPollLimits;和 claude-hud 同源同语义。
  //   2) SDK rate_limit_event(仅兜底:poll 未认领的窗口才用)—— driver → aggregator(见 session.ts)。
  // poll 一旦认领某窗口即锁定权威值,SDK 不再覆盖;受限环境读不到 keychain 时才退化到 SDK。
  mgr.subscribeLimits((limits) => gateway.pushLimits(limits));
  const poller = new UsagePoller({
    readCredentials: () => readOauthCredentials(),
    fetchUsage: defaultFetchUsage,
    onLimits: (limits) => mgr.applyPollLimits(limits),
    baseUrl:
      process.env.ANTHROPIC_BASE_URL ??
      process.env.ANTHROPIC_API_BASE_URL ??
      "",
  });
  // 进程级 5 分钟轮询,随引擎生命周期常驻;无需显式 stop()(进程退出即止)。
  poller.start();
  console.log("[server] LIVE");
}
