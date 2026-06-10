export interface FeishuMessageMeta {
  messageId: string;
  chatId: string;
  senderId: string;
  chatType: "p2p" | "group";
}

export interface FakeFeishuConnectorOptions {
  now?: () => number;
}

export interface FakeFeishuScanConfirmation {
  chatId: string;
  senderId: string;
  chatType: FeishuMessageMeta["chatType"];
  displayName?: string;
}

export interface FakeFeishuInboundMessage extends FeishuMessageMeta {
  text: string;
  displayName?: string;
}

export interface FeishuOutboundCorrelationMeta {
  displayName?: string;
  textLength: number;
  replyToMessageId?: string;
  replyToChatId?: string;
  replyToSenderId?: string;
  chatType?: FeishuMessageMeta["chatType"];
}
