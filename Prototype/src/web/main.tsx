import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "@fontsource/press-start-2p";
// Fusion Pixel 12px CJK is self-hosted via @font-face in styles.css (T0.5) —
// not @fontsource, whose package mislabels the full-CJK file as "latin" and
// ships a 1.4MB .woff fallback. See public/fonts/.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
