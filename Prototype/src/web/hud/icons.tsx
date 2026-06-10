/* ROGUENT custom pixel icons — drawn as rect compositions on a 16px grid.
   Hard edges, dark outline #2c1c10, top-left light source. NO emoji.
   Exports: ICON_ART, IconName, ICON_NAMES, Icon */

import type React from "react";

export type Rect = { x: number; y: number; w: number; h: number; c: string };

const O = "#2c1c10"; // outline
const C = {
  red: "#ff4d6d",
  redD: "#c8324f",
  redH: "#ff90a3",
  cyan: "#36c5e0",
  cyanD: "#1f8aa3",
  cyanH: "#9fe9f7",
  gold: "#f2c84b",
  goldD: "#b8881f",
  goldH: "#ffe79a",
  green: "#5fd35f",
  greenD: "#2f9c3a",
  greenH: "#b6f0a8",
  purple: "#a06cd5",
  purpleD: "#6f43a0",
  purpleH: "#d6b6f2",
  wood: "#8a5a32",
  woodD: "#5a3a1e",
  woodH: "#c08a52",
  paper: "#e9dcc0",
  paperD: "#c4b48c",
  steel: "#aeb9c6",
  steelD: "#6f7c8c",
  steelH: "#e3ebf3",
  ink: "#2c1c10",
  white: "#f4ead7",
  shadow: "#0b0a12",
  glass: "#bfe9f0",
  muted: "#8a8170",
};

/** r(x,y,w,h,color) — shorthand rect constructor */
function r(x: number, y: number, w: number, h: number, c: string): Rect {
  return { x, y, w, h, c };
}

/** box — filled rect with 1px outline; returns [outline rect, fill rect] */
function box(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  line?: string,
): Rect[] {
  const a: Rect[] = [r(x, y, w, h, line ?? O)];
  a.push(r(x + 1, y + 1, w - 2, h - 2, fill));
  return a;
}

// ---------------------------------------------------------------------------
// Icon art — each entry is a flat array of Rect
// ---------------------------------------------------------------------------

