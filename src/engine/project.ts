import { execFileSync } from "node:child_process";
import { basename } from "node:path";

/** Resolves the git toplevel for `cwd`, or throws if `cwd` isn't a git repo. */
export type GitToplevelResolver = (cwd: string) => string;

const gitToplevel: GitToplevelResolver = (cwd) =>
  execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

/**
 * Project name for a session's working directory: the basename of its git
 * toplevel, falling back to the directory's own basename when `cwd` isn't a git
 * repo (or git is unavailable). This is the room-grouping key for the overworld
 * (each project = one room). Shells out to git once per new session — cheap, and
 * sessions are user-initiated.
 *
 * 注意:`git rev-parse --show-toplevel` 在 worktree 内返回的是 worktree 目录,
 * 不是主仓库 —— 故同一仓库的不同 worktree 会落进不同房间。这是**有意行为**(已与
 * 用户对齐:project = git 根 basename,各 worktree 各有其根)。
 *
 * `resolveToplevel` 默认 shell-out 到 git;仅作测试注入用(让用例能模拟 git 把
 * `/` 当作根目录,从而覆盖 basename 为空的守卫分支)。
 */
export function projectFor(
  cwd: string,
  resolveToplevel: GitToplevelResolver = gitToplevel,
): string {
  try {
    const root = resolveToplevel(cwd);
    // basename('/') === '' —— git 根 basename 为空时不能返回空串,贯穿到 cwd 回退。
    const name = basename(root);
    if (name) return name;
  } catch {
    // not a git repo / git missing / cwd doesn't exist — fall back to the dir name
  }
  return basename(cwd) || cwd;
}
