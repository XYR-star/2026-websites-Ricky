import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script, createContext } from "node:vm";

const baseHead = readFileSync(new URL("../src/components/BaseHead.astro", import.meta.url), "utf8");
const floatingControls = readFileSync(new URL("../src/components/PublicFloatingControls.astro", import.meta.url), "utf8");
const initialize = new Script(baseHead.match(/const themeInitScript = String\.raw`([\s\S]*?)`;/)[1]);
const bindControls = new Script(floatingControls.match(/<script is:inline>([\s\S]*?)<\/script>/)[1]);

function createPage({ storedTheme, systemDark = false, blockStorage = false, reducedMotion = false } = {}) {
  const root = { dataset: {}, style: {} };
  const theme = new EventTarget();
  const scroll = new EventTarget();
  const icon = { textContent: "" };
  const attributes = new Map();
  theme.setAttribute = (name, value) => attributes.set(name, value);
  const elements = { "[data-theme-toggle]": theme, "[data-theme-icon]": icon, "[data-scroll-top]": scroll };
  const document = {
    documentElement: root,
    querySelector: (selector) => elements[selector] ?? null,
    querySelectorAll: () => [],
  };
  let scrollOptions;
  const window = {
    matchMedia: (query) => ({ matches: query.includes("color-scheme") ? systemDark : reducedMotion }),
    scrollTo: (options) => { scrollOptions = options; },
  };
  const storage = {
    getItem: () => storedTheme,
    setItem: (_key, value) => { storedTheme = value; },
  };
  const context = createContext({ document, window });
  Object.defineProperty(context, "localStorage", {
    get() {
      if (blockStorage) throw new Error("Storage unavailable");
      return storage;
    },
  });
  initialize.runInContext(context);
  bindControls.runInContext(context);
  return {
    root,
    icon,
    label: () => attributes.get("aria-label"),
    saved: () => storedTheme,
    toggle: () => theme.dispatchEvent(new Event("click")),
    scrollTop: () => { scroll.dispatchEvent(new Event("click")); return scrollOptions; },
  };
}

test("a saved public theme wins over the system, and changing it updates the control and storage", () => {
  const page = createPage({ storedTheme: "light", systemDark: true });
  assert.equal(page.root.dataset.theme, "light");
  page.toggle();
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.root.style.colorScheme, "dark");
  assert.equal(page.label(), "切换到浅色模式");
  assert.equal(page.icon.textContent, "☀");
  assert.equal(page.saved(), "dark");
});

test("the public theme still follows the system and switches when storage is blocked", () => {
  const page = createPage({ systemDark: true, blockStorage: true });
  assert.equal(page.root.dataset.theme, "dark");
  page.toggle();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.root.style.colorScheme, "light");
  assert.equal(page.label(), "切换到黑暗模式");
  assert.equal(page.icon.textContent, "☾");
});

test("the public back-to-top action respects reduced motion", () => {
  assert.equal(createPage({ reducedMotion: true }).scrollTop().behavior, "auto");
  assert.equal(createPage().scrollTop().behavior, "smooth");
});