// Internal `as const` source — preserves the IconName union + readonly tuples.
const ICON_ART_DATA = {
  // ---- HP heart ----
  heart: [
    r(3, 2, 4, 1, O),
    r(9, 2, 4, 1, O),
    r(2, 3, 1, 3, O),
    r(7, 3, 2, 2, O),
    r(13, 3, 1, 3, O),
    r(3, 3, 4, 1, C.redH),
    r(9, 3, 4, 1, C.redH),
    r(3, 4, 4, 2, C.red),
    r(9, 4, 4, 2, C.red),
    r(2, 6, 12, 1, C.red),
    r(2, 6, 1, 1, O),
    r(13, 6, 1, 1, O),
    r(3, 7, 10, 1, C.redD),
    r(2, 7, 1, 1, O),
    r(13, 7, 1, 1, O),
    r(4, 8, 8, 1, C.redD),
    r(3, 8, 1, 1, O),
    r(12, 8, 1, 1, O),
    r(5, 9, 6, 1, C.redD),
    r(4, 9, 1, 1, O),
    r(11, 9, 1, 1, O),
    r(6, 10, 4, 1, C.redD),
    r(5, 10, 1, 1, O),
    r(10, 10, 1, 1, O),
    r(7, 11, 2, 1, O),
  ],

  // ---- MP / week gem (mana crystal) ----
  gem: [
    r(6, 1, 4, 1, O),
    r(5, 2, 1, 1, O),
    r(10, 2, 1, 1, O),
    r(6, 2, 4, 1, C.cyanH),
    r(4, 3, 1, 1, O),
    r(11, 3, 1, 1, O),
    r(5, 3, 6, 1, C.cyan),
    r(6, 3, 1, 1, C.cyanH),
    r(3, 4, 1, 2, O),
    r(12, 4, 1, 2, O),
    r(4, 4, 8, 2, C.cyan),
    r(4, 4, 2, 1, C.cyanH),
    r(3, 6, 10, 1, C.cyanD),
    r(2, 6, 1, 1, O),
    r(13, 6, 1, 1, O),
    r(4, 7, 8, 1, C.cyanD),
    r(3, 7, 1, 1, O),
    r(12, 7, 1, 1, O),
    r(5, 8, 6, 1, C.cyanD),
    r(4, 8, 1, 1, O),
    r(11, 8, 1, 1, O),
    r(6, 9, 4, 1, C.cyanD),
    r(5, 9, 1, 1, O),
    r(10, 9, 1, 1, O),
    r(7, 10, 2, 1, C.cyanD),
    r(6, 10, 1, 1, O),
    r(9, 10, 1, 1, O),
    r(7, 11, 2, 1, O),
  ],

  // ---- token coin stack ----
  coins: [
    r(4, 9, 8, 1, O),
    r(3, 10, 10, 1, O),
    r(3, 10, 10, 1, O),
    r(3, 10, 1, 3, O),
    r(12, 10, 1, 3, O),
    r(4, 10, 8, 3, C.gold),
    r(4, 10, 8, 1, C.goldH),
    r(4, 12, 8, 1, C.goldD),
    r(4, 13, 8, 1, O),
    r(5, 5, 6, 1, O),
    r(4, 6, 8, 1, O),
    r(4, 6, 1, 3, O),
    r(11, 6, 1, 3, O),
    r(5, 6, 6, 3, C.gold),
    r(5, 6, 6, 1, C.goldH),
    r(5, 8, 6, 1, C.goldD),
    r(5, 9, 6, 1, O),
    r(7, 7, 2, 1, C.goldH),
  ],

  // ---- gem currency (faceted) ----
  gemcur: [
    r(5, 2, 6, 1, O),
    r(4, 3, 1, 1, O),
    r(11, 3, 1, 1, O),
    r(5, 3, 6, 1, C.purpleH),
    r(3, 4, 1, 1, O),
    r(12, 4, 1, 1, O),
    r(4, 4, 8, 1, C.purple),
    r(3, 5, 10, 1, C.purple),
    r(2, 5, 1, 1, O),
    r(13, 5, 1, 1, O),
    r(4, 5, 2, 1, C.purpleH),
    r(2, 6, 12, 1, C.purpleD),
    r(1, 6, 1, 1, O),
    r(14, 6, 1, 1, O),
    r(2, 7, 1, 1, O),
    r(13, 7, 1, 1, O),
    r(3, 7, 10, 1, C.purple),
    r(3, 8, 1, 1, O),
    r(12, 8, 1, 1, O),
    r(4, 8, 8, 1, C.purpleD),
    r(4, 9, 8, 1, O),
    r(5, 9, 6, 1, C.purpleD),
    r(5, 9, 1, 1, O),
    r(10, 9, 1, 1, O),
    r(5, 10, 6, 1, O),
    r(6, 10, 4, 1, C.purpleD),
    r(7, 11, 2, 1, O),
  ],

  // ---- completed: laurel + check flag ----
  laurel: [
    r(7, 2, 2, 1, O),
    r(6, 3, 1, 1, O),
    r(9, 3, 1, 1, O),
    r(7, 3, 2, 1, C.greenH),
    r(5, 4, 1, 2, O),
    r(10, 4, 1, 2, O),
    r(6, 4, 4, 2, C.green),
    r(4, 6, 1, 3, O),
    r(11, 6, 1, 3, O),
    r(5, 6, 1, 3, C.greenD),
    r(10, 6, 1, 3, C.greenD),
    r(5, 9, 1, 2, O),
    r(10, 9, 1, 2, O),
    r(6, 10, 1, 2, C.greenD),
    r(9, 10, 1, 2, C.greenD),
    // check mark
    r(10, 7, 1, 1, C.gold),
    r(9, 8, 1, 1, C.gold),
    r(8, 9, 1, 1, C.gold),
    r(6, 8, 1, 1, C.gold),
    r(7, 9, 1, 1, C.gold),
    r(7, 10, 1, 1, C.goldH),
  ],

  // ---- spellbook (skill) ----
  spellbook: [
    ...box(2, 3, 12, 10, C.purpleD, O),
    r(3, 4, 5, 8, C.purple),
    r(9, 4, 4, 8, C.purple),
    r(8, 3, 1, 10, O),
    r(4, 5, 3, 1, C.purpleH),
    r(10, 5, 2, 1, C.purpleH),
    r(4, 7, 3, 1, C.purpleH),
    r(10, 7, 2, 1, C.purpleH),
    r(4, 9, 2, 1, C.purpleH),
    r(10, 9, 2, 1, C.purpleH),
    // star clasp
    r(7, 7, 2, 1, C.gold),
    r(8, 6, 1, 3, C.gold),
    r(7, 7, 1, 1, C.goldH),
  ],

  // ---- backpack / pouch ----
  pouch: [
    r(6, 2, 4, 1, O),
    r(5, 3, 1, 1, O),
    r(10, 3, 1, 1, O),
    r(6, 3, 4, 1, C.woodH),
    ...box(3, 4, 10, 9, C.wood, O),
    r(4, 5, 8, 1, C.woodH),
    r(3, 7, 10, 1, O),
    r(6, 8, 4, 1, O),
    r(7, 8, 2, 1, C.gold),
    r(4, 9, 3, 3, C.woodD),
    r(9, 9, 3, 3, C.woodD),
  ],

  // ---- chat scroll ----
  chat: [
    ...box(2, 3, 12, 7, C.paper, O),
    r(4, 5, 8, 1, C.paperD),
    r(4, 7, 6, 1, C.paperD),
    r(5, 10, 1, 2, O),
    r(6, 10, 2, 1, O),
    r(6, 11, 2, 1, O),
    r(5, 12, 3, 1, O), // tail
    r(6, 10, 1, 2, C.paper),
  ],

  // ---- model crystal (multi-facet brain crystal) ----
  crystal: [
    r(7, 1, 2, 1, O),
    r(6, 2, 1, 1, O),
    r(9, 2, 1, 1, O),
    r(7, 2, 2, 1, C.cyanH),
    r(5, 3, 1, 4, O),
    r(10, 3, 1, 4, O),
    r(6, 3, 4, 1, C.cyan),
    r(6, 4, 4, 3, C.cyan),
    r(6, 4, 1, 3, C.cyanH),
    r(5, 7, 6, 1, C.cyanD),
    r(6, 8, 1, 3, O),
    r(9, 8, 1, 3, O),
    r(7, 8, 2, 3, C.cyanD),
    r(6, 11, 4, 1, O),
    r(11, 4, 1, 1, C.cyanH),
    r(12, 5, 1, 1, C.cyanH),
    r(4, 9, 1, 1, C.cyanH),
  ],

  // ---- import: folder + arrow ----
  import: [
    r(2, 4, 5, 1, O),
    r(2, 5, 1, 8, O),
    ...box(2, 5, 12, 8, C.gold, O),
    r(3, 6, 10, 1, C.goldH),
    r(3, 11, 10, 1, C.goldD),
    // down arrow
    r(8, 6, 1, 3, O),
    r(6, 8, 5, 1, O),
    r(7, 9, 3, 1, O),
    r(8, 10, 1, 1, O),
  ],

  // ---- quest scroll (tasks) ----
  quest: [
    r(3, 2, 10, 1, O),
    r(3, 13, 10, 1, O),
    r(2, 3, 2, 1, C.paperD),
    r(12, 3, 2, 1, C.paperD),
    r(2, 12, 2, 1, C.paperD),
    r(12, 12, 2, 1, C.paperD),
    r(4, 3, 8, 10, C.paper),
    r(3, 3, 1, 10, O),
    r(12, 3, 1, 10, O),
    r(6, 5, 5, 1, O),
    r(6, 7, 5, 1, O),
    r(6, 9, 4, 1, O),
    r(5, 5, 1, 1, C.green),
    r(5, 7, 1, 1, C.green),
    r(5, 9, 1, 1, C.muted),
  ],

  // ---- shop awning (market stall) ----
  shop: [
    r(1, 3, 14, 1, O),
    r(2, 4, 12, 2, C.red),
    r(2, 4, 2, 2, C.paper),
    r(6, 4, 2, 2, C.paper),
    r(10, 4, 2, 2, C.paper),
    r(2, 6, 1, 1, O),
    r(4, 6, 1, 1, O),
    r(6, 6, 1, 1, O),
    r(8, 6, 1, 1, O),
    r(10, 6, 1, 1, O),
    r(12, 6, 1, 1, O),
    r(2, 7, 12, 6, C.woodD),
    r(2, 7, 1, 6, O),
    r(13, 7, 1, 6, O),
    r(2, 12, 12, 1, O),
    r(4, 8, 3, 4, C.wood),
    r(9, 8, 3, 4, C.wood),
  ],

  // ---- trophy (leaderboard) ----
  trophy: [
    r(4, 2, 8, 1, O),
    r(4, 3, 1, 4, O),
    r(11, 3, 1, 4, O),
    r(5, 3, 6, 3, C.gold),
    r(5, 3, 6, 1, C.goldH),
    r(2, 3, 2, 3, O),
    r(2, 4, 1, 2, C.goldD),
    r(12, 3, 2, 3, O),
    r(13, 4, 1, 2, C.goldD),
    r(5, 6, 6, 1, C.goldD),
    r(6, 7, 4, 1, O),
    r(7, 8, 2, 2, C.goldD),
    r(5, 10, 6, 1, O),
    r(4, 11, 8, 1, O),
    r(4, 11, 8, 2, C.gold),
    r(4, 12, 8, 1, C.goldD),
    r(4, 13, 8, 1, O),
  ],

  // ---- settings gear-rune ----
  gear: [
    r(7, 1, 2, 1, O),
    r(7, 1, 2, 1, C.steelH),
    r(1, 7, 1, 2, O),
    r(14, 7, 1, 2, O),
    r(7, 14, 2, 1, O),
    r(3, 3, 2, 2, C.steel),
    r(11, 3, 2, 2, C.steel),
    r(3, 11, 2, 2, C.steel),
    r(11, 11, 2, 2, C.steel),
    ...box(4, 4, 8, 8, C.steel, O),
    r(5, 5, 6, 1, C.steelH),
    ...box(6, 6, 4, 4, C.shadow, O),
    r(7, 7, 2, 2, C.cyan),
  ],

  // ---- menu rune bars ----
  menu: [
    ...box(2, 3, 12, 2, C.gold, O),
    ...box(2, 7, 12, 2, C.gold, O),
    ...box(2, 11, 12, 2, C.gold, O),
    r(4, 3, 1, 2, C.goldH),
    r(4, 7, 1, 2, C.goldH),
    r(4, 11, 1, 2, C.goldH),
  ],

  // ---- account portrait frame ----
  account: [
    ...box(2, 2, 12, 12, C.woodD, O),
    r(3, 3, 10, 1, C.woodH),
    r(7, 5, 2, 3, C.paperD),
    r(6, 5, 1, 1, O),
    r(9, 5, 1, 1, O), // head
    r(6, 6, 4, 2, C.paper),
    r(5, 9, 6, 3, C.cyan),
    r(5, 9, 6, 1, C.cyanH), // shoulders
    r(4, 10, 1, 2, O),
    r(11, 10, 1, 2, O),
  ],

  // ---- pause ----
  pause: [
    ...box(4, 3, 3, 10, C.gold, O),
    ...box(9, 3, 3, 10, C.gold, O),
    r(5, 4, 1, 8, C.goldH),
    r(10, 4, 1, 8, C.goldH),
  ],

  // ---- tools ----
  read: [
    // open book
    r(2, 4, 5, 1, O),
    r(9, 4, 5, 1, O),
    r(7, 3, 2, 9, O),
    r(2, 4, 1, 8, O),
    r(13, 4, 1, 8, O),
    r(2, 12, 12, 1, O),
    r(3, 5, 4, 7, C.paper),
    r(9, 5, 4, 7, C.paper),
    r(4, 6, 2, 1, C.cyanD),
    r(10, 6, 2, 1, C.cyanD),
    r(4, 8, 3, 1, C.paperD),
    r(9, 8, 3, 1, C.paperD),
  ],

  write: [
    // quill
    r(11, 2, 2, 1, O),
    r(10, 3, 2, 1, O),
    r(9, 4, 2, 1, O),
    r(8, 5, 2, 1, O),
    r(7, 6, 2, 1, O),
    r(10, 3, 1, 1, C.white),
    r(9, 4, 1, 2, C.steelH),
    r(8, 5, 1, 2, C.steel),
    r(6, 7, 2, 1, O),
    r(5, 8, 2, 1, O),
    r(4, 9, 2, 1, O),
    r(3, 10, 2, 1, O),
    r(6, 7, 1, 3, C.gold),
    r(4, 9, 2, 2, C.goldD),
    r(3, 11, 2, 1, C.ink),
    r(2, 12, 2, 1, C.ink),
  ],

  bash: [
    // flask / test tube
    r(6, 2, 4, 1, O),
    r(6, 3, 1, 2, C.steelH),
    r(9, 3, 1, 2, O),
    r(5, 5, 1, 1, O),
    r(10, 5, 1, 1, O),
    r(4, 6, 1, 1, O),
    r(11, 6, 1, 1, O),
    r(3, 7, 1, 6, O),
    r(12, 7, 1, 6, O),
    r(3, 13, 10, 1, O),
    r(4, 7, 8, 1, C.glass),
    r(4, 8, 8, 4, C.green),
    r(4, 8, 8, 1, C.greenH),
    r(6, 9, 1, 1, C.greenH),
    r(9, 10, 1, 1, C.greenH),
  ],

  search: [
    // magnifier
    ...box(3, 3, 7, 7, C.cyanD, O),
    r(4, 4, 5, 5, C.cyanH),
    r(5, 5, 3, 3, C.glass),
    r(9, 9, 2, 2, O),
    r(10, 10, 2, 2, O),
    r(11, 11, 2, 2, O),
    r(12, 12, 1, 1, O),
    r(10, 10, 1, 1, C.gold),
  ],

  task: [
    // wand + star
    r(11, 2, 2, 1, C.gold),
    r(10, 3, 1, 1, C.gold),
    r(12, 3, 1, 1, C.gold),
    r(11, 3, 1, 1, C.goldH),
    r(11, 1, 1, 1, C.gold),
    r(9, 5, 2, 1, O),
    r(8, 6, 2, 1, O),
    r(7, 7, 2, 1, O),
    r(6, 8, 2, 1, O),
    r(5, 9, 2, 1, O),
    r(4, 10, 2, 1, O),
    r(3, 11, 2, 1, O),
    r(9, 5, 1, 1, C.purpleH),
    r(7, 7, 2, 2, C.purple),
    r(4, 10, 2, 2, C.purpleD),
    r(3, 3, 1, 1, C.goldH),
    r(13, 8, 1, 1, C.goldH),
  ],

  mcp: [
    // plug
    r(6, 1, 1, 3, O),
    r(9, 1, 1, 3, O),
    ...box(4, 4, 8, 4, C.steel, O),
    r(5, 5, 6, 1, C.steelH),
    r(5, 8, 6, 2, C.steelD),
    r(6, 8, 4, 1, O),
    r(7, 10, 2, 3, O),
    r(7, 10, 2, 3, C.gold),
    r(7, 13, 2, 1, O),
  ],

  // ---- status ----
  ask: [
    // glowing ? rune in bubble
    ...box(2, 2, 12, 9, C.cyanD, O),
    r(3, 3, 10, 1, C.cyanH),
    r(6, 10, 1, 2, O),
    r(6, 11, 2, 1, O),
    r(6, 10, 1, 2, C.cyanD), // tail
    // question mark
    r(6, 4, 4, 1, C.white),
    r(6, 4, 1, 2, C.white),
    r(9, 4, 1, 3, C.white),
    r(8, 6, 1, 1, C.white),
    r(7, 7, 1, 1, C.white),
    r(7, 9, 1, 1, C.white),
  ],

  todo: [
    // small scroll
    r(4, 3, 8, 1, O),
    r(4, 12, 8, 1, O),
    r(3, 4, 1, 8, O),
    r(12, 4, 1, 8, O),
    r(4, 4, 8, 8, C.paper),
    r(6, 6, 4, 1, C.paperD),
    r(6, 8, 4, 1, C.paperD),
    r(6, 10, 3, 1, C.muted),
  ],

  idle: [
    // zzz
    r(8, 2, 4, 1, O),
    r(11, 3, 1, 1, O),
    r(9, 4, 2, 1, O),
    r(8, 5, 4, 1, O),
    r(8, 2, 4, 1, C.white),
    r(8, 5, 4, 1, C.white),
    r(4, 7, 3, 1, O),
    r(6, 8, 1, 1, O),
    r(4, 9, 1, 1, O),
    r(3, 10, 3, 1, O),
    r(4, 7, 3, 1, C.cyanH),
    r(3, 10, 3, 1, C.cyanH),
  ],

  done: [
    // green check
    r(11, 4, 2, 2, C.greenH),
    r(10, 5, 2, 2, C.green),
    r(9, 6, 2, 2, C.green),
    r(8, 7, 2, 2, C.green),
    r(6, 8, 2, 2, C.green),
    r(5, 7, 2, 2, C.green),
    r(4, 6, 2, 2, C.greenD),
    r(12, 3, 1, 1, O),
    r(13, 4, 1, 2, O),
    r(3, 6, 1, 1, O),
    r(4, 8, 1, 1, O),
    r(7, 10, 1, 1, O),
    r(10, 7, 1, 1, O),
  ],

  error: [
    // red spark
    r(7, 1, 2, 3, C.red),
    r(7, 12, 2, 3, C.red),
    r(1, 7, 3, 2, C.red),
    r(12, 7, 3, 2, C.red),
    r(3, 3, 2, 2, C.redH),
    r(11, 3, 2, 2, C.redH),
    r(3, 11, 2, 2, C.redD),
    r(11, 11, 2, 2, C.redD),
    r(6, 6, 4, 4, C.gold),
    r(6, 6, 4, 1, C.goldH),
    r(7, 7, 2, 2, C.white),
  ],

  compact: [
    // refresh / cycle runes
    r(4, 2, 7, 1, O),
    r(11, 2, 1, 3, O),
    r(9, 3, 2, 1, O),
    r(9, 1, 1, 3, C.cyan),
    r(11, 2, 1, 2, C.cyan),
    r(3, 3, 1, 3, O),
    r(3, 3, 2, 1, C.cyan),
    r(2, 5, 2, 6, C.cyanD),
    r(12, 5, 2, 6, C.cyanD),
    r(5, 13, 7, 1, O),
    r(4, 11, 1, 3, O),
    r(4, 12, 2, 1, C.cyan),
    r(7, 12, 1, 3, C.cyan),
    r(6, 13, 2, 1, O),
  ],

  // ---- runtime badges ----
  claude: [
    // blue rune sigil
    ...box(2, 2, 12, 12, "#103642", O),
    r(3, 3, 10, 1, C.cyanH),
    r(7, 4, 2, 2, C.cyanH),
    r(5, 6, 6, 1, C.cyan),
    r(7, 6, 2, 4, C.cyanH),
    r(4, 8, 2, 1, C.cyan),
    r(10, 8, 2, 1, C.cyan),
    r(6, 10, 4, 1, C.cyan),
    r(7, 11, 2, 1, C.cyanH),
  ],

  codex: [
    // green bracket/terminal rune
    ...box(2, 2, 12, 12, "#103a1f", O),
    r(3, 3, 10, 1, C.greenH),
    r(5, 5, 3, 1, C.green),
    r(5, 5, 1, 6, C.green),
    r(5, 10, 3, 1, C.green),
    r(11, 5, 1, 6, C.green),
    r(9, 5, 2, 1, C.green),
    r(9, 10, 2, 1, C.green),
    r(8, 9, 2, 1, C.greenH),
    r(9, 8, 1, 1, C.greenH),
  ],

  // ---- save / floppy (for transition) ----
  save: [
    ...box(2, 2, 12, 12, C.steelD, O),
    r(3, 3, 10, 1, C.steelH),
    r(5, 3, 6, 4, C.shadow),
    r(8, 4, 2, 2, C.cyan),
    r(4, 9, 8, 4, C.steel),
    r(4, 9, 8, 1, C.steelH),
    r(5, 10, 6, 2, C.shadow),
  ],

  // ---- vault / archive chest ----
  vault: [
    r(3, 5, 10, 1, O),
    r(3, 6, 10, 2, C.wood),
    r(3, 6, 10, 1, C.woodH),
    ...box(2, 8, 12, 5, C.woodD, O),
    r(7, 8, 2, 5, C.gold),
    r(7, 10, 2, 2, C.goldH),
    r(3, 2, 4, 3, C.woodD),
    r(9, 2, 4, 3, C.woodD),
    r(3, 4, 10, 1, O),
  ],
} as const;

// Widened for runtime indexing by arbitrary strings (e.g. mapping.ts tool names).
export const ICON_ART: Record<string, readonly Rect[]> = ICON_ART_DATA;

export type IconName = keyof typeof ICON_ART_DATA;

export const ICON_NAMES = Object.keys(ICON_ART_DATA) as IconName[];

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export function Icon({
  name,
  size = 24,
  glow,
  className,
  style,
  title,
}: {
  name: IconName;
  size?: number;
  glow?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const art = ICON_ART[name];
  if (!art) {
    // Defensive runtime guard — type system prevents this in practice
    return (
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          background: "#642",
        }}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={title ?? name}
      className={`pxicon${className ? ` ${className}` : ""}`}
      style={{
        display: "block",
        shapeRendering: "crispEdges",
        filter: glow ? `drop-shadow(0 0 4px ${glow})` : undefined,
        ...style,
      }}
    >
      {art.map((rect, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: static art data, order never changes
          key={i}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={rect.c}
        />
      ))}
    </svg>
  );
}
