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

test("projectFor falls back to cwd basename when the git toplevel basenames to empty", () => {
  // 注入一个把根解析成 '/' 的 resolver —— basename('/') === ''。若没有守卫(直接
  // 返回 basename(root)),project 就会是空串,总览世界会出现无名空房间。守卫必须
  // 让它贯穿到 cwd 回退,产出 cwd 的 basename。
  const p = projectFor("/srv/work/my-project", () => "/");
  expect(p).toBe("my-project");
});

test("projectFor never returns an empty string for a root-level path", () => {
  // 即便 cwd 本身就是 '/'(basename 也为空),也必须回退到 cwd 自身,绝不产出空串。
  const p = projectFor("/", () => "/");
  expect(p.length).toBeGreaterThan(0);
  expect(p).toBe("/");
});
