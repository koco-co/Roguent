import { WebSocketServer } from "ws";
import { resolvePort } from "./port";
import { loadFixture, replayTimed } from "./record";
import { SessionManager } from "./session";
import { WsGateway } from "./ws-gateway";

const port = resolvePort(process.env);
const replayArg = process.argv.indexOf("--replay");
// 回放 fixture 既可走 `--replay <path>`,也可走 env ROGUENT_REPLAY(便于 Tauri host 透传)。
const replayFixture =
  replayArg !== -1 ? process.argv[replayArg + 1] : process.env.ROGUENT_REPLAY;

if (replayArg !== -1 && !process.argv[replayArg + 1]) {
  throw new Error("--replay requires a fixture path argument");
}

if (replayFixture) {
  // Cost-free demo: replay a fixture to every client, ignore commands.
  const wss = new WebSocketServer({ port });
  wss.on("listening", () => {
    const addr = wss.address();
    if (addr && typeof addr === "object") console.log(`PORT=${addr.port}`);
  });
  console.log(`[server] REPLAY ${replayFixture}`);
  wss.on("connection", async (ws) => {
    const events = await loadFixture(replayFixture);
    await replayTimed(
      events,
      (e) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
      },
      1,
    );
  });
} else {
  const mgr = new SessionManager();
  new WsGateway(port, mgr, (p) => console.log(`PORT=${p}`));
  console.log("[server] LIVE");
}
