import { createInterface } from "node:readline";
import { WeChatBot } from "@wechatbot/wechatbot";

const storageDir =
  process.env.ROGUENT_WECHAT_STORAGE_DIR ?? defaultStorageDir(process.env);
const bot = new WeChatBot({ storage: "file", storageDir });
const messagesByChat = new Map();
let counter = 0;
let pollingTask = null;
let messageHandlerRegistered = false;

function write(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function respond(id, fn) {
  Promise.resolve()
    .then(fn)
    .then((result) => write({ id, ok: true, result }))
    .catch((error) =>
      write({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: "host_error",
      }),
    );
}

function emit(event) {
  write({ type: "event", event });
}

function emitStatus(state, error, metadata) {
  emit({
    type: "status",
    status: {
      id: "wechat-node-host",
      channel: "wechat",
      state,
      label: "WeChat Node Host",
      error,
      lastEventAt: Date.now(),
      metadata,
    },
  });
}

function registerMessageHandler() {
  if (messageHandlerRegistered) return;
  messageHandlerRegistered = true;
  bot.onMessage((message) => {
    messagesByChat.set(message.userId, message);
    const displayName = extractDisplayName(message);
    const id = `wechat-node-inbound-${++counter}`;
    emit({
      type: "message",
      event: {
        id,
        channel: "wechat",
        direction: "inbound",
        externalChatId: message.userId,
        deliveryId: id,
        summary: message.text,
        bodyText: message.text,
        from: message.userId,
        displayName,
        metadata: {
          contextAvailable: Boolean(message._contextToken),
          ...(displayName ? { displayName } : {}),
        },
        receivedAt: message.timestamp.getTime(),
      },
    });
  });
}

async function startPollingAfterLogin() {
  registerMessageHandler();
  if (pollingTask) return;
  pollingTask = bot.start().catch((error) => {
    pollingTask = null;
    emitStatus("error", error instanceof Error ? error.message : String(error));
  });
}

async function startPairing(sessionId) {
  const qr = await new Promise((resolve, reject) => {
    let settled = false;
    bot
      .login({
        force: true,
        callbacks: {
          onQrUrl(url) {
            const state = {
              id: `wechat-node-qr-${slug(sessionId)}-${++counter}`,
              channel: "wechat",
              sessionId,
              status: "pending",
              url,
              expiresAt: Date.now() + 180_000,
            };
            emit({ type: "pairing.qr", qr: state });
            settled = true;
            resolve(state);
          },
          onScanned() {
            emit({
              type: "pairing.scanned",
              channel: "wechat",
              sessionId,
              externalChatId: sessionId,
              scannedAt: Date.now(),
            });
          },
          onExpired() {
            emit({
              type: "pairing.expired",
              qr: {
                id: `wechat-node-qr-${slug(sessionId)}-${counter}`,
                channel: "wechat",
                sessionId,
                status: "expired",
                expiresAt: Date.now(),
              },
            });
          },
        },
      })
      .then(() => startPollingAfterLogin())
      .catch((error) => {
        if (!settled) reject(error);
        else
          emitStatus(
            "error",
            error instanceof Error ? error.message : String(error),
          );
      });
  });
  return qr;
}

async function sendMessage(externalChatId, text) {
  const message = messagesByChat.get(externalChatId);
  if (message) await bot.reply(message, text);
  else await bot.send(externalChatId, text);
  const result = {
    id: `wechat-node-outbound-${++counter}`,
    channel: "wechat",
    externalChatId,
    status: "delivered",
    sentAt: Date.now(),
  };
  emit({ type: "outbound.ack", result });
  return result;
}

function extractDisplayName(message) {
  return firstString(
    message.displayName,
    message.senderName,
    message.nickname,
    message.nickName,
    message.raw?.from_user_display_name,
    message.raw?.from_user_name,
    message.raw?.sender_name,
    message.raw?.nickname,
    message.raw?.nick_name,
  );
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function defaultStorageDir(env) {
  const home = env.HOME;
  if (!home) return ".roguent/wechat";
  if (process.platform === "darwin") {
    return `${home}/Library/Application Support/Roguent/wechat`;
  }
  return `${env.XDG_DATA_HOME ?? `${home}/.local/share`}/Roguent/wechat`;
}

function slug(value) {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.type === "startPairing") {
    respond(request.id, () => startPairing(request.sessionId));
  } else if (request.type === "stopPairing") {
    respond(request.id, () => undefined);
  } else if (request.type === "sendMessage") {
    respond(request.id, () =>
      sendMessage(request.externalChatId, request.text),
    );
  } else {
    write({
      id: request.id,
      ok: false,
      error: `Unknown request type: ${String(request.type)}`,
      code: "host_error",
    });
  }
});

process.on("SIGTERM", () => {
  bot.stop();
  process.exit(0);
});
