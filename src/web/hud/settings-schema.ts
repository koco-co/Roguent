import type { IconName } from "./icons";

/**
 * Settings(CONFIG)面板的 **mock 示例 schema**——移植自设计原型 data.js
 * (settingsGroups / compactModels / codexSettingsGroups)。
 *
 * **整套数据全为示例占位,引擎不消费**:Roguent 是「活动可视化平台」,既不读写
 * Claude Code 的 settings.json,也未接入 Codex runtime;这里的字段 / 值 / 选项只为
 * 忠实复刻原型外观,既不接任何真实 store,也不持久化。组件侧本地 state 操作即可,
 * 不要把它当真实配置(别与 src/web/settings-store.ts —— 那是 app 自己的 UI 偏好 ——
 * 混为一谈)。
 *
 * icon 字段对应 icons.tsx 的 IconName,已逐一核对原型用到的名字
 * (gear/menu/compact/gem/account/mcp/spellbook/task)均存在,无替换。
 */

// 控件类型联合:与 renderCtrl 的分发分支一一对应。默认输入(原型里没显式 type 的
// 字段)按 'text' 处理。
export type SettingFieldType =
  | "toggle"
  | "select"
  | "radio"
  | "list"
  | "hooks"
  | "text";

// 单条 hook(event chip + 命令)——仅 hooks 类型字段使用。
export interface SettingHook {
  event: string;
  cmd: string;
}

// 字段的默认值类型:toggle→boolean、list→string[]、hooks→SettingHook[]、其余→string。
export type SettingValue = string | boolean | string[] | SettingHook[];

// 单个可编辑字段(label / 控件类型 / 默认值 / 选项 / 提示 / key)。
export interface SettingField {
  k: string;
  label: string;
  type: SettingFieldType;
  val: SettingValue;
  // select / radio 才有候选项。
  opts?: string[];
  tip: string;
}

// 分组(左侧导航一项)。compact 组 items 为空,由 CompactGroup 特殊渲染(§6.8)。
export interface SettingGroup {
  id: string;
  name: string;
  icon: IconName;
  items: SettingField[];
}

// 压缩阈值的某个模型一行(ThresholdRow):mode='auto' 走 SDK 原生,'pct' 用阈值滑块。
export interface CompactModel {
  model: string;
  label: string;
  mode: "auto" | "pct";
  pct: number;
  note: string;
}

const INTEGRATION_SETTINGS_GROUP: SettingGroup = {
  id: "integrations",
  name: "IM / 订阅",
  icon: "account",
  items: [
    {
      k: "im_wechat_enabled",
      label: "微信扫码配对 WeChat",
      type: "toggle",
      val: true,
      tip: "允许微信单会话扫码配对并把 agent 回复转发回当前微信会话。",
    },
    {
      k: "im_feishu_enabled",
      label: "飞书长连接 Feishu",
      type: "toggle",
      val: false,
      tip: "启用飞书/Lark bot 长连接收发消息。",
    },
    {
      k: "feishu_app_id",
      label: "飞书 App ID",
      type: "text",
      val: "",
      tip: "飞书/Lark bot 的 app_id。",
    },
    {
      k: "feishu_app_secret",
      label: "飞书 App Secret",
      type: "text",
      val: "",
      tip: "敏感字段,保存时只写入 SecretStore 引用。",
    },
    {
      k: "github_enabled",
      label: "GitHub 订阅",
      type: "toggle",
      val: false,
      tip: "接收 GitHub webhook 并路由到邮箱/公告板/会话。",
    },
    {
      k: "github_repo",
      label: "GitHub repo",
      type: "text",
      val: "",
      tip: "订阅仓库,格式 owner/repo。",
    },
    {
      k: "github_webhook_secret",
      label: "GitHub webhookSecret",
      type: "text",
      val: "",
      tip: "GitHub webhook HMAC secret,保存时只写 SecretStore 引用。",
    },
    {
      k: "x_enabled",
      label: "X 订阅",
      type: "toggle",
      val: false,
      tip: "启用 X webhook/订阅事件接入。",
    },
    {
      k: "x_bearer_token",
      label: "X bearerToken",
      type: "text",
      val: "",
      tip: "X API bearer token,保存时只写 SecretStore 引用。",
    },
    {
      k: "relay_enabled",
      label: "Relay 转发",
      type: "toggle",
      val: false,
      tip: "启用本地 tunnel 或生产 relay 转发 webhook。",
    },
    {
      k: "relay_endpoint",
      label: "Relay endpoint",
      type: "text",
      val: "",
      tip: "Relay 服务地址。",
    },
    {
      k: "relay_token",
      label: "Relay token",
      type: "text",
      val: "",
      tip: "Relay capability token,保存时只写 SecretStore 引用。",
    },
  ],
};

