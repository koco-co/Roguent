import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

// 底部居中操作坞(对标设计原型 hud.jsx Hotbar):两组 iconbtn,中间一条分隔。
// 仅内景显示(组件内 view!=='overworld' gate)。
//
// 接线说明(过渡期混合接线):
// - 剩余 5 个面板仍走布尔标志(T3.x 各面板迁到单一路由后统一):
//   backpack→lootOpen、chat→drawerOpen、model→modelOpen、
//   import→importOpen、leaderboard→leaderboardOpen;lit = 对应布尔。
// - skills / tasks / shop 走 openPanel(单一路由);skills 已迁(T3.3 Skills Modal),
//   lit = activePanel === id。
// - badge 角标:暂无真实徽标数据 → 不渲染(不造假);保留 .badge 渲染能力(badge?: number)
//   以便引擎补齐后接入。

// 走布尔标志的槽(过渡期遗留)。
type FlagKey =
  | "lootOpen"
  | "drawerOpen"
  | "modelOpen"
  | "importOpen"
  | "leaderboardOpen";
// 走单一路由 openPanel 的槽。
type RoutePanel = "tasks" | "shop" | "skills";

type FlagSlot = { kind: "flag"; icon: IconName; flag: FlagKey; label: string };
type RouteSlot = {
  kind: "route";
  icon: IconName;
  panel: RoutePanel;
  label: string;
};
type Slot = FlagSlot | RouteSlot;

// g1:技能 / 背包 / 聊天 / 模型 / 导入(对标原型 hotbar g1)。
const GROUP1: Slot[] = [
  { kind: "route", icon: "spellbook", panel: "skills", label: "技能" },
  { kind: "flag", icon: "pouch", flag: "lootOpen", label: "背包" },
  { kind: "flag", icon: "chat", flag: "drawerOpen", label: "聊天" },
  { kind: "flag", icon: "crystal", flag: "modelOpen", label: "模型" },
  { kind: "flag", icon: "import", flag: "importOpen", label: "导入" },
];
// g2:任务 / 商店 / 排行榜(对标原型 hotbar g2)。
const GROUP2: Slot[] = [
  { kind: "route", icon: "quest", panel: "tasks", label: "任务" }, // panel 待 T3.x
  { kind: "route", icon: "shop", panel: "shop", label: "商店" }, // panel 待 T3.x
  { kind: "flag", icon: "trophy", flag: "leaderboardOpen", label: "排行榜" },
];

/** 单个 hotbar 槽。lit/onClick 由父按接线方式注入。badge 暂传空(无真实数据)。 */
function HotbarSlot({
  slot,
  lit,
  onClick,
}: {
  slot: Slot;
  lit: boolean;
  onClick: () => void;
}) {
  // 角标暂无真实数据源 → 不渲染(保留 .badge 能力,引擎补齐后传 badge 即可)。
  const badge: number | null = null;
  return (
    <button
      type="button"
      className={`iconbtn${lit ? " active" : ""}`}
      onClick={onClick}
    >
      <Icon name={slot.icon} size={30} />
      {badge != null && <div className="badge count">{badge}</div>}
      <div className="tip cjk">{slot.label}</div>
    </button>
  );
}

/**
 * 底部居中操作坞。仅内景显示。自带绝对定位(.panel.hotbar + .hotbar-anchor)。
 */
export function Hotbar() {
  // 仅内景 HUD 显示;总览大厅没有「操作坞」。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  // 订阅各布尔标志 + 路由当前面板,用于 lit 态。
  const lootOpen = useUiStore((s) => s.lootOpen);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const modelOpen = useUiStore((s) => s.modelOpen);
  const importOpen = useUiStore((s) => s.importOpen);
  const leaderboardOpen = useUiStore((s) => s.leaderboardOpen);
  const activePanel = useUiStore((s) => s.activePanel);
  const toggle = useUiStore((s) => s.toggle);
  const openPanel = useUiStore((s) => s.openPanel);

  if (!inInterior) return null;

  // 布尔标志当前值查表(用于 lit)。
  const flagValue: Record<FlagKey, boolean> = {
    lootOpen,
    drawerOpen,
    modelOpen,
    importOpen,
    leaderboardOpen,
  };

  const renderSlot = (slot: Slot) => {
    if (slot.kind === "flag") {
      return (
        <HotbarSlot
          key={slot.label}
          slot={slot}
          lit={flagValue[slot.flag]}
          onClick={() => toggle(slot.flag)}
        />
      );
    }
    return (
      <HotbarSlot
        key={slot.label}
        slot={slot}
        lit={activePanel === slot.panel}
        onClick={() => openPanel(slot.panel)}
      />
    );
  };

  return (
    <div className="panel hotbar hotbar-anchor">
      <div className="hotbar-body">
        <div className="hb-group">{GROUP1.map(renderSlot)}</div>
        <div className="hb-sep" />
        <div className="hb-group">{GROUP2.map(renderSlot)}</div>
      </div>
    </div>
  );
}
