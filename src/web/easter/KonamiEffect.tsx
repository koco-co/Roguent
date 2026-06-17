import { useEffect } from "react";
import { useT } from "../i18n";
import { useEasterStore } from "./easter-store";

/** How long the rainbow flash stays on screen before auto-dismissing (ms). */
const HOLD_MS = 1600;

/** The cosmetic id fired by the Konami code (see KonamiListener). */
const KONAMI_COSMETIC = "konami-rainbow";

/**
 * KonamiEffect — mount once at App root.
 *
 * Consumes easter-store `lastEffect`: when the Konami cosmetic fires it paints
 * a brief full-screen rainbow flash, then calls clearLastEffect() so the egg is
 * one-shot. Any other (non-cosmetic) effect is consumed immediately without a
 * visual, so the slot never stays stuck.
 *
 * Purely cosmetic + local easter-store state — never touches real agent data
 * or sends engine commands. Reduced-motion aware: the `.konami-rainbow`
 * animation is neutralized by the root `.no-motion` guard (Reduce-motion
 * setting) and the global `@media (prefers-reduced-motion: reduce)` rule.
 */
export function KonamiEffect() {
  const t = useT();
  const lastEffect = useEasterStore((s) => s.lastEffect);
  const clearLastEffect = useEasterStore((s) => s.clearLastEffect);

  const showRainbow =
    lastEffect?.kind === "cosmetic" &&
    lastEffect.cosmeticId === KONAMI_COSMETIC;

  useEffect(() => {
    if (!lastEffect) return;
    // Non-cosmetic (or non-konami) effects have no overlay here — consume the
    // slot right away so a later cosmetic can render.
    if (!showRainbow) {
      clearLastEffect();
      return;
    }
    // One-shot: dismiss after the hold so re-entering won't re-stack
    // (firedEggs already guards repeat fires, but the timer keeps it tidy).
    const id = setTimeout(clearLastEffect, HOLD_MS);
    return () => clearTimeout(id);
  }, [lastEffect, showRainbow, clearLastEffect]);

  if (!showRainbow) return null;
  return (
    <div
      className="konami-rainbow"
      aria-hidden="true"
      title={t("彩蛋")}
      data-testid="konami-rainbow"
    />
  );
}
