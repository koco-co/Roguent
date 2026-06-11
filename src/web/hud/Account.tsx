import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { formatCountdown } from "./limits-format";

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

/** The account panel: real subscription plan + usage; auth buttons are placeholders. */
export function Account() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "account");
  const closePanel = useUiStore((s) => s.closePanel);
  // 真数据:订阅 plan + 5h/周用量(与 LimitBars 同源)。selector 只取单值,不构造新值。
  const limits = useRoomStore((s) => s.limits);

  if (!active) return null;

  const now = Date.now();

  return (
    <Modal
      title="ACCOUNT"
      sub="订阅 · 用量"
      icon="account"
      width={720}
      onClose={closePanel}
    >
      <div className="account-wrap">
        {/* 订阅 plan(真):大字 plan 名,stale/apiError 标注与 LimitBars lb-plan 同写法。 */}
        <div className="acct-plan">
          <div className="px gold" style={{ fontSize: 24 }}>
            Claude {limits?.planName ?? "—"}
            {limits?.stale ? ` · ${t("同步中")}` : ""}
            {limits?.apiError ? ` · ${t("同步失败")}` : ""}
          </div>
          <div className="dim" style={{ marginTop: 8 }}>
            {t("5h 与周限额已映射为左上血条 / 魔法条")}
          </div>
        </div>

        {/* 用量(真):已用% bar + 重置倒计时,5h→hp、周→mp。 */}
        <div className="acct-usage">
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
