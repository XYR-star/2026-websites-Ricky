import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkArticlePublication, checkTravelPublication } from "../public/cms-trial/publish-check.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const repo = "XYR-star/2026-websites-Ricky";
const slug = "2026-11-07-editorial-workbench";
const article = (collection) => `src/content/${collection}/${slug}.md`;
const entry = (collection = "blog", value = slug) => ({
  get: (name) => ({ collection, slug: value })[name],
});
const pull = (collection = "blog", branch = "main") => ({
  state: "open",
  base: { ref: branch, sha: "a".repeat(40), repo: { full_name: repo } },
  head: { ref: `cms/${collection}/${slug}`, sha: "b".repeat(40), repo: { full_name: repo } },
});
const file = (filename, status = "modified") => ({ filename, status });

function mockGitHub(...responses) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    assert.ok(response !== undefined, "unexpected additional GitHub request");
    if (response instanceof Error) throw response;
    if (response === "HTTP_ERROR") return { ok: false, status: 403 };
    return { ok: true, json: async () => response };
  };
  return calls;
}

for (const collection of ["blog", "travel", "research"]) {
  test(`prePublish accepts one ${collection} article plus historical images`, async () => {
    const calls = mockGitHub([pull(collection)], {
      files: [file(article(collection)), file("public/images/cms-trial/old-cover.png", "added")],
    });
    await checkArticlePublication({ entry: entry(collection) });
    assert.equal(calls.length, 2);
    const query = new URL(calls[0].url).searchParams;
    assert.equal(query.get("base"), "main");
    assert.equal(query.get("state"), "open");
    assert.equal(query.get("head"), `XYR-star:cms/${collection}/${slug}`);
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.headers.Accept, "application/vnd.github+json");
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.match(calls[1].url, /\/compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}\?per_page=1$/);
  });
}

for (const name of ["homepage", "about", "now", "projects", "tracks", "site"]) {
  for (const status of ["added", "modified"]) {
    test(`prePublish accepts ${status} of the fixed ${name} page JSON`, async () => {
      const value = pull("pages");
      value.head.ref = `cms/pages/${name}`;
      const calls = mockGitHub([value], { files: [file(`src/data/${name}.json`, status)] });
      await checkArticlePublication({ entry: entry("pages", name) });
      assert.equal(calls.length, 2);
      assert.equal(new URL(calls[0].url).searchParams.get("head"), `XYR-star:cms/pages/${name}`);
    });
  }
}

test("older trial loaders retain their existing export", () => {
  assert.equal(checkTravelPublication, checkArticlePublication);
});

test("explicit preview environment remains isolated from production", async () => {
  const calls = mockGitHub([pull("travel", "decap-preview")], { files: [file(article("travel"), "added")] });
  await checkArticlePublication({ entry: entry("travel") }, "decap-preview");
  assert.equal(new URL(calls[0].url).searchParams.get("base"), "decap-preview");
});

