// ── 共享任务面板 mock 单一源 ──────────────────────────────────────────────────
// 以下全为 mock 占位 —— 引擎暂无共享任务清单 / 依赖图 / 归属 / inter-agent 信箱。
// 待引擎接入(聚合各 agent TodoWrite + team 清单)后替换为真数据。仅供 TaskWindow /
// Tasks 面板渲染,绝不冒充真实数据。
//
// owner.hero 必须是 src/shared/mapping.ts 里 HERO_POOL / ORCHESTRATOR_HERO 的合法
// base 名(HeroPortrait 传非法名渲染不出精灵):orc=ORCHESTRATOR_HERO(knight_m),
// 其余各取 HERO_POOL 里不同的合法 base(wizzard_m / knight_f / elf_f / dwarf_f)。

export type MockTaskState = "pending" | "in-progress" | "completed";

export interface MockTask {
  id: string;
  title: string;
  state: MockTaskState;
  owner: string | null;
  model: string;
  deps: string[];
  desc: string;
  blockedByUser?: boolean;
}

// 忠实移植原型 panels1.jsx 的 DATA.tasks 这 7 条(去 emoji)。字段 / 状态枚举与原型一致。
export const MOCK_TASKS: MockTask[] = [
  {
    id: "t1",
    title: "重构大厅相机缩放逻辑",
    state: "in-progress",
    owner: "orc",
    model: "Opus 4.8",
    deps: [],
    desc: "让整数倍缩放贴身跟随主控，进出房间平滑过渡。",
  },
  {
    id: "t2",
    title: "勘察 mapping.ts 英雄池",
    state: "completed",
    owner: "mage",
    model: "Sonnet 4.6",
    deps: [],
    desc: "梳理 HERO_POOL / ORCHESTRATOR_HERO 的稳定哈希分配。",
  },
  {
    id: "t3",
    title: "重绘 NPC 头顶状态槽",
    state: "in-progress",
    owner: "kf",
    model: "Opus 4.8",
    deps: ["t2"],
    desc: "askuser 最高优先，工具气泡随调用切换。",
  },
  {
    id: "t4",
    title: "接 TodoWrite → 任务面板实时同步",
    state: "pending",
    owner: null,
    model: "—",
    deps: ["t1", "t3"],
    desc: "聚合各会话待办 + agent team 共享清单。",
  },
  {
    id: "t5",
    title: "写大厅空态引导文案",
    state: "pending",
    owner: "elf",
    model: "Sonnet 4.6",
    deps: ["t1"],
    desc: "「召唤你的第一个小队」引导。",
  },
  {
    id: "t6",
    title: "更新 README 安装步骤",
    state: "pending",
    owner: "elf",
    model: "Sonnet 4.6",
    deps: [],
    desc: "等待用户确认 bun / npm。",
    blockedByUser: true,
  },
  {
    id: "t7",
    title: "依赖审计 bun.lock",
    state: "completed",
    owner: "dwf",
    model: "Haiku 4.5",
    deps: [],
    desc: "校验锁文件无幽灵依赖。",
  },
];

export interface MockOwner {
  name: string;
  hero: string;
}

// owner id → 展示名 + 合法 0x72 hero base(见顶部说明)。
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

// state → [圆点 / 进度条颜色, 文案];TaskWindow 与 Tasks 两处共用,与原型 meta 一致。
export const STATE_META: Record<MockTaskState, [string, string]> = {
  pending: ["#8a8170", "待领"],
  "in-progress": ["#36c5e0", "进行中"],
  completed: ["#5fd35f", "完成"],
};

// 进度:completed→100、pending→0、in-progress 按原型固定值(t1:62 / t3:38 / 其它:50)。
// TaskWindow(进度条)与 Tasks 共用同一派生函数。
export function taskProgress(tk: MockTask): number {
  if (tk.state === "completed") return 100;
  if (tk.state === "pending") return 0;
  if (tk.id === "t1") return 62;
  if (tk.id === "t3") return 38;
  return 50;
}
