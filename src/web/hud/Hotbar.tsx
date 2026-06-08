import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

// 底部居中操作坞(对标设计原型 hud.jsx Hotbar):两组 iconbtn,中间一条分隔。
// 仅内景显示(组件内 view!=='overworld' gate)。
//
// 接线说明:全部槽已走单一路由 openPanel(activePanel === panel ⇒ lit)。
// badge 角标:暂无真实徽标数据 → 不渲染(不造假);保留 .badge 渲染能力(badge?: number)
// 以便引擎补齐后接入。

// 走单一路由 openPanel 的面板。
type RoutePanel =
  | "tasks"
  | "shop"
  | "skills"
  | "leaderboard"
  | "backpack"
  | "chat"
  | "mailbox"
  | "pairing"
  | "model"
  | "import";

type Slot = {
  icon: IconName;
  panel: RoutePanel;
  label: string;
};

// g1:技能 / 背包 / 聊天 / 模型 / 导入(对标原型 hotbar g1)。
const GROUP1: Slot[] = [
  { icon: "spellbook", panel: "skills", label: "技能" },
  { icon: "pouch", panel: "backpack", label: "背包" },
  { icon: "chat", panel: "chat", label: "聊天" },
  { icon: "vault", panel: "mailbox", label: "信箱" },
  { icon: "mcp", panel: "pairing", label: "配对" },
  { icon: "crystal", panel: "model", label: "模型" },
  { icon: "import", panel: "import", label: "导入" },
];
// g2:任务 / 商店 / 排行榜(对标原型 hotbar g2)。
const GROUP2: Slot[] = [
  { icon: "quest", panel: "tasks", label: "任务" },
  { icon: "shop", panel: "shop", label: "商店" },
  { icon: "trophy", panel: "leaderboard", label: "排行榜" },
];

/** 单个 hotbar 槽。lit/onClick 由父注入。badge 暂传空(无真实数据)。 */
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
  // 路由当前面板(全部槽统一据此判定 lit)+ 打开面板的稳定函数。
  const activePanel = useUiStore((s) => s.activePanel);
  const openPanel = useUiStore((s) => s.openPanel);

  if (!inInterior) return null;

  const renderSlot = (slot: Slot) => (
    <HotbarSlot
      key={slot.label}
      slot={slot}
      lit={activePanel === slot.panel}
      onClick={() => openPanel(slot.panel)}
    />
  );

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
