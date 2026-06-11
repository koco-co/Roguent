import { useT } from "../i18n";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

// 顶右设置坞(对标设计原型 hud.jsx ButtonDock):一列 iconbtn,每个 Icon + 悬浮 tip 标签。
// 两视图(大厅 / 内景)都显示。lit 态 = 该按钮目标 panel 当前为 activePanel。
//
// 接线说明(过渡期):
// - gear→settings、menu→menu、pause→menu(暂代「暂停」;真正的 transition 漩涡是 T3.12)
//   这三个目标 panel(settings/menu)是 T3.x 才建,现在点了只设 activePanel、无组件渲染 =
//   安全空操作(单一路由 openPanel 不报错)。注释标注「panel 待 T3.x」。
// - account→account:T3.11 已把账号正式接到 Account 面板(订阅 plan + 5h/周用量真数据)。
//   原 about 入口(T1.2 临时接在账号槽上)后续由 T3.12 SystemMenu 的「关于」承接;
//   "about" 暂保留在联合类型里(About 组件仍 working,T3.12 再正式接入口)。
type DockBtn = {
  icon: IconName;
  panel: "settings" | "menu" | "about" | "account" | "mailbox" | "board";
  label: string;
};

const DOCK_BTNS: DockBtn[] = [
  { icon: "vault", panel: "mailbox", label: "信箱" },
  { icon: "trophy", panel: "board", label: "公告" },
  { icon: "gear", panel: "settings", label: "设置" }, // panel 待 T3.x
  { icon: "menu", panel: "menu", label: "菜单" }, // panel 待 T3.x
  // T3.11:账号正式接 Account 面板;原临时的 about 入口由 T3.12 SystemMenu 承接。
  { icon: "account", panel: "account", label: "账号" },
  { icon: "pause", panel: "menu", label: "暂停" }, // 暂代,transition 漩涡是 T3.12
];

/**
 * 顶右设置坞。自带绝对定位(.dock + .dock-anchor),落在 Currency 下方。两视图都显示。
 */
export function ButtonDock() {
  const t = useT();
  const activePanel = useUiStore((s) => s.activePanel);
  const openPanel = useUiStore((s) => s.openPanel);

  return (
    <div className="dock dock-anchor">
      {DOCK_BTNS.map((b) => (
        <button
          key={b.label}
          type="button"
          className={`iconbtn${activePanel === b.panel ? " active" : ""}`}
          onClick={() => openPanel(b.panel)}
        >
          <Icon name={b.icon} size={28} />
          <div className="tip cjk">{t(b.label)}</div>
        </button>
      ))}
    </div>
  );
}
