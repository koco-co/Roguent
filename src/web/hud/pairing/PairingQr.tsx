import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
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

function needsVerifyCode(qr?: PairingQrData): boolean {
  return qr?.metadata?.needVerifyCode === true;
}

export function PairingQr({
  channel,
  qr,
  onCreate,
  onSubmitVerifyCode,
  onCancel,
}: {
  channel: PairableChannel;
  qr?: PairingQrData;
  onCreate: () => void;
  onSubmitVerifyCode?: (code: string) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const copy = CHANNEL_COPY[channel];
  const showVerifyCode = needsVerifyCode(qr);
  const isPending = qr?.status === "pending";
  const canCancel = isPending && onCancel != null;

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
          <QRCodeSVG
            value={qr.url}
            title={copy.qrLabel}
            level="M"
            marginSize={2}
            bgColor="#f4ead7"
            fgColor="#1a130c"
            className="pair-qr-svg"
          />
        ) : (
          <div className="pair-qr-empty">
            <div className="px">NO QR</div>
            <div className="faint">{t("等待引擎生成配对码")}</div>
          </div>
        )}
      </div>

      {qr?.url && !qr.imageDataUrl ? (
        <a
          className="pair-qr-link faint"
          href={qr.url}
          target="_blank"
          rel="noreferrer"
        >
          {qr.url}
        </a>
      ) : null}

      {showVerifyCode && onSubmitVerifyCode ? (
        <VerifyCodeForm onSubmit={onSubmitVerifyCode} />
      ) : null}

      <div className="pair-qr-foot">
        {qr?.expiresAt ? (
          <span className="faint">
            expires {new Date(qr.expiresAt).toLocaleTimeString()}
          </span>
        ) : (
          <span className="faint">{t("单个会话绑定,新绑定覆盖旧绑定")}</span>
        )}
        <div className="pair-qr-actions">
          {canCancel ? (
            <button
              type="button"
              className="pxbtn cjk danger"
              onClick={onCancel}
            >
              {t("取消")}
            </button>
          ) : null}
          <button type="button" className="pxbtn cjk" onClick={onCreate}>
            {t("生成 QR")}
          </button>
        </div>
      </div>
      {qr?.error ? <div className="pair-error">{qr.error}</div> : null}
    </div>
  );
}

function VerifyCodeForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const t = useT();
  const [code, setCode] = useState("");

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form
      className="pair-verify"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="faint pair-verify-hint">
        {t("输入手机微信显示的数字")}
      </div>
      <div className="pair-verify-row">
        <input
          className="pair-verify-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          aria-label={t("验证码")}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
          }
        />
        <button type="submit" className="pxbtn cjk" disabled={!code.trim()}>
          {t("提交验证码")}
        </button>
      </div>
    </form>
  );
}