// ── Claude settings.json 分组(8 组,逐字段照搬原型 data.js)────────────────
export const SETTINGS_GROUPS: SettingGroup[] = [
  {
    id: "general",
    name: "通用 General",
    icon: "gear",
    items: [
      {
        k: "model",
        label: "默认模型 model",
        type: "select",
        val: "Opus 4.8",
        opts: ["Opus 4.8", "Sonnet 4.6", "Haiku 4.5"],
        tip: "新会话默认使用的模型。",
      },
      {
        k: "outputStyle",
        label: "输出风格 outputStyle",
        type: "select",
        val: "default",
        opts: ["default", "concise", "explanatory"],
        tip: "回复的详略与口吻。",
      },
      {
        k: "language",
        label: "回复语言 language",
        type: "select",
        val: "跟随系统",
        opts: ["跟随系统", "中文", "English"],
        tip: "模型回复使用的语言。",
      },
      {
        k: "effortLevel",
        label: "推理强度 effortLevel",
        type: "radio",
        val: "high",
        opts: ["low", "medium", "high", "xhigh"],
        tip: "更高强度更慢但更准。",
      },
      {
        k: "alwaysThinking",
        label: "默认深度思考 alwaysThinkingEnabled",
        type: "toggle",
        val: true,
        tip: "每轮默认启用扩展思考。",
      },
    ],
  },
  {
    id: "ui",
    name: "界面 Interface",
    icon: "menu",
    items: [
      {
        k: "theme",
        label: "主题 theme",
        type: "select",
        val: "地牢深青",
        opts: ["地牢深青", "城镇暖棕", "暗夜"],
        tip: "面板与世界的整体配色。",
      },
      {
        k: "editorMode",
        label: "编辑模式 editorMode",
        type: "radio",
        val: "normal",
        opts: ["normal", "vim"],
        tip: "输入框的键位模式。",
      },
      {
        k: "viewMode",
        label: "视图 viewMode",
        type: "radio",
        val: "default",
        opts: ["default", "verbose", "focus"],
        tip: "信息密度。",
      },
      {
        k: "autoScroll",
        label: "自动滚动 autoScrollEnabled",
        type: "toggle",
        val: true,
        tip: "新输出时自动滚到底部。",
      },
      {
        k: "reducedMotion",
        label: "减少动效 prefersReducedMotion",
        type: "toggle",
        val: false,
        tip: "关闭闪烁与粒子。",
      },
    ],
  },
  // compact 组 items 为空,由 CompactGroup 特殊渲染(§6.8)。
  {
    id: "compact",
    name: "上下文压缩 Compaction",
    icon: "compact",
    items: [],
  },
  {
    id: "perm",
    name: "权限 Permissions",
    icon: "gem",
    items: [
      {
        k: "defaultMode",
        label: "默认模式 defaultMode",
        type: "radio",
        val: "ask",
        opts: ["ask", "auto", "strict"],
        tip: "工具调用的默认审批策略。",
      },
      {
        k: "additionalDirectories",
        label: "附加目录 additionalDirectories",
        type: "list",
        val: ["~/work/shared"],
        tip: "允许访问的额外目录。",
      },
    ],
  },
  {
    id: "team",
    name: "Agent / 团队",
    icon: "account",
    items: [
      {
        k: "agentTeams",
        label: "实验性团队 EXPERIMENTAL_AGENT_TEAMS",
        type: "toggle",
        val: true,
        tip: "开启 agent teams 协作机制。",
      },
      {
        k: "teammateMode",
        label: "队友模式 teammateMode",
        type: "radio",
        val: "in-process",
        opts: ["auto", "in-process", "tmux"],
        tip: "队友进程的运行方式。",
      },
      {
        k: "teammateModel",
        label: "默认队友模型",
        type: "select",
        val: "Sonnet 4.6",
        opts: ["Opus 4.8", "Sonnet 4.6", "Haiku 4.5"],
        tip: "subagent 默认模型。",
      },
    ],
  },
  {
    id: "mcp",
    name: "MCP 服务器",
    icon: "mcp",
    items: [
      {
        k: "enableAllProjectMcp",
        label: "启用项目内全部 MCP",
        type: "toggle",
        val: false,
        tip: "自动启用 .mcp.json 中的服务器。",
      },
      {
        k: "enabledMcp",
        label: "已启用 enabledMcpjsonServers",
        type: "list",
        val: ["github-mcp", "commit-lint"],
        tip: "白名单服务器。",
      },
    ],
  },
  {
    id: "skills",
    name: "技能 / 插件",
    icon: "spellbook",
    items: [
      {
        k: "skillOverrides",
        label: "技能覆盖 skillOverrides",
        type: "radio",
        val: "on",
        opts: ["on", "name-only", "off"],
        tip: "技能注入策略。",
      },
      {
        k: "disableSkillShell",
        label: "禁用技能 shell 执行",
        type: "toggle",
        val: false,
        tip: "安全：禁止技能执行 shell。",
      },
    ],
  },
  {
    id: "hooks",
    name: "Hooks",
    icon: "task",
    items: [
      {
        k: "hooks",
        label: "生命周期事件",
        type: "hooks",
        val: [
          { event: "TeammateIdle", cmd: 'notify-send "队友空闲"' },
          { event: "TaskCompleted", cmd: "./scripts/on-done.sh" },
        ],
        tip: "在事件触发时运行命令（含 agent teams 事件）。",
      },
    ],
  },
  INTEGRATION_SETTINGS_GROUP,
];

