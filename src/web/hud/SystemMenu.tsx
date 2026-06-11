import { useT } from "../i18n";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

/**
 * 系统 / 暂停菜单 SystemMenu(T3.12,对标设计原型 panels2.jsx 的 SystemMenu)。
 *
 * 不是 Modal,而是直接的全屏 `.scrim` 覆盖层:点空白处关菜单(Esc 关闭由 App
 * 集中处理,无需本组件加键盘监听)。内层 `.sysmenu-inner` 吞掉冒泡防误关。
 *
 * **真 / 占位边界**(对标原型 `fn || onClose` 的回退:无动作的条目点了只关菜单):
 * - **真路由**:继续游戏 / 账号·订阅 / runtime 管理 / 导入会话 / 外观·主题 /
 *   关于 Roguent —— 都 openPanel 到现有面板,是真入口。
 *   - 「runtime 管理」与原型一致,也路由到 account(订阅 OAuth 由本机 Claude Code
 *     继承,无独立 runtime 管理面板)。
 *   - 「关于 Roguent」恢复了 About 的 UI 入口:T3.11 把 ButtonDock 账号槽从 about
 *     改成 account 后 About 暂无入口,现由此承接。
 * - **占位**:保存 / 导出会话、退出 —— 引擎无对应能力(无会话导出、无真实退出),
 *   点击仅 closePanel,不造假。
 *
 * selector 守 zustand 铁律:只取单值 / 稳定函数引用,不在 selector 里构造新值。
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(hooks 规则)。
 */

type SysItem = {
  label: string;
  icon: IconName;
  /** 点击动作;占位项给 closePanel(对标原型 fn||onClose 回退)。 */
  action: () => void;
};

export function SystemMenu() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "menu");
  const closePanel = useUiStore((s) => s.closePanel);
  const openPanel = useUiStore((s) => s.openPanel);

  if (!active) return null;

  // 条目顺序对标原型;icon 均经 icons.tsx 核实存在(done/account/claude/save/
  // import/gear/spellbook/error)。无需替换任何图标。
  const items: SysItem[] = [
    { label: "继续游戏", icon: "done", action: closePanel },
    {
      label: "账号 · 订阅",
      icon: "account",
      action: () => openPanel("account"),
    },
    // 原型同样把「runtime 管理」路由到 account(无独立 runtime 面板)。
    {
      label: "runtime 管理",
      icon: "claude",
      action: () => openPanel("account"),
    },
    // 占位:引擎无会话导出能力,点击仅关菜单(对标原型 fn||onClose 回退)。
    { label: "保存 / 导出会话", icon: "save", action: closePanel },
    { label: "导入会话", icon: "import", action: () => openPanel("import") },
    { label: "外观 / 主题", icon: "gear", action: () => openPanel("settings") },
    {
      label: "关于 Roguent",
      icon: "spellbook",
      action: () => openPanel("about"),
    },
    // 占位:无真实退出动作,点击仅关菜单。
    { label: "退出", icon: "error", action: closePanel },
  ];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是覆盖遮罩,点空白处关菜单;键盘关闭由 App 的 Esc 集中处理
    <div className="scrim sysmenu" onClick={closePanel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡,防止点菜单时误触 scrim 关闭 */}
      <div className="sysmenu-inner" onClick={(e) => e.stopPropagation()}>
        <div className="sys-logo px">ROGUENT</div>
        <div
          className="faint"
          style={{ letterSpacing: ".2em", marginBottom: 30 }}
        >
          {t("PAUSED · 指挥台")}
        </div>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className="sys-btn"
            onClick={it.action}
          >
            <Icon name={it.icon} size={22} />
            <span>{t(it.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
