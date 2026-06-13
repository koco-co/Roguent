import type React from "react";
import { useState } from "react";
import { useT, useTL } from "../../i18n";
import { useUiStore } from "../../ui-store";
import { Icon } from "../icons";
import {
  MOCK_DAILY_REWARDS,
  MOCK_LOGIN_EVENTS,
  type MockLoginEvent,
} from "./login-events-mock-data";

/**
 * 登录活动弹窗 LoginEvents(对标设计原型 panels3.jsx 的 LoginEvents):签到日历 +
 * 活动海报轮播。
 *
 * **整面板 mock 占位**:Roguent 引擎**没有登录活动 / 签到 / 节日运营系统**,签到
 * 天数、宝石数、活动海报全是演示(`login-events-mock-data.ts` 三重标注:数据顶注 +
 * `MOCK_` 前缀 + 本组件 `.task-mock-banner`)。
 *
 * **不自动弹**:原型靠 localStorage「今日不再提示」做每日自动弹窗;本仓没有登录
 * 事件源,故**只由手动入口(SystemMenu / dock)打开**,绝不自动弹,也不写
 * localStorage。领取/查看按钮只播放本地状态机,不造真实奖励。
 *
 * 这不是 Modal,而是 `.ev-scrim` 覆盖层(点空白处关闭;Esc 由 App 集中处理)。
 * activePanel gate 放在所有 hooks 之后(hooks 规则)。
 */

// 签到日历海报(7 天网格,照搬原型 EventArt 的 signin 分支)。
function SignInGrid() {
  const tl = useTL();
  const t = useT();
  return (
    <div className="ev-signin">
      {MOCK_DAILY_REWARDS.map((d) => (
        <div
          key={d.day}
          className={`ev-day${d.got ? " got" : ""}${d.today ? " today" : ""}${
            d.big ? " big" : ""
          }`}
        >
          <div className="ev-day-n px">
            {tl(`第${d.day}天`, `Day ${d.day}`)}
          </div>
          <div className="ev-day-ic">
            <Icon
              name={d.icon}
              size={d.big ? 32 : 26}
              glow={d.today || d.big ? "#f2c84b" : undefined}
            />
          </div>
          <div className="ev-day-v">{d.label}</div>
          {d.got && <div className="ev-day-check">✓</div>}
          {d.today && <div className="ev-day-badge px">{t("今日")}</div>}
        </div>
      ))}
    </div>
  );
}

// 海报艺术(double / release 用旋转光束海报;signin 走日历)。
function EventArt({ ev }: { ev: MockLoginEvent }) {
  if (ev.art === "signin") return <SignInGrid />;
  const glyph = ev.art === "double" ? "gemcur" : "crystal";
  return (
    <div
      className="ev-poster"
      style={{ "--ac": ev.accent } as React.CSSProperties}
    >
      <div className="ev-poster-rays" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="ev-poster-spark"
          style={{
            left: `${8 + i * 13}%`,
            top: `${12 + ((i * 37) % 70)}%`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
      <div className="ev-poster-glyph">
        <Icon name={glyph} size={80} glow={ev.accent} />
      </div>
      {ev.art === "double" && <div className="ev-poster-x2 px">×2</div>}
    </div>
  );
}

export function LoginEvents() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "loginEvents");
  const closePanel = useUiStore((s) => s.closePanel);
  // 轮播索引;本地 UI 态。
  const [idx, setIdx] = useState(0);
  // 「领取」演示态(只切按钮文案,不发真实奖励)。
  const [claimed, setClaimed] = useState(false);

  if (!active) return null;

  const list = MOCK_LOGIN_EVENTS;
  const ev = list[idx] ?? list[0];
  if (!ev) return null;

  const prev = () => setIdx((i) => (i - 1 + list.length) % list.length);
  const next = () => setIdx((i) => (i + 1) % list.length);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是覆盖遮罩,点空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="ev-scrim" onClick={closePanel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡,防止点弹窗时误关 */}
      <div
        className="ev-pop"
        style={{ "--ac": ev.accent } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* banner 缎带 */}
        <div className="ev-ribbon">
          <span className="ev-ribbon-k px">{t(ev.kind)}</span>
          <span className="ev-ribbon-t cjk">{t(ev.title)}</span>
          {ev.tag && <span className="ev-ribbon-tag px">{ev.tag}</span>}
        </div>
        <button type="button" className="ev-close px" onClick={closePanel}>
          ✕
        </button>

        {/* 真假分明:整面板 mock,引擎无登录活动源;不自动弹,只手动打开。 */}
        <div className="task-mock-banner" style={{ margin: "0 18px" }}>
          <Icon name="error" size={14} glow="#f2c84b" />
          {t("示例活动 · 引擎无登录活动源(演示用途，不自动弹、不发真实奖励)")}
        </div>

        {/* 海报 / 签到日历 */}
        <div className="ev-art">
          <EventArt ev={ev} />
        </div>

        {/* 正文 */}
        <div className="ev-body">
          <div className="ev-sub cjk">{t(ev.sub)}</div>
          {ev.desc && <div className="ev-desc">{t(ev.desc)}</div>}
          {ev.ends && (
            <div className="ev-ends px">
              <Icon name="idle" size={13} style={{ marginRight: 6 }} />
              {ev.ends}
            </div>
          )}
        </div>

        {/* 动作:签到弹窗领取;其余只是演示「查看 / 稍后」。 */}
        <div className="ev-act">
          {ev.art === "signin" ? (
            <button
              type="button"
              className={`pxbtn gold cjk${claimed ? " is-done" : ""}`}
              disabled={claimed}
              onClick={() => setClaimed(true)}
            >
              {claimed ? (
                t("✓ 已领取 · 1天 Max(演示)")
              ) : (
                <>
                  <Icon name="gemcur" size={16} style={{ marginRight: 8 }} />
                  {t("领取今日奖励")}
                </>
              )}
            </button>
          ) : (
            <>
              <button type="button" className="pxbtn gold cjk" onClick={next}>
                {t("查看")}
              </button>
              <button
                type="button"
                className="pxbtn sm cjk"
                onClick={closePanel}
              >
                {t("稍后")}
              </button>
            </>
          )}
        </div>

        {/* 轮播圆点 + 左右导航 */}
        <div className="ev-foot">
          <div className="ev-dots">
            {list.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`ev-dot${idx === i ? " on" : ""}`}
                aria-label={`event ${i + 1}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
          <div className="ev-nav">
            <button
              type="button"
              className="ev-arrow px"
              aria-label="previous"
              onClick={prev}
            >
              ‹
            </button>
            <button
              type="button"
              className="ev-arrow px"
              aria-label="next"
              onClick={next}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
