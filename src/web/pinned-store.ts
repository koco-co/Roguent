import { create } from "zustand";

// ──────────────────────────────────────────────────────────────────────────
// 置顶消息 store(B3 切片)。
//
// ⚠️ 客户端本地 UI 状态,不是引擎事件、没有真实业务源。
// 置顶是「在本机查看时把某几条消息标记出来」的纯查看辅助,只存 localStorage,
// 既不进 RoomEvent 协议、也不广播给其它客户端、不影响 agent 行为。
// 真/假边界:重发/编辑/搜索接真(真命令 / 真 timeline);置顶是客户端便利,
// 绝不声称引擎源(无源不造,见 spec §真/假边界)。
//
// 形状:pinnedBySession: Record<sessionId, string[]>(每会话已置顶的 timeline
// message item id 列表,id == MessageBubble 的 item.id == String(seq))。
// 单独成 store(不并进 settings-store)因为它是 per-session 的运行期数据、
// 生命周期与 UI 偏好不同。
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "roguent:pinned";

// 空数组常量:给「无置顶」会话返回稳定引用,避免 selector 每次造新数组触发重渲染。
const EMPTY: readonly string[] = Object.freeze([]);

export interface PinnedState {
  /** 每会话已置顶的消息 item id。客户端本地,持久化到 localStorage。 */
  pinnedBySession: Record<string, string[]>;
}

interface PinnedActions {
  /** 切换 (sessionId, itemId) 的置顶态:不在则加入,已在则移除。 */
  togglePin: (sessionId: string, itemId: string) => void;
  /** 该会话是否已置顶此消息。 */
  isPinned: (sessionId: string, itemId: string) => boolean;
}

export type PinnedStore = PinnedState & PinnedActions;

/**
 * 把持久化的原始字符串解析成 pinnedBySession。对损坏数据宽容:解析失败 / 非对象
 * → 空;每个值只保留「全是 string 的数组」,其它丢弃。抽成纯函数便于单测。
 */
export function parsePinned(raw: string | null): Record<string, string[]> {
  if (raw == null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const obj = data as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (
      Array.isArray(value) &&
      value.every((v): v is string => typeof v === "string")
    ) {
      // 去重,保留首次出现顺序。
      out[key] = [...new Set(value)];
    }
  }
  return out;
}

// localStorage 访问全程守卫(测试环境无该全局、隐私模式 / Tauri 可能抛错),失败回落空。
function loadPinned(): Record<string, string[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    return parsePinned(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function savePinned(state: Record<string, string[]>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式 / 配额满 —— 静默忽略,不挡 UI。 */
  }
}

export const usePinnedStore = create<PinnedStore>((set, get) => ({
  pinnedBySession: loadPinned(),
  togglePin: (sessionId, itemId) =>
    set((s) => {
      const current = s.pinnedBySession[sessionId] ?? [];
      const has = current.includes(itemId);
      const nextIds = has
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      const next: Record<string, string[]> = { ...s.pinnedBySession };
      if (nextIds.length === 0) {
        // 空列表不留键,保持持久化数据紧凑。
        delete next[sessionId];
      } else {
        next[sessionId] = nextIds;
      }
      return { pinnedBySession: next };
    }),
  isPinned: (sessionId, itemId) =>
    (get().pinnedBySession[sessionId] ?? EMPTY).includes(itemId),
}));

// 任意 pin 变化时持久化(actions 不变,只序列化 pinnedBySession)。
usePinnedStore.subscribe((s) => savePinned(s.pinnedBySession));

/**
 * 当前会话的已置顶 id 数组的稳定 selector。无置顶时返回**同一个**冻结空数组,
 * 避免在 zustand selector 里造新数组导致无限重渲染(守 zustand 铁律)。
 * 组件用法:`usePinnedStore((s) => selectPinnedIds(s, sessionId))`。
 */
export function selectPinnedIds(
  s: PinnedState,
  sessionId: string,
): readonly string[] {
  return s.pinnedBySession[sessionId] ?? EMPTY;
}
