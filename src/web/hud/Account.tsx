import { ORCHESTRATOR_HERO } from "../../shared/mapping";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { formatCountdown } from "./limits-format";

// mock: 装饰用,引擎无等级/代号/邮箱数据源(与左上 PlayerCard 同源 mock,不接真实状态)。
const MOCK_LEVEL = 47; // mock 等级
const MOCK_NAME = "指挥官 Orc"; // mock 代号(指挥官 + mock 代号 Orc)
const MOCK_HANDLE = "orc@roguent"; // mock 句柄(非真实邮箱:隐私 + 非游戏数据)

/** Context-window XP 颜色阈值(照设计原型 panels2.jsx):绿 <60 / 黄 ≤85 / 红 else。 */
function ctxColor(ctx: number): string {
  return ctx < 60 ? "#5fd35f" : ctx <= 85 ? "#f2c84b" : "#ff4d6d";
}

/**
 * 账号面板 Account(T3.11,对标设计原型 panels2.jsx 的 Account):
 * 展示订阅 plan + 5h/周用量 + 重置倒计时。
 *
 * **真/假边界**:
 * - **真**:plan 名 + 5h/周「已用%」+ 重置倒计时,全部来自 `store.limits`
 *   (`AccountLimits`),与左上 LimitBars 同源——这是真订阅数据,不造假。
 *   注意:这里展示的是 **utilization(已用%)**,bar 宽度直接用 utilization;
 *   与 LimitBars 显示 remaining(剩余%)不同,各自忠实于其原型语义。
 * - **占位**:底部「/login」「登出」按钮——引擎**不暴露 auth 控制**(订阅 OAuth
 *   由本机 Claude Code 继承,见 CLAUDE.md),故两按钮做成纯视觉占位、不绑真实
 *   逻辑(无 onClick),并在下方加 faint 说明,绝不假装能真登录/登出。
 *
 * selector 守 zustand 铁律:只取单值 / 稳定函数引用,绝不在 selector 里构造新值。
 * activePanel gate 的 `if (!active) return null` 放在所有 hooks 之后(hooks 规则);
 * `now` 在 render 体里取(非 hook,与 LimitBars 一致,不破坏 resume)。
 */

/** 单条用量行:label + bar(已用% = utilization)+ 右侧倒计时。无数据 → 弱化 + "—"。 */
function UsageRow({
  label,
  kind,
  utilization,
  resetsAt,
  now,
}: {
  label: string; // "5h" | "Weekly"
  kind: "hp" | "mp"; // 5h → hp(血条)、周 → mp(魔法条),与左上血条 / 魔法条对应
  utilization: number | null; // 已用%(0-100);null=无数据 → 弱化
  resetsAt: number | null;
  now: number;
}) {
  const hasData = utilization != null;
  const width = utilization ?? 0;
  return (
    <div className="acct-row">
      <div className="sr-label">{label}</div>
      <div className="barframe" style={{ flex: 1 }}>
        <div
          className={`barfill ${kind}`}
          style={{ width: `${width}%`, opacity: hasData ? 1 : 0.25 }}
        />
        <div className="bar-label px">
          {hasData ? `${Math.round(width)}%` : "—"}
        </div>
      </div>
      <div className="faint px" style={{ fontSize: 9 }}>
        {hasData ? formatCountdown(resetsAt, now) : "—"}
      </div>
    </div>
  );
}

/**
 * The PROFILE panel: hero banner header (decorative Lv/name/handle + real Context
 * XP echo) over the real subscription plan + 5h/Weekly usage; auth buttons are
 * placeholders.
 *
 * **真/假边界**:
 * - **真**:plan 名 + 5h/周「已用%」+ 重置倒计时,全部来自 `store.limits`(`AccountLimits`),
 *   与左上 PlayerCard 同源——真订阅数据,不造假。头部 Context XP 条 = 当前会话上下文窗口
 *   占用%(`context.utilization`),只在**内景**有会话语境时有值(沿用 inInterior gate)。
 * - **mock/装饰**:头部 `Lv 47`、名字 `指挥官 Orc`、句柄 `orc@roguent` 无真实数据源
 *   (见 MOCK_* 常量注释 + 面板内 faint 文案);hero 立绘用 `ORCHESTRATOR_HERO`(金骑士);
 *   设计稿皇冠本仓库无 crown 资源 → 省略。
 * - **占位**:底部「/login」「登出」按钮——引擎不暴露 auth 控制(订阅 OAuth 由本机
 *   Claude Code 继承),做成纯视觉占位、不绑真实逻辑,下方 faint 说明。
 *
 * selector 守 zustand 铁律:只取单值,绝不在 selector 里构造新值;hooks 全在 early return 前。
 */
