// Decap 3.17.3 has no public theme API. Keep this adapter outside its React tree.
export const THEME_STORAGE_KEY = "ricky-admin-theme";
const MODES = new Set(["system", "light", "dark"]);
const controllers = new WeakMap();
const SCOPE = "#nc-root, .ReactModalPortal";
const PROJECTION_ATTRIBUTES = ["data-editor-surface", "data-editor-ink", "data-editor-border"];

export function resolveEditorTheme(mode, systemDark) {
  return mode === "dark" || (mode !== "light" && systemDark) ? "dark" : "light";
}

export function readThemeMode(win) {
  try {
    const value = win.localStorage.getItem(THEME_STORAGE_KEY);
    return MODES.has(value) ? value : "system";
  } catch {
    return "system";
  }
}

// Match only the pinned CMS's known UI palette, never arbitrary author colours.
// Attribute selectors below remain independent of Emotion-generated class names.
const BACKGROUNDS = {
  "#ffffff": "surface", "#eff0f4": "canvas", "#dfdfe3": "raised",
  "#f2f2f2": "raised", "#e6e6e6": "raised", "#eeeeee": "raised",
  "#f5f5f5": "raised", "#f8f8f8": "surface", "#fafafa": "surface",
  "#798291": "raised", "#313d3e": "raised", "#555a65": "raised",
  "#e8f5fe": "info", "#ddf5f9": "info", "#f6d8ff": "draft",
  "#ffee9c": "review", "#caef6f": "ready", "#aae31f": "ready",
  "#fcefea": "danger", "#fbe0d7": "danger", "#17a2b8": "action",
  "#3a69c7": "action",
};
const INKS = {
  "#ffffff": "text", "#000000": "text", "#111111": "text",
  "#222222": "text", "#333333": "text", "#313d3e": "text",
  "#444a57": "text", "#444444": "text", "#555555": "muted",
  "#666666": "muted", "#798291": "muted", "#5d626f": "muted",
  "#7b8290": "muted", "#b3b9c4": "muted", "#555a65": "muted",
  "#3a69c7": "accent", "#117888": "accent", "#1195aa": "accent",
  "#17a2b8": "accent", "#005614": "success", "#754e00": "warning",
  "#ff003b": "danger", "#d60032": "danger", "#70399f": "draft",
};
const BORDERS = {
  "#ffffff": "line", "#dfdfe3": "line", "#eff0f4": "line",
  "#e6e6e6": "line", "#cccccc": "line", "#dddddd": "line",
  "#d9d9d9": "line", "#3a69c7": "accent", "#ff003b": "danger",
};

function opaqueColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map((char) => char + char).join("");
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/.exec(color);
  if (!match || match.slice(1, 4).some((channel) => Number(channel) > 255)) return "";
  return "#" + match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
}

export function paletteToken(property, color) {
  const palette = { backgroundColor: BACKGROUNDS, color: INKS, borderColor: BORDERS }[property];
  return palette?.[opaqueColor(color)] ?? null;
}

function projectNode(node, win) {
  if (!node.matches?.("div, section, main, header, footer, aside, nav, ul, ol, li, p, span, a, button, label, input, textarea, select, option, h1, h2, h3, h4, h5, h6, pre, code, table, thead, tbody, tr, td, th")) return;
  // Leave images, author text leaves and CodeMirror syntax colours to their own renderers.
  if (!node.closest(SCOPE) || node.closest(".CodeMirror, [data-slate-leaf], [data-slate-node='text']")) return;
  for (const attribute of PROJECTION_ATTRIBUTES) node.removeAttribute(attribute);
  const style = win.getComputedStyle(node);
  const values = [style.backgroundColor, style.color, style.borderColor];
  const properties = ["backgroundColor", "color", "borderColor"];
  for (let index = 0; index < properties.length; index += 1) {
    const token = paletteToken(properties[index], values[index]);
    if (token) node.setAttribute(PROJECTION_ATTRIBUTES[index], token);
  }
}

