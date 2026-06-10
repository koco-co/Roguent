import { useMemo } from "react";
import type { Loot } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Modal } from "./Modal";
import { Icon, type IconName } from "./icons";

/**
 * 背包面板 Backpack(对标设计原型 panels2.jsx 的 Backpack,§背包):
 * 两个区域:1) 当前会话 loot(真实工件)2) 经济 inventory(扭蛋/ledger 获得的物品)。
 *
 * **真数据面板**:
 * - loot 区:session.loot ——引擎归一化真实 SDK 产出得到的工件。
 * - inventory 区:store.inventory ——经由 economy.ledger.appended 追加的物品,
 *   由 reduceInventoryFromLedger 从 append-only ledger 推导出。
 *
 * Zustand selector 铁律:selector 只返回稳定引用(数组引用/对象引用或模块级兜底
 * 常量),绝不在 selector 里构造新数组/对象——倒序、补空槽等派生操作放在 render 体。
 *
 * activePanel gate 放在所有 hooks 之后(React hooks 规则)。
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

/** The backpack: loot artifacts + economy inventory items. */
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
  // 真实 inventory:来自 economy.ledger.appended → reduceInventoryFromLedger。
  // 稳定引用:只有 ledger.appended 才替换 inventory 对象。
  const inventory = useRoomStore((s) => s.inventory);

  if (!active) return null;

  // 倒序:最新掉落在前(在 render 体里建新数组,不在 selector 里)。
  const ordered = [...loot].reverse();
  // 视觉空槽:补到下一个 4 的倍数,且总格数至少 8(纯装饰,不放内容)。
  const minCells = Math.max(ordered.length, 8);
  const totalCells = Math.ceil(minCells / 4) * 4;
  const emptyCount = totalCells - ordered.length;

  // inventory 列表:按 id 排序(在 render 体里派生,依赖稳定引用 inventory)。
  const inventoryItems = useMemo(
    () => Object.values(inventory).toSorted((a, b) => a.id.localeCompare(b.id)),
    [inventory],
  );

  return (
    <Modal
      title="BACKPACK"
      sub="本会话产出 loot · 扭蛋/经济背包"
      icon="pouch"
      width={760}
      onClose={closePanel}
    >
      {/* ── 会话工件 loot ── */}
      <div
        className="faint"
        style={{ fontSize: 11, marginBottom: 8, letterSpacing: 1 }}
      >
        会话工件
      </div>
      {ordered.length === 0 ? <div className="faint">暂无掉落</div> : null}
      <div className="loot-grid">
        {/* 真 loot 格:每格 = 一件真实产出的工件。 */}
        {ordered.map((l) => (
          <div key={l.id} className="loot-cell">
            <Icon
              name={
                (KIND_ICON as Record<string, IconName | undefined>)[l.kind] ??
                "quest"
              }
              size={30}
              glow={
                (KIND_GLOW as Record<string, string | undefined>)[l.kind] ??
                "var(--cyan)"
              }
            />
            <div className="loot-name">{l.label}</div>
          </div>
        ))}
        {/* 视觉空槽:把袋子填满到下一个 4 的倍数(纯装饰,无内容)。 */}
        {Array.from({ length: emptyCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 纯装饰空槽,无身份、无内容、不重排
          <div key={`empty-${i}`} className="loot-cell empty" />
        ))}
      </div>

      {/* ── 经济 inventory(扭蛋/ledger 获得) ── */}
      <div
        className="faint"
        style={{ fontSize: 11, margin: "16px 0 8px", letterSpacing: 1 }}
      >
        经济背包 ({inventoryItems.length})
      </div>
      {inventoryItems.length === 0 ? (
        <div className="faint">暂无物品 · 通过扭蛋或成就获得</div>
      ) : (
        <div className="loot-grid">
          {inventoryItems.map((item) => (
            <div
              key={item.id}
              className="loot-cell"
              data-testid={`inventory-item-${item.id}`}
            >
              <Icon name="gemcur" size={24} glow="#a06cd5" />
              <div className="loot-name" style={{ fontSize: 9 }}>
                {item.label}
              </div>
              {item.quantity > 1 ? (
                <div
                  className="faint"
                  style={{ fontSize: 8 }}
                >{`×${item.quantity}`}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
