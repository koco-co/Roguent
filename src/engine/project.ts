import { execFileSync } from "node:child_process";
import { basename } from "node:path";

/**
 * Project name for a session's working directory: the basename of its git
 * toplevel, falling back to the directory's own basename when `cwd` isn't a git
 * repo (or git is unavailable). This is the room-grouping key for the overworld
 * (each project = one room). Shells out to git once per new session — cheap, and
 * sessions are user-initiated.
 */
export function projectFor(cwd: string): string {
  try {
    const root = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (root) return basename(root);
  } catch {
    // not a git repo / git missing / cwd doesn't exist — fall back to the dir name
  }
  return basename(cwd) || cwd;
}
