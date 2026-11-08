import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSafeLink, validatePageData, validateCMSPreSave } from "../src/lib/page-data.mjs";

function realData(name) {
  return JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
}

for (const name of ["homepage", "about", "now", "projects", "site"]) {
  test(`validates real ${name} JSON without changing text, order, or object identity`, () => {
    const data = realData(name);
    const before = structuredClone(data);
    assert.equal(validatePageData(name, data), data);
    assert.deepEqual(data, before);
  });
}

test("accepts every supported homepage section and preserves editor array order", () => {
  const data = realData("homepage");
  data.sections = [
    { id: "newest", type: "featuredPosts", enabled: true, count: 24, order: 90 },
    { id: "旅行", type: "travelList", enabled: true, count: 1, order: 0 },
    { id: "research", type: "researchList", enabled: false },
    { id: "links", type: "curatedLinks", enabled: true, items: [{ title: "", description: "", href: "" }] },
    { id: "current", type: "nowSummary", enabled: true, body: "" },
    { id: "about", type: "aboutNote", enabled: true, body: "正文保持原样\n\n第二段" },
    { id: "quote", type: "quote", enabled: true, quote: "" },
    { id: "text", type: "richText", enabled: true, body: "" },
  ];
  const before = structuredClone(data);
  validatePageData("homepage", data);
  assert.deepEqual(data, before);
  assert.equal(data.sections[0].id, "newest");
});

test("allows optional legacy intro, note, and secondary text to be missing or blank", () => {
  const homepage = realData("homepage");
  delete homepage.hero.intro;
  homepage.hero.note = "";
  homepage.hero.primaryLinkLabel = "";
  homepage.hero.primaryLinkHref = "";
  assert.doesNotThrow(() => validatePageData("homepage", homepage));
  const about = realData("about");
  delete about.hero.intro;
  delete about.profileCard.secondaryBody;
  delete about.facts.location;
  assert.doesNotThrow(() => validatePageData("about", about));
  const projects = realData("projects");
  delete projects.hero.intro;
  assert.doesNotThrow(() => validatePageData("projects", projects));
});

const safeLinks = [
  "https://example.com/path?query=hello#part", "http://example.com", "HTTPS://EXAMPLE.COM",
  "mailto:rick@example.com", "mailto:rick@example.com?subject=hello%20there",
  "/", "/blog/中文文章", "/blog/hello%20world", "#start-here", "#", "/now?tab=notes#today",
];
for (const href of safeLinks) {
  test(`allows a safe link ${JSON.stringify(href)}`, () => assert.equal(isSafeLink(href), true));
}

const unsafeLinks = [
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)", "file:///etc/passwd", "//evil.example/path", "///evil.example/path",
  "/\\evil.example", "\\\\evil.example", "https://example.com\\@evil.example", "https://rick:password@example.com",
  "https://rick@example.com", "https://%72ick@example.com", "https://@example.com", "https://:@example.com", " https://example.com", "https://example.com ",
  "https://example.com/\u0000", "https://example.com/\u007f", "https://example.com/\u0085",
  "https://example.com/%0a", "/%5Cevil.example", "/%2Fevil.example", "mailto://rick:password@example.com", "https://", "https:example.com",
  "relative/path", "javascript%3Aalert(1)", "/broken%encoding", "", null, 7, {}, [],
];
for (const href of unsafeLinks) {
  test(`rejects an unsafe link ${JSON.stringify(href)}`, () => assert.equal(isSafeLink(href), false));
}

test("externalOnly excludes local paths and anchors while permitting HTTP and mail links", () => {
  assert.equal(isSafeLink("/blog", { externalOnly: true }), false);
  assert.equal(isSafeLink("#today", { externalOnly: true }), false);
  assert.equal(isSafeLink("https://example.com", { externalOnly: true }), true);
  assert.equal(isSafeLink("mailto:rick@example.com", { externalOnly: true }), true);
});

const invalidHomepage = [
  ["hero object", (data) => { data.hero = null; }, /首页.hero/],
  ["sections array", (data) => { data.sections = {}; }, /首页.sections/],
  ["section object", (data) => { data.sections[0] = null; }, /sections\[1\]/],
  ["duplicate section ID", (data) => { data.sections[1].id = data.sections[0].id; }, /编号.*重复/],
  ["hero and section ID collision", (data) => { data.sections[0].id = data.hero.id; }, /编号.*重复/],
  ["empty section ID", (data) => { data.sections[0].id = ""; }, /\.id/],
  ["unsafe section ID", (data) => { data.sections[0].id = "bad id#x"; }, /\.id/],
  ["unknown section type", (data) => { data.sections[0].type = "gallery"; }, /\.type/],
  ["truthy string enabled", (data) => { data.sections[0].enabled = "false"; }, /\.enabled/],
  ["fractional order", (data) => { data.sections[0].order = 1.5; }, /\.order/],
  ["negative order", (data) => { data.sections[0].order = -1; }, /\.order/],
  ["excessive order", (data) => { data.sections[0].order = 10001; }, /\.order/],
  ["fractional count", (data) => { data.sections[2].count = 2.5; }, /\.count/],
  ["negative count", (data) => { data.sections[2].count = -1; }, /\.count/],
  ["zero count", (data) => { data.sections[2].count = 0; }, /\.count/],
  ["excessive count", (data) => { data.sections[2].count = 25; }, /\.count/],
  ["string count", (data) => { data.sections[2].count = "3"; }, /\.count/],
  ["non-finite count", (data) => { data.sections[2].count = Infinity; }, /\.count/],
  ["curated item list", (data) => { data.sections[0].items = null; }, /\.items/],
  ["curated text object", (data) => { data.sections[0].items[0].title = {}; }, /\.title/],
  ["body array", (data) => { data.sections[1].body = []; }, /\.body/],
  ["hero unsafe href", (data) => { data.hero.primaryLinkHref = "javascript:alert(1)"; }, /primaryLinkHref/],
  ["section unsafe href", (data) => { data.sections[1].linkHref = "//evil.example"; }, /linkHref/],
  ["curated unsafe href", (data) => { data.sections[0].items[0].href = "data:text/html,x"; }, /\.href/],
];
for (const [label, mutate, message] of invalidHomepage) {
  test(`rejects invalid homepage ${label} with a readable field path`, () => {
    const data = realData("homepage");
    mutate(data);
    assert.throws(() => validatePageData("homepage", data), message);
  });
}

