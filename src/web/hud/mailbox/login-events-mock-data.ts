import type { IconName } from "../icons";

/**
 * LoginEvents(签到日历 + 活动海报轮播)面板的 **mock 示例数据**——移植自设计原型
 * data.js 的 `dailyRewards` / `events`。
 *
 * **真假分明铁律(本仓既有)**:全文为 **mock 占位,引擎不消费**。Roguent 没有
 * 登录活动 / 签到 / 节日运营这套系统(本机 Claude Code 订阅态没有「每日登录奖励」
 * 概念);签到天数、宝石数、活动海报全属演示。`MOCK_` 命名前缀 + 面板内
 * `.task-mock-banner` 共同显著标注,且面板 **不自动弹**(无登录事件源,只手动入口
 * 打开),绝不让它看起来像真实的活动推送。
 */

// ── 签到日历一天(照搬原型字段 day/icon/label/got/today/big)──────────────────
export interface MockDailyReward {
  day: number;
  icon: IconName;
  /** 奖励文案(如 ×120 / 1天 Max;数值类不强译)。 */
  label: string;
  /** 是否已领(展示置灰 + ✓)。 */
  got: boolean;
  /** 是否今日(展示高亮 + 今日徽标)。 */
  today?: boolean;
  /** 是否大奖格(第 7 天限定皮肤)。 */
  big?: boolean;
}

export const MOCK_DAILY_REWARDS: MockDailyReward[] = [
  { day: 1, icon: "gemcur", label: "×120", got: true },
  { day: 2, icon: "gemcur", label: "×150", got: true },
  { day: 3, icon: "crystal", label: "1天 Max", got: false, today: true },
  { day: 4, icon: "gemcur", label: "×200", got: false },
  { day: 5, icon: "spellbook", label: "技能券", got: false },
  { day: 6, icon: "gemcur", label: "×260", got: false },
  { day: 7, icon: "trophy", label: "限定皮肤", got: false, big: true },
];

// ── 活动海报(照搬原型 events;art 决定海报样式,kind/title/sub/desc 文案)──────
export interface MockLoginEvent {
  id: string;
  /** 活动类型徽带(签到 / 限时 / 版本;渲染处包 t())。 */
  kind: string;
  /** 像素 accent 色。 */
  accent: string;
  /** 海报样式:signin 签到日历 / double 双倍海报 / release 版本海报。 */
  art: "signin" | "double" | "release";
  /** 活动标题(中文文案,渲染处包 t())。 */
  title: string;
  /** 副标题(渲染处包 t())。 */
  sub: string;
  /** 正文描述(可选,渲染处包 t())。 */
  desc?: string;
  /** 倒计时文案(可选,如「剩 1 天 18 小时」)。 */
  ends?: string;
  /** NEW 等角标(可选)。 */
  tag?: string;
}

export const MOCK_LOGIN_EVENTS: MockLoginEvent[] = [
  {
    id: "ev_signin",
    kind: "签到",
    accent: "#f2c84b",
    art: "signin",
    title: "连续登录奖励",
    sub: "第 3 天 · 今日可领",
  },
  {
    id: "ev_double",
    kind: "限时",
    accent: "#36c5e0",
    art: "double",
    title: "双倍宝石周末",
    sub: "完成会话获得 2× 宝石",
    desc: "本周末内，每完成一个会话或合并一次提交，奖励宝石翻倍。攒满去扭蛋机换限定皮肤。",
    ends: "剩 1 天 18 小时",
  },
  {
    id: "ev_release",
    kind: "版本",
    accent: "#a06cd5",
    art: "release",
    title: "Claude Code v0.9",
    sub: "agent teams 稳定版上线",
    desc: "tmux 队友模式、/oracle 技能、1M 上下文阈值优化。订阅者可一键升级 runtime。",
    tag: "NEW",
  },
];
