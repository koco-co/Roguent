import { create } from "zustand";

// 用户 UI 偏好(对标设计原型 app.jsx 的 TWEAK_DEFAULTS / setTweak)。
// 工程决策:内部一律用规范英文键(theme/density 不存中文 label);中文 label 是
// 设置面板 UI 层(T3.5)的事,不进 store。
export interface Settings {
  /** 强调色(hex);驱动 --accent。 */
  accent: string;
  /** 房间主题;驱动 room-* class 与 --core-glow。 */
  theme: "teal" | "forest" | "cyber";
  /** 动效开关;false → no-motion class。 */
  motion: boolean;
  /** HUD 密度;compact → hud-compact class。 */
  density: "comfy" | "compact";
  /** 像素中文字体;false → cjk-sys class(回落系统字体)。 */
  cjkPixel: boolean;
  /**
   * 玩家英雄皮肤;null 表示回退到默认 "knight_m"(= CharacterSelect 首选「骑士」,
   * 见 src/web/lobby/HubPlaza.tsx 的 avatarHero 回落)。英雄池见 CharacterSelect 的
   * CHARSEL_HEROES。由大厅玩家(HubPlaza)消费并持久化。
   */
  avatarHero: string | null;
  /** Additive room glows: door, fountains, and ambient light pools. */
  ambientGlow: boolean;
  /** Decorative rain streaks in the room air. */
  ambientRain: boolean;
  /** Ambient motes/sparks/loot/footstep particles. */
  ambientParticles: boolean;
  /** App-level ambience sound preference; audio engine may consume later. */
  ambientSound: boolean;
  /** 界面语言;"cn" 中文(默认)/ "en" English。产品术语两种语言下都保持英文。 */
  uiLang: "cn" | "en";
}

export const DEFAULT_SETTINGS: Settings = {
  accent: "#36c5e0",
  theme: "teal",
  motion: true,
  density: "comfy",
  cjkPixel: true,
  avatarHero: null,
  ambientGlow: true,
  ambientRain: true,
  ambientParticles: true,
  ambientSound: true,
  uiLang: "cn",
};

// theme → 核心辉光色(对标原型 GLOW 映射)。
const GLOW: Record<Settings["theme"], string> = {
  teal: "rgba(54,170,210,.22)",
  forest: "rgba(95,211,95,.2)",
  cyber: "rgba(160,108,213,.24)",
};

const STORAGE_KEY = "roguent:settings";

/**
 * 根节点 class 串(对标原型 rootClass,但不含 stage-root —— 本仓库根节点不需要那个
 * 原型专用 id/class)。
 *
 * CSS 消费端归属(store 在此正确产出 hook,样式规则在各自任务里补):
 *   · cjk-sys      —— 已接线(styles.css `.cjk-sys`,T0.5)
 *   · hud-compact  —— 待 T2.x 内景 HUD chrome(缩放 .dock/.hotbar/.session-banner/.currency 等)
 *   · no-motion    —— 待收尾补全局 `.no-motion *{animation:none}`(对标原型 layout.css)
 *   · room-*       —— 待房间主题接线(随 --core-glow 一起,见 settingsRootStyle)
 * 在对应规则落地前,这几个偏好改了暂无视觉效果(非缺陷)。
 */
export function settingsRootClass(s: Settings): string {
  return [
    `room-${s.theme}`,
    s.motion ? "" : "no-motion",
    s.density === "compact" ? "hud-compact" : "",
    s.cjkPixel ? "" : "cjk-sys",
    s.ambientGlow ? "" : "no-ambient-glow",
    s.ambientRain ? "" : "no-ambient-rain",
    s.ambientParticles ? "" : "no-ambient-particles",
    s.ambientSound ? "" : "sound-muted",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 根节点 CSS 自定义属性(对标原型 rootStyle)。
 * --accent 已被多处消费(styles.css 的辉光/选中描边);--core-glow 待房间主题接线
 * (对标原型 layout.css 的 `.room-core-glow{...var(--core-glow)...}`)。
 */
export function settingsRootStyle(
  s: Settings,
): Record<"--accent" | "--core-glow", string> {
  return { "--accent": s.accent, "--core-glow": GLOW[s.theme] };
}

/**
 * 把持久化的原始字符串解析成已知键的子集。对未知 / 损坏数据宽容:JSON 解析失败或
 * 非对象 → 空;只挑出类型正确的已知键(未知键忽略)。抽成纯函数便于单测。
 */
export function parsePersisted(raw: string | null): Partial<Settings> {
  if (raw == null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  const obj = data as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof obj.accent === "string") out.accent = obj.accent;
  if (obj.theme === "teal" || obj.theme === "forest" || obj.theme === "cyber") {
    out.theme = obj.theme;
  }
  if (typeof obj.motion === "boolean") out.motion = obj.motion;
  if (obj.density === "comfy" || obj.density === "compact") {
    out.density = obj.density;
  }
  if (typeof obj.cjkPixel === "boolean") out.cjkPixel = obj.cjkPixel;
  if (typeof obj.avatarHero === "string" || obj.avatarHero === null) {
    out.avatarHero = obj.avatarHero;
  }
  if (typeof obj.ambientGlow === "boolean") {
    out.ambientGlow = obj.ambientGlow;
  }
  if (typeof obj.ambientRain === "boolean") {
    out.ambientRain = obj.ambientRain;
  }
  if (typeof obj.ambientParticles === "boolean") {
    out.ambientParticles = obj.ambientParticles;
  }
  if (typeof obj.ambientSound === "boolean") {
    out.ambientSound = obj.ambientSound;
  }
  if (obj.uiLang === "cn" || obj.uiLang === "en") out.uiLang = obj.uiLang;
  return out;
}

// 读已持久化的偏好,与默认值合并。所有 localStorage 访问都守卫(测试环境无该全局、
// 隐私模式 / Tauri 可能抛错),失败回落默认。
function loadPersisted(): Settings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...parsePersisted(localStorage.getItem(STORAGE_KEY)),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// 把当前可序列化偏好写回 localStorage;同样全程守卫。
function savePersisted(s: Settings): void {
  if (typeof localStorage === "undefined") return;
  try {
    const {
      accent,
      theme,
      motion,
      density,
      cjkPixel,
      avatarHero,
      ambientGlow,
      ambientRain,
      ambientParticles,
      ambientSound,
      uiLang,
    } = s;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accent,
        theme,
        motion,
        density,
        cjkPixel,
        avatarHero,
        ambientGlow,
        ambientRain,
        ambientParticles,
        ambientSound,
        uiLang,
      }),
    );
  } catch {
    /* 隐私模式 / 配额满 —— 静默忽略,不挡 UI。 */
  }
}

interface SettingsActions {
  /** 类型安全地改单个偏好(对标原型 setTweak)。 */
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** 恢复全部默认。 */
  reset: () => void;
}

export type SettingsStore = Settings & SettingsActions;

// 不用 zustand persist 中间件:bun:test 环境无 localStorage 全局,中间件在 create
// 时即抛错。改为手写 load + subscribe 写回(见上方守卫)。
export const useSettingsStore = create<SettingsStore>((set) => ({
  ...loadPersisted(),
  setSetting: (key, value) =>
    set({ [key]: value } as Pick<Settings, typeof key>),
  reset: () => set({ ...DEFAULT_SETTINGS }),
}));

// 任意偏好变化时持久化(actions 不会变,序列化时已剔除)。
useSettingsStore.subscribe((s) => savePersisted(s));
