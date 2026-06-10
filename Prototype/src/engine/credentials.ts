import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join, normalize, resolve } from "node:path";

export interface OauthCredentials {
  accessToken: string;
  subscriptionType: string;
}

export interface CredentialDeps {
  now: () => number;
  readKeychain: () => string | null;
  readFile: () => string | null;
}

const KEYCHAIN_SERVICE = "Claude Code-credentials";

// 仅解析 CLI 的 claudeAiOauth 命名空间(camelCase,expiresAt 为 ms)。
// 绝不读 SDK file-provider 的 snake_case 文件。
function parse(json: string, now: number): OauthCredentials | null {
  try {
    const o = JSON.parse(json) as {
      claudeAiOauth?: {
        accessToken?: string;
        subscriptionType?: string;
        expiresAt?: number;
      };
    };
    const c = o.claudeAiOauth;
    if (!c?.accessToken) return null;
    if (c.expiresAt != null && c.expiresAt <= now) return null; // ms 同单位
    return {
      accessToken: c.accessToken,
      subscriptionType: c.subscriptionType ?? "",
    };
  } catch {
    return null;
  }
}

function keychainService(home: string): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  const def = normalize(resolve(join(home, ".claude")));
  if (!configDir || normalize(resolve(configDir)) === def)
    return KEYCHAIN_SERVICE;
  const hash = createHash("sha256")
    .update(normalize(resolve(configDir)))
    .digest("hex")
    .slice(0, 8);
  return `${KEYCHAIN_SERVICE}-${hash}`;
}

// 默认实现:macOS keychain(绝对路径 + 参数数组,无 shell 注入面)。
function defaultReadKeychain(): string | null {
  if (process.platform !== "darwin") return null;
  const home = homedir();
  const service = keychainService(home);
  const account = userInfo().username?.trim();
  const run = (args: string[]) =>
    execFileSync("/usr/bin/security", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    }).trim();
  try {
    const args = account
      ? ["find-generic-password", "-s", service, "-a", account, "-w"]
      : ["find-generic-password", "-s", service, "-w"];
    const out = run(args);
    return out || null;
  } catch (err) {
    // 只记 message;严禁 log 整个 error / err.stderr(可能含 token)。
    console.warn(
      `[credentials] keychain read failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

function defaultReadFile(): string | null {
  const path = join(
    process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"),
    ".credentials.json",
  );
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    console.warn(
      `[credentials] file read failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

const defaults: CredentialDeps = {
  now: () => Date.now(),
  readKeychain: defaultReadKeychain,
  readFile: defaultReadFile,
};

/** 每次调用都重新读(不缓存 token),CLI 旋转后下轮自愈。 */
export function readOauthCredentials(
  deps: Partial<CredentialDeps> = {},
): OauthCredentials | null {
  const d = { ...defaults, ...deps };
  const now = d.now();
  let raw: string | null = null;
  try {
    raw = d.readKeychain();
  } catch (err) {
    console.warn(
      `[credentials] keychain read threw: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  const fromKeychain = raw ? parse(raw, now) : null;
  if (fromKeychain) return fromKeychain;
  let file: string | null = null;
  try {
    file = d.readFile();
  } catch {
    file = null;
  }
  return file ? parse(file, now) : null;
}
