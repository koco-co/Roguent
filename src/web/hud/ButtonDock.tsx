import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

// 顶右设置坞(对标设计原型 hud.jsx ButtonDock):一列 iconbtn,每个 Icon + 悬浮 tip 标签。
// 两视图(大厅 / 内景)都显示。lit 态 = 该按钮目标 panel 当前为 activePanel。
//
// 接线说明(过渡期):
// - gear→settings、menu→menu、pause→menu(暂代「暂停」;真正的 transition 漩涡是 T3.12)
//   这三个目标 panel(settings/menu)是 T3.x 才建,现在点了只设 activePanel、无组件渲染 =
//   安全空操作(单一路由 openPanel 不报错)。注释标注「panel 待 T3.x」。
// - account→about:现有 px-dock 的 about 入口是 T1.2 临时验证入口;为不丢「关于」可达性,
//   重建后暂以 account 槽接 openPanel('about')(About 已是 working 面板)。T3.11/T3.12 再
//   把 account / about 拆成正式的「账号」体系。
type DockBtn = {
  icon: IconName;
  panel: "settings" | "menu" | "about";
  label: string;
};

const DOCK_BTNS: DockBtn[] = [
  { icon: "gear", panel: "settings", label: "设置" }, // panel 待 T3.x
  { icon: "menu", panel: "menu", label: "菜单" }, // panel 待 T3.x
  // account 暂接 About(working);T3.11/T3.12 正式接「账号」。
  { icon: "account", panel: "about", label: "账号" },
  { icon: "pause", panel: "menu", label: "暂停" }, // 暂代,transition 漩涡是 T3.12
];

/**
 * 顶右设置坞。自带绝对定位(.dock + .dock-anchor),落在 Currency 下方。两视图都显示。
 */
export function ButtonDock() {
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
          <div className="tip cjk">{b.label}</div>
        </button>
      ))}
    </div>
  );
}
