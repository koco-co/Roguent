import { useEffect, useRef } from "react";
import { type EasterEffect, useEasterStore } from "./easter-store";

/** The classic Konami Code sequence. */
export const KONAMI_SEQUENCE: string[] = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const KONAMI_EFFECT: EasterEffect = {
  kind: "cosmetic",
  cosmeticId: "konami-rainbow",
};

/**
 * KonamiListener — mount once at App root, renders null.
 *
 * Listens to keydown events globally and fires the "konami" easter egg when
 * the full Konami Code sequence is entered. The easter egg is one-time only
 * (subsequent attempts are no-ops via the idempotent store).
 *
 * Does NOT affect real agent execution — purely local / cosmetic flavor.
 */
export function KonamiListener() {
  const fireEgg = useEasterStore((s) => s.fireEgg);
  const bufferRef = useRef<string[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes when the user is typing in a text field.
      // Use nodeName / isContentEditable rather than instanceof checks so that
      // the guard works both in browsers and in happy-dom test environments
      // (where HTMLInputElement / HTMLTextAreaElement globals are unavailable).
      const target = e.target as
        | (EventTarget & { nodeName?: string; isContentEditable?: boolean })
        | null;
      if (target) {
        const nodeName = target.nodeName?.toUpperCase();
        if (
          nodeName === "INPUT" ||
          nodeName === "TEXTAREA" ||
          target.isContentEditable === true
        )
          return;
      }

      const buf = bufferRef.current;
      buf.push(e.key);
      // Keep only the most recent N keys where N = sequence length
      if (buf.length > KONAMI_SEQUENCE.length) {
        buf.splice(0, buf.length - KONAMI_SEQUENCE.length);
      }
      if (
        buf.length === KONAMI_SEQUENCE.length &&
        buf.every((k, i) => k === KONAMI_SEQUENCE[i])
      ) {
        fireEgg("konami", KONAMI_EFFECT);
        bufferRef.current = []; // reset buffer after match
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fireEgg]);

  return null;
}
