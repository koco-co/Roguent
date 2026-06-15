// 美术风格包(Art Style Pack)— 忠实落地原型 panels2.jsx 的全局素材切换。
// 只有 pixel-fantasy 是真内置素材;另外 4 个为占位(用户自备素材,未导入则回退占位图)。
// 持久化沿用原型:localStorage['roguent_artpack'] + <html data-artpack>,不接 settings-store。
// name/desc 为中文(同时是 i18n DICT 键),渲染处经 t() 翻译;en 为英文副标题/useTL 用。

export interface ArtPack {
  id: string;
  name: string; // cn 名(DICT 键)
  en: string; // en 名
  ac: string; // 强调色 --ac
  desc: string; // cn 描述(DICT 键)
  ready?: boolean; // 是否有真实内置素材
}

export const ARTPACK_KEY = "roguent_artpack";
export const DEFAULT_ARTPACK = "pixel-fantasy";

export const ART_PACKS: ArtPack[] = [
  {
    id: "pixel-fantasy",
    name: "像素奇幻",
    en: "Pixel Fantasy",
    ac: "#f2c84b",
    desc: "当前内置风格 · 地牢羊皮卷 · 暖棕木质 HUD",
    ready: true,
  },
  {
    id: "neon-terminal",
    name: "霓虹终端",
    en: "Neon Terminal",
    ac: "#36c5e0",
    desc: "CRT 扫描线 · 磷光青绿 · 赛博命令行界面",
  },
  {
    id: "holo-blueprint",
    name: "全息蓝图",
    en: "Holo Blueprint",
    ac: "#5aa9ff",
    desc: "线框全息投影 · 坐标网格 · 半透冷蓝",
  },
  {
    id: "deep-space",
    name: "深空舰桥",
    en: "Deep-Space Bridge",
    ac: "#a06cd5",
    desc: "星舰指挥桥 · 深空星野 · 暗物质金属",
  },
  {
    id: "synthwave",
    name: "合成波",
    en: "Synthwave Grid",
    ac: "#ff6a8a",
    desc: "80s 落日网格 · 品红/青渐隐 · 矢量霓虹",
  },
];

/** 读取当前包(异常/未设置 → 默认 pixel-fantasy)。 */
export function loadArtPack(): string {
  try {
    return localStorage.getItem(ARTPACK_KEY) || DEFAULT_ARTPACK;
  } catch {
    return DEFAULT_ARTPACK;
  }
}

/** 持久化选择 + 盖 <html data-artpack>(供未来素材/CSS 层挂钩)。 */
export function applyArtPack(id: string): void {
  try {
    localStorage.setItem(ARTPACK_KEY, id);
  } catch {
    // ignore(隐私模式 / 存储不可用)
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-artpack", id);
  }
}
