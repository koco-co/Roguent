import { afterEach } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";

const window = new Window({
  url: "http://localhost/",
}) as unknown as Window & typeof globalThis;

type TestImageLoadHandler = ((event: Event) => void) | null;

class TestImage {
  onload: TestImageLoadHandler = null;
  onerror: TestImageLoadHandler = null;
  #src = "";

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.(new Event("load")));
  }
}

const browserFetch = window.fetch.bind(window);

function publicAssetPath(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(raw, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (!url.pathname.startsWith("/assets/")) return null;
  return join(process.cwd(), "public", url.pathname.slice(1));
}

async function fetchWithPublicAssets(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const path = publicAssetPath(input);
  if (!path) return browserFetch(input, init);

  const file = Bun.file(path);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file);
}

const globals = {
  window,
  self: window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent,
  CustomEvent: window.CustomEvent,
  Image: TestImage,
  MutationObserver: window.MutationObserver,
  fetch: fetchWithPublicAssets,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
};

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
});
