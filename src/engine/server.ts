import { WebSocketServer } from "ws";
import { loadFixture, replayTimed } from "./record";
import { SessionManager } from "./session";
import { WsGateway } from "./ws-gateway";

const PORT = Number(process.env.ROGUENT_PORT ?? 8787);
const replayArg = process.argv.indexOf("--replay");

if (replayArg !== -1) {
  // Cost-free demo: replay a fixture to every client, ignore commands.
  const fixture = process.argv[replayArg + 1];
  if (!fixture) throw new Error("--replay needs a fixture path");
  const wss = new WebSocketServer({ port: PORT });
  console.log(`[server] REPLAY ${fixture} on ws://localhost:${PORT}`);
  wss.on("connection", async (ws) => {
    const events = await loadFixture(fixture);
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
  new WsGateway(PORT, mgr);
  console.log(`[server] LIVE on ws://localhost:${PORT}`);
}
