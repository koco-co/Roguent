import { useT } from "../i18n";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

// 底部居中操作坞(对标设计原型 hud.jsx Hotbar):两组 iconbtn,中间一条分隔。
// 仅内景显示(组件内 view!=='overworld' gate)。
//
// 接线说明:全部槽已走单一路由 openPanel(activePanel === panel ⇒ lit)。
// badge 角标:暂无真实徽标数据 → 不渲染(不造假);保留 .badge 渲染能力(badge?: number)
// 以便引擎补齐后接入。

// 走单一路由 openPanel 的面板(hotbar 自己用到的子集;mailbox/pairing 仍是合法
// PanelId,但 design v2 把它们移到 ButtonDock,不再从 hotbar 路由)。
type RoutePanel =
  | "tasks"
  | "chat"
  | "skills"
  | "market"
  | "model"
  | "import"
  | "backpack"
  | "shop"
  | "leaderboard"
  | "achievements";

type Slot = {
  icon: IconName;
  panel: RoutePanel;
  label: string;
};

// 左组:工作流(任务/聊天/技能/插件市场/模型/导入)。对标设计稿 v2 hotbar g1。
const GROUP1: Slot[] = [
  { icon: "quest", panel: "tasks", label: "任务" },
  { icon: "chat", panel: "chat", label: "聊天" },
  { icon: "spellbook", panel: "skills", label: "技能" },
  { icon: "mcp", panel: "market", label: "插件市场" },
  { icon: "crystal", panel: "model", label: "模型" },
  { icon: "import", panel: "import", label: "导入" },
];
// 右组:成长与资产(背包/装饰商店/排行/成就)。对标设计稿 v2 hotbar g2。
// 成就格:设计稿用「奖牌」图标,icons.tsx 无 medal → 用 laurel(桂冠,成就语义最近)。
const GROUP2: Slot[] = [
  { icon: "pouch", panel: "backpack", label: "背包" },
  { icon: "shop", panel: "shop", label: "装饰商店" },
  { icon: "trophy", panel: "leaderboard", label: "排行榜" },
  { icon: "laurel", panel: "achievements", label: "成就" },
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
  const t = useT();
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
      <div className="tip cjk">{t(slot.label)}</div>
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
