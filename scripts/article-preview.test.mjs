import assert from "node:assert/strict";
import test from "node:test";
import { registerArticlePreview } from "../public/cms-trial/article-preview.js";

const templates = new Map();
const styles = [];
globalThis.window = {
  location: { origin: "https://www.heyrickishere.com" },
  h: (tag, props, ...children) => ({
    tag, props: props ?? {}, children: children.flat().filter((value) => value !== false && value != null),
  }),
  createClass: (spec) => class {
    constructor(props) { this.props = props; }
    render() { return spec.render.call(this); }
  },
};
registerArticlePreview({
  registerPreviewStyle: (url) => styles.push(url),
  registerPreviewTemplate: (name, component) => templates.set(name, component),
});

function render(collection, data, options = {}) {
  const Component = templates.get(collection);
  return new Component({
    entry: { getIn: ([, field]) => data[field] },
    getAsset: options.getAsset ?? ((value) => value),
    widgetFor: options.widgetFor ?? (() => ({ tag: "div", props: { id: "rendered-body" }, children: [] })),
  }).render();
}

function nodes(tree, tag) {
  if (!tree || typeof tree !== "object") return [];
  return [tree.tag === tag ? tree : [], ...tree.children.map((child) => nodes(child, tag))].flat();
}

function text(tree) {
  return typeof tree === "string" ? tree : tree?.children?.map(text).join("") ?? "";
}

test("both article types use the shared stylesheet", () => {
  assert.deepEqual([...templates.keys()].sort(), ["blog", "travel"]);
  assert.deepEqual(styles, ["/cms-trial/article-preview.css"]);
});

test("a blog needs no cover; travel keeps its required-cover guidance", () => {
  const blog = render("blog", { title: "无封面也可以写", body: "正文" });
  assert.equal(nodes(blog, "figure").length, 0);
  assert.doesNotMatch(text(blog), /选一张封面|封面暂不可预览/);
  assert.match(text(render("travel", { body: "正文" })), /选一张封面/);
});

test("blog tags work with YAML arrays and Decap immutable lists without changing data", () => {
  const tags = Object.freeze([" 网站 ", "R2", "R2", "", null]);
  for (const value of [tags, { toArray: () => tags }]) {
    const tree = render("blog", { tags: value });
    const list = nodes(tree, "ul")[0];
    assert.equal(list.props["aria-label"], "文章标签");
    assert.deepEqual(list.children.map(text), ["网站", "R2"]);
  }
  assert.deepEqual(tags, [" 网站 ", "R2", "R2", "", null]);
  assert.equal(nodes(render("travel", { tags }), "ul").length, 0);
});

test("date-only, ISO and imported Date values show the same calendar day", () => {
  for (const date of ["2026-11-05", "2026-11-05T00:00:00.000Z", new Date("2026-11-05T00:00:00Z")]) {
    const time = nodes(render("blog", { date }), "time")[0];
    assert.equal(time.props.dateTime, "2026-11-05");
    assert.equal(text(time), "2026年11月5日");
  }
});

test("missing and invalid dates never silently display a different day", () => {
  assert.match(text(render("blog", {})), /尚未填写日期/);
  for (const date of ["2026-02-30", "not-a-date", new Date(NaN)]) {
    const tree = render("blog", { date });
    assert.equal(nodes(tree, "time").length, 0);
    assert.match(text(tree), /日期格式待检查/);
  }
});

test("the existing Markdown widget remains responsible for rendering body content", () => {
  const body = "\n```js\nconst longLine = '保留代码、表格及图片原始正文';\n```\n";
  const data = Object.freeze({ title: "<script>仅为标题文本</script>", body });
  const widget = { tag: "div", props: { id: "rendered-body" }, children: [] };
  const calls = [];
  const tree = render("blog", data, { widgetFor: (name) => { calls.push(name); return widget; } });
  assert.deepEqual(calls, ["body"]);
  assert.equal(nodes(tree, "h1")[0].children[0], data.title);
  assert.equal(nodes(tree, "div").find((node) => node.props.id === "rendered-body"), widget);
  assert.equal(data.body, body);
});

test("valid stored and freshly selected cover assets keep their source bytes", () => {
  const assets = [
    "https://assets.heyrickishere.com/cms/travel/post/original.jpg",
    "blob:https://www.heyrickishere.com/selected-image",
    "data:image/png;base64,aGVsbG8=",
    { toString: () => "https://assets.heyrickishere.com/cms/blog/original.png" },
  ];
  for (const asset of assets) {
    const tree = render("blog", { title: "封面", cover: "stored-key" }, { getAsset: () => asset });
    assert.equal(nodes(tree, "img")[0].props.src, String(asset));
  }
});

test("unavailable or unsafe cover sources remain text placeholders", () => {
  for (const cover of ["javascript:alert(1)", "http://insecure.example/image.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PHNjcmlwdD4="]) {
    const tree = render("blog", { cover });
    assert.equal(nodes(tree, "img").length, 0);
    assert.match(text(tree), /封面暂不可预览/);
  }
});
