import type { IconName } from "./icons";

/**
 * Shop(SHOP)面板的 **mock 示例数据**——移植自设计原型 data.js
 * (plugins / items / currency.gems)。
 *
 * **整套数据全为示例占位,引擎不消费**:Roguent 是「活动可视化平台」,**没有**插件
 * 市场、**没有**宝石经济、**没有**皮肤 / 宠物商品。data.js 虽把 plugins 注释成
 * "(real)",但对 Roguent 引擎而言**整面板都是 mock**——这里的字段 / 价格 / 安装数 /
 * 拥有状态只为忠实复刻原型外观,既不接任何真实 store,也不持久化。组件侧本地 state
 * 操作即可,「安装」/「购买」按钮均为视觉占位,绝不冒充真实交易。
 *
 * icon 字段对应 icons.tsx 的 IconName,已逐一核对原型用到的名字
 * (plugins:mcp/search/crystal/shop/write/error;
 *  items:quest/crystal/account/bash/task/trophy/write/gemcur)均存在,无替换。
 */

// 插件市场一条商品(忠实照搬原型字段 id/name/author/cat/icon/stars/installs/desc/owned/runtime)。
export interface ShopPlugin {
  id: string;
  name: string;
  author: string;
  cat: string;
  icon: IconName;
  stars: number;
  installs: string;
  desc: string;
  owned: boolean;
  runtime: "both" | "claude";
}

// 道具店一件商品(忠实照搬原型字段 id/name/cat/icon/price/owned/accent;扭蛋项额外 gacha)。
export interface ShopItem {
  id: string;
  name: string;
  cat: string;
  icon: IconName;
  price: number;
  owned: boolean;
  accent: string;
  gacha?: boolean;
}

// ── 插件市场(6 条 p1~p6,逐字段照搬原型 data.js,中文照抄)──────────────────
export const SHOP_PLUGINS: ShopPlugin[] = [
  {
    id: "p1",
    name: "github-mcp",
    author: "anthropic",
    cat: "MCP",
    icon: "mcp",
    stars: 4.9,
    installs: "52k",
    desc: "GitHub 仓库、PR、issue 的 MCP 服务器。",
    owned: true,
    runtime: "both",
  },
  {
    id: "p2",
    name: "playwright-skill",
    author: "community",
    cat: "Skills",
    icon: "search",
    stars: 4.7,
    installs: "31k",
    desc: "浏览器自动化与端到端测试技能。",
    owned: false,
    runtime: "claude",
  },
  {
    id: "p3",
    name: "postgres-mcp",
    author: "community",
    cat: "MCP",
    icon: "crystal",
    stars: 4.6,
    installs: "28k",
    desc: "安全只读/读写 Postgres 查询。",
    owned: false,
    runtime: "both",
  },
  {
    id: "p4",
    name: "figma-bridge",
    author: "studio",
    cat: "插件",
    icon: "shop",
    stars: 4.4,
    installs: "12k",
    desc: "把 Figma 选区导入为组件草图。",
    owned: false,
    runtime: "claude",
  },
  {
    id: "p5",
    name: "commit-lint",
    author: "community",
    cat: "Skills",
    icon: "write",
    stars: 4.8,
    installs: "40k",
    desc: "提交信息规范化与校验技能。",
    owned: true,
    runtime: "both",
  },
  {
    id: "p6",
    name: "sentry-mcp",
    author: "sentry",
    cat: "MCP",
    icon: "error",
    stars: 4.5,
    installs: "19k",
    desc: "拉取错误分组与堆栈,定位回归。",
    owned: false,
    runtime: "both",
  },
];

// ── 道具店(8 件 i1~i8,逐字段照搬原型 data.js;i8 为扭蛋)──────────────────
export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "i1",
    name: "森林房间皮肤",
    cat: "房间",
    icon: "quest",
    price: 1200,
    owned: false,
    accent: "#5fd35f",
  },
  {
    id: "i2",
    name: "赛博地砖",
    cat: "房间",
    icon: "crystal",
    price: 1800,
    owned: false,
    accent: "#36c5e0",
  },
  {
    id: "i3",
    name: "黑猫伙伴",
    cat: "宠物",
    icon: "account",
    price: 600,
    owned: true,
    accent: "#a06cd5",
  },
  {
    id: "i4",
    name: "史莱姆伙伴",
    cat: "宠物",
    icon: "bash",
    price: 900,
    owned: false,
    accent: "#5fd35f",
  },
  {
    id: "i5",
    name: "忍者皮肤",
    cat: "皮肤",
    icon: "task",
    price: 1500,
    owned: false,
    accent: "#ff4d6d",
  },
  {
    id: "i6",
    name: "黄金边框",
    cat: "UI",
    icon: "trophy",
    price: 2400,
    owned: false,
    accent: "#f2c84b",
  },
  {
    id: "i7",
    name: "霓虹字体",
    cat: "UI",
    icon: "write",
    price: 800,
    owned: false,
    accent: "#36c5e0",
  },
  {
    id: "i8",
    name: "扭蛋:随机皮肤",
    cat: "扭蛋",
    icon: "gemcur",
    price: 500,
    owned: false,
    accent: "#ff4d6d",
    gacha: true,
  },
];

// ── 宝石余额(原型 currency.gems = 14099,作 mock 常量;非真实经济)──────────
export const SHOP_GEMS = 14099;

// 插件市场左侧分类(忠实照搬原型 cats)。
export const SHOP_CATS = ["全部", "已安装", "Skills", "MCP", "插件"];
