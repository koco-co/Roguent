import { ORCHESTRATOR_HERO } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Icon } from "./icons";

// mock: 装饰用,引擎无等级/代号数据源。写死,不接任何真实状态。
const MOCK_LEVEL = 47; // mock 等级
const MOCK_NAME = "指挥官 Orc"; // mock 代号(指挥官 + mock 代号 Orc)

/** Context-window XP 颜色阈值(照设计原型 hud.jsx):绿 <60 / 黄 ≤85 / 红 else。 */
function ctxColor(ctx: number): string {
  return ctx < 60 ? "#5fd35f" : ctx <= 85 ? "#f2c84b" : "#ff4d6d";
}

/**
 * 左上**英雄卡**(player hero card),替换原 LimitBars 的占位:
 * - **真**:Context XP 条 = 当前会话上下文窗口占用%(`context.utilization`,0-100),
 *   只在**内景**有会话语境时显示(沿用 LimitBars 的 inInterior gate);plan 名取
 *   `limits.planName`。颜色阈值照设计稿。
 * - **mock/装饰**:`Lv 47`、名字 `指挥官 Orc` 无真实数据源(见上方 MOCK_* 常量注释);
 *   hero 立绘用 `ORCHESTRATOR_HERO`(金骑士);设计稿的皇冠子节点本仓库**无 crown
 *   资源 → 省略**(不引入不存在的组件)。
 * - 点击整卡 → `openPanel("account")` 打开 PROFILE,5h/Weekly 真实用量在那里完整展示
 *   (英雄卡替换 LimitBars 后,5h/Weekly 不再常驻,故此跳转是「照搬设计原稿」的前提)。
 *
 * selector 守 zustand 铁律:分别取单值,绝不在 selector 里构造新值;hooks 全在 render 顶层。
 */
export function PlayerCard() {
  const t = useT();
  const limits = useRoomStore((s) => s.limits);
  const ctxUtil = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.context?.utilization ?? null)
      : null,
  );
  // 内景才有会话语境 → 才显 Context XP 条。返回布尔基元,不构造新值。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const openPanel = useUiStore((s) => s.openPanel);

  const showXp = inInterior && ctxUtil != null;
  const ctx = ctxUtil ?? 0;
  const color = ctxColor(ctx);

  return (
    <button
      type="button"
      className="panel rivets playercard"
      onClick={() => openPanel("account")}
      title={t("查看个人详情 · 5h / Weekly 用量")}
    >
      <div className="pc-body">
        {/* ornate avatar frame(无 crown 资源,省略 .pc-crown 子节点) */}
        <div className="pc-frame">
          <HeroPortrait
            sessionId=""
            hero={ORCHESTRATOR_HERO}
            size={58}
            className="pc-portrait-canvas"
          />
          <div className="pc-corners" />
          <div className="pc-rt">
            <Icon name="claude" size={13} />
          </div>
          {/* mock: 装饰等级,引擎无等级数据源 */}
          <div className="pc-level px">Lv {MOCK_LEVEL}</div>
        </div>
        {/* identity + context-window XP bar */}
        <div className="pc-info">
          {/* mock: 装饰名/代号,引擎无名字数据源 */}
          <div className="pc-name px">{MOCK_NAME}</div>
          <div className="pc-plan px">
            <span className="gold">CLAUDE</span>
            <span> · {limits?.planName ?? "—"}</span>
          </div>
          <div className="pc-xp">
            <div className="pc-xp-lab px">
              <span>Context</span>
              <span style={{ color: showXp ? color : "var(--ink-faint)" }}>
                {showXp ? `${Math.round(ctx)}%` : "—"}
              </span>
            </div>
            <div className="pc-xp-bar">
              <div
                className="pc-xp-fill"
                style={{
                  width: showXp ? `${ctx}%` : "0%",
                  opacity: showXp ? 1 : 0.25,
                  background: `linear-gradient(180deg,#ffe79a,${color} 55%,rgba(0,0,0,.25))`,
                }}
              />
            </div>
          </div>
          <div className="pc-hint px">▸ {t("查看 5h / Weekly 用量")}</div>
        </div>
      </div>
    </button>
  );
}
