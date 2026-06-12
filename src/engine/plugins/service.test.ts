import { expect, test } from "bun:test";
import { createPluginsService } from "./service";

const CFG = "tests/fixtures/plugins/cfg";

test("snapshot 复用 catalog", () => {
  const svc = createPluginsService({ configDir: CFG, cliPath: "claude" });
  expect(svc.snapshot().some((p) => p.id === "alpha-mcp@official")).toBe(true);
});

test("runAction 拼对 CLI 参数(install 带 --scope user)", async () => {
  const calls: { cli: string; args: string[] }[] = [];
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "/x/claude",
    run: async (cli, args) => {
      calls.push({ cli, args });
      return { code: 0, stderr: "" };
    },
  });
  await svc.runAction("install", "gamma-cmd@official");
  expect(calls[0]).toEqual({
    cli: "/x/claude",
    args: ["plugin", "install", "gamma-cmd@official", "--scope", "user"],
  });
});

test("uninstall 不带 --scope", async () => {
  const calls: string[][] = [];
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async (_cli, args) => {
      calls.push(args);
      return { code: 0, stderr: "" };
    },
  });
  await svc.runAction("uninstall", "alpha-mcp@official");
  expect(calls[0]).toEqual(["plugin", "uninstall", "alpha-mcp@official"]);
});

test("未知 pluginId 被拒(不调 CLI)", async () => {
  let ran = false;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => {
      ran = true;
      return { code: 0, stderr: "" };
    },
  });
  await expect(svc.runAction("enable", "nope@nowhere")).rejects.toThrow(
    /Unknown plugin/,
  );
  expect(ran).toBe(false);
});

test("CLI 非 0 退出 → 抛错带 stderr", async () => {
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => ({ code: 1, stderr: "boom" }),
  });
  await expect(svc.runAction("enable", "alpha-mcp@official")).rejects.toThrow(
    /boom/,
  );
});

test("并发 runAction 串行执行(不重叠)", async () => {
  let active = 0;
  let maxActive = 0;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { code: 0, stderr: "" };
    },
  });
  await Promise.all([
    svc.runAction("enable", "alpha-mcp@official"),
    svc.runAction("disable", "beta-skill@official"),
  ]);
  expect(maxActive).toBe(1);
});

test("链保活：第一个 runAction 失败后第二个仍执行并 resolve", async () => {
  let callCount = 0;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => {
      callCount++;
      if (callCount === 1) return { code: 1, stderr: "first fails" };
      return { code: 0, stderr: "" };
    },
  });
  const first = svc.runAction("enable", "alpha-mcp@official");
  const second = svc.runAction("disable", "beta-skill@official");
  await expect(first).rejects.toThrow(/first fails/);
  const result = await second;
  expect(Array.isArray(result)).toBe(true);
  expect(callCount).toBe(2);
});

test("run 收到的 env 包含 CLAUDE_CONFIG_DIR === configDir", async () => {
  let capturedEnv: NodeJS.ProcessEnv | undefined;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async (_cli, _args, env) => {
      capturedEnv = env;
      return { code: 0, stderr: "" };
    },
  });
  await svc.runAction("install", "gamma-cmd@official");
  expect(capturedEnv?.CLAUDE_CONFIG_DIR).toBe(CFG);
});
