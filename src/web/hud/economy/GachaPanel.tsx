import type React from "react";
import { useMemo } from "react";
import { GACHA_POOL, GACHA_PULL_COST } from "../../../engine/economy/gacha";
import { useT, useTL } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { sendCommand } from "../../ws-client";
import { Modal } from "../Modal";
import { Icon } from "../icons";

/**
 * 扭蛋面板 GachaPanel — 接真实 ledger/inventory store。
 *
 * 设计规则(Zustand selector 铁律):
 * - selector 只取基元值(数字、字符串)或稳定引用(对象引用)。
 * - 不在 selector 里构造新数组/对象——会导致每次渲染都产生新引用 → 无限重渲染。
 * - 倒序/过滤等衍生操作放在 useMemo 里,依赖 selector 返回的稳定引用。
 *
 * 命令路径:点击「抽」→ sendCommand({ cmd:"economy", action:"purchaseItem",
 * sku:"gacha.hero" }) → WsGateway → SessionManager → 引擎侧处理(扣 gem、追加
 * inventory)→ economy.ledger.appended → store.reduce → 此处重渲染。
 *
 * activePanel gate 必须在所有 hooks 之后(React hooks 规则)。
 */
export function GachaPanel() {
  const t = useT();
  const tl = useTL();
  const active = useUiStore((s) => s.activePanel === "gacha");
  const closePanel = useUiStore((s) => s.closePanel);

  // 稳定引用:只取 balances 对象和 inventory 对象——两者在 store 里都是稳定引用
  // (只有 economy.ledger.appended 才替换它们)。
  const balances = useRoomStore((s) => s.ledger.balances);
  const inventory = useRoomStore((s) => s.inventory);

  // 从 balances 里取宝石数;balances 是稳定引用,gem 是基元
  const gemBalance = balances.gem ?? 0;
  const canPull = gemBalance >= GACHA_PULL_COST;

  // 背包里的 item 列表(id 顺序排序) — 在 render 体里派生,不在 selector 里。
  const ownedItems = useMemo(
    () => Object.values(inventory).toSorted((a, b) => a.id.localeCompare(b.id)),
    [inventory],
  );

  if (!active) return null;

  function handlePull() {
    sendCommand({
      cmd: "economy",
      action: "purchaseItem",
      sku: "gacha.hero",
      metadata: { source: "gacha-panel" },
    });
  }

  return (
    <Modal
      title="GACHA"
      sub="扭蛋抽卡 · 真实 gem 余额驱动"
      icon="gemcur"
      accent="#a06cd5"
      width={860}
      onClose={closePanel}
    >
      <div className="gacha-panel">
        {/* ── 余额条 ── */}
        <div className="shop-bal" style={{ marginBottom: 16 }}>
          <Icon name="gemcur" size={22} />
          <span
            data-testid="gacha-balance"
            className="px"
            style={{ color: "#a06cd5" }}
          >
            {gemBalance.toLocaleString()}
          </span>
          <span className="faint" style={{ fontSize: 11 }}>
            {tl(
              `宝石 · 抽一次 ${GACHA_PULL_COST} 💎 `,
              `Gems · ${GACHA_PULL_COST} 💎 per pull `,
            )}
          </span>
          {!canPull && (
            <span
              style={{ fontSize: 11, color: "#ff4d6d", marginLeft: 8 }}
              data-testid="gacha-insufficient"
            >
              {t("余额不足")}
            </span>
          )}
        </div>

        {/* ── 抽取按钮 ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button
            type="button"
            className={`pxbtn cjk${canPull ? "" : " dis"}`}
            disabled={!canPull}
            aria-label="Pull gacha"
            onClick={handlePull}
          >
            <Icon name="gemcur" size={14} style={{ marginRight: 6 }} />
            {tl(
              `抽一次 (${GACHA_PULL_COST} 💎)`,
              `Pull (${GACHA_PULL_COST} 💎)`,
            )}
          </button>
        </div>

        {/* ── 奖池预览 ── */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="faint"
            style={{ fontSize: 11, marginBottom: 8, letterSpacing: 1 }}
          >
            {t("奖池")}
          </div>
          <div className="item-grid scroll">
            {GACHA_POOL.map((item) => {
              const owned = item.id in inventory;
              return (
                <div
                  key={item.id}
                  className={`item-card${owned ? " gacha" : ""}`}
                  style={
                    {
                      "--ac": rarityColor(item.rarity),
                      opacity: owned ? 0.6 : 1,
                    } as React.CSSProperties
                  }
                >
                  <div className="item-base">
                    <Icon
                      name="gemcur"
                      size={32}
                      glow={rarityColor(item.rarity)}
                    />
                  </div>
                  <div className="item-name" style={{ fontSize: 10 }}>
                    {item.label}
                  </div>
                  <div
                    className="chip px"
                    style={{ fontSize: 8, color: rarityColor(item.rarity) }}
                  >
                    {item.rarity}
                  </div>
                  {owned && (
                    <span className="chip greenc" style={{ marginTop: 4 }}>
                      {t("已拥有")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 已拥有的 inventory 物品 ── */}
        <div>
          <div
            className="faint"
            style={{ fontSize: 11, marginBottom: 8, letterSpacing: 1 }}
          >
            {t("背包")} ({ownedItems.length})
          </div>
          {ownedItems.length === 0 ? (
            <div
              className="empty-center faint"
              data-testid="gacha-inventory-empty"
            >
              {t("还没有物品 · 抽卡获得")}
            </div>
          ) : (
            <div className="loot-grid">
              {ownedItems.map((item) => {
                // Check if item is a pool item (duplicate pool item means future pulls get refund)
                const isPoolItem = GACHA_POOL.some((p) => p.id === item.id);
                return (
                  <div
                    key={item.id}
                    className="loot-cell"
                    data-testid={`inventory-item-${item.id}`}
                    data-duplicate={isPoolItem ? "true" : "false"}
                  >
                    <Icon name="gemcur" size={24} glow="#a06cd5" />
                    <div className="loot-name" style={{ fontSize: 9 }}>
                      {item.label}
                    </div>
                    {item.quantity > 1 ? (
                      <div
                        className="faint"
                        style={{ fontSize: 8 }}
                      >{`×${item.quantity}`}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case "legendary":
      return "#f2c84b";
    case "epic":
      return "#a06cd5";
    case "rare":
      return "#36c5e0";
    case "uncommon":
      return "#5fd35f";
    default:
      return "#9ca3af";
  }
}
