import { homedir } from "node:os";
import { join } from "node:path";

/** Claude 配置目录:CLAUDE_CONFIG_DIR(若设)否则 ~/.claude。与 credentials.ts 同源。 */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
}
