import { expect, test } from "bun:test";
import { projectFor } from "./project";

test("projectFor falls back to the directory basename for a non-git path", () => {
  // A path that isn't a git repo (and need not exist) → git fails, basename wins.
  expect(projectFor("/tmp/roguent-not-a-repo-xyz")).toBe(
    "roguent-not-a-repo-xyz",
  );
});

test("projectFor returns this repo's git-root basename when run inside it", () => {
  // The test process runs inside the Roguent checkout; the git toplevel basename
  // is a non-empty string (the worktree/repo dir name).
  const p = projectFor(process.cwd());
  expect(p.length).toBeGreaterThan(0);
  expect(p).not.toContain("/");
});
