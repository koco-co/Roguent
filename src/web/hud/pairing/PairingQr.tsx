import type {
  IntegrationChannel,
  PairingQr as PairingQrData,
} from "../../../shared/events";
import { useT } from "../../i18n";

const CHANNEL_COPY = {
  wechat: {
    label: "微信",
    qrLabel: "WeChat QR code",
    hint: "用微信扫码绑定本指挥台",
  },
  feishu: {
    label: "飞书",
    qrLabel: "Feishu QR code",
    hint: "用飞书扫码或打开机器人配对",
  },
} as const;

export type PairableChannel = keyof typeof CHANNEL_COPY;

export function isPairableChannel(
  channel: IntegrationChannel,
): channel is PairableChannel {
  return channel === "wechat" || channel === "feishu";
}

export function channelLabel(channel: PairableChannel): string {
  return CHANNEL_COPY[channel].label;
}

export function PairingQr({
  channel,
  qr,
  onCreate,
}: {
  channel: PairableChannel;
  qr?: PairingQrData;
  onCreate: () => void;
}) {
  const t = useT();
  const copy = CHANNEL_COPY[channel];
  return (
    <div className="pair-qr-card">
      <div className="pair-qr-head">
        <div>
          <div className="px pair-card-title">{t(copy.label)} QR</div>
          <div className="faint">{t(copy.hint)}</div>
        </div>
        <span className={`pair-status ${qr?.status ?? "idle"}`}>
          {qr ? qr.status : "idle"}
        </span>
      </div>

      <div className="pair-qr-box">
        {qr?.imageDataUrl ? (
          <img src={qr.imageDataUrl} alt="" aria-label={copy.qrLabel} />
        ) : qr?.url ? (
          <div className="pair-qr-url" aria-label={copy.qrLabel}>
            {qr.url}
          </div>
        ) : (
          <div className="pair-qr-empty">
            <div className="px">NO QR</div>
            <div className="faint">{t("等待引擎生成配对码")}</div>
          </div>
        )}
      </div>

      <div className="pair-qr-foot">
        {qr?.expiresAt ? (
          <span className="faint">
            expires {new Date(qr.expiresAt).toLocaleTimeString()}
          </span>
        ) : (
          <span className="faint">{t("单个会话绑定,新绑定覆盖旧绑定")}</span>
        )}
        <button type="button" className="pxbtn cjk" onClick={onCreate}>
          {t("生成 QR")}
        </button>
      </div>
      {qr?.error ? <div className="pair-error">{qr.error}</div> : null}
    </div>
  );
}
