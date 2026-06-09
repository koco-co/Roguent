import { useState } from "react";
import type React from "react";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SHOP_CATS, SHOP_GEMS, SHOP_ITEMS, SHOP_PLUGINS } from "./shop-data";

/**
 * 商店(SHOP)面板 Shop(对标设计原型 panels2.jsx 的 Shop,§6.14):
 * 「插件市场 + 道具店」两个 tab。
 *
 * **整面板为 mock 占位**:Roguent 是「活动可视化平台」,**没有**插件市场、**没有**
 * 宝石经济、**没有**皮肤 / 宠物商品。data.js 虽把 plugins 注释成 "(real)",但对本
 * 引擎而言整面板都是示例——plugins / items / 宝石余额 / 安装 / 购买 / 已拥有全是
 * 本地 mock 常量(见 shop-data.ts),**不接任何真实 store、不持久化**;「安装」/「购买」
 * 按钮均为视觉占位,绝不假装真安装 / 真购买。顶部一条显眼 .task-mock-banner 显式标注
 * (复用 Tasks 的 mock banner 类)。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则);selector
 * 只取 activePanel(基元 boolean)/ closePanel(稳定函数引用),守 zustand selector
 * 铁律。plugins 的过滤是在 render 体里对本地 mock 常量做的,**不是**在 selector 里,
 * 不破坏铁律。
 */

export function Shop() {
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const active = activePanel === "shop" || activePanel === "gacha";
  // 当前 tab(market/items)、分类、搜索串,全为本地 mock 态。
  const [tab, setTab] = useState<"market" | "items">("market");
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");

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
            {/* 余额条:宝石数 + 说明(沿用原型文案;非真实经济)。 */}
            <div className="shop-bal">
              <Icon name="gemcur" size={22} />
              <span className="px" style={{ color: "#a06cd5" }}>
                {SHOP_GEMS.toLocaleString()}
              </span>
              <span className="faint" style={{ fontSize: 11 }}>
                宝石 · 完成会话/任务赚取,仅外观,不影响开发结果
              </span>
            </div>

            {/* 道具 grid:每件一张 item-card,扭蛋项加 .gacha;--ac 为强调色。 */}
            <div className="item-grid scroll">
              {SHOP_ITEMS.map((it) => (
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
                  {/* mock 视觉:价格按钮不绑真实购买逻辑。 */}
                  {it.owned ? (
                    <span className="chip greenc" style={{ marginTop: 8 }}>
                      已拥有
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="pxbtn sm cjk"
                      style={{ marginTop: 8 }}
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
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
