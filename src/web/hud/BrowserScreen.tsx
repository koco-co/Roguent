import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useSettingsStore } from "../settings-store";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { screenViewOf } from "./browser-screen-view";
import { Icon } from "./icons";

// 内景「指挥大屏 · 实时工具流」。引擎没有浏览器画面流,但有真实 tool 活动;大屏据此
// 渲染(screenViewOf):tab=会话标题、url 栏=最近 tool 的 inputSummary(截断)、
// caption=agent名 · toolName、LIVE/IDLE 徽标=最近 tool 是否 running。
// 线框页 / 扫描线 / CRT flicker / 光标都是**纯装饰**(不声称数据);光标仅 motion
// 开启时游走。无 tool 活动 = 空闲态(IDLE + 占位),不造数据。
export function BrowserScreen() {
  const sessionId = useRoomStore((s) => s.currentSessionId);
  // selector 只取稳定引用:session 对象或 null(?? null 只归一 undefined,不构造新值)。
  const session = useRoomStore((s) =>
    sessionId ? (s.sessions[sessionId] ?? null) : null,
  );
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const motion = useSettingsStore((s) => s.motion);
  const t = useT();

  // 装饰光标游走:仅 motion 开时启动 interval;关闭时保持静止。hooks 必须在
  // 任何 early return 之前声明。
  const [cursor, setCursor] = useState({ x: 50, y: 52 });
  useEffect(() => {
    if (!motion) return;
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setCursor({
        x: 50 + Math.sin(tick / 7) * 30,
        y: 52 + Math.cos(tick / 5) * 26,
      });
    }, 600);
    return () => clearInterval(id);
  }, [motion]);

  const view = screenViewOf(session);
  if (!inInterior) return null;

  const busy = view.busy;
  // 空闲态:无任何 tool 活动 → IDLE 徽标(灰)+ url 占位 + caption 走 i18n 提示。
  // 非空闲:busy → DRIVING 徽标,否则 LIVE;url/caption 显真实数据(产品数据不翻译)。
  const badge = view.idle ? "IDLE" : busy ? "DRIVING" : "LIVE";
  const badgeClass = view.idle
    ? "bs-live px idle"
    : `bs-live px${busy ? " busy" : ""}`;
  const url = view.idle ? "—" : view.url;
  const caption = view.idle ? t("等待工具调用…") : view.caption;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 大屏吞掉冒泡,防点击穿透到房间;无键盘交互
    <div className="bigscreen" onClick={(e) => e.stopPropagation()}>
      <div className="bigscreen-arm" />
      <div className="bigscreen-frame">
        {/* chrome: traffic dots + tab + live badge */}
        <div className="bs-chrome">
          <div className="bs-dots">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="bs-dot" style={{ background: c }} />
            ))}
          </div>
          <div className="bs-tab cjk">{view.tab}</div>
          <div style={{ flex: 1 }} />
          <div className={badgeClass}>
            <span className="bs-livedot" />
            {badge}
          </div>
        </div>
        {/* url bar: 最近 tool 的 inputSummary(截断) */}
        <div className="bs-urlbar">
          <Icon
            name={busy ? "compact" : "search"}
            size={12}
            glow={busy ? "#36c5e0" : undefined}
          />
          <span className="bs-url px">{url}</span>
          {busy && <span className="bs-load" />}
        </div>
        {/* viewport: 纯装饰线框页 + 扫描线 + flicker + 光标(不声称数据) */}
        <div className="bs-viewport">
          <div className="bs-scan" />
          <div className="bs-page">
            <div className="bs-blk bs-hero" />
            <div className="bs-row">
              <div className="bs-blk bs-card" />
              <div className="bs-blk bs-card" />
              <div className="bs-blk bs-card" />
            </div>
            <div className="bs-blk bs-line w80" />
            <div className="bs-blk bs-line w60" />
            <div className="bs-blk bs-line w70" />
          </div>
          <div
            className={`bs-cursor${busy ? " click" : ""}`}
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 12 12"
              style={{ shapeRendering: "crispEdges" }}
              aria-hidden="true"
            >
              <path
                d="M1 1 L1 9 L3 7 L5 11 L6 10 L4 6 L7 6 Z"
                fill="#fff"
                stroke="#0b0a12"
                strokeWidth={0.6}
              />
            </svg>
          </div>
          <div className="bs-flicker" />
        </div>
        {/* caption: agent名 · toolName(产品数据);空闲走 i18n 提示 */}
        <div className="bs-caption">
          <span className="bs-act cjk">{caption}</span>
        </div>
      </div>
      <div className="bigscreen-base" />
      <div className="bigscreen-glow" />
    </div>
  );
}