test("rejects unknown page names and a siteUrl editable field", () => {
  for (const name of ["unknown", "constructor", "__proto__"]) assert.throws(() => validatePageData(name, {}), /页面/);
  const site = realData("site");
  site.siteUrl = "https://other.example";
  assert.throws(() => validatePageData("site", site), /siteUrl/);
});

test("rejects about links and site social links with dangerous protocols", () => {
  const about = realData("about");
  about.links = [{ label: "Unsafe", href: "javascript:alert(1)" }];
  assert.throws(() => validatePageData("about", about), /关于页.links\[1\].href/);
  const site = realData("site");
  site.socialLinks = [{ label: "Unsafe", href: "https://user:secret@example.com" }];
  assert.throws(() => validatePageData("site", site), /站点信息.socialLinks\[1\].href/);
});

test("accepts migrated projects and now page data with optional introductory text", () => {
  const now = { eyebrow: "Now", title: "近况", intro: "", items: ["第一条", "第二条"] };
  const projects = { hero: { eyebrow: "Projects", title: "项目", intro: "" }, items: [{ title: "写作", status: "进行中", description: "保持原文" }] };
  assert.equal(validatePageData("now", now), now);
  assert.equal(validatePageData("projects", projects), projects);
});

test("rejects malformed migrated page structures before templates can crash", () => {
  const now = realData("now");
  now.items = [{ title: "Object instead of text" }];
  assert.throws(() => validatePageData("now", now), /近况页.items\[1\]/);
  const projects = realData("projects");
  projects.items[0].description = ["Not text"];
  assert.throws(() => validatePageData("projects", projects), /项目页.items\[1\].description/);
  const about = realData("about");
  about.links = "not an array";
  assert.throws(() => validatePageData("about", about), /关于页.links/);
  const site = realData("site");
  site.socialLinks = {};
  assert.throws(() => validatePageData("site", site), /站点信息.socialLinks/);
});

test("preSave validates all fixed page entry names against their exact filenames without replacing data", () => {
  for (const name of ["homepage", "about", "now", "projects", "site"]) {
    const data = realData(name);
    const before = structuredClone(data);
    assert.equal(validateCMSPreSave({ collection: "pages", slug: name, path: `src/data/${name}.json`, data }), undefined);
    assert.deepEqual(data, before);
  }
});

for (const [slug, path] of [
  ["homepage", "src/data/about.json"],
  ["homepage", "src/data/homepage.json.bak"],
  ["homepage", "../src/data/homepage.json"],
  ["homepage", undefined],
  ["homepage.json", "src/data/homepage.json"],
  ["src/data/homepage.json", "src/data/homepage.json"],
  ["unknown", "src/data/unknown.json"],
]) {
  test(`preSave refuses mismatched page slug/path ${JSON.stringify([slug, path])}`, () => {
    assert.throws(() => validateCMSPreSave({ collection: "pages", slug, path, data: realData("homepage") }), /页面草稿路径/);
  });
}

test("preSave also rejects malformed page data instead of changing it", () => {
  const data = realData("homepage");
  data.sections[0].enabled = "false";
  const before = structuredClone(data);
  assert.throws(() => validateCMSPreSave({ collection: "pages", slug: "homepage", path: "src/data/homepage.json", data }), /enabled/);
  assert.deepEqual(data, before);
});

test("preSave accepts research HTTP/HTTPS source links and optional empty source lists", () => {
  const data = { title: "研究", links: [{ label: "论文", href: "https://example.com/paper" }, { label: "资料", href: "http://example.com" }] };
  const before = structuredClone(data);
  assert.equal(validateCMSPreSave({ collection: "research", data }), undefined);
  assert.deepEqual(data, before);
  assert.doesNotThrow(() => validateCMSPreSave({ collection: "research", data: {} }));
  assert.doesNotThrow(() => validateCMSPreSave({ collection: "research", data: { links: [] } }));
});

for (const href of ["mailto:rick@example.com", "/research/paper", "#paper", "javascript:alert(1)", "https://rick:secret@example.com", "https://example.com/%0d"]) {
  test(`preSave rejects an unsafe or unsupported research URL ${JSON.stringify(href)}`, () => {
    assert.throws(() => validateCMSPreSave({ collection: "research", data: { links: [{ label: "资料", href }] } }), /研究文章.links\[1\].href/);
  });
}

test("preSave rejects non-array research links and leaves unrelated article collections alone", () => {
  assert.throws(() => validateCMSPreSave({ collection: "research", data: { links: "not a list" } }), /研究文章.links/);
  assert.throws(() => validateCMSPreSave({ collection: "research", data: { links: [null] } }), /研究文章.links\[1\]/);
  assert.throws(() => validateCMSPreSave({ collection: "research", data: { links: [{ label: [], href: "https://example.com" }] } }), /\.label/);
  assert.equal(validateCMSPreSave({ collection: "blog", data: { title: "博客" } }), undefined);
});
