# Worktree 优先工作流

新功能、修复、重构都默认走 detached worktree;不为任务新建分支,也不建长期 feature 分支。

## 流程

1. 主工作树若有 tracked / untracked 改动,先快照提交:`git add -A` → `git commit -m "chore: 🧹 save pre-worktree local changes"`。这是 pre-worktree 的执行前快照,不做范围过滤。
2. 创建隔离的 detached worktree:`git worktree add --detach .worktrees/<slug> main`。
3. 按需同步 ignored 的本地 runtime(见下);只同步本任务真依赖的登录态 / 证据 / 配置。
4. 实现、`bun run check`、`bun test`、`bunx tsc --noEmit`(`check` 只 Biome 不查类型,改 TS 必跑此条;动 `tests/e2e/` 还要 `bun run typecheck:e2e`,主 tsc 不含 `tests/`)、按主题分批 commit,全部在 worktree 内完成。
5. 验证通过 → 记 worktree HEAD SHA → 回主工作树 `git merge --no-ff <sha>` 合入 `main`。
6. 合并后重新验证;没问题 → `git push origin main`。
7. 清理:`git worktree remove .worktrees/<slug>`。detached worktree 没有分支,无需删分支这一步。

worktree 目录固定放 `.worktrees/<slug>`,不换到别的层级来绕过规则。

## 同步 ignored 的 runtime

`git worktree add` 只检出 git tracked 文件,`.gitignore` 忽略的目录不会带过去。创建 worktree 后按任务需要显式同步:

- `node_modules/`:worktree 内 `bun install`,或 symlink 主工作树的(共享只读依赖)。
- `.claude/`:只在任务需要本地权限 / 登录态时 symlink 必需子路径;写入型 runtime(`*.lock`、`settings.local.json`)留在各自工作树,不共享、不提交。
- `fixtures/*.local.jsonl`:本地录制的脱敏证据,只读用可 symlink;不提交。

## Conventional Commits

- 标题英文:`type: emoji description`。映射:feat 🧩 / fix 🩹 / refactor ✨ / docs 📝 / test 🧪 / chore 🧹 / ci 👷 / merge 🔀。
- body 可中文。
- 改后即测:动了代码 / 配置 / runtime 就跑 `bun test` + `bun run check` + `bunx tsc --noEmit`(`check` 不查类型,改 TS 必跑后者;动 `tests/e2e/` 再跑 `bun run typecheck:e2e`),失败先修;不把局部通过说成全量通过。

## 例外(需用户确认)

- Destructive 操作:`git reset --hard`、`branch -D`、`push --force`
- 跨仓库 PR
- Shared infra 改动
- 生产部署
