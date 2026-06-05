import { beforeEach, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  type Settings,
  parsePersisted,
  settingsRootClass,
  settingsRootStyle,
  useSettingsStore,
} from "./settings-store";

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});

test("默认值与 DEFAULT_SETTINGS 一致", () => {
  const s = useSettingsStore.getState();
  expect(s.accent).toBe("#36c5e0");
  expect(s.theme).toBe("teal");
  expect(s.motion).toBe(true);
  expect(s.density).toBe("comfy");
  expect(s.cjkPixel).toBe(true);
  expect(s.avatarHero).toBeNull();
});

test("setSetting 改单个键、不影响其它键", () => {
  useSettingsStore.getState().setSetting("theme", "forest");
  expect(useSettingsStore.getState().theme).toBe("forest");
  // 其它键不动
  expect(useSettingsStore.getState().accent).toBe("#36c5e0");
  expect(useSettingsStore.getState().motion).toBe(true);

  useSettingsStore.getState().setSetting("motion", false);
  expect(useSettingsStore.getState().motion).toBe(false);
  expect(useSettingsStore.getState().theme).toBe("forest"); // 之前的改动仍在
});

test("setSetting 支持 avatarHero(string 与 null)", () => {
  useSettingsStore.getState().setSetting("avatarHero", "wizzard_m");
  expect(useSettingsStore.getState().avatarHero).toBe("wizzard_m");
  useSettingsStore.getState().setSetting("avatarHero", null);
  expect(useSettingsStore.getState().avatarHero).toBeNull();
});

test("reset 恢复默认", () => {
  const s = useSettingsStore.getState();
  s.setSetting("theme", "cyber");
  s.setSetting("accent", "#ff4d6d");
  s.setSetting("motion", false);
  useSettingsStore.getState().reset();
  expect(useSettingsStore.getState().theme).toBe("teal");
  expect(useSettingsStore.getState().accent).toBe("#36c5e0");
  expect(useSettingsStore.getState().motion).toBe(true);
});

test("settingsRootClass: 默认全开 → 仅 room-teal", () => {
  expect(settingsRootClass(DEFAULT_SETTINGS)).toBe("room-teal");
});

test("settingsRootClass: motion=false → 含 no-motion", () => {
  expect(settingsRootClass({ ...DEFAULT_SETTINGS, motion: false })).toBe(
    "room-teal no-motion",
  );
});

test("settingsRootClass: density=compact → 含 hud-compact", () => {
  expect(settingsRootClass({ ...DEFAULT_SETTINGS, density: "compact" })).toBe(
    "room-teal hud-compact",
  );
});

test("settingsRootClass: cjkPixel=false → 含 cjk-sys", () => {
  expect(settingsRootClass({ ...DEFAULT_SETTINGS, cjkPixel: false })).toBe(
    "room-teal cjk-sys",
  );
});

test("settingsRootClass: theme 切换 → room-forest / room-cyber", () => {
  expect(settingsRootClass({ ...DEFAULT_SETTINGS, theme: "forest" })).toBe(
    "room-forest",
  );
  expect(settingsRootClass({ ...DEFAULT_SETTINGS, theme: "cyber" })).toBe(
    "room-cyber",
  );
});

test("settingsRootClass: 全部 off 组合按序拼接", () => {
  expect(
    settingsRootClass({
      ...DEFAULT_SETTINGS,
      theme: "cyber",
      motion: false,
      density: "compact",
      cjkPixel: false,
    }),
  ).toBe("room-cyber no-motion hud-compact cjk-sys");
});

test("settingsRootStyle: 三个 theme 各自的 --accent / --core-glow", () => {
  expect(settingsRootStyle(DEFAULT_SETTINGS)).toEqual({
    "--accent": "#36c5e0",
    "--core-glow": "rgba(54,170,210,.22)",
  });
  expect(settingsRootStyle({ ...DEFAULT_SETTINGS, theme: "forest" })).toEqual({
    "--accent": "#36c5e0",
    "--core-glow": "rgba(95,211,95,.2)",
  });
  expect(
    settingsRootStyle({
      ...DEFAULT_SETTINGS,
      theme: "cyber",
      accent: "#a06cd5",
    }),
  ).toEqual({
    "--accent": "#a06cd5",
    "--core-glow": "rgba(160,108,213,.24)",
  });
});

test("parsePersisted: null / 损坏 JSON → 空对象", () => {
  expect(parsePersisted(null)).toEqual({});
  expect(parsePersisted("not json {{{")).toEqual({});
  expect(parsePersisted("[1,2,3]")).toEqual({}); // 非对象
  expect(parsePersisted("null")).toEqual({}); // JSON null
});

test("parsePersisted: 合法子集被保留", () => {
  expect(
    parsePersisted(JSON.stringify({ theme: "cyber", motion: false })),
  ).toEqual({
    theme: "cyber",
    motion: false,
  });
});

test("parsePersisted: 未知键被忽略,类型错误的已知键被丢弃", () => {
  const parsed = parsePersisted(
    JSON.stringify({
      theme: "purple", // 非法枚举 → 丢
      density: "compact", // 合法
      motion: "yes", // 类型错 → 丢
      bogus: 42, // 未知键 → 丢
      avatarHero: "knight_f",
    }),
  );
  expect(parsed).toEqual({ density: "compact", avatarHero: "knight_f" });
});

test("parsePersisted: avatarHero=null 被保留", () => {
  expect(parsePersisted(JSON.stringify({ avatarHero: null }))).toEqual({
    avatarHero: null,
  });
});

// 编译期类型断言:setSetting 的泛型签名对齐 Settings[K]。
const _typeCheck: <K extends keyof Settings>(k: K, v: Settings[K]) => void =
  useSettingsStore.getState().setSetting;
void _typeCheck;
