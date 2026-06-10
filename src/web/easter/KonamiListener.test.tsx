import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { KonamiListener } from "./KonamiListener";
import { KONAMI_SEQUENCE } from "./KonamiListener";
import { useEasterStore } from "./easter-store";

afterEach(() => {
  cleanup();
  useEasterStore.setState({ firedEggs: {}, lastEffect: null });
});

// Helper: fire a sequence of keys on window
function pressKeys(keys: string[]) {
  for (const key of keys) {
    fireEvent.keyDown(window, { key });
  }
}

// ── full Konami sequence triggers easter egg exactly once ─────────────────────

test("full Konami sequence fires konami easter egg once", () => {
  render(<KonamiListener />);

  pressKeys(KONAMI_SEQUENCE);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBe(true);
  expect(state.lastEffect).not.toBeNull();
});

test("full Konami sequence fires egg exactly once (re-entering sequence is no-op)", () => {
  render(<KonamiListener />);

  pressKeys(KONAMI_SEQUENCE);
  const effectAfterFirst = useEasterStore.getState().lastEffect;

  // Clear lastEffect to simulate dismissal, then re-enter
  useEasterStore.getState().clearLastEffect();
  pressKeys(KONAMI_SEQUENCE);

  // firedEggs["konami"] still true; lastEffect remains null (idempotent)
  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBe(true);
  expect(state.lastEffect).toBeNull();
  expect(effectAfterFirst).not.toBeNull();
});

// ── partial / wrong sequence does nothing ─────────────────────────────────────

test("partial sequence (incomplete Konami) does not fire", () => {
  render(<KonamiListener />);

  // Only send the first 5 keys of the 10-key Konami sequence
  pressKeys(KONAMI_SEQUENCE.slice(0, 5));

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();
});

test("wrong sequence does not fire", () => {
  render(<KonamiListener />);

  pressKeys(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();
});

test("almost-correct sequence with one wrong key does not fire", () => {
  render(<KonamiListener />);

  // Replace last key with wrong key
  const wrong = [...KONAMI_SEQUENCE.slice(0, -1), "x"];
  pressKeys(wrong);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();
});

// ── text-input guard: keystrokes in inputs must not advance the buffer ────────

/** Dispatch the full Konami sequence as bubbling KeyboardEvents from a given
 * element, so that `e.target` is that element when the window listener fires. */
function pressKeysFromElement(el: Element, keys: string[]) {
  for (const key of keys) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }
}

test("keydown events from an <input> target do not fire konami", () => {
  render(<KonamiListener />);

  const input = document.createElement("input");
  document.body.appendChild(input);

  pressKeysFromElement(input, KONAMI_SEQUENCE);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();

  input.remove();
});

test("keydown events from a <textarea> target do not fire konami", () => {
  render(<KonamiListener />);

  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);

  pressKeysFromElement(textarea, KONAMI_SEQUENCE);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();

  textarea.remove();
});

// ── cleanup: listener is removed on unmount ───────────────────────────────────

test("listener removed on unmount: sequence after unmount does not fire", () => {
  const { unmount } = render(<KonamiListener />);
  unmount();

  // Reset store to ensure we're testing fresh state
  useEasterStore.setState({ firedEggs: {}, lastEffect: null });

  pressKeys(KONAMI_SEQUENCE);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBeUndefined();
  expect(state.lastEffect).toBeNull();
});
