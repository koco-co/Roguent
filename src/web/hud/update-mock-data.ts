/**
 * UpdateModal(版本与更新日志)面板的 **mock 示例数据**——移植自设计原型
 * panels2.jsx 的 UpdateModal CHANGELOG。
 *
 * **真假分明铁律(本仓既有)**:全文为 **mock 占位,引擎不消费**。Roguent 没有
 * 「检查更新 / 升级 runtime」能力,版本号与更新日志纯属演示;`MOCK_` 命名前缀 +
 * 面板内 `.task-mock-banner` 共同显著标注,绝不让它看起来像真实的版本检查结果。
 *
 * 字段照搬原型:`v`(版本号,产品术语不强译)/ `accent`(像素 accent 色)/
 * `tag?`(NEW 角标)/ `notes`(更新点)。`current` 标记当前版本(展示「当前」徽标)。
 */

export interface MockChangelogEntry {
  /** 版本号(产品术语,不强译)。 */
  v: string;
  /** 像素 accent 色(标题描边)。 */
  accent: string;
  /** 角标文案(如 NEW);缺省不显示。 */
  tag?: string;
  /** 是否为「当前」版本(展示当前徽标)。 */
  current?: boolean;
  /** 更新点列表(中文,渲染处包 t())。 */
  notes: string[];
}

// 当前展示版本号(mock 常量;与真实构建版本无关)。
export const MOCK_CURRENT_VERSION = "Roguent v0.9";

// 更新日志(逐字段照搬原型 data.js / panels2.jsx CHANGELOG;最新版置顶并标 NEW)。
export const MOCK_CHANGELOG: MockChangelogEntry[] = [
  {
    v: "v1.0",
    tag: "NEW",
    accent: "#5fd35f",
    notes: [
      "agent teams 正式版 · tmux 队友模式",
      "/oracle 技能上线",
      "1M 上下文阈值自动压缩优化",
    ],
  },
  {
    v: "v0.9",
    accent: "#36c5e0",
    current: true,
    notes: [
      "大厅 / 内景像素美术升级",
      "召唤法阵 · 昼夜光照 · 氛围预设",
      "聊天气泡像素化 · 实时可调氛围",
    ],
  },
  {
    v: "v0.8",
    accent: "#8a8170",
    notes: ["本地双 runtime 调度台", "扭蛋 / 成就 / 排行榜 / 邮箱面板"],
  },
];
