import { useState } from "react";
import type { PairingBinding } from "../../../shared/events";
import { useT } from "../../i18n";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { sendCommand } from "../../ws-client";
import { Modal } from "../Modal";
import { BindingList } from "./BindingList";
import {
  type PairableChannel,
  PairingQr,
  channelLabel,
  isPairableChannel,
} from "./PairingQr";

const PAIRABLE_CHANNELS: PairableChannel[] = ["wechat", "feishu"];

export function PairingPanelHost() {
  const active = useUiStore((s) => s.activePanel === "pairing");
  const closePanel = useUiStore((s) => s.closePanel);
  const sessionId = useRoomStore((s) => s.currentSessionId);

  if (!active || !sessionId) return null;
  return <PairingPanel sessionId={sessionId} onClose={closePanel} />;
}

export function PairingPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [channel, setChannel] = useState<PairableChannel>("wechat");
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const pairings = useRoomStore((s) => s.pairings);
  const qr = pairings?.qrByChannel[channel];
  const bindings = Object.values(pairings?.byId ?? {})
    .filter(isVisibleBinding(sessionId, channel))
    .sort((a, b) => (b.updatedAt ?? b.boundAt) - (a.updatedAt ?? a.boundAt));

  const createPairing = () => {
    sendCommand({
      cmd: "createPairing",
      sessionId,
      channel,
      forwardingEnabled: true,
    });
  };

  return (
    <Modal
      title="PAIRING"
      sub="扫码 · 微信 / 飞书消息互转"
      icon="mcp"
      accent="#5fd35f"
      width={980}
      onClose={onClose}
    >
      <dialog open aria-label="Pairing" className="pair-panel">
        <div className="tabs pair-tabs">
          {PAIRABLE_CHANNELS.map((item) => (
            <button
              key={item}
              type="button"
              className={`tab${channel === item ? " on" : ""}`}
              aria-pressed={channel === item}
              onClick={() => setChannel(item)}
            >
              {channelLabel(item)}
            </button>
          ))}
        </div>

        <div className="pair-grid">
          <PairingQr channel={channel} qr={qr} onCreate={createPairing} />
          <div className="pair-side">
            <div className="pair-session-card">
              <div className="px pair-card-title">{t("当前会话")}</div>
              <div className="pair-session-title">
                {session?.title ?? sessionId}
              </div>
              <div className="faint">{session?.cwd ?? t("未设置工作目录")}</div>
            </div>
            <BindingList channel={channel} bindings={bindings} />
          </div>
        </div>
      </dialog>
    </Modal>
  );
}

function isVisibleBinding(sessionId: string, channel: PairableChannel) {
  return (binding: PairingBinding) =>
    binding.sessionId === sessionId &&
    binding.channel === channel &&
    isPairableChannel(binding.channel);
}
