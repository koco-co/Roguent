import type { IntegrationChannel, PairingQr } from "../../shared/integrations";
import type { IntegrationConnectorStatus } from "../../shared/integrations";
import type { IntegrationEvent, MaybePromise } from "./types";

export interface PairingQrState extends PairingQr {
  channel: "wechat" | "feishu";
  sessionId: string;
}

export interface OutboundImTarget {
  externalChatId: string;
  externalUserId?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundDeliveryResult {
  id: string;
  channel: IntegrationChannel;
  externalChatId: string;
  status: "delivered" | "failed";
  sentAt: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type ImConnectorEvent =
  | {
      type: "pairing.qr";
      qr: PairingQrState;
    }
  | {
      type: "pairing.scanned";
      channel: PairingQrState["channel"];
      sessionId: string;
      externalChatId: string;
      externalUserId?: string;
      displayName?: string;
      scannedAt: number;
    }
  | {
      type: "pairing.expired";
      qr: PairingQrState;
    }
  | {
      type: "message";
      event: IntegrationEvent;
    }
  | {
      type: "outbound.ack";
      result: OutboundDeliveryResult;
    }
  | {
      type: "status";
      status: IntegrationConnectorStatus;
    };

export interface ImConnector {
  start?(): Promise<void>;
  stop?(): Promise<void>;
  close?(): Promise<void>;
  startPairing(sessionId: string): Promise<PairingQrState>;
  stopPairing(sessionId: string): Promise<void>;
  sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult>;
  onEvent(handler: (event: ImConnectorEvent) => MaybePromise<void>): () => void;
}
