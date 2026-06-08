import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CodexAppServerProbe,
  type CodexProbeRunner,
  probeCodexAppServer,
  probeCodexCapabilities,
  resolveCodexCliPath,
} from "./codex-capabilities";

function fakeRunner(handler: CodexProbeRunner): {
  calls: string[][];
  run: CodexProbeRunner;
} {
  const calls: string[][] = [];
  return {
    calls,
    run: async (argv, options) => {
      calls.push(argv);
      return handler(argv, options);
    },
  };
}

function fakeAppServerProbe(handler: CodexAppServerProbe): {
  calls: string[][];
  probe: CodexAppServerProbe;
} {
  const calls: string[][] = [];
  return {
    calls,
    probe: async (argv, options) => {
      calls.push(argv);
      return handler(argv, options);
    },
  };
}

test("probeCodexCapabilities honors ROGUENT_CODEX_PATH and detects all capabilities", async () => {
  const fake = fakeRunner(async (argv) => {
    const command = argv.slice(1).join(" ");
    if (command === "--version") {
      return { code: 0, stdout: "codex-cli 0.133.0\n", stderr: "" };
    }
    if (command === "exec --help") {
      return {
        code: 0,
        stdout: "Usage: codex exec [OPTIONS]\n  --json\n",
        stderr: "",
      };
    }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  });
  const appServer = fakeAppServerProbe(async () => ({
    available: true,
    stdout: '{"id":1,"result":{"userAgent":"Codex Desktop/0.133.0"}}\n',
    stderr: "",
  }));

  const result = await probeCodexCapabilities({
    env: { ROGUENT_CODEX_PATH: "/tmp/codex" },
    run: fake.run,
    probeAppServer: appServer.probe,
    timeoutMs: 25,
  });

  expect(result).toEqual({
    cliPath: "/tmp/codex",
    version: "codex-cli 0.133.0",
    appServer: "available",
    execJson: "available",
  });
  expect(fake.calls).toEqual([
    ["/tmp/codex", "--version"],
    ["/tmp/codex", "exec", "--help"],
  ]);
  expect(appServer.calls).toEqual([
    ["/tmp/codex", "app-server", "--listen", "stdio://"],
  ]);
});

test("probeCodexCapabilities degrades when the Codex CLI is missing", async () => {
  const fake = fakeRunner(async () => {
    throw new Error("ENOENT");
  });

  const result = await probeCodexCapabilities({
    env: {},
    run: fake.run,
  });

  expect(result.cliPath).toBe("codex");
  expect(result.version).toBeUndefined();
  expect(result.execJson).toBe("unavailable");
  expect(result.appServer).toBe("unavailable");
  expect(result.reason).toContain("version probe failed");
});

test("probeCodexCapabilities keeps execJson available when app-server handshake is malformed", async () => {
  const fake = fakeRunner(async (argv) => {
    const command = argv.slice(1).join(" ");
    if (command === "--version") {
      return { code: 0, stdout: "codex-cli 0.133.0\n", stderr: "" };
    }
    if (command === "exec --help") {
      return { code: 0, stdout: "Usage: codex exec\n--json\n", stderr: "" };
    }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  });
  const appServer = fakeAppServerProbe(async () => ({
    available: false,
    stdout: "not-json\n",
    stderr: "boom\n",
    reason: "malformed initialize response",
  }));

  const result = await probeCodexCapabilities({
    env: {},
    run: fake.run,
    probeAppServer: appServer.probe,
  });

  expect(result.version).toBe("codex-cli 0.133.0");
  expect(result.execJson).toBe("available");
  expect(result.appServer).toBe("unavailable");
  expect(result.reason).toContain("app-server");
});

test("probeCodexCapabilities detects app-server after initialize response with no startup output", async () => {
  const fake = fakeRunner(async (argv) => {
    const command = argv.slice(1).join(" ");
    if (command === "--version") {
      return { code: 0, stdout: "codex-cli 0.133.0\n", stderr: "" };
    }
    if (command === "exec --help") {
      return { code: 0, stdout: "Usage: codex exec\n--json\n", stderr: "" };
    }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  });
  const appServer = fakeAppServerProbe(async () => ({
    available: true,
    stdout:
      '{"id":1,"result":{"userAgent":"Codex Desktop/0.133.0","codexHome":"/tmp/codex"}}\n',
    stderr: "",
  }));

  const result = await probeCodexCapabilities({
    env: {},
    run: fake.run,
    probeAppServer: appServer.probe,
  });

  expect(result.appServer).toBe("available");
  expect(result.reason).toBeUndefined();
});

test("resolveCodexCliPath trims override and falls back to codex", () => {
  expect(resolveCodexCliPath({ ROGUENT_CODEX_PATH: " /opt/codex " })).toBe(
    "/opt/codex",
  );
  expect(resolveCodexCliPath({ ROGUENT_CODEX_PATH: "   " })).toBe("codex");
  expect(resolveCodexCliPath({})).toBe("codex");
});

test("probeCodexAppServer reaps a server that ignores SIGTERM after initialize", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roguent-codex-probe-"));
  const script = join(dir, "fake-app-server.js");
  writeFileSync(
    script,
    [
      'process.on("SIGTERM", () => {});',
      'console.log(JSON.stringify({ id: 1, result: { userAgent: "fake-codex", pid: process.pid } }));',
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );

  try {
    const result = await probeCodexAppServer([process.execPath, script], {
      timeoutMs: 100,
    });
    const firstLine = result.stdout.trim().split(/\r?\n/)[0];
    const payload = JSON.parse(firstLine ?? "{}") as {
      result?: { pid?: number };
    };
    const pid = payload.result?.pid;
    expect(result.available).toBe(true);
    expect(typeof pid).toBe("number");
    expect(processIsAlive(pid!)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
