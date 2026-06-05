import type React from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";
import { Icon } from "./icons";

/**
 * 模型切换面板 Model(对标设计原型 panels2.jsx 的 ModelPanel):
 * 一卡一模型的竖排列表,点击切换当前会话的运行模型。
 *
 * **这是真数据面板,不是 mock**:每张卡映射一个可选模型 id,点击即向引擎发
 * `setModel` 命令切换「当前会话的真实模型」(session.model);名称 / 描述 /
 * accent 色仅为忠实原型的展示元信息,不造假、不加 mock banner。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。
 * selector 守 zustand 铁律:只取基元(currentSessionId)/ 单值(当前会话 model)/
 * 稳定函数引用(closePanel),绝不在 selector 里构造新值。
 */

// 可选模型 + 展示元信息(去 emoji,用 accent 色区分):id 是真实模型标识,
// 名称 / 描述 / accent 仅为忠实原型外观的展示装饰,不影响切换逻辑。
const MODELS: Array<{
  id: string;
  name: string;
  desc: string;
  accent: string;
}> = [
  {
    id: "claude-opus-4-8",
    name: "Opus 4.8",
    desc: "最强推理 · 1M 上下文",
    accent: "#f2c84b",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Sonnet 4.6",
    desc: "均衡 · 默认队友",
    accent: "#36c5e0",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    desc: "快速 · 低成本",
    accent: "#5fd35f",
  },
];

/** The model picker: switch the current session's running model (real command). */
export function ModelPicker() {
  const active = useUiStore((s) => s.activePanel === "model");
  const closePanel = useUiStore((s) => s.closePanel);
  // 真数据:当前会话 id + 其运行模型。selector 只取基元 / 单值,不构造新值。
  const currentId = useRoomStore((s) => s.currentSessionId);
  const currentModel = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId]?.model : undefined,
  );

  if (!active) return null;

  return (
    <Modal
      title="MODEL"
      sub="切换会话模型"
      icon="crystal"
      accent="#36c5e0"
      width={720}
      onClose={closePanel}
    >
      <div className="model-list">
        {/* 真模型卡:每张 = 一个可选模型,点击发 setModel 切换当前会话模型。 */}
        {MODELS.map((m) => {
          const selected = m.id === currentModel;
          return (
            <button
              key={m.id}
              type="button"
              className={`model-card${selected ? " sel" : ""}`}
              style={{ "--ac": m.accent } as React.CSSProperties}
              onClick={() => {
                if (currentId)
                  sendCommand({
                    cmd: "setModel",
                    sessionId: currentId,
                    model: m.id,
                  });
                closePanel();
              }}
            >
              <div className="model-ic">
                <Icon name="crystal" size={32} glow={m.accent} />
              </div>
              <div className="model-meta">
                <div className="px" style={{ color: m.accent }}>
                  {m.name}
                </div>
                <div className="dim">{m.desc}</div>
              </div>
              {selected && <div className="chip greenc">当前</div>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