function observeCMSPalette(win, doc) {
  let observer;
  let frame;
  let disposed = false;
  const pending = new Set();
  const requestFrame = win.requestAnimationFrame?.bind(win) ?? ((callback) => win.setTimeout(callback, 0));
  const cancelFrame = win.cancelAnimationFrame?.bind(win) ?? win.clearTimeout.bind(win);

  function flush() {
    frame = undefined;
    if (disposed || doc.documentElement.dataset.editorTheme !== "dark") {
      pending.clear();
      return;
    }
    const roots = [...pending];
    pending.clear();
    // Neutralise native colour transitions only during measurement. Read the
    // unprojected palette and restore attributes synchronously before painting.
    doc.documentElement.dataset.editorThemeMeasuring = "";
    try {
      for (const root of roots) {
        projectNode(root, win);
        for (const node of root.querySelectorAll?.("*") ?? []) projectNode(node, win);
      }
    } finally {
      delete doc.documentElement.dataset.editorThemeMeasuring;
    }
  }
  function queue(node) {
    if (!node?.matches || disposed) return;
    if (node.closest(".CodeMirror, [data-slate-leaf], [data-slate-node='text']")) return;
    // Ignore our own controls/help and unrelated document elements.
    if (!node.matches(SCOPE) && !node.closest(SCOPE) && !node.querySelector(SCOPE)) return;
    if ([...pending].some((root) => root.contains(node))) return;
    for (const root of pending) if (node.contains(root)) pending.delete(root);
    pending.add(node);
    if (frame === undefined) frame = requestFrame(flush);
  }
  function refresh() {
    if (doc.documentElement.dataset.editorTheme !== "dark") return;
    for (const root of doc.querySelectorAll(SCOPE)) queue(root);
  }
  if (typeof win.MutationObserver === "function" && doc.body) {
    observer = new win.MutationObserver((records) => {
      if (doc.documentElement.dataset.editorTheme !== "dark") return;
      for (const record of records) {
        if (record.type === "attributes") queue(record.target);
        else for (const node of record.addedNodes) if (node.nodeType === 1) queue(node);
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  }
  refresh();
  return {
    refresh,
    destroy() {
      disposed = true;
      observer?.disconnect();
      if (frame !== undefined) cancelFrame(frame);
      pending.clear();
    },
  };
}

export function initEditorTheme({ win = window, doc = win.document } = {}) {
  if (controllers.has(doc)) return controllers.get(doc);
  let media;
  try { media = win.matchMedia?.("(prefers-color-scheme: dark)"); } catch { /* Older/private browsers use light. */ }
  let mode = readThemeMode(win);
  let theme;
  let control;
  let select;
  let palette;

  function apply(nextMode, persist = false) {
    mode = MODES.has(nextMode) ? nextMode : "system";
    theme = resolveEditorTheme(mode, Boolean(media?.matches));
    doc.documentElement.dataset.editorTheme = theme;
    doc.documentElement.dataset.editorThemeMode = mode;
    doc.documentElement.style.colorScheme = theme;
    if (select) select.value = mode;
    if (persist) {
      try { win.localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* The selection still works for this tab. */ }
    }
    palette?.refresh();
    if (typeof win.CustomEvent === "function") {
      win.dispatchEvent(new win.CustomEvent("ricky:editor-theme", { detail: { mode, theme } }));
    }
  }
  const onSystem = () => { if (mode === "system") apply(mode); };
  const onStorage = (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) apply(event.newValue);
  };
  apply(mode);
  if (media?.addEventListener) media.addEventListener("change", onSystem);
  else media?.addListener?.(onSystem);
  win.addEventListener("storage", onStorage);

  const controller = {
    get mode() { return mode; },
    get theme() { return theme; },
    setMode(value) { if (MODES.has(value)) apply(value, true); },
    destroy() {
      if (media?.removeEventListener) media.removeEventListener("change", onSystem);
      else media?.removeListener?.(onSystem);
      win.removeEventListener("storage", onStorage);
      doc.removeEventListener("DOMContentLoaded", mount);
      palette?.destroy();
      control?.remove();
      controllers.delete(doc);
    },
  };
  controllers.set(doc, controller);

  function mount() {
    if (!doc.body || control) return;
    control = doc.createElement("aside");
    control.id = "editor-theme-control";
    control.setAttribute("aria-label", "后台外观");
    const label = doc.createElement("label");
    label.htmlFor = "editor-theme-select";
    label.textContent = "外观";
    select = doc.createElement("select");
    select.id = "editor-theme-select";
    for (const [value, title] of [["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]]) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = title;
      select.append(option);
    }
    select.value = mode;
    select.addEventListener("change", () => controller.setMode(select.value));
    control.append(label, select);
    doc.body.append(control);
    palette = observeCMSPalette(win, doc);
  }
  if (doc.body) mount();
  else doc.addEventListener("DOMContentLoaded", mount, { once: true });
  return controller;
}

if (typeof window !== "undefined" && typeof document !== "undefined") initEditorTheme();
