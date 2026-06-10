import { useEffect, useState } from "react";

// 共享低频帧计数器(~6.6fps),移植自原型 sprites.jsx 的 useTick:大厅几十个 DOM 精灵
// 共用一个定时器,而不是各自起 rAF/interval。首个订阅者懒启动、无订阅者时清掉。
const subs = new Set<() => void>();
let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(() => {
    tick = (tick + 1) % 600;
    for (const fn of subs) fn();
  }, 150);
}

/** 订阅共享帧计数器:返回当前 tick,每 ~150ms 递增并触发重渲染。 */
export function useSpriteTick(): number {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((v) => v + 1);
    subs.add(fn);
    ensureTimer();
    return () => {
      subs.delete(fn);
      if (subs.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return tick;
}
