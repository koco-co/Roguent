import type { IconName } from "./icons";

/**
 * Shop(SHOP)面板的 **mock 示例数据**——移植自设计原型 data.js
 * (items / currency.gems)。
 *
 * **本文件仅含装饰 Shop 面板的 `SHOP_ITEMS` / `SHOP_GEMS` / `ShopItem`**。
 * `ShopPlugin`、`SHOP_PLUGINS`、`SHOP_CATS` 已随 Market 面板接真(2026-06,见
 * docs/ROADMAP.md §3.6)而退役删除:Market 现在展示真实本机插件目录(来自
 * `~/.claude/plugins` 目录文件合并;操作经 `claude plugin` CLI),不再依赖静态 mock 数组。
 *
 * 道具店(`SHOP_ITEMS`)/ 宝石余额(`SHOP_GEMS`)仍为视觉占位,引擎暂无宝石经济。
 * icon 字段对应 icons.tsx 的 IconName(items:quest/crystal/account/bash/task/trophy/write/gemcur)。
 */

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
