/**
 * 扭蛋幸运保底(lucky pity)—— 纯前端确定性机制(照 Prototype panels3.jsx:148-175)。
 *
 * 规则:玩家在蓄力区连续快速点击,1.2s 滑动窗口内累计到 5 次 → 蓄满,
 * 下一抽必出 legendary。计数随会话内存,刷新即清零(不持久化、不造掉落数据)。
 *
 * 这里只实现 **触发边界** 的纯逻辑(可断言),装饰性的「从 legendary 池里随机选一个」
 * 留给 UI 用 Math.random;真正消耗宝石/产出物品仍走真实 economy.purchaseItem 命令。
 */

/** 蓄满所需的连续点击次数(第 5 次蓄满)。 */
export const LUCKY_PITY_THRESHOLD = 5;

/** 连续点击的滑动窗口(毫秒);超时的旧点击不计入。 */
export const LUCKY_WINDOW_MS = 1200;

export interface LuckyState {
  /** 窗口内有效点击的时间戳(升序)。 */
  readonly clicks: readonly number[];
  /** 是否已蓄满 —— 蓄满后下一抽必出 legendary。 */
  readonly charged: boolean;
}

export function createLuckyState(): LuckyState {
  return { clicks: [], charged: false };
}

/**
 * 记录一次蓄力点击。返回新状态;当窗口内点击数达到阈值时 `charged` 翻 true 并清空计数。
 * 已蓄满(charged)时再点不重置,保持蓄满直到下一抽消费掉。
 */
export function registerLuckyClick(state: LuckyState, now: number): LuckyState {
  if (state.charged) return state;
  const clicks = [...state.clicks, now].filter(
    (t) => now - t < LUCKY_WINDOW_MS,
  );
  if (clicks.length >= LUCKY_PITY_THRESHOLD) {
    return { clicks: [], charged: true };
  }
  return { clicks, charged: false };
}

/**
 * 消费蓄力(一次抽取时调用)。返回 `{ lucky, state }`:
 * - lucky:本次抽取是否享受保底(消费前是否蓄满)。
 * - state:消费后的新状态(清空蓄满标记与计数)。
 */
export function consumeLucky(state: LuckyState): {
  lucky: boolean;
  state: LuckyState;
} {
  return { lucky: state.charged, state: createLuckyState() };
}
