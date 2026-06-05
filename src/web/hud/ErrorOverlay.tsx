import { useUiStore } from "../ui-store";
import { Icon } from "./icons";

/**
 * runtime 离线错误层 ErrorOverlay(T3.12,对标设计原型 lobby.jsx 的 ErrorOverlay)。
 *
 * 不是 Modal,而是直接的全屏 `.scrim` 覆盖层:资源 / 连接失败时显示可见错误层,
 * 绝不静默黑屏。点空白处关闭(Esc 关闭由 App 集中处理)。
 *
 * **触发入口待 T4.3 接真实连接状态**(WS 断线 → openPanel('error'));本任务只建
 * 组件 + 走 activePanel 路由。现可由 openPanel('error') 手动打开验证。`'error'`
 * 已在 ui-store 的 PanelId union 里。
 *
 * 「重试连接」「返回」当前都仅 closePanel —— 真实重连逻辑同样待 T4.3 接入,届时
 * 「重试连接」改触发 WS 重连。
 *
 * selector 守 zustand 铁律:只取单值 / 稳定函数引用,不在 selector 里构造新值。
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(hooks 规则)。
 */
export function ErrorOverlay() {
  const active = useUiStore((s) => s.activePanel === "error");
  const closePanel = useUiStore((s) => s.closePanel);

  if (!active) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是覆盖遮罩,点空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="scrim" onClick={closePanel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡,防止点错误层时误触 scrim 关闭 */}
      <div className="error-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="error-spark">
          <Icon name="error" size={64} glow="#ff4d6d" />
        </div>
        <div
          className="px"
          style={{ fontSize: 14, color: "#ff8197", margin: "18px 0 10px" }}
        >
          runtime 离线
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          无法连接到该项目的 Claude Code engine。
        </div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 22 }}>
          资源/连接失败时显示可见错误层,绝不静默黑屏。
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
          }}
        >
          {/* 重试连接 / 返回:真实重连待 T4.3,当前两按钮均仅关闭错误层。 */}
          <button
            type="button"
            className="pxbtn primary cjk"
            onClick={closePanel}
          >
            重试连接
          </button>
          <button type="button" className="pxbtn cjk" onClick={closePanel}>
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
