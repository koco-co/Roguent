import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type RuntimeKind, defaultRuntimeConfig } from "../../shared/runtime";
import { MimicChest } from "../easter/MimicChest";
import { PetActor } from "../easter/PetActor";
import { Icon, type IconName } from "../hud/icons";
import { useT, useTL } from "../i18n";
import { useSettingsStore } from "../settings-store";
import {
  selectMailboxBoardItemsFromMailbox,
  selectMailboxUnreadCount,
  useRoomStore,
} from "../store";
import { type PanelId, useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { HubCanvas } from "./HubCanvas";
import { PixelSprite } from "./PixelSprite";
import { useSpriteTick } from "./sprite-tick";

// 大厅暖色开放广场,移植自原型 lobby.jsx 的 HubWorld:固定结构(中央任务台 + 四周
// vendor + 两侧 runtime 门)+ 可操控 avatar(WASD/点击移动)+ 黑猫 + 漫步小人。
// 逻辑全在虚拟 1920×1080 坐标系里跑(速度/半径照搬原型),渲染时按 % 映射到实际视口,
// 自适应不黑边。sessions 改由任务台打开的 SessionGrid 面板浏览(已实现)。
//
// 真假边界:任务台/项目门 → 真 SessionGrid / newSession;vendor → 真面板。
// 商店/扭蛋仍进入 Shop,由 Shop 自身显式标注 mock 经济边界。

const VW = 1920;
const VH = 1080;

type PanelAction = Extract<
  PanelId,
  | "sessiongrid"
  | "tasks"
  | "shop"
  | "market"
  | "gacha"
  | "achievements"
  | "board"
  | "settings"
  | "mailbox"
  | "leaderboard"
  | "backpack"
>;

type InteractAction =
  | { kind: "panel"; panel: PanelAction }
  | { kind: "runtime"; runtime: RuntimeKind };

interface Interactable {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  sub: string;
  action: InteractAction;
  icon: IconName;
  accent: string;
}

const INTERACT: Interactable[] = [
  {
    id: "tower",
    x: 960,
    y: 512,
    r: 170,
    label: "任务台",
    sub: "QUEST CONSOLE",
    action: { kind: "panel", panel: "sessiongrid" },
    icon: "quest",
    accent: "#36c5e0",
  },
  {
    id: "shop",
    x: 1556,
    y: 452,
    r: 140,
    label: "装饰商店",
    sub: "SHOP",
    action: { kind: "panel", panel: "shop" },
    icon: "shop",
    accent: "#a06cd5",
  },
  {
    id: "market",
    x: 660,
    y: 452,
    r: 132,
    label: "插件市场",
    sub: "MARKET",
    action: { kind: "panel", panel: "market" },
    icon: "mcp",
    accent: "#36c5e0",
  },
  {
    id: "gacha",
    x: 1576,
    y: 738,
    r: 130,
    label: "扭蛋机",
    sub: "GACHA",
    action: { kind: "panel", panel: "gacha" },
    icon: "crystal",
    accent: "#a06cd5",
  },
  {
    id: "board",
    x: 360,
    y: 742,
    r: 140,
    label: "公告板",
    sub: "BOARD",
    action: { kind: "panel", panel: "board" },
    icon: "trophy",
    accent: "#f2c84b",
  },
  {
    id: "mailbox",
    x: 1272,
    y: 248,
    r: 120,
    label: "邮箱",
    sub: "MAILBOX",
    action: { kind: "panel", panel: "mailbox" },
    icon: "vault",
    accent: "#36c5e0",
  },
  {
    id: "altar",
    x: 960,
    y: 236,
    r: 130,
    label: "设置祭坛",
    sub: "CONFIG",
    action: { kind: "panel", panel: "settings" },
    icon: "gear",
    accent: "#36c5e0",
  },
  {
    id: "achievements",
    x: 652,
    y: 248,
    r: 130,
    label: "成就殿",
    sub: "ACHIEVEMENTS",
    action: { kind: "panel", panel: "achievements" },
    icon: "pouch",
    accent: "#5fd35f",
  },
  {
    id: "leaderboard",
    x: 362,
    y: 452,
    r: 140,
    label: "排行榜",
    sub: "RANKING",
    action: { kind: "panel", panel: "leaderboard" },
    icon: "trophy",
    accent: "#f2c84b",
  },
  {
    id: "cdoor",
    x: 214,
    y: 946,
    r: 120,
    label: "Claude 项目",
    sub: "",
    action: { kind: "runtime", runtime: "claude" },
    icon: "quest",
    accent: "#36c5e0",
  },
  {
    id: "xdoor",
    x: 1706,
    y: 946,
    r: 120,
    label: "Codex 项目",
    sub: "",
    action: { kind: "runtime", runtime: "codex" },
    icon: "quest",
    accent: "#5fd35f",
  },
];

// 漫步装饰小人(纯氛围,不可交互):[hero, x, y] 虚拟坐标。
const DECOR: [string, number, number][] = [
  ["knight_f", 150, 360],
  ["dwarf_m", 1700, 392],
  ["wizzard_f", 1668, 586],
  ["goblin", 120, 600],
];

// ── 环境装饰(纯氛围,全确定性,禁 Math.random;照原型 lobby.jsx:147-181)──
// 城墙火把坐标(虚拟 1920×1080)。
const TORCHES: [number, number][] = [
  [150, 150],
  [560, 150],
  [960, 120],
  [1360, 150],
  [1770, 150],
];
// 石化英雄雕像:[hero, x, y, flip],分立广场两侧。
const STATUES: [string, number, number, boolean][] = [
  ["knight_m", 724, 548, false],
  ["elf_f", 1196, 548, true],
];
// 粒子参数走原型公式(density 固定 1):embers×18 / leaves×14 / fireflies×7。
const EMBER_N = 18;
const LEAF_N = 14;
const FIREFLY_N = 7;

const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const dist = (
  p: { x: number; y: number },
  it: { x: number; y: number },
): number => Math.hypot(p.x - it.x, p.y - it.y);
let runtimeDoorSessionSeq = 0;

function isKeyboardOwnedElement(el: Element | null, key: string): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "BUTTON") {
    return key === "Enter" || key === " " || key === "Spacebar";
  }
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

