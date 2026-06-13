import { useState } from "react";
import type { PluginEntry } from "../../shared/events";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { installedPluginCount } from "./market-counts";

const CATS = ["全部", "已安装", "Skills", "MCP", "插件"] as const;

function matchesCat(p: PluginEntry, cat: string): boolean {
  if (cat === "全部") return true;
  if (cat === "已安装") return p.installed;
  if (cat === "MCP") return p.hasMcp;
  if (cat === "Skills") return p.hasSkills;
  if (cat === "插件") return !p.hasMcp && !p.hasSkills;
  return true;
}

/**
 * 插件市场(MARKET)面板 — 渲染真实插件目录(来自引擎 PluginsMessage),
 * 安装 / 启用 / 停用 / 卸载按钮经 sendCommand 上行到引擎处理。
 *
 * Zustand selector 铁律:只取基元值或稳定引用;派生过滤在 render 体里做。
 * hooks 全在 early return 之前(React hooks 规则)。
 */
export function Market() {
  const active = useUiStore((s) => s.activePanel === "market");
  const closePanel = useUiStore((s) => s.closePanel);
  const plugins = useRoomStore((s) => s.plugins);
  const busy = useRoomStore((s) => s.pluginsBusy);
  const t = useT();
  const [cat, setCat] = useState<string>("全部");
  const [q, setQ] = useState("");

  if (!active) return null;

  const installedCount = installedPluginCount(plugins);
  const busyIds = new Set(busy.map((b) => b.id));

  const list = plugins
    .filter((p) => matchesCat(p, cat))
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.description.toLowerCase().includes(q.toLowerCase()),
    );

  const act = (
    action: "install" | "enable" | "disable" | "uninstall",
    id: string,
  ) => sendCommand({ cmd: "plugins", action, pluginId: id });

  return (
    <Modal
      title="MARKET"
      sub={t("插件市场 · MCP / Skills / 插件 · 接入真实能力")}
      icon="mcp"
      width={1180}
      onClose={closePanel}
    >
      <div className="shop-wrap">
        <div className="shop-market">
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
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                className={`shop-cat${cat === c ? " on" : ""}`}
                onClick={() => setCat(c)}
              >
                {t(c)}
                {c === "已安装" && (
                  <span className="shop-cat-n px">{installedCount}</span>
                )}
              </button>
            ))}
            <div className="shop-side-note faint">
              {t("插件变更对新建会话生效")}
            </div>
          </div>

          <div className="shop-grid scroll">
            {list.length === 0 ? (
              <div className="faint" style={{ padding: "24px 16px" }}>
                {plugins.length === 0 ? (
                  <>
                    <div>{t("目录未就绪")}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {t("引擎还未广播插件目录")}
                    </div>
                  </>
                ) : (
                  <>
                    <div>{t("无匹配结果")}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {t("尝试调整搜索词或分类筛选")}
                    </div>
                  </>
                )}
              </div>
            ) : (
              list.map((p) => {
                const isBusy = busyIds.has(p.id);
                return (
                  <div key={p.id} className="plugin-card">
                    <div className="plugin-top">
                      <div className="plugin-ic">
                        <Icon name="mcp" size={30} glow="#36c5e0" />
                      </div>
                      <div className="plugin-meta">
                        <div className="plugin-name">{p.name}</div>
                        <div className="faint" style={{ fontSize: 11 }}>
                          by {p.author ?? "—"}
                        </div>
                      </div>
                      <span className="chip px" style={{ fontSize: 8 }}>
                        {t(p.componentType)}
                      </span>
                    </div>
                    <div className="plugin-desc">{p.description}</div>
                    <div className="plugin-bottom">
                      {p.category && (
                        <span className="chip px" style={{ fontSize: 8 }}>
                          {p.category}
                        </span>
                      )}
                      <span className="faint" style={{ fontSize: 11 }}>
                        {p.installs !== null
                          ? `${formatInstalls(p.installs)} ${t("次安装")}`
                          : "—"}
                      </span>
                      <span className="chip px" style={{ fontSize: 8 }}>
                        {p.marketplace}
                      </span>
                      <div style={{ flex: 1 }} />
                      {renderAction(p, isBusy, t, act)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function formatInstalls(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderAction(
  p: PluginEntry,
  isBusy: boolean,
  t: (s: string) => string,
  act: (a: "install" | "enable" | "disable" | "uninstall", id: string) => void,
) {
  if (isBusy) return <span className="chip">{t("处理中…")}</span>;
  if (!p.installed)
    return (
      <button
        type="button"
        className="pxbtn gold sm cjk"
        onClick={() => act("install", p.id)}
      >
        {t("安装")}
      </button>
    );
  if (p.enabled)
    return (
      <>
        <span className="chip greenc">{t("已启用")}</span>
        <button
          type="button"
          className="pxbtn sm cjk"
          onClick={() => act("disable", p.id)}
        >
          {t("停用")}
        </button>
      </>
    );
  return (
    <>
      <button
        type="button"
        className="pxbtn gold sm cjk"
        onClick={() => act("enable", p.id)}
      >
        {t("启用")}
      </button>
      <button
        type="button"
        className="pxbtn sm cjk"
        onClick={() => act("uninstall", p.id)}
      >
        {t("卸载")}
      </button>
    </>
  );
}