// ── 压缩阈值模型(3 个,§6.8 CompactGroup 用)──────────────────────────────
export const COMPACT_MODELS: CompactModel[] = [
  {
    model: "claude-opus-4-8",
    label: "Opus 4.8",
    mode: "pct",
    pct: 20,
    note: "1M 上下文易烧额度，建议设阈值。",
  },
  {
    model: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    mode: "auto",
    pct: 50,
    note: "走 SDK 原生自动压缩。",
  },
  {
    model: "claude-haiku-4-5",
    label: "Haiku 4.5",
    mode: "auto",
    pct: 50,
    note: "走 SDK 原生自动压缩。",
  },
];

// ── Codex ~/.codex/config.toml 分组(4 组;原型 data.js 里的 \uXXXX 已还原为中文)──
export const CODEX_SETTINGS_GROUPS: SettingGroup[] = [
  {
    id: "cx-general",
    name: "通用 General",
    icon: "gear",
    items: [
      {
        k: "cx_model",
        label: "模型 model",
        type: "select",
        val: "gpt-5-codex",
        opts: ["gpt-5-codex", "gpt-5", "o4-mini"],
        tip: "Codex CLI 使用的模型。",
      },
      {
        k: "cx_provider",
        label: "模型提供方 model_provider",
        type: "select",
        val: "openai",
        opts: ["openai", "azure", "custom"],
        tip: "模型接入的 provider。",
      },
      {
        k: "cx_reasoning",
        label: "推理强度 reasoning_effort",
        type: "radio",
        val: "medium",
        opts: ["low", "medium", "high"],
        tip: "推理链的深度。",
      },
    ],
  },
  {
    id: "cx-approval",
    name: "审批 Approval",
    icon: "gem",
    items: [
      {
        k: "cx_approval",
        label: "审批策略 approval_policy",
        type: "radio",
        val: "on-request",
        opts: ["untrusted", "on-request", "on-failure", "never"],
        tip: "什么时候需要人工批准命令。",
      },
    ],
  },
  {
    id: "cx-sandbox",
    name: "沙箱 Sandbox",
    icon: "compact",
    items: [
      {
        k: "cx_sandbox",
        label: "沙箱模式 sandbox_mode",
        type: "radio",
        val: "workspace-write",
        opts: ["read-only", "workspace-write", "danger-full-access"],
        tip: "命令可访问的文件系统范围。",
      },
      {
        k: "cx_network",
        label: "网络访问 network_access",
        type: "toggle",
        val: false,
        tip: "沙箱内是否允许联网。",
      },
    ],
  },
  {
    id: "cx-mcp",
    name: "MCP 服务器",
    icon: "mcp",
    items: [
      {
        k: "cx_mcp",
        label: "mcp_servers",
        type: "list",
        val: ["github-mcp"],
        tip: "config.toml 中配置的 MCP 服务器。",
      },
      {
        k: "cx_mcp_profile",
        label: "MCP profile",
        type: "select",
        val: "default",
        opts: ["default", "mobile-dev", "ci"],
        tip: "Roguent 保存的 Codex MCP 配置 profile。",
      },
    ],
  },
  INTEGRATION_SETTINGS_GROUP,
];
