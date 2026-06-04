import { useEffect } from "react";
import { Hud } from "./hud/Hud";
import { Room } from "./room/Room";
import { connectRoom } from "./ws-client";

export function App() {
  useEffect(() => {
    const conn = connectRoom();
    return () => conn.close();
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Room />
      <Hud />
    </div>
  );
}
