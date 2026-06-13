/**
 * Tasks 面板「信件区」(inter-agent 邮箱)的 **mock 示例数据**——移植自设计原型
 * data.js 的 `mailbox`。
 *
 * **真假分明铁律(本仓既有)**:全文为 **mock 占位,引擎不消费**。Roguent 引擎
 * **没有 agent 之间的信箱通道**——subagent 间不互发信件,这里展示的发件人 / 标题 /
 * 时间全属演示。`MOCK_` 命名前缀 + 面板内 `.task-mock-banner` 共同显著标注,绝不
 * 污染上方真实的当前会话 TodoWrite 待办区,也绝不让它看起来像真实的 agent 通信。
 *
 * 原型字段 `from`/`to` 是 NPC 短码;本仓 Tasks 面板无 NPC 名册,故直接用可读的
 * agent 角色名(发件人 / 收件人),并补 `title`(标题)/ `time`(时间)以贴合
 * 「发件人 / 标题 / 时间」的信件列表展示。
 */

export interface MockAgentLetter {
  /** 发件 agent 角色名(展示用,非真实 agentId)。 */
  from: string;
  /** 收件 agent 角色名。 */
  to: string;
  /** 信件标题(中文文案,渲染处包 t())。 */
  title: string;
  /** 信件时间(展示用 mock 时间戳)。 */
  time: string;
}

export const MOCK_AGENT_LETTERS: MockAgentLetter[] = [
  {
    from: "勘察",
    to: "主控",
    title: "勘察完成，HERO_POOL 有 8 个稳定皮肤。",
    time: "19:08",
  },
  {
    from: "主控",
    to: "测试",
    title: "状态槽优先级按 §6.6，askuser 置顶。",
    time: "19:12",
  },
  {
    from: "测试",
    to: "主控",
    title: "测试套件 88% 上下文，接近阈值，请求压缩。",
    time: "19:21",
  },
  {
    from: "依赖",
    to: "主控",
    title: "bun.lock 无异常，依赖审计通过。",
    time: "19:25",
  },
];
