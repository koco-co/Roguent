import type React from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";
import { Icon, type IconName } from "./icons";

/**
 * 技能 / 法术书面板 Skills(对标设计原型 panels1.jsx 的 Skills,§法术书):
 * 一格一技能的法术书 grid。
 *
 * **真假分明**:
 * - **真实**:格子映射的是「当前会话真实可用的 slash 命令」(session.slashCommands),
 *   点击即 `sendCommand({cmd:"sendMessage", ...})` 把 `/<name>` 发给该会话——真功能。
 * - **mock 装饰**:图标 / 稀有度 / 描述 / 锁定全是示例装饰(引擎不提供这些),靠 SKILL_DECOR
 *   忠实复刻原型外观,顶部 .skill-mock-note 显式标注;锁定占位技能(MOCK_LOCKED)单独分组、
 *   不可点,sub-header 写明「未解锁 · 示例(占位,非真实命令)」,绝不冒充真实命令。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。
 * selector 只取 activePanel(基元)/ closePanel(稳定函数引用)/ s.sessions[id](单值),
 * 守 zustand selector 铁律——slashCommands 在 render 体里 map,不在 selector 里建数组。
 */

// 稀有度配色(mock 装饰,对标原型 common/rare/epic/legendary 四档)。
const RARITY = {
  common: "#8a8170",
  rare: "#36c5e0",
  epic: "#a06cd5",
  legendary: "#f2c84b",
} as const;

type Decor = { icon: IconName; rarity: keyof typeof RARITY; desc: string };

// 已知命令 → 忠实原型的装饰(图标 / 稀有度 / 描述全是示例,非引擎数据)。
const SKILL_DECOR: Record<string, Decor> = {
  compact: { icon: "compact", rarity: "common", desc: "压缩当前上下文并续跑" },
  review: { icon: "search", rarity: "common", desc: "对当前 diff 做代码审查" },
  test: { icon: "bash", rarity: "common", desc: "运行测试套件并汇总失败" },
  plan: { icon: "quest", rarity: "rare", desc: "生成多步任务计划" },
  team: { icon: "account", rarity: "rare", desc: "召集 agent team 协作" },
  docs: { icon: "read", rarity: "common", desc: "生成或更新文档" },
  doc: { icon: "read", rarity: "common", desc: "生成或更新文档" },
  commit: { icon: "write", rarity: "common", desc: "生成提交信息并提交" },
  mcp: { icon: "mcp", rarity: "rare", desc: "连接 MCP 工具服务器" },
};

// 未知命令的回落装饰(仍是真命令,只是没有专属示例外观)。
const DEFAULT_DECOR: Decor = {
  icon: "quest",
  rarity: "common",
  desc: "内置 slash 命令",
};

// 锁定占位技能:纯 mock 装饰,**非真实命令**,不可点(展示原型的「未解锁」格)。
const MOCK_LOCKED: Array<{
  id: string;
  name: string;
  icon: IconName;
  rarity: keyof typeof RARITY;
  desc: string;
}> = [
  {
    id: "refactor",
    name: "/refactor",
    icon: "task",
    rarity: "epic",
    desc: "跨文件安全重构",
  },
  {
    id: "bench",
    name: "/bench",
    icon: "trophy",
    rarity: "epic",
    desc: "性能基准回归",
  },
  {
    id: "migrate",
    name: "/migrate",
    icon: "import",
    rarity: "rare",
    desc: "数据/schema 迁移向导",
  },
  {
    id: "oracle",
    name: "/oracle",
    icon: "crystal",
    rarity: "legendary",
    desc: "调用更强模型做疑难推理",
  },
];

export function Skills() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "skills");
  const closePanel = useUiStore((s) => s.closePanel);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );

  if (!active) return null;

  // 真实技能 = slash 命令(有命令文件)+ skills(SDK init 的 skills 字段,如
  // brainstorming)。统一规整成不带前导 / 的名字、按名去重(/code-review 可能既是
  // 命令又是技能),渲染时统一加 /。在 render 体里 map,不进 selector(守铁律)。
  const cmds = Array.from(
    new Set(
      [...(session?.slashCommands ?? []), ...(session?.skills ?? [])].map((c) =>
        c.replace(/^\//, ""),
      ),
    ),
  );

  return (
    <Modal
      title="SKILLS"
      sub="法术书 · slash 命令 & skills"
      icon="spellbook"
      accent="#a06cd5"
      width={1000}
      vibe="talent"
      onClose={closePanel}
    >
      {/* mock 标注:图标 / 稀有度 / 锁定为示例装饰,下方为真实可用的 slash 命令。 */}
      <div className="skill-mock-note">
        {t("图标 / 稀有度 / 锁定为示例装饰;下方为当前会话")}
        <b>{t("真实可用")}</b>
        {t("的 slash 命令,点击即运行。")}
      </div>

      {/* 真实技能格:每格 = 一条真 slash 命令,点击发命令。 */}
      {cmds.length === 0 ? (
        <div className="faint">{t("当前会话无可用 slash 命令")}</div>
      ) : (
        <div className="skill-grid">
          {cmds.map((name) => {
            const decor = SKILL_DECOR[name] ?? DEFAULT_DECOR;
            const rarityColor = RARITY[decor.rarity];
            return (
              <button
                key={name}
                type="button"
                className="skill-cell"
                style={{ "--rar": rarityColor } as React.CSSProperties}
                onClick={() => {
                  if (session)
                    sendCommand({
                      cmd: "sendMessage",
                      sessionId: session.id,
                      text: `/${name}`,
                    });
                  closePanel();
                }}
              >
                <div className="skill-ic">
                  <Icon name={decor.icon} size={34} glow={rarityColor} />
                </div>
                <div className="skill-name px">/{name}</div>
                <div className="skill-desc">{t(decor.desc)}</div>
                <div className="skill-rar px" style={{ color: rarityColor }}>
                  {decor.rarity}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* mock 锁定组:纯示例占位,非真实命令,不可点。 */}
      <div className="skill-sub">{t("未解锁 · 示例(占位,非真实命令)")}</div>
      <div className="skill-grid">
        {MOCK_LOCKED.map((s) => {
          const rarityColor = RARITY[s.rarity];
          return (
            <div key={s.id} className="skill-cell locked">
              <div className="skill-ic">
                <Icon name={s.icon} size={34} />
              </div>
              <div className="skill-name px">{s.name}</div>
              <div className="skill-desc">{t(s.desc)}</div>
              <div className="skill-rar px" style={{ color: rarityColor }}>
                {s.rarity}
              </div>
              <div className="skill-lock">
                <Icon name="error" size={18} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
