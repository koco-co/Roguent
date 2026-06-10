// ── inter-agent 信箱 mock 单一源 ──────────────────────────────────────────────
// 仅 Tasks 面板底部「信箱」用:引擎不暴露 agent 间信箱,故保留为**标注 mock**
// (Tasks.tsx 内有局部 .task-mock-banner 显式声明)。任务/待办数据已全部接真
// (Session.todos),原 MOCK_TASKS / STATE_META / taskProgress 已删除,改用
// src/web/hud/todos-view.ts 的 TODO_META / todoProgress。

export interface MockOwner {
  name: string;
  hero: string;
}

// 信箱 from/to 用的展示名(纯 mock 角色,与真实 agent 无关)。
export const MOCK_OWNERS: Record<string, MockOwner> = {
  orc: { name: "Orchestrator", hero: "knight_m" },
  mage: { name: "Surveyor", hero: "wizzard_m" },
  kf: { name: "Warden", hero: "knight_f" },
  elf: { name: "Scribe", hero: "elf_f" },
  dwf: { name: "Auditor", hero: "dwarf_f" },
};

export interface MockMail {
  from: string;
  to: string;
  text: string;
}

// inter-agent 信箱(占位)。from / to 用 owner id,渲染时映射成 MOCK_OWNERS 的展示名。
export const MOCK_MAILBOX: MockMail[] = [
  { from: "mage", to: "orc", text: "勘察完成，HERO_POOL 有 8 个稳定皮肤。" },
  { from: "orc", to: "kf", text: "状态槽优先级按 §6.6，askuser 置顶。" },
  { from: "kf", to: "orc", text: "测试套件 88% 上下文，接近阈值，请求压缩。" },
  { from: "dwf", to: "orc", text: "bun.lock 无异常，依赖审计通过。" },
];
