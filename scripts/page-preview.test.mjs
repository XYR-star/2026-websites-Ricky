import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { registerPagePreview } from "../public/admin/page-preview.js";
import { isSafeLink } from "../src/lib/page-data.mjs";

const templates = new Map();
const styles = [];
globalThis.window = {
  document: { documentElement: { dataset: { editorTheme: "dark" } } },
  h: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat().filter((value) => value !== false && value != null) }),
  createClass: (spec) => class {
    constructor(props) { this.props = props; this.state = spec.getInitialState?.call(this); }
    render() { return spec.render.call(this); }
  },
};
registerPagePreview({
  registerPreviewTemplate: (name, component) => templates.set(name, component),
  registerPreviewStyle: (url) => styles.push(url),
}, { isSafeLink });
function render(name, data) {
  return new (templates.get(name))({ entry: { get: () => ({ toJS: () => data }) } }).render();
}
function nodes(tree, tag) {
  if (!tree || typeof tree !== "object") return [];
  return [tree.tag === tag ? tree : [], ...tree.children.map((child) => nodes(child, tag))].flat();
}
function text(tree) { return typeof tree === "string" ? tree : tree?.children?.map(text).join("") ?? ""; }

test("file collections register by entry slug using the pinned Decap contract", () => {
  assert.deepEqual([...templates.keys()], ["homepage", "about", "now", "projects", "site"]);
  assert.deepEqual(styles, ["/admin/page-preview.css"]);
});

test("each current JSON page has readable content and inherits the editor theme", () => {
  for (const name of templates.keys()) {
    const data = JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
    const before = JSON.stringify(data);
    const tree = render(name, data);
    assert.equal(tree.props["data-editor-theme"], "dark");
    assert.equal(nodes(tree, "h1").length, 1);
    assert.match(text(tree), new RegExp((data.hero?.title ?? data.title).slice(0, 5)));
    assert.doesNotMatch(text(tree), /\{"hero":|\{"title":/);
    assert.equal(JSON.stringify(data), before);
  }
});

test("homepage preview follows drag order, ignores legacy order numbers and hides disabled blocks", () => {
  const data = { hero: { title: "首页" }, sections: [
    { type: "richText", enabled: true, order: 900, title: "数组第一块", body: "第一段\n\n第二段" },
    { type: "richText", enabled: false, order: 0, title: "隐藏块", body: "不可显示" },
    { type: "featuredPosts", enabled: true, order: 1, title: "数组第二块", count: 4 },
  ] };
  const before = JSON.stringify(data);
  const tree = render("homepage", data);
  assert.deepEqual(nodes(tree, "h2").map(text), ["数组第一块", "数组第二块"]);
  assert.doesNotMatch(text(tree), /隐藏块|不可显示/);
  assert.match(text(tree), /4 条最新博客/);
  assert.match(text(tree), /完整图文请查看构建预览/);
  assert.equal(JSON.stringify(data), before);
});

test("all page links are safe during incomplete editing, not just after publication", () => {
  const data = { hero: { title: "链接" }, links: [
    { label: "安全", href: "https://example.com" },
    { label: "不安全", href: "javascript:alert(1)" },
    { label: "编码危险", href: "/%2fevil.example" },
  ] };
  const tree = render("about", data);
  assert.deepEqual(nodes(tree, "a").map((node) => node.props.href), ["https://example.com"]);
  assert.match(text(tree), /不安全（链接待检查）/);
  assert.match(text(tree), /编码危险（链接待检查）/);
});

test("missing nested objects and partial list entries do not crash a fresh editor", () => {
  for (const name of templates.keys()) assert.ok(render(name, {}).tag === "article");
  assert.doesNotThrow(() => render("homepage", { sections: [null, { enabled: true, type: "curatedLinks", items: [null, "partial"] }] }));
  assert.doesNotThrow(() => render("projects", { items: [null, "partial"] }));
});
