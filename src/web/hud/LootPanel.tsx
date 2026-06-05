import type { Loot } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon, type IconName } from "./icons";

/**
 * 背包面板 Backpack(对标设计原型 panels2.jsx 的 Backpack,§背包):
 * 一格一战利品的「袋子」grid。
 *
 * **这是真数据面板,不是 mock**:每一格映射「当前会话真实产出的 loot」
 * (session.loot)——引擎归一化真实 SDK 产出得到的工件。**唯一的视觉填充**是
 * 把网格补到下一个 4 的倍数(至少 8 格)的 .loot-cell.empty 空槽,纯装饰、不放内容,
 * 复刻原型「有空槽的袋子」观感;不造假 loot、不加 mock banner。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。
 * selector 守 zustand 铁律:loot 选择器只返回稳定引用(loot 数组引用或模块级
 * EMPTY_LOOT 兜底),绝不在 selector 里 .map/.reverse/[...]/构造新数组——
 * 倒序、补空槽全在 render 体里做。
 */

// loot.kind → 图标(file=读文件 / diff=写改 / report=报告 / answer=回答)。
const KIND_ICON: Record<Loot["kind"], IconName> = {
  file: "read",
  diff: "write",
  report: "quest",
  answer: "chat",
};

// loot.kind → 柔和辉光色,让不同类型的工件有区分度(纯装饰)。
const KIND_GLOW: Record<Loot["kind"], string> = {
  file: "var(--cyan)",
  diff: "#a06cd5",
  report: "#f2c84b",
  answer: "#36c5e0",
};

// Stable reference: returning a fresh `[]` from a Zustand selector makes
// useSyncExternalStore see a new snapshot every render → infinite loop.
const EMPTY_LOOT: readonly Loot[] = [];

/** The backpack: artifacts (loot) the session has produced. */
export function LootPanel() {
  const active = useUiStore((s) => s.activePanel === "backpack");
  const closePanel = useUiStore((s) => s.closePanel);
  // 真 loot:选中会话的产出。selector 只返回稳定引用(loot 数组或 EMPTY_LOOT)。
  const loot = useRoomStore((s) => {
    const sess = s.currentSessionId
      ? s.sessions[s.currentSessionId]
      : undefined;
    return sess?.loot ?? EMPTY_LOOT;
  });

  if (!active) return null;

  // 倒序:最新掉落在前(在 render 体里建新数组,不在 selector 里)。
  const ordered = [...loot].reverse();
  // 视觉空槽:补到下一个 4 的倍数,且总格数至少 8(纯装饰,不放内容)。
  const minCells = Math.max(ordered.length, 8);
  const totalCells = Math.ceil(minCells / 4) * 4;
  const emptyCount = totalCells - ordered.length;

  return (
    <Modal
      title="BACKPACK"
      sub="本会话产出 loot"
      icon="pouch"
      width={760}
      onClose={closePanel}
    >
      {ordered.length === 0 ? <div className="faint">暂无掉落</div> : null}
      <div className="loot-grid">
        {/* 真 loot 格:每格 = 一件真实产出的工件。 */}
        {ordered.map((l) => (
          <div key={l.id} className="loot-cell">
            <Icon name={KIND_ICON[l.kind]} size={30} glow={KIND_GLOW[l.kind]} />
            <div className="loot-name">{l.label}</div>
          </div>
        ))}
        {/* 视觉空槽:把袋子填满到下一个 4 的倍数(纯装饰,无内容)。 */}
        {Array.from({ length: emptyCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 纯装饰空槽,无身份、无内容、不重排
          <div key={`empty-${i}`} className="loot-cell empty" />
        ))}
      </div>
    </Modal>
  );
}
