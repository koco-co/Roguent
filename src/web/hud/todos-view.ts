import {
  ORCHESTRATOR_ID,
  type Session,
  type TodoItem,
  type TodoStatus,
} from "../../shared/domain";

// 一条带归属 agent 的待办(展平后供面板渲染)。
export interface TodoRow extends TodoItem {
  agentId: string;
}

// 把会话各 agent 的 TodoWrite 清单展平成一条有序列表:主控优先,其余按 agentId 升序;
// 各 agent 内部顺序原样保留(= TodoWrite 写入顺序)。无会话 / 空表 → []。
export function sessionTodos(session: Session | undefined): TodoRow[] {
  if (!session) return [];
  const ids = Object.keys(session.todos).sort((a, b) =>
    a === ORCHESTRATOR_ID ? -1 : b === ORCHESTRATOR_ID ? 1 : a.localeCompare(b),
  );
  const rows: TodoRow[] = [];
  for (const id of ids) {
    for (const item of session.todos[id] ?? [])
      rows.push({ ...item, agentId: id });
  }
  return rows;
}

export interface TodoCounts {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}
export function todoCounts(rows: TodoRow[]): TodoCounts {
  const c: TodoCounts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    total: rows.length,
  };
  for (const r of rows) c[r.status]++;
  return c;
}

// status → [圆点/进度条颜色, 中文文案]。对标原型 STATE_META,但用真实 TodoWrite 枚举
// (pending | in_progress | completed)。TaskWindow 与 Tasks 共用。
export const TODO_META: Record<TodoStatus, [string, string]> = {
  pending: ["#8a8170", "待办"],
  in_progress: ["#36c5e0", "进行中"],
  completed: ["#5fd35f", "完成"],
};

// status → 进度条宽度 %(TodoWrite 无逐项百分比,按状态给固定值;进行中给 60 + live 流光)。
export function todoProgress(status: TodoStatus): number {
  if (status === "completed") return 100;
  if (status === "in_progress") return 60;
  return 0;
}
