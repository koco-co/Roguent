import { execFile } from "node:child_process";
import type { PluginsCommand } from "../../shared/commands";
import type { PluginEntry, PluginsMessage } from "../../shared/events";
import { readPluginCatalog } from "./catalog";

export type PluginRun = (
  cli: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<{ code: number; stderr: string }>;

const defaultRun: PluginRun = (cli, args, env) =>
  new Promise((resolve) => {
    execFile(
      cli,
      args,
      { env, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stderr: stderr?.toString() ?? err?.message ?? "" });
      },
    );
  });

export interface PluginsService {
  snapshot(): PluginEntry[];
  runAction(
    action: PluginsCommand["action"],
    pluginId: string,
  ): Promise<PluginEntry[]>;
}

export function createPluginsService(opts: {
  configDir: string;
  cliPath: string;
  env?: NodeJS.ProcessEnv;
  run?: PluginRun;
}): PluginsService {
  const run = opts.run ?? defaultRun;
  const env = opts.env ?? process.env;
  const snapshot = () => readPluginCatalog({ configDir: opts.configDir });

  // 串行链:任一时刻只跑一个 mutation(并发写 settings/installed 会坏账)。
  let chain: Promise<unknown> = Promise.resolve();

  const runAction = (
    action: PluginsCommand["action"],
    pluginId: string,
  ): Promise<PluginEntry[]> => {
    const task = chain.then(async () => {
      if (!snapshot().some((p) => p.id === pluginId)) {
        throw new Error(`Unknown plugin: ${pluginId}`);
      }
      const args =
        action === "uninstall"
          ? ["plugin", "uninstall", pluginId]
          : ["plugin", action, pluginId, "--scope", "user"];
      const { code, stderr } = await run(opts.cliPath, args, env);
      if (code !== 0) {
        throw new Error(
          `claude plugin ${action} failed (${code}): ${stderr}`.trim(),
        );
      }
      return snapshot();
    });
    // 链保活:无论成败都让下一个排队任务能继续。
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  return { snapshot, runAction };
}

// 供 gateway 拼初始/广播消息的便捷构造(可选)。
export function pluginsMessage(
  plugins: PluginEntry[],
  busy: PluginsMessage["busy"],
  ts: number,
): PluginsMessage {
  return { kind: "plugins", ts, plugins, busy };
}
