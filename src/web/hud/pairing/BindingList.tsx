import type { PairingBinding } from "../../../shared/events";
import { useT } from "../../i18n";
import { sendCommand } from "../../ws-client";
import { type PairableChannel, channelLabel } from "./PairingQr";

export function BindingList({
  channel,
  bindings,
}: {
  channel: PairableChannel;
  bindings: PairingBinding[];
}) {
  const t = useT();
  return (
    <div className="pair-bindings">
      <div className="pair-section-title">
        <span className="px">{t("已绑定")}</span>
        <span className="faint">
          {t(channelLabel(channel))} · {bindings.length}
        </span>
      </div>

      {bindings.length === 0 ? (
        <div className="pair-empty">
          <div className="px">EMPTY</div>
          <div className="faint">{t("扫码完成后会出现在这里")}</div>
        </div>
      ) : (
        <div className="pair-binding-list">
          {bindings.map((binding) => (
            <BindingRow key={binding.id} binding={binding} />
          ))}
        </div>
      )}
    </div>
  );
}

function BindingRow({ binding }: { binding: PairingBinding }) {
  const t = useT();
  const title =
    binding.displayName || binding.externalUserId || t("未命名会话");
  const toggleForwarding = () => {
    sendCommand({
      cmd: "updatePairing",
      bindingId: binding.id,
      forwardingEnabled: !binding.forwardingEnabled,
    });
  };
  const revoke = () => {
    sendCommand({
      cmd: "updatePairing",
      bindingId: binding.id,
      status: "revoked",
      forwardingEnabled: false,
    });
  };

  return (
    <div className={`pair-binding ${binding.status}`}>
      <div className="pair-binding-main">
        <div className="pair-binding-icon" />
        <div className="pair-binding-text">
          <div className="pair-binding-title">
            <span className="cjk">{title}</span>
            <span className={`pair-status ${binding.status}`}>
              {binding.status}
            </span>
          </div>
          <div className="faint">
            {binding.externalChatId}
            {binding.updatedAt
              ? ` · ${new Date(binding.updatedAt).toLocaleString()}`
              : ""}
          </div>
        </div>
      </div>

      <div className="pair-binding-actions">
        <button
          type="button"
          role="switch"
          aria-label={t("转发")}
          aria-checked={binding.forwardingEnabled}
          className={`pxtoggle${binding.forwardingEnabled ? " on" : ""}`}
          onClick={toggleForwarding}
        >
          <span className="knob" />
        </button>
        <button type="button" className="pxbtn danger cjk" onClick={revoke}>
          {t("解绑")}
        </button>
      </div>
    </div>
  );
}
