import { useState } from "react";
import type React from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SHOP_ITEMS } from "./shop-data";

/**
 * 装饰商店(SHOP)面板 Shop —— 收敛为**纯装饰商店**(房间 / 皮肤 / 宠物 / UI)。
 * 插件市场已拆到 Market.tsx;扭蛋已由 economy/GachaPanel 接管(activePanel==="gacha")。
 *
 * **宝石余额接真实 ledger**:顶部余额条读取 store.ledger.balances.gem;
 * 「已拥有」状态接真实 store.inventory。购买按钮仍为视觉 mock(引擎无商品购买 action)。
 *
 * Zustand selector 铁律:只取基元值(数字)或稳定引用(对象引用);分类过滤等派生
 * 操作放在 render 体里。activePanel gate 放在所有 hooks 之后(React hooks 规则)。
 */

// 装饰商品分类(中文做 state 值,渲染处包 t())。
const cats = ["全部", "房间", "皮肤", "宠物", "UI"];

export function Shop() {
  const active = useUiStore((s) => s.activePanel === "shop");
  const closePanel = useUiStore((s) => s.closePanel);
  const openPanel = useUiStore((s) => s.openPanel);
  const t = useT();
  // 当前分类,本地 UI 态。
  const [cat, setCat] = useState("全部");

  // 真实 gem 余额:从 ledger.balances 取;balances 是稳定引用,只有新条目 append 才替换。
  const gemBalance = useRoomStore((s) => s.ledger.balances.gem ?? 0);
  // 真实背包:inventory 对象稳定引用;render 体里再检查 item 是否在里面。
  const inventory = useRoomStore((s) => s.inventory);

  if (!active) return null;

  // 在 render 体里过滤:仅装饰商品(非扭蛋项),再按分类过滤。
  const items = SHOP_ITEMS.filter((it) => !it.gacha).filter(
    (it) => cat === "全部" || it.cat === cat,
  );

  return (
    <Modal
      title="SHOP"
      sub={t("装饰商店 · 宝石消费 · 仅外观，不影响开发结果")}
      icon="shop"
      width={1180}
      onClose={closePanel}
    >
      <div className="shop-wrap">
        {/* mock 标注:示例商品,购买逻辑未接入;余额 / 已拥有为真。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          {t("示例商品 · 购买逻辑未接入(宝石余额/已拥有为真)")}
        </div>

        <div className="shop-items">
          {/* 余额条:真实 gem 余额 from store.ledger.balances;尾部去扭蛋机入口。 */}
          <div className="shop-bal">
            <Icon name="gemcur" size={22} />
            <span className="px" style={{ color: "#a06cd5" }}>
              {gemBalance.toLocaleString()}
            </span>
            <span className="faint" style={{ fontSize: 11 }}>
              宝石 · 完成会话/任务赚取,仅外观,不影响开发结果
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="pxbtn sm cjk"
              onClick={() => openPanel("gacha")}
            >
              {t("去扭蛋机")}
            </button>
          </div>

          {/* 分类 chips:一行 .shop-cat,中文做 state 值、渲染包 t()。 */}
          <div className="shop-itemcats">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                className={`shop-cat${cat === c ? " on" : ""}`}
                onClick={() => setCat(c)}
              >
                {t(c)}
              </button>
            ))}
          </div>

          {/* 道具 grid:每件一张 item-card;--ac 为强调色。
              已拥有状态接真实 inventory;购买按钮仍为视觉 mock(引擎无商品购买逻辑)。 */}
          <div className="item-grid scroll">
            {items.map((it) => {
              // [MOCK] 「购买」按钮不绑真实逻辑;已拥有来源于真实 inventory。
              // TODO: SHOP_ITEMS ids (i1–i8) do not map to real gacha SKUs.
              // The label-equality check (inv.label === it.name) is a placeholder
              // that can false-positive when gacha items share display names with
              // shop items. Fix by assigning real SKUs to SHOP_ITEMS and matching
              // on inv.sku === it.sku when gacha/shop item catalogs are unified.
              const isOwned = Object.values(inventory).some(
                (inv) => inv.label === it.name || inv.sku === it.id,
              );
              return (
                <div
                  key={it.id}
                  className="item-card"
                  style={{ "--ac": it.accent } as React.CSSProperties}
                >
                  <div className="item-base">
                    <Icon name={it.icon} size={40} glow={it.accent} />
                  </div>
                  <div className="item-name">{it.name}</div>
                  <div className="chip px" style={{ fontSize: 8 }}>
                    {it.cat}
                  </div>
                  {/* 已拥有:真实 inventory 驱动。购买按钮为 mock 占位。 */}
                  {isOwned ? (
                    <span className="chip greenc" style={{ marginTop: 8 }}>
                      {t("已拥有")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="pxbtn sm cjk"
                      style={{ marginTop: 8 }}
                      title="[mock] 购买逻辑尚未接入"
                    >
                      <Icon
                        name="gemcur"
                        size={14}
                        style={{ marginRight: 5 }}
                      />
                      {it.price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