// 扭蛋机穹顶 5 色 gm-cap(纯装饰,色序照原型 lobby.jsx:220)。
const GACHA_CAPS = ["#ff4d6d", "#36c5e0", "#f2c84b", "#5fd35f", "#a06cd5"];
// 摊位类结构 id → (icon, 强调色),照原型 lobby.jsx:246-247,按本仓 id 映射。
const STALL_META: Record<string, { icon: IconName; color: string }> = {
  shop: { icon: "shop", color: "#a06cd5" },
  leaderboard: { icon: "trophy", color: "#f2c84b" },
  altar: { icon: "gear", color: "#36c5e0" },
  achievements: { icon: "medal", color: "#f2c84b" },
  market: { icon: "mcp", color: "#36c5e0" },
};

function Structure({
  it,
  near,
  onClick,
  tick,
}: {
  it: Interactable;
  near: boolean;
  onClick: (e: React.MouseEvent) => void;
  tick: number;
}) {
  const t = useT();
  // en 模式隐藏 struct-sub(英文代号在英文 UI 里冗余,对标设计原型)。基元 selector。
  const lang = useSettingsStore((s) => s.uiLang);
  // 邮箱徽标 / 公告便签接真:订阅 mailbox slice(稳定引用,不在 selector 里构造新值),
  // 派生值用 useMemo / 纯函数算。hooks 全在 early return 前,顺序稳定。
  const mailbox = useRoomStore((s) => s.mailbox);
  const unread = mailbox ? selectMailboxUnreadCount(mailbox) : 0;
  const boardNotes = useMemo(
    () =>
      mailbox ? selectMailboxBoardItemsFromMailbox(mailbox, { limit: 3 }) : [],
    [mailbox],
  );
  const float = Math.sin(tick / 3) * 4;
  let body: React.ReactNode;
  if (it.id === "tower") {
    body = (
      <div className="struct-tower">
        <div className="tower-ring" />
        <div
          className="tower-orb"
          style={{ transform: `translateY(${float}px)` }}
        >
          <Icon name="quest" size={64} glow="#36c5e0" />
        </div>
        <div className="tower-base">
          <PixelSprite
            name="wall_fountain_mid_blue_anim_f0"
            scale={5}
            animated={false}
          />
          <PixelSprite
            name="wall_fountain_basin_blue_anim_f0"
            scale={5}
            animated={false}
          />
        </div>
        {/* 喷泉水滴 ×4(纯装饰,CSS 驱动) */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={`d${i}`}
            className="fountain-drop"
            style={
              { "--i": i, animationDelay: `${i * 0.4}s` } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  } else if (it.action.kind === "runtime") {
    const col = it.accent;
    body = (
      <div
        className="struct-door"
        style={{ "--ac": col } as React.CSSProperties}
      >
        <div className="door-flag" style={{ background: col }}>
          <Icon
            name={it.action.runtime === "codex" ? "codex" : "claude"}
            size={18}
          />
        </div>
        <PixelSprite name="doors_leaf_closed" scale={4} animated={false} />
      </div>
    );
  } else if (it.id === "gacha") {
    body = (
      <div className="struct-gacha">
        <div className="gm-dome">
          {GACHA_CAPS.map((c, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 静态 5 色穹顶豆,不重排
              key={`cap${i}`}
              className="gm-cap"
              style={{
                background: c,
                left: `${14 + i * 16}%`,
                top: `${18 + (i % 2) * 30}%`,
              }}
            />
          ))}
        </div>
        <div className="gm-body">
          <div className="gm-knob" />
          <div className="gm-slot" />
        </div>
        <div className="vendor-ped" />
        <div
          className="gacha-sparkle"
          style={{ transform: `translateY(${float}px)` }}
        >
          ✦
        </div>
      </div>
    );
  } else if (it.id === "board") {
    // 公告便签接真:取 mailbox board 前 3 条,标题渲染进 .board-note(无源则不渲染便签)。
    body = (
      <div className="struct-board">
        <div className="board-roof" />
        <div className="board-face">
          {boardNotes.map((note, i) => (
            <div
              key={note.id}
              className="board-note"
              style={
                {
                  "--ac": GACHA_CAPS[i % GACHA_CAPS.length],
                } as React.CSSProperties
              }
            >
              <span className="board-pin" />
              <span className="board-note-t">{note.title}</span>
            </div>
          ))}
        </div>
        <div className="board-legs">
          <span />
          <span />
        </div>
      </div>
    );
  } else if (it.id === "mailbox") {
    // 未读徽标接真:unread>0 才翻旗 + 显示红点数字。
    body = (
      <div className="struct-mailbox">
        <div className={`mailbox-flag${unread > 0 ? " up" : ""}`} />
        <div className="mailbox-box">
          <Icon name="mail" size={34} />
        </div>
        <div className="mailbox-post" />
        {unread > 0 ? <div className="mailbox-count px">{unread}</div> : null}
      </div>
    );
  } else {
    const meta = STALL_META[it.id] ?? { icon: it.icon, color: it.accent };
    const col = meta.color;
    body = (
      <div
        className={`struct-stall stall-${it.id}`}
        style={{ "--ac": col } as React.CSSProperties}
      >
        <div className="stall-roof" />
        <div className="stall-valance" />
        <div className="stall-body">
          <div className="stall-post l" />
          <div className="stall-post r" />
          <div
            className="stall-sign"
            style={{ transform: `translateY(${float}px)` }}
          >
            <Icon name={meta.icon} size={40} glow={col} />
          </div>
          <div className="stall-counter" />
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`structure${near ? " near" : ""}`}
      aria-label={`${t(it.label)}${it.sub ? ` ${it.sub}` : ""}`}
      style={{ left: pct(it.x, VW), top: pct(it.y, VH) }}
      onClick={onClick}
    >
      {body}
      <div className="struct-label">
        <span>{t(it.label)}</span>
        {lang !== "en" && it.sub ? (
          <span className="struct-sub px">{it.sub}</span>
        ) : null}
      </div>
    </button>
  );
}

function nextSessionNumber(): number {
  const nums = Object.keys(useRoomStore.getState().sessions)
    .map((id) => Number(id.replace(/^s/, "")))
    .filter((n) => Number.isFinite(n));
  runtimeDoorSessionSeq =
    Math.max(runtimeDoorSessionSeq, nums.length ? Math.max(...nums) : 0) + 1;
  return runtimeDoorSessionSeq;
}

export interface HubPlazaProps {
  initialPosition?: { x: number; y: number };
}

export function HubPlaza({ initialPosition }: HubPlazaProps = {}) {
  const t = useT();
  const tl = useTL();
  const openPanel = useUiStore((s) => s.openPanel);
  const avatarHero = useSettingsStore((s) => s.avatarHero) ?? "knight_m";
  const hubRef = useRef<HTMLDivElement>(null);
  const avRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const pos = useRef(initialPosition ?? { x: 960, y: 900 });
  const petPos = useRef({
    x: (initialPosition?.x ?? 960) - 60,
    y: (initialPosition?.y ?? 900) + 30,
  });
  const tgt = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const face = useRef(1);
  const [near, setNear] = useState<Interactable | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState(1);
  const tick = useSpriteTick();

  // 输入是否暂停:有模态面板打开,或还没选角色(CharacterSelect 门盖在上面)。
  // useCallback 让两者引用稳定,既能进 effect 依赖又不会让 rAF 循环重挂。
  const blocked = useCallback(
    () =>
      useUiStore.getState().activePanel !== null ||
      useSettingsStore.getState().avatarHero === null,
    [],
  );
  const fire = useCallback(
    (it: Interactable) => {
      if (it.action.kind === "panel") {
        openPanel(it.action.panel);
        return;
      }
      const n = nextSessionNumber();
      const config = defaultRuntimeConfig(it.action.runtime);
      sendCommand({
        cmd: "newSession",
        sessionId: `s${n}`,
        title: `${it.action.runtime === "codex" ? "Codex" : "Claude"} 会话 ${n}`,
        model: config.model,
        runtime: config.runtime,
        permissionMode: config.permissionMode,
        ...(config.approvalPolicy
          ? { approvalPolicy: config.approvalPolicy }
          : {}),
        sandboxMode: config.sandboxMode,
        ...(config.reasoningEffort
          ? { reasoningEffort: config.reasoningEffort }
          : {}),
        networkAccess: config.networkAccess,
      });
    },
    [openPanel],
  );

  // 移动 + 邻近检测循环(rAF,坐标全在虚拟 1920×1080;avatar/pet 位置走命令式 DOM,
  // 不进 React state,只有 near/moving/facing 变化时才 setState)。
  useEffect(() => {
    const MAP: Record<string, string> = {
      w: "up",
      s: "down",
      a: "left",
      d: "right",
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
    };
    const kd = (e: KeyboardEvent) => {
      if (isKeyboardOwnedElement(document.activeElement, e.key)) return;
      if (blocked()) return;
      const k = e.key.toLowerCase();
      const dir = MAP[k];
      if (dir) {
        keys.current.add(dir);
        tgt.current = null;
      } else if (k === "e" || k === "enter") {
        const n = INTERACT.find((it) => dist(pos.current, it) < it.r);
        if (n) fire(n);
      }
    };
    const ku = (e: KeyboardEvent) => {
      const dir = MAP[e.key.toLowerCase()];
      if (dir) keys.current.delete(dir);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);

    let raf = 0;
    let lastMoving = false;
    let lastFace = 1;
    let lastNear: string | null = null;
    const loop = () => {
      const p = pos.current;
      const sp = 7;
      let vx = 0;
      let vy = 0;
      if (!blocked()) {
        for (const dir of keys.current) {
          if (dir === "up") vy -= 1;
          if (dir === "down") vy += 1;
          if (dir === "left") vx -= 1;
          if (dir === "right") vx += 1;
        }
      }
      let mv = false;
      if (vx || vy) {
        const m = Math.hypot(vx, vy) || 1;
        p.x += (vx / m) * sp;
        p.y += (vy / m) * sp;
        mv = true;
        if (vx) face.current = vx < 0 ? -1 : 1;
      } else if (tgt.current && !blocked()) {
        const dx = tgt.current.x - p.x;
        const dy = tgt.current.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 6) {
          p.x += (dx / d) * sp;
          p.y += (dy / d) * sp;
          mv = true;
          if (Math.abs(dx) > 1) face.current = dx < 0 ? -1 : 1;
        } else {
          tgt.current = null;
        }
      }
      p.x = Math.max(70, Math.min(VW - 70, p.x));
      // y 下限对照原型 lobby.jsx:121(1060,即 VH-20)。
      p.y = Math.max(150, Math.min(VH - 20, p.y));
      if (avRef.current) {
        avRef.current.style.left = pct(p.x, VW);
        avRef.current.style.top = pct(p.y, VH);
      }
      // 黑猫跟随
      const pt = petPos.current;
      const pdx = p.x - 40 - pt.x;
      const pdy = p.y - pt.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd > 55) {
        pt.x += (pdx / pd) * 5;
        pt.y += (pdy / pd) * 5;
      }
      if (petRef.current) {
        petRef.current.style.left = pct(pt.x, VW);
        petRef.current.style.top = pct(pt.y, VH);
      }
      const n = INTERACT.find((it) => dist(p, it) < it.r) ?? null;
      if ((n?.id ?? null) !== lastNear) {
        lastNear = n?.id ?? null;
        setNear(n);
      }
      if (mv !== lastMoving) {
        lastMoving = mv;
        setMoving(mv);
      }
      if (face.current !== lastFace) {
        lastFace = face.current;
        setFacing(face.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, [blocked, fire]);

  const toVirtual = (clientX: number, clientY: number) => {
    const rect = hubRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * VW,
      y: ((clientY - rect.top) / rect.height) * VH,
    };
  };
  const clickBg = (e: React.MouseEvent) => {
    if (blocked()) return;
    const v = toVirtual(e.clientX, e.clientY);
    if (v) {
      tgt.current = v;
      keys.current.clear();
    }
  };
  const clickStruct = (e: React.MouseEvent, it: Interactable) => {
    e.stopPropagation();
    if (blocked()) return;
    fire(it);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 点击寻路;键盘走 WASD,a11y 由 App 集中处理
    <div ref={hubRef} className="hub" onClick={clickBg}>
      <HubCanvas />
      <div className="hub-sun" />
      {/* 日夜切换无真实设置源,固定 day 观感(tod-tint/hub-sun 的 CSS 默认值
          即原型 .tod-day 那组,见 styles.css §HUB 环境装饰)。 */}
      <div className="tod-tint" />
      <div className="vignette town" />
      <div className="hub-bigglow" />
      {Array.from({ length: EMBER_N }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态确定性粒子,数量固定不重排
          key={`em${i}`}
          className="ember"
          style={{
            left: `${4 + i * (95 / EMBER_N)}%`,
            bottom: "-20px",
            animationDelay: `${i * 0.6}s`,
            animationDuration: `${8 + (i % 6)}s`,
          }}
        />
      ))}
      {Array.from({ length: LEAF_N }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态确定性粒子,数量固定不重排
          key={`lf${i}`}
          className={`hub-leaf k${i % 4}`}
          style={{
            left: `${-4 + i * (100 / LEAF_N)}%`,
            top: "-6%",
            animationDelay: `${i * 1.3}s`,
            animationDuration: `${11 + (i % 7)}s`,
          }}
        />
      ))}
      {Array.from({ length: FIREFLY_N }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态确定性粒子,数量固定不重排
          key={`ff${i}`}
          className="hub-firefly"
          style={{
            left: pct(640 + ((i * 173) % 680), VW),
            top: pct(390 + ((i * 97) % 280), VH),
            animationDelay: `${i * 0.8}s`,
            animationDuration: `${4 + (i % 4)}s`,
          }}
        />
      ))}
      <div className="hub-plaza-rune">
        <div className="hub-plaza-ring" />
        <div className="hub-plaza-ring rev" />
      </div>
      {TORCHES.map(([x, y], i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态固定坐标火把,不重排
          key={`tor${i}`}
          className="torch"
          style={{ left: pct(x, VW), top: pct(y, VH) }}
        >
          <div className="torch-bracket" />
          <div className="torch-flame" />
          <div className="torch-glow" />
          {[0, 1, 2].map((s) => (
            <div
              key={`s${s}`}
              className="torch-spark"
              style={{ animationDelay: `${s * 0.5}s` }}
            />
          ))}
        </div>
      ))}
      {DECOR.map(([hero, x, y]) => (
        <div
          key={hero}
          className="hub-decor"
          style={{ left: pct(x, VW), top: pct(y, VH) }}
        >
          <PixelSprite base={hero} anim="idle" scale={3.4} flip={x > VW / 2} />
        </div>
      ))}
      {STATUES.map(([hero, x, y, flip]) => (
        <div
          key={hero}
          className="hub-statue"
          style={{ left: pct(x, VW), top: pct(y, VH) }}
        >
          <div className="hub-statue-fig">
            <PixelSprite base={hero} anim="idle" scale={3.6} flip={flip} />
          </div>
          <div className="hub-statue-ped" />
        </div>
      ))}
      {INTERACT.map((it) => (
        <Structure
          key={it.id}
          it={it}
          near={near?.id === it.id}
          onClick={(e) => clickStruct(e, it)}
          tick={tick}
        />
      ))}
      {/* 隐藏宝箱怪彩蛋:伪装成草坪宝物,点击咬合(虚拟坐标 1505,846)。 */}
      <div
        className="hub-mimic"
        style={{ left: pct(1505, VW), top: pct(846, VH) }}
      >
        <MimicChest scale={4} />
      </div>
      <div
        ref={petRef}
        className="hub-pet"
        style={{
          left: pct(petPos.current.x, VW),
          top: pct(petPos.current.y, VH),
        }}
      >
        <PetActor scale={3} />
      </div>
      <div
        ref={avRef}
        className="hub-avatar"
        style={{ left: pct(pos.current.x, VW), top: pct(pos.current.y, VH) }}
      >
        {near ? (
          <div className="hub-prompt">
            <span className="px">E</span> {t("进入")} {t(near.label)}
          </div>
        ) : null}
        <div className="hub-avatar-ring" />
        <PixelSprite
          base={avatarHero}
          anim={moving ? "run" : "idle"}
          scale={4.4}
          flip={facing < 0}
        />
      </div>
      <div className="hub-controls px">
        {tl("WASD / 点击移动 · E 交互", "WASD / click to move · E interact")}
      </div>
    </div>
  );
}

/** 大厅视图:始终渲染可操控暖色广场;新会话由 Claude/Codex 门创建。 */
export function LobbyView() {
  return (
    <div data-testid="lobby-view">
      <HubPlaza />
    </div>
  );
}
