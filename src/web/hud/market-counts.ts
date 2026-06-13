import type { PluginEntry } from "../../shared/events";

/**
 * 「已安装」计数 —— 纯派生于真实插件目录(引擎 PluginsMessage 广播,见 store.plugins)。
 * 只数 `installed` 为 true 的真实条数,不造数据(照 Prototype panels2.jsx:190 的 owned 数)。
 */
export function installedPluginCount(plugins: readonly PluginEntry[]): number {
  return plugins.reduce((n, p) => (p.installed ? n + 1 : n), 0);
}
