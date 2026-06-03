import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ color: "#cffcf7", fontFamily: "monospace", padding: 16 }}>
      Roguent — booting…
    </div>
  </StrictMode>,
);