test("rejects unsupported collections, branch and unsafe slugs before any request", async () => {
  const calls = mockGitHub();
  await assert.rejects(checkArticlePublication({ entry: entry("unknown") }));
  await assert.rejects(checkArticlePublication({ entry: entry() }, "release"));
  for (const invalid of ["", ".", "..", "../other", "a/b", "a\\b", ".hidden", "a..b", "a.", "a.lock", "a b", "a\u0000b", "a\u007fb", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a@{b"]) {
    await assert.rejects(checkArticlePublication({ entry: entry("blog", invalid) }), undefined, JSON.stringify(invalid));
  }
  assert.equal(calls.length, 0);
});

test("prePublish requires an exact fixed page entry name, not a path or JSON filename", async () => {
  const calls = mockGitHub();
  for (const name of ["unknown", "homepage.json", "src/data/homepage.json", "../homepage", "constructor", "__proto__", ""]) {
    await assert.rejects(checkArticlePublication({ entry: entry("pages", name) }), undefined, name);
  }
  assert.equal(calls.length, 0);
});

const invalidPulls = [
  ["foreign head repository", (value) => { value.head.repo.full_name = "other/fork"; }],
  ["wrong base repository", (value) => { value.base.repo.full_name = "other/repository"; }],
  ["missing head repository", (value) => { value.head.repo = null; }],
  ["wrong base branch", (value) => { value.base.ref = "decap-preview"; }],
  ["wrong head reference", (value) => { value.head.ref = "cms/blog/another"; }],
  ["closed pull request", (value) => { value.state = "closed"; }],
  ["invalid base SHA", (value) => { value.base.sha = "invalid"; }],
  ["invalid head SHA", (value) => { value.head.sha = "b".repeat(39); }],
];

for (const [label, mutate] of invalidPulls) {
  test(`prePublish rejects ${label}`, async () => {
    const value = pull();
    mutate(value);
    const calls = mockGitHub([value]);
    await assert.rejects(checkArticlePublication({ entry: entry() }), /先保存草稿/);
    assert.equal(calls.length, 1);
  });
}

test("prePublish rejects missing saved draft PR", async () => {
  mockGitHub([]);
  await assert.rejects(checkArticlePublication({ entry: entry() }), /先保存草稿/);
});

const invalidFiles = [
  ["other article", [file(article("blog")), file("src/content/blog/other.md")]],
  ["other collection", [file(article("blog")), file(article("travel"))]],
  ["second research article in a blog PR", [file(article("blog")), file(article("research"))]],
  ["fixed page file", [file(article("blog")), file("src/data/homepage.json")]],
  ["configuration", [file(article("blog")), file("public/admin/config.yml")]],
  ["article deletion", [file(article("blog"), "removed")]],
  ["article rename", [file(article("blog"), "renamed")]],
  ["historical image deletion", [file(article("blog")), file("public/images/cms-trial/old.jpg", "removed")]],
  ["unsupported image type", [file(article("blog")), file("public/images/cms-trial/old.svg", "added")]],
  ["missing article", [file("public/images/cms-trial/old.jpg")]],
  ["empty diff", []],
  ["missing file list", undefined],
  ["possibly truncated GitHub comparison", [file(article("blog")), ...Array.from({ length: 299 }, (_, index) => file(`public/images/cms-trial/${index}.jpg`))]],
];

for (const [label, files] of invalidFiles) {
  test(`prePublish rejects ${label}`, async () => {
    mockGitHub([pull()], { files });
    await assert.rejects(checkArticlePublication({ entry: entry() }), /其他文件/);
  });
}

const invalidPageFiles = [
  ["different fixed page JSON", [file("src/data/about.json")]],
  ["second fixed page JSON", [file("src/data/homepage.json"), file("src/data/about.json")]],
  ["adjacent configuration JSON", [file("src/data/homepage.json"), file("src/data/config.json")]],
  ["CMS configuration", [file("src/data/homepage.json"), file("public/admin/config.yml")]],
  ["article alongside page JSON", [file("src/data/homepage.json"), file(article("blog"))]],
  ["historical image alongside page JSON", [file("src/data/homepage.json"), file("public/images/cms-trial/old.jpg", "added")]],
  ["page deletion", [file("src/data/homepage.json", "removed")]],
  ["page rename", [file("src/data/homepage.json", "renamed")]],
  ["empty page diff", []],
];

for (const [label, files] of invalidPageFiles) {
  test(`prePublish rejects ${label}`, async () => {
    const value = pull("pages");
    value.head.ref = "cms/pages/homepage";
    mockGitHub([value], { files });
    await assert.rejects(checkArticlePublication({ entry: entry("pages", "homepage") }), /其他文件/);
  });
}

test("prePublish rejects another page JSON alongside tracks", async () => {
  const value = pull("pages");
  value.head.ref = "cms/pages/tracks";
  mockGitHub([value], { files: [file("src/data/tracks.json"), file("src/data/homepage.json")] });
  await assert.rejects(checkArticlePublication({ entry: entry("pages", "tracks") }), /其他文件/);
});

for (const [label, mutate] of invalidPulls) {
  test(`prePublish rejects a page PR with ${label}`, async () => {
    const value = pull("pages");
    value.head.ref = "cms/pages/homepage";
    mutate(value);
    const calls = mockGitHub([value]);
    await assert.rejects(checkArticlePublication({ entry: entry("pages", "homepage") }), /先保存草稿/);
    assert.equal(calls.length, 1);
  });
}

for (const failingResponse of ["HTTP_ERROR", new Error("network unavailable")]) {
  test(`prePublish blocks publication when GitHub lookup fails: ${String(failingResponse)}`, async () => {
    mockGitHub(failingResponse);
    await assert.rejects(checkArticlePublication({ entry: entry() }));
  });
}

test("prePublish blocks publication when the comparison request fails", async () => {
  mockGitHub([pull()], "HTTP_ERROR");
  await assert.rejects(checkArticlePublication({ entry: entry() }), /暂时无法核对/);
});
