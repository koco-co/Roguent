import type React from "react";
import { useT } from "../i18n";
import { Icon, type IconName } from "./icons";

/** 可复用的像素模态壳,忠实复刻设计原型 Modal(panels1.jsx)结构。
 *
 *  原型是固定 1920×1080 缩放舞台,`width`/`height` 是绝对像素;我们的 HUD 是
 *  响应式真像素(不引入全局 stage-scale),故把 `width` 当作「设计目标宽」并钳制:
 *  `min(width, 94vw)` + `maxHeight: min(90vh, 960px)`,让 `.panel-body.scroll`
 *  内部滚动,任意视口都不溢出又保留设计比例。
 *
 *  Esc 不在此监听——由 App 集中处理(优先关面板),避免双重处理。 */
export function Modal({
  title,
  sub,
  icon,
  accent = "#f2c84b",
  onClose,
  width = 1120,
  height,
  vibe,
  children,
}: {
  title: string;
  sub?: string;
  icon?: IconName;
  accent?: string;
  onClose: () => void;
  width?: number;
  height?: number;
  vibe?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是模态遮罩,点击空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="scrim" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡,防止点面板时误触 scrim 关闭 */}
      <div
        className={`panel rivets modal-pop${vibe ? ` vibe-${vibe}` : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          // 设计目标宽 → 钳制到视口;高度上限 90vh / 960px,超出由 body 内部滚动
          width: `min(${width}px, 94vw)`,
          maxHeight: "min(90vh, 960px)",
          ...(height ? { height: `min(${height}px, 90vh)` } : {}),
        }}
      >
        <div className="panel-titlebar">
          {icon && <Icon name={icon} size={22} glow={accent} />}
          <span className="title" style={{ color: accent }}>
            {title}
          </span>
          {sub && <span className="sub cjk">{t(sub)}</span>}
          <button type="button" className="closex px" onClick={onClose}>
            ✕
          </button>
        </div>
        {/* flex:1 + minHeight:0 lets the body absorb leftover height and scroll
            internally, so the panel never overflows its max-height (T1.2 fix). */}
        <div className="panel-body scroll" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
