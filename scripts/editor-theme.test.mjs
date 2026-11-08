import assert from "node:assert/strict";
import test from "node:test";
import { initEditorTheme, paletteToken, readThemeMode, resolveEditorTheme, THEME_STORAGE_KEY } from "../public/admin/editor-theme.js";

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
}

class Element extends Events {
  constructor(tag) { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; }
  setAttribute(name, value) { this[name] = value; }
  append(...elements) { for (const element of elements) { element.parent = this; this.children.push(element); } }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
}

function browser({ dark = false, stored = null, unavailableStorage = false } = {}) {
  const values = new Map(stored ? [[THEME_STORAGE_KEY, stored]] : []);
  const storageCalls = [];
  const storage = {
    getItem(key) { storageCalls.push(["get", key]); return values.get(key) ?? null; },
    setItem(key, value) { storageCalls.push(["set", key, value]); values.set(key, value); },
  };
  const doc = new Events();
  doc.documentElement = new Element("html");
  doc.body = new Element("body");
  doc.createElement = (tag) => new Element(tag);
  doc.querySelectorAll = () => [];
  const media = new Events();
  media.matches = dark;
  const win = new Events();
  Object.assign(win, {
    document: doc,
    matchMedia: () => media,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout, clearTimeout,
  });
  Object.defineProperty(win, "localStorage", {
    get() { if (unavailableStorage) throw new Error("Storage denied"); return storage; },
  });
  const events = [];
  win.addEventListener("ricky:editor-theme", (event) => events.push(event.detail));
  return { win, doc, media, values, events, storageCalls };
}

test("fresh users follow the OS; manual light and dark override it", () => {
  assert.equal(resolveEditorTheme("system", true), "dark");
  assert.equal(resolveEditorTheme("system", false), "light");
  assert.equal(resolveEditorTheme("light", true), "light");
  assert.equal(resolveEditorTheme("dark", false), "dark");
  const fixture = browser({ dark: true });
  const controller = initEditorTheme(fixture);
  assert.equal(controller.mode, "system");
  assert.equal(fixture.doc.documentElement.dataset.editorTheme, "dark");
  assert.deepEqual(fixture.events, [{ mode: "system", theme: "dark" }]);
  controller.destroy();
});

test("the external accessible selector persists only its own appearance preference", () => {
  const fixture = browser();
  const controller = initEditorTheme(fixture);
  const control = fixture.doc.body.children[0];
  const [label, select] = control.children;
  assert.equal(label.htmlFor, select.id);
  assert.deepEqual(select.children.map((option) => option.value), ["system", "light", "dark"]);
  select.value = "dark";
  select.dispatchEvent({ type: "change" });
  assert.equal(controller.theme, "dark");
  assert.equal(fixture.values.get(THEME_STORAGE_KEY), "dark");
  assert.ok(fixture.storageCalls.every(([, key]) => key === THEME_STORAGE_KEY));
  controller.destroy();
});

test("saved preference restores, while invalid preferences safely follow the OS", () => {
  for (const stored of ["light", "dark", "system", "corrupt-value"]) {
    const fixture = browser({ dark: true, stored });
    const controller = initEditorTheme(fixture);
    assert.equal(controller.mode, stored === "corrupt-value" ? "system" : stored);
    assert.equal(controller.theme, stored === "light" ? "light" : "dark");
    controller.destroy();
  }
});

test("blocked storage never prevents switching themes or following system changes", () => {
  const fixture = browser({ unavailableStorage: true });
  assert.equal(readThemeMode(fixture.win), "system");
  const controller = initEditorTheme(fixture);
  controller.setMode("dark");
  assert.equal(controller.theme, "dark");
  controller.setMode("system");
  fixture.media.matches = true;
  fixture.media.dispatchEvent({ type: "change" });
  assert.equal(controller.theme, "dark");
  controller.destroy();
});

test("system changes apply in system mode and do not overwrite manual preferences", () => {
  const fixture = browser();
  const controller = initEditorTheme(fixture);
  fixture.media.matches = true;
  fixture.media.dispatchEvent({ type: "change" });
  assert.equal(controller.theme, "dark");
  controller.setMode("light");
  fixture.media.dispatchEvent({ type: "change" });
  assert.equal(controller.theme, "light");
  controller.setMode("not-a-mode");
  assert.equal(controller.mode, "light");
  controller.destroy();
});

test("other tabs update appearance, while unrelated storage and drafts are ignored", () => {
  const fixture = browser();
  const controller = initEditorTheme(fixture);
  fixture.win.dispatchEvent({ type: "storage", key: "draft", newValue: "dark" });
  assert.equal(controller.mode, "system");
  fixture.win.dispatchEvent({ type: "storage", key: THEME_STORAGE_KEY, newValue: "dark" });
  assert.equal(controller.mode, "dark");
  fixture.win.dispatchEvent({ type: "storage", key: THEME_STORAGE_KEY, newValue: null });
  assert.equal(controller.mode, "system");
  assert.equal(fixture.storageCalls.filter(([operation]) => operation === "set").length, 0);
  controller.destroy();
});

test("initialization is idempotent and cleanup does not leave duplicate controls/listeners", () => {
  const fixture = browser();
  const first = initEditorTheme(fixture);
  assert.equal(initEditorTheme(fixture), first);
  assert.equal(fixture.doc.body.children.length, 1);
  first.destroy();
  assert.equal(fixture.doc.body.children.length, 0);
  assert.equal(fixture.media.listeners.get("change").size, 0);
  assert.equal(fixture.win.listeners.get("storage").size, 0);
  const second = initEditorTheme(fixture);
  assert.notEqual(first, second);
  second.destroy();
});

test("only the pinned CMS palette is mapped, retaining status meanings", () => {
  assert.equal(paletteToken("backgroundColor", "rgb(255, 255, 255)"), "surface");
  assert.equal(paletteToken("backgroundColor", "#eff0f4"), "canvas");
  assert.equal(paletteToken("backgroundColor", "rgba(246, 216, 255, 1)"), "draft");
  assert.equal(paletteToken("color", "#005614"), "success");
  assert.equal(paletteToken("color", "#ff003b"), "danger");
  assert.equal(paletteToken("borderColor", "#dfdfe3"), "line");
  for (const color of ["transparent", "rgba(255,255,255,0)", "#123456", "url(image.jpg)"]) {
    assert.equal(paletteToken("backgroundColor", color), null);
  }
});
