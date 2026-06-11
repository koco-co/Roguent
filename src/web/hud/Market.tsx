import { useState } from "react";
import { useT } from "../i18n";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SHOP_CATS, SHOP_PLUGINS } from "./shop-data";

/**
 * 插件市场(MARKET)面板 Market —— 从旧 Shop 的「插件市场」tab 拆出的独立面板。
 *
 * **整面板 mock + banner**:Roguent 引擎无插件市场,这里的插件 / 评分 / 安装数 /
 * 拥有状态全为示例占位,「安装」按钮不绑真实逻辑,只忠实复刻原型外观。
 *
 * Zustand selector 铁律:只取基元值(布尔)或稳定引用;分类 / 搜索过滤等派生操作
 * 放在 render 体里。activePanel gate 放在所有 hooks 之后(React hooks 规则)。
 */
export function Market() {
  const active = useUiStore((s) => s.activePanel === "market");
  const closePanel = useUiStore((s) => s.closePanel);
  const t = useT();
  // 分类、搜索串,均为本地 UI 态。
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");

  if (!active) return null;

  // 已安装计数:拥有的插件数(供「已安装」分类右侧角标)。
  const ownedCount = SHOP_PLUGINS.filter((p) => p.owned).length;

  // 在 render 体里对本地 mock 常量过滤(同原型逻辑):cat==='已安装'→ owned;
  // cat!=='全部'→ p.cat===cat;再叠加 q(name 或 desc 包含 q)。不在 selector 里。
  const plugins = SHOP_PLUGINS.filter((p) => {
    if (cat === "已安装") return p.owned;
    if (cat !== "全部") return p.cat === cat;
    return true;
  }).filter((p) => !q || p.name.includes(q) || p.desc.includes(q));

  return (
    <Modal
      title="MARKET"
      sub={t("插件市场 · MCP / Skills / 插件 · 接入真实能力")}
      icon="mcp"
      width={1180}
      onClose={closePanel}
    >
      <div className="shop-wrap">
        {/* mock 标注:整面板示例数据,显眼 banner——引擎无插件市场。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          {t("示例插件 · 安装逻辑未接入(引擎暂无插件市场)")}
        </div>

        <div className="shop-market">
          {/* 左侧:搜索框 + 分类列表。 */}
          <div className="shop-side">
            <div className="shop-search">
              <Icon name="search" size={16} />
              <input
                className="pxinput"
                placeholder={t("搜索…")}
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
                {t(c)}
                {c === "已安装" && (
                  <span className="shop-cat-n px">{ownedCount}</span>
                )}
              </button>
            ))}
            <div className="shop-side-note faint">
              {t(
                "评分 / 安装数为示例 · 真实能力以本机已配置的 MCP / Skills 为准",
              )}
            </div>
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
                  <span className="chip px" style={{ fontSize: 8 }}>
                    {p.cat}
                  </span>
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
                    {p.runtime === "both" ? t("通用") : "Claude"}
                  </span>
                  <div style={{ flex: 1 }} />
                  {/* mock 视觉:「安装」按钮不绑真实逻辑。 */}
                  {p.owned ? (
                    <span className="chip greenc">{t("已启用")}</span>
                  ) : (
                    <button type="button" className="pxbtn gold sm cjk">
                      {t("安装")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
