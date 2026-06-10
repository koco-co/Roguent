import { useState } from "react";
import type React from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SHOP_CATS, SHOP_ITEMS, SHOP_PLUGINS } from "./shop-data";

/**
 * 商店(SHOP)面板 Shop(对标设计原型 panels2.jsx 的 Shop,§6.14):
 * 「插件市场 + 道具店」两个 tab。
 *
 * **宝石余额接真实 ledger**:道具店顶部余额条读取 store.ledger.balances.gem。
 * 「已拥有」状态接真实 store.inventory。
 * 插件市场 + 各商品卡的「安装/购买」按钮仍为视觉 mock 占位(Roguent 引擎无插件市场
 * 和商品购买 action),顶部保留 mock banner 标注。
 *
 * Zustand selector 铁律:只取基元值(数字)或稳定引用(对象引用);不在 selector
 * 里构造新数组/对象——倒序、补空格等派生操作放在 render 体里。
 *
 * activePanel gate 放在所有 hooks 之后(React hooks 规则)。
 */

export function Shop() {
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const active = activePanel === "shop" || activePanel === "gacha";
  // 当前 tab(market/items)、分类、搜索串,全为本地 UI 态。
  const [tab, setTab] = useState<"market" | "items">("market");
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");

  // 真实 gem 余额:从 ledger.balances 取;balances 是稳定引用,只有新条目 append 才替换。
  const gemBalance = useRoomStore((s) => s.ledger.balances.gem ?? 0);
  // 真实背包:inventory 对象稳定引用;render 体里再检查 item.id 是否在里面。
  const inventory = useRoomStore((s) => s.inventory);

  if (!active) return null;
  const visibleTab = activePanel === "gacha" ? "items" : tab;

  // 在 render 体里对本地 mock 常量过滤(同原型逻辑):cat==='已安装'→ owned;
  // cat!=='全部'→ p.cat===cat;再叠加 q(name 或 desc 包含 q)。不在 selector 里。
  const plugins = SHOP_PLUGINS.filter((p) => {
    if (cat === "已安装") return p.owned;
    if (cat !== "全部") return p.cat === cat;
    return true;
  }).filter((p) => !q || p.name.includes(q) || p.desc.includes(q));

  return (
    <Modal
      title="SHOP"
      sub="插件市场 + 道具店"
      icon="shop"
      width={1180}
      onClose={closePanel}
    >
      <div className="shop-wrap">
        {/* mock 标注:整面板示例数据,显眼 banner——引擎无插件市场 / 宝石经济。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          示例数据 · 引擎暂无插件市场 / 宝石经济(纯展示)
        </div>

        {/* 两个 tab:插件市场 / 道具店。 */}
        <div className="tabs">
          <button
            type="button"
            className={`tab${visibleTab === "market" ? " on" : ""}`}
            onClick={() => setTab("market")}
          >
            插件市场
          </button>
          <button
            type="button"
            className={`tab${visibleTab === "items" ? " on" : ""}`}
            onClick={() => setTab("items")}
          >
            道具店
          </button>
        </div>

        {visibleTab === "market" ? (
          <div className="shop-market">
            {/* 左侧:搜索框 + 分类列表。 */}
            <div className="shop-side">
              <div className="shop-search">
                <Icon name="search" size={16} />
                <input
                  className="pxinput"
                  placeholder="搜索…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {SHOP_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`shop-cat${cat === c ? " on" : ""}`}
                  onClick={() => setCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 右侧:过滤后的插件卡 grid。 */}
            <div className="shop-grid scroll">
              {plugins.map((p) => (
                <div key={p.id} className="plugin-card">
                  <div className="plugin-top">
                    <div className="plugin-ic">
                      <Icon name={p.icon} size={30} glow="#36c5e0" />
                    </div>
                    <div className="plugin-meta">
                      <div className="plugin-name">{p.name}</div>
                      <div className="faint" style={{ fontSize: 11 }}>
                        by {p.author}
                      </div>
                    </div>
                  </div>
                  <div className="plugin-desc">{p.desc}</div>
                  <div className="plugin-bottom">
                    {/* ★ 是普通星号字符(非 emoji),可用。 */}
                    <span
                      className="px"
                      style={{ fontSize: 9, color: "#f2c84b" }}
                    >
                      ★ {p.stars}
                    </span>
                    <span className="faint" style={{ fontSize: 11 }}>
                      {p.installs} 安装
                    </span>
                    <span className="chip px" style={{ fontSize: 8 }}>
                      {p.runtime === "both" ? "通用" : "Claude"}
                    </span>
                    <div style={{ flex: 1 }} />
                    {/* mock 视觉:「安装」按钮不绑真实逻辑。 */}
                    {p.owned ? (
                      <span className="chip greenc">已拥有</span>
                    ) : (
                      <button type="button" className="pxbtn gold sm cjk">
                        安装
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="shop-items">
            {/* 余额条:真实 gem 余额 from store.ledger.balances。 */}
            <div className="shop-bal">
              <Icon name="gemcur" size={22} />
              <span className="px" style={{ color: "#a06cd5" }}>
                {gemBalance.toLocaleString()}
              </span>
              <span className="faint" style={{ fontSize: 11 }}>
                宝石 · 完成会话/任务赚取,仅外观,不影响开发结果
              </span>
            </div>

            {/* 道具 grid:每件一张 item-card,扭蛋项加 .gacha;--ac 为强调色。
                已拥有状态接真实 inventory:it.sku 在 inventory 里即视为「已拥有」。
                购买按钮仍为视觉 mock(引擎无商品购买逻辑)。 */}
            <div className="item-grid scroll">
              {SHOP_ITEMS.map((it) => {
                // 真实拥有判断:inventory 里有与 it.id 或 it.name 匹配的 sku 则为已拥有。
                // SHOP_ITEMS 的 id(i1~i8)不是真实 sku;按商品名字符匹配是合理的
                // 占位策略。若无更好映射,后退到 it.owned(shop-data 的静态 mock)。
                // [MOCK] 「购买」按钮不绑真实逻辑;已拥有来源于真实 inventory。
                // TODO: SHOP_ITEMS ids (i1–i8) do not map to real gacha SKUs.
                // The label-equality check (inv.label === it.name) is a placeholder
                // that can false-positive when gacha items share display names with
                // shop items. Fix by assigning real SKUs to SHOP_ITEMS and matching
                // on inv.sku === it.sku when gacha/shop item catalogs are unified.
                const ownedInInventory = Object.values(inventory).some(
                  (inv) => inv.label === it.name || inv.sku === it.id,
                );
                const isOwned = ownedInInventory;
                return (
                  <div
                    key={it.id}
                    className={`item-card${it.gacha ? " gacha" : ""}`}
                    style={{ "--ac": it.accent } as React.CSSProperties}
                  >
                    <div className="item-base">
                      <Icon name={it.icon} size={40} glow={it.accent} />
                    </div>
                    <div className="item-name">{it.name}</div>
                    <div className="chip px" style={{ fontSize: 8 }}>
                      {it.cat}
                    </div>
                    {/* 已拥有:真实 inventory 驱动(如无真实条目则降级 mock 标注)。
                      购买按钮为 mock 占位。 */}
                    {isOwned ? (
                      <span className="chip greenc" style={{ marginTop: 8 }}>
                        已拥有
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
        )}
      </div>
    </Modal>
  );
}
