export interface LocalSessionMeta {
  project: string; // 目录名（encoded cwd）
  sessionId: string; // 文件名去掉 .jsonl
  path: string; // 绝对路径
  mtime: number; // epoch ms
  firstMessage: string; // 首条 user 文本预览
  msgCount: number; // 行数
}

// engine → client 的定向控制消息（非 RoomEvent 信封）。
export type ControlMessage =
  | { kind: "control"; type: "localSessions"; items: LocalSessionMeta[] }
  | { kind: "control"; type: "importError"; path: string; reason: string };
