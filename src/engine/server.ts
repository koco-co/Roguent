import { WebSocketServer } from "ws";
import type { RoguentSettings } from "../shared/events";
import { readOauthCredentials } from "./credentials";
import { cliPathFromEnv } from "./driver";
import { wireEconomyServices } from "./economy/wiring";
import { resolveIngressPort, startIngressServer } from "./ingress/server";
import { startLiveIntegrations } from "./integrations/live";
import { createMailboxService } from "./mailbox/service";
import { openDatabase, resolveDatabasePath } from "./persistence/db";
import { migrate } from "./persistence/migrations";
import { claudeConfigDir } from "./plugins/paths";
import { createPluginsService } from "./plugins/service";
import { resolvePort } from "./port";
import { replayTimed } from "./record";
import { loadAnyFixture } from "./replay/prototype-fixtures";
import { createSchedulerRunner } from "./scheduler/runner";
import { createSchedulerService } from "./scheduler/service";
import { KeychainSecretStore } from "./secrets/keychain";
import { SessionManager } from "./session";
import { createSettingsService } from "./settings/service";
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
  // Real external connectors (WeChat/Feishu/GitHub/X) and runtime spawning are
  // NOT started — only the WebSocket server + fixture loader run.
  const wss = new WebSocketServer({ port });
  wss.on("listening", () => {
    const addr = wss.address();
    if (addr && typeof addr === "object") console.log(`PORT=${addr.port}`);
  });
  console.log(`[server] REPLAY ${replayFixture}`);
  wss.on("connection", async (ws) => {
    // loadAnyFixture auto-detects the fixture format:
    //   - ReplayRecord JSONL (atMs + kind)  → validated, converted to RoomEvents
    //   - CodexRuntimeEvent JSONL (kind)    → normalized via codex-normalize
    //   - Legacy RoomEvent JSONL (seq+type) → loaded as-is (old path preserved)
    const events = await loadAnyFixture(replayFixture, "replay");
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
  const secretStore = new KeychainSecretStore();
  const mgr = new SessionManager(undefined, process.cwd(), { auditDb: db });
  const scheduler = createSchedulerService(db);
  const settingsService = createSettingsService(db, secretStore);
  const pluginsService = createPluginsService({
    configDir: claudeConfigDir(),
    // dev 回落 PATH 上的 claude(可能与 SDK 内置 CLI 版本不同);Tauri 下走 ROGUENT_CLI_PATH。
    cliPath: cliPathFromEnv(process.env) ?? "claude",
  });
  // 真实宝石经济:账本 + 扭蛋 + 成就,接同一个生产 DB。
  // wireEconomyServices 会一次性发放 welcome_bonus(幂等,重启不重复发),
  // 让新用户真有宝石可花;成就奖励(claim → 账本入账)是第二个真实宝石来源。
  const economy = wireEconomyServices(db);
  const integrations = startLiveIntegrations({
    db,
    secretStore,
    sessions: mgr,
  });
  let activeGithubWebhookSecretRef: string | null = null;
  void settingsService
    .load("user")
    .then((settings) => {
      if (!settings) return undefined;
      activeGithubWebhookSecretRef =
        githubWebhookSecretRefFromSettings(settings);
      return integrations.applySubscriptionSettings(settings);
    })
    .catch((error) => {
      console.warn(
        "[server] saved subscription settings apply failed:",
        error instanceof Error ? error.message : String(error),
      );
    });
  const gateway = new WsGateway(port, mgr, (p) => console.log(`PORT=${p}`), {
    mailbox: createMailboxService(db),
    scheduler,
    settings: settingsService,
    onSettingsUpdated(payload) {
      activeGithubWebhookSecretRef = githubWebhookSecretRefFromSettings(
        payload.settings,
      );
      return integrations.applySubscriptionSettings(payload.settings);
    },
    plugins: pluginsService,
    pairing: integrations.pairing,
    // 单条转发到配对 IM(D-b):把 mailbox item 正文经配对连接器 sendMessage 转发。
    forward: {
      forward: (channel, externalChatId, text) =>
        integrations.forwardToIm(channel, externalChatId, text),
    },
    // 宝石经济上线:扭蛋(purchaseItem)+ 成就(claimAchievement / 运行时进度)。
    // initialPullSeq 用 null-session 账本条目数,扭蛋种子重启后仍唯一。
    gacha: economy.gacha,
    achievements: economy.achievements,
    initialPullSeq: economy.initialPullSeq,
    // 新连入的客户端按连接私发账本 + 成就快照(非广播),
    // 让真实宝石余额立刻可见,而不是等到有新活动才从 0 跳起。
    economy: {
      ledgerEntries: () => economy.ledger.entries(null),
      achievements: () => economy.achievements.list(),
    },
  });
  const schedulerRunner = createSchedulerRunner({ db, sessions: mgr });
  schedulerRunner.start();
  const ingressPort = resolveIngressPort(process.env);
  if (ingressPort !== null && ingressPort === port && port !== 0) {
    console.warn(
      `[server] ingress disabled: ROGUENT_INGRESS_PORT=${ingressPort} conflicts with ROGUENT_PORT`,
    );
  } else {
    const ingress = startIngressServer({
      db,
      githubWebhookSecretRef: () => activeGithubWebhookSecretRef,
      port: ingressPort,
      router: integrations.router,
      secretStore,
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
  // 启动即读一次真实插件目录并广播(连入的客户端经 lastPlugins 重放)。
  gateway.pushPlugins(pluginsService.snapshot(), []);
  console.log("[server] LIVE");
}

function githubWebhookSecretRefFromSettings(
  settings: RoguentSettings,
): string | null {
  const value = settings.integrations?.github?.metadata?.webhookSecret;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = (value as { secretRef?: unknown }).secretRef;
  return typeof ref === "string" && ref.trim() ? ref.trim() : null;
}
