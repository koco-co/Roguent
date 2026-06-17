// 美术风格包(Art Style Pack)— 忠实落地原型 panels2.jsx 的全局素材切换。
// 默认使用生成的科幻美术资源;pixel-fantasy 仅保留为手动 legacy 0x72 选项。
// 持久化沿用原型:localStorage['roguent_artpack'] + <html data-artpack>,不接 settings-store。
// name/desc 为中文(同时是 i18n DICT 键),渲染处经 t() 翻译;en 为英文副标题/useTL 用。

export interface ArtPack {
  id: string;
  name: string; // cn 名(DICT 键)
  en: string; // en 名
  ac: string; // 强调色 --ac
  desc: string; // cn 描述(DICT 键)
  ready?: boolean; // 是否有真实内置素材
  previews?: {
    lobby: string;
    interior: string;
  };
  ui?: {
    buttons: string;
  };
  sourceSheets?: {
    characters: string;
    environment: string;
    props: string;
    structures: string;
    hud: string;
    easter: string;
    ui: string;
  };
}

export const ARTPACK_KEY = "roguent_artpack";
export const ARTPACK_CHANGE_EVENT = "roguent:artpack-changed";
export const DEFAULT_ARTPACK = "neon-terminal";

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
    ready: true,
    previews: {
      lobby: "/assets/artpacks/neon-terminal/previews/lobby.png",
      interior: "/assets/artpacks/neon-terminal/previews/interior.png",
    },
    ui: {
      buttons: "/assets/artpacks/neon-terminal/ui/buttons.png",
    },
    sourceSheets: {
      characters: "/assets/artpacks/neon-terminal/characters/npcs.png",
      environment: "/assets/artpacks/neon-terminal/tiles/environment.png",
      props: "/assets/artpacks/neon-terminal/items/props.png",
      structures: "/assets/artpacks/neon-terminal/structures/source-sheet.png",
      hud: "/assets/artpacks/neon-terminal/hud/icons.png",
      easter: "/assets/artpacks/neon-terminal/easter/sprites.png",
      ui: "/assets/artpacks/neon-terminal/ui/buttons.png",
    },
  },
  {
    id: "holo-blueprint",
    name: "全息蓝图",
    en: "Holo Blueprint",
    ac: "#5aa9ff",
    desc: "线框全息投影 · 坐标网格 · 半透冷蓝",
    ready: true,
    previews: {
      lobby: "/assets/artpacks/holo-blueprint/previews/lobby.png",
      interior: "/assets/artpacks/holo-blueprint/previews/interior.png",
    },
    ui: {
      buttons: "/assets/artpacks/holo-blueprint/ui/buttons.png",
    },
    sourceSheets: {
      characters: "/assets/artpacks/holo-blueprint/characters/npcs.png",
      environment: "/assets/artpacks/holo-blueprint/tiles/environment.png",
      props: "/assets/artpacks/holo-blueprint/items/props.png",
      structures: "/assets/artpacks/holo-blueprint/structures/source-sheet.png",
      hud: "/assets/artpacks/holo-blueprint/hud/icons.png",
      easter: "/assets/artpacks/holo-blueprint/easter/sprites.png",
      ui: "/assets/artpacks/holo-blueprint/ui/buttons.png",
    },
  },
  {
    id: "deep-space",
    name: "深空舰桥",
    en: "Deep-Space Bridge",
    ac: "#a06cd5",
    desc: "星舰指挥桥 · 深空星野 · 暗物质金属",
    ready: true,
    previews: {
      lobby: "/assets/artpacks/deep-space/previews/lobby.png",
      interior: "/assets/artpacks/deep-space/previews/interior.png",
    },
    ui: {
      buttons: "/assets/artpacks/deep-space/ui/buttons.png",
    },
    sourceSheets: {
      characters: "/assets/artpacks/deep-space/characters/npcs.png",
      environment: "/assets/artpacks/deep-space/tiles/environment.png",
      props: "/assets/artpacks/deep-space/items/props.png",
      structures: "/assets/artpacks/deep-space/structures/source-sheet.png",
      hud: "/assets/artpacks/deep-space/hud/icons.png",
      easter: "/assets/artpacks/deep-space/easter/sprites.png",
      ui: "/assets/artpacks/deep-space/ui/buttons.png",
    },
  },
  {
    id: "synthwave",
    name: "合成波",
    en: "Synthwave Grid",
    ac: "#ff6a8a",
    desc: "80s 落日网格 · 品红/青渐隐 · 矢量霓虹",
    ready: true,
    previews: {
      lobby: "/assets/artpacks/synthwave/previews/lobby.png",
      interior: "/assets/artpacks/synthwave/previews/interior.png",
    },
    ui: {
      buttons: "/assets/artpacks/synthwave/ui/buttons.png",
    },
    sourceSheets: {
      characters: "/assets/artpacks/synthwave/characters/npcs.png",
      environment: "/assets/artpacks/synthwave/tiles/environment.png",
      props: "/assets/artpacks/synthwave/items/props.png",
      structures: "/assets/artpacks/synthwave/structures/source-sheet.png",
      hud: "/assets/artpacks/synthwave/hud/icons.png",
      easter: "/assets/artpacks/synthwave/easter/sprites.png",
      ui: "/assets/artpacks/synthwave/ui/buttons.png",
    },
  },
];

/** 读取当前包(异常/未设置 → 默认生成科幻图包)。 */
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ARTPACK_CHANGE_EVENT, { detail: { id } }),
    );
  }
}