export function Account() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "account");
  const closePanel = useUiStore((s) => s.closePanel);
  // 内景才有会话语境 → Context XP 才有值。返回布尔基元,不构造新值。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  // 真数据:订阅 plan + 5h/周用量(与 PlayerCard 同源)。selector 只取单值,不构造新值。
  const limits = useRoomStore((s) => s.limits);
  const ctxUtil = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.context?.utilization ?? null)
      : null,
  );

  if (!active) return null;

  const now = Date.now();
  const showXp = inInterior && ctxUtil != null;
  const ctx = ctxUtil ?? 0;
  const xpColor = ctxColor(ctx);

  return (
    <Modal
      title="PROFILE"
      sub="个人详情 · 订阅与用量"
      icon="account"
      width={560}
      onClose={closePanel}
    >
      <div className="account-wrap">
        {/* 英雄横幅(mock 装饰头部 + 真 Context XP echo)。无 crown 资源,省略 .acct2-crown。 */}
        <div className="acct2-hero">
          <div className="acct2-frame">
            <HeroPortrait
              sessionId=""
              hero={ORCHESTRATOR_HERO}
              size={90}
              className="acct2-portrait-canvas"
            />
            <div className="acct2-corners" />
            {/* mock: 装饰等级,引擎无等级数据源 */}
            <div className="acct2-level px">Lv {MOCK_LEVEL}</div>
          </div>
          <div className="acct2-id">
            {/* mock: 装饰名/代号,引擎无名字数据源 */}
            <div className="acct2-name px">{MOCK_NAME}</div>
            <div className="acct2-plan px">
              <span className="gold">Claude</span>
              <span>
                {" · "}
                {limits?.planName ?? "—"} {t("计划")}
                {limits?.stale ? ` · ${t("同步中")}` : ""}
                {limits?.apiError ? ` · ${t("同步失败")}` : ""}
              </span>
            </div>
            {/* mock: 装饰句柄,非真实邮箱(隐私 + 非游戏数据) */}
            <div className="acct2-handle px">{MOCK_HANDLE}</div>
            {/* Context XP echo(真:当前会话上下文占用%,内景才有) */}
            <div className="acct2-xprow">
              <Icon name="gem" size={16} />
              <span className="acct2-xplab px">Context</span>
              <div className="acct2-xpbar">
                <div
                  className="acct2-xpfill"
                  style={{
                    width: showXp ? `${ctx}%` : "0%",
                    opacity: showXp ? 1 : 0.25,
                    background: `linear-gradient(180deg,#ffe79a,${xpColor} 55%,rgba(0,0,0,.25))`,
                  }}
                />
              </div>
              <span
                className="px"
                style={{
                  fontSize: 9,
                  color: showXp ? xpColor : "var(--ink-faint)",
                  minWidth: 30,
                  textAlign: "right",
                }}
              >
                {showXp ? `${Math.round(ctx)}%` : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* 用量(真):已用% bar + 重置倒计时,5h→hp、周→mp。 */}
        <div className="acct-usage">
          <div className="acct2-sec px">Usage</div>
          <UsageRow
            label="5h"
            kind="hp"
            utilization={limits?.fiveHour.utilization ?? null}
            resetsAt={limits?.fiveHour.resetsAt ?? null}
            now={now}
          />
          <UsageRow
            label="Weekly"
            kind="mp"
            utilization={limits?.sevenDay.utilization ?? null}
            resetsAt={limits?.sevenDay.resetsAt ?? null}
            now={now}
          />
        </div>

        {/* auth 占位:引擎不暴露 auth 控制,两按钮纯视觉占位(无 onClick),下方 faint 说明。 */}
        <div>
          <div className="npccard-act">
            <button type="button" className="pxbtn cjk">
              /login
            </button>
            <button
              type="button"
              className="pxbtn cjk"
              style={{ color: "#ff8197" }}
            >
              {t("登出")}
            </button>
          </div>
          <div className="faint" style={{ marginTop: 10, lineHeight: 1.6 }}>
            {t("登录态由本机 Claude Code 订阅管理(终端 /login)")}
          </div>
        </div>
      </div>
    </Modal>
  );
}
