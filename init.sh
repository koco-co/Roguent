#!/usr/bin/env bash
# Roguent 纯浏览器开发一键启动:同时拉起 Engine(WS, :8787)与 Vite 前端(:5173)。
# Ctrl+C 按一次即可收掉两个进程(trap kill 0 杀整个进程组,避免端口残留僵尸)。
# 桌面壳请走 `bun run dev:app`,不需要这个脚本。
set -euo pipefail

# 不管从哪个目录调用,都切到仓库根(脚本所在目录),保证相对的 src/ 路径成立。
cd "$(dirname "$0")"

# 任一进程退出 / 收到中断信号 → 杀整个进程组,避免 8787 端口残留僵尸 engine。
trap 'kill 0' EXIT INT TERM

echo "▶ Engine → ws://localhost:8787"
echo "▶ Web    → http://localhost:5173"
echo "  (Ctrl+C 一并停止)"
echo

bun run dev:engine &
bun run dev:web &
wait
