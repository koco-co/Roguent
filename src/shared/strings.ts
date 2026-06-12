// 纯展示字符串工具。

// titleCase: 按 `-` / `_` / 空白分词,每词首字母大写其余原样保留。
// 空串安全返回空串。用于把 role(orchestrator / code-review)派生成展示名
// (Orchestrator / Code Review)。房间名牌与消息气泡作者名共用。
export function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// npcLabel: 房间小人头顶名牌文案。role 派生展示名(titleCase);lead/主控
// 前缀金色 `★`(对齐设计原型 hud.jsx 的 orchestrator 名牌)。
const LEAD_PREFIX = "★ ";
export function npcLabel(role: string, isLead: boolean): string {
  const label = titleCase(role);
  return isLead ? LEAD_PREFIX + label : label;
}
