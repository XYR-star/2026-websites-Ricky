import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createPayloadContentReader,
  getContentSource,
  getPageData,
  getPayloadRequestSettings,
  getPayloadSiteContent,
  payloadPageNames,
  validatePayloadSiteContent,
} from "../src/lib/payload-content.mjs";

function page(name) {
  return JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
}

function snapshot() {
  return {
    schemaVersion: 1,
    articles: {
      blog: [{
        _status: "published", slug: "2026-11-14-开始写作", title: "开始写作", date: "2026-11-14",
        description: "保留中文文章地址", bodyMarkdown: "## 内容\n\n这是正文。", tags: ["日常"],
      }],
      research: [{
        _status: "published", slug: "2026-11-14-research", title: "研究记录", date: "2026-11-14T10:00:00.000Z",
        summary: "研究摘要", bodyMarkdown: "记录", project: "项目", status: "进行中",
        links: [{ label: "论文", href: "https://example.com/paper" }],
      }],
      travel: [{
        _status: "published", slug: "2026-11-03-暑假九寨行", title: "暑假九寨行", date: "2026-11-04",
        description: "一次旅行", cover: "/images/travel/120_swu/1776737551118-6000ce60.jpg",
        bodyMarkdown: '![湖水](https://assets.heyrickishere.com/cms/lake.jpg "原图")',
        media_id: "4bc5be8c-3c13-4ae7-943e-d8b832def49f",
      }],
    },
    pages: Object.fromEntries(payloadPageNames.map((name) => [name, page(name)])),
  };
}

const env = { CMS_URL: "https://cms.example.com", CMS_READ_TOKEN: "test-only-read-token" };
const json = (value = snapshot(), options = {}) => new Response(JSON.stringify(value), {
  headers: { "content-type": "application/json; charset=utf-8" }, ...options,
});

test("defaults to the v1 local content path and refuses misspelled content sources", () => {
  assert.equal(getContentSource({}), "legacy");
  assert.equal(getContentSource({ CONTENT_SOURCE: "legacy" }), "legacy");
  assert.equal(getContentSource({ CONTENT_SOURCE: "payload" }), "payload");
  assert.throws(() => getContentSource({ CONTENT_SOURCE: "paylaod" }), /CONTENT_SOURCE/);
});

test("validates all published content together and preserves Chinese slugs, original media URLs and page order", () => {
  const value = snapshot();
  const expected = structuredClone(value);
  const result = validatePayloadSiteContent(value);
  assert.deepEqual(result, expected);
  assert.equal(result.articles.travel[0].slug, "2026-11-03-暑假九寨行");
  assert.equal(result.articles.travel[0].cover, expected.articles.travel[0].cover);
  assert.ok(Object.isFrozen(result.articles.travel[0]));
  assert.ok(Object.isFrozen(result.pages.homepage.sections));
  assert.throws(() => result.articles.blog.push({}), TypeError);
});

test("one draft in any collection rejects the entire response instead of publishing a partial site", () => {
  for (const collection of ["blog", "research", "travel"]) {
    const value = snapshot();
    value.articles[collection][0]._status = "draft";
    assert.throws(() => validatePayloadSiteContent(value), /not published/);
  }
  const value = snapshot();
  value.articles.blog[0].draft = true;
  assert.throws(() => validatePayloadSiteContent(value), /not published/);
});

test("private content fields and management metadata cannot accidentally enter the public content contract", () => {
  for (const field of ["visibility", "password", "_versions", "privateUrl", "id", "updatedAt"]) {
    const value = snapshot();
    value.articles.blog[0][field] = "PRIVATE_TEST_DATA";
    assert.throws(() => validatePayloadSiteContent(value), /unsupported fields/);
  }
  const value = snapshot();
  value.privateDrafts = ["PRIVATE_TEST_DATA"];
  assert.throws(() => validatePayloadSiteContent(value), /unsupported fields/);
});

test("withdrawn and deleted content can be represented by empty collections without falling back to Git files", () => {
  const value = snapshot();
  value.articles = { blog: [], travel: [], research: [] };
  assert.deepEqual(validatePayloadSiteContent(value).articles, value.articles);
});

test("missing collections, pages and invalid page configuration stop the build", () => {
  for (const collection of ["blog", "research", "travel"]) {
    const value = snapshot();
    delete value.articles[collection];
    assert.throws(() => validatePayloadSiteContent(value), /collection is missing/);
  }
  for (const name of payloadPageNames) {
    const value = snapshot();
    delete value.pages[name];
    assert.throws(() => validatePayloadSiteContent(value), /missing or failed validation/);
  }
  const value = snapshot();
  value.pages.homepage.sections[0].enabled = "true";
  assert.throws(() => validatePayloadSiteContent(value), /homepage page/);
});

test("rejects duplicate or unsafe route IDs without normalizing old article URLs", () => {
  const value = snapshot();
  value.articles.blog.push(structuredClone(value.articles.blog[0]));
  assert.throws(() => validatePayloadSiteContent(value), /duplicate slugs/);
  for (const slug of ["../private", "post/extra", "post?draft=true", "post#secret", "%2e%2e", "", "__proto__"]) {
    const value = snapshot();
    value.articles.blog[0].slug = slug;
    assert.throws(() => validatePayloadSiteContent(value), /unsafe or missing slug/);
  }
});

test("checks real calendar dates, text fields, tags and research links", () => {
  const changes = [
    (v) => { v.articles.blog[0].date = "2026-02-30"; },
    (v) => { v.articles.blog[0].title = " "; },
    (v) => { v.articles.blog[0].tags = [42]; },
    (v) => { v.articles.research[0].links[0].href = "javascript:alert(1)"; },
    (v) => { v.articles.research[0].links[0].href = "https://user:password@example.com/paper"; },
    (v) => { v.articles.travel[0].media_id = "not-a-uuid"; },
  ];
  for (const change of changes) {
    const value = snapshot();
    change(value);
    assert.throws(() => validatePayloadSiteContent(value), /CMS published content is invalid/);
  }
});

test("keeps public CDN and historical local images while refusing unsafe cover paths", () => {
  for (const cover of [
    "https://assets.heyrickishere.com/cms/lake.jpg",
    "/images/travel/120_swu/photo.jpg",
    "images/cms-trial/old.jpg",
  ]) {
    const value = snapshot();
    value.articles.travel[0].cover = cover;
    assert.equal(validatePayloadSiteContent(value).articles.travel[0].cover, cover);
  }
  for (const cover of [
    "/images/../api/private", "/images/%2e%2e/api/private", "//private.example/photo.jpg",
    "javascript:alert(1)", "data:image/png;base64,AAAA", "https://user:pass@example.com/img.jpg",
  ]) {
    const value = snapshot();
    value.articles.travel[0].cover = cover;
    assert.throws(() => validatePayloadSiteContent(value), /image|credentials/);
  }
});

test("short-lived private asset addresses are refused in covers and actual Markdown media, including reference images", () => {
  const urls = [
    "https://private.example/image.jpg?X-Amz-Signature=PRIVATE_TEST_DATA",
    "https://private.example/image.jpg?access_token=PRIVATE_TEST_DATA",
    "https://private.example/image.jpg?X-Goog-Credential=PRIVATE_TEST_DATA",
    "https://account.r2.cloudflarestorage.com/bucket/image.jpg",
    "https://cms.example.com/api/media/file/image.jpg",
  ];
  for (const url of urls) {
    for (const apply of [
      (v) => { v.articles.travel[0].cover = url; },
      (v) => { v.articles.travel[0].bodyMarkdown = `![预览图](${url})`; },
      (v) => { v.articles.travel[0].bodyMarkdown = `![预览图][private]\n\n[private]: ${url}`; },
      (v) => { v.articles.travel[0].bodyMarkdown = `[下载](${url})`; },
    ]) {
      const value = snapshot();
      apply(value);
      assert.throws(() => validatePayloadSiteContent(value), /private access credentials/);
    }
  }
});

test("documentation may show a signed URL example as code without turning it into a public asset link", () => {
  const value = snapshot();
  value.articles.blog[0].bodyMarkdown = [
    "`https://private.example/image.jpg?X-Amz-Signature=example`",
    "```md\n![示例](https://private.example/image.jpg?token=example)\n```",
  ].join("\n\n");
  assert.doesNotThrow(() => validatePayloadSiteContent(value));
});

test("oversized article content is rejected before rendering", () => {
  const value = snapshot();
  value.articles.blog[0].bodyMarkdown = "a".repeat(1024 * 1024 + 1);
  assert.throws(() => validatePayloadSiteContent(value), /larger than the supported limit/);
});

test("request configuration requires a dedicated token and a safe CMS destination", () => {
  assert.deepEqual(getPayloadRequestSettings(env), {
    endpoint: "https://cms.example.com/api/site-content", token: env.CMS_READ_TOKEN,
  });
  assert.equal(getPayloadRequestSettings({ ...env, CMS_URL: "http://127.0.0.1:3000/" }).endpoint,
    "http://127.0.0.1:3000/api/site-content");
  for (const CMS_URL of [undefined, "cms.example.com", "http://remote.example.com", "https://user:pass@example.com", "https://example.com?key=SECRET", "https://example.com/#draft"]) {
    assert.throws(() => getPayloadRequestSettings({ ...env, CMS_URL }), /CMS_URL/);
  }
  for (const CMS_READ_TOKEN of [undefined, "", "token\nheader: value", "Bearer with spaces"]) {
    assert.throws(() => getPayloadRequestSettings({ ...env, CMS_READ_TOKEN }), /CMS_READ_TOKEN/);
  }
});

test("all concurrent collection and page reads share exactly one authenticated, non-redirecting response", async () => {
  let calls = 0;
  const reader = createPayloadContentReader({ env, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, "https://cms.example.com/api/site-content");
    assert.equal(init.headers.Authorization, `Bearer ${env.CMS_READ_TOKEN}`);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    return json();
  } });
  const first = reader();
  const [a, b, c] = await Promise.all([first, reader(), reader()]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(reader(), first);
});

test("failed requests remain failed for the whole build and never retry or substitute local content", async () => {
  let calls = 0;
  const reader = createPayloadContentReader({ env, fetchImpl: async () => {
    calls++;
    return new Response("PRIVATE_SERVER_RESPONSE", { status: 503 });
  } });
  const error = await reader().catch((error) => error);
  assert.match(error.message, /HTTP 503/);
  assert.doesNotMatch(error.message, /PRIVATE_SERVER_RESPONSE|test-only-read-token/);
  await assert.rejects(reader(), /HTTP 503/);
  assert.equal(calls, 1);
});

test("network failures and timeouts stop the CMS build without exposing credentials", async () => {
  const reader = createPayloadContentReader({ env, fetchImpl: async () => {
    throw new Error(`request failed: ${env.CMS_READ_TOKEN}`);
  } });
  await assert.rejects(reader(), (error) => /local content was not substituted/.test(error.message) && !error.message.includes(env.CMS_READ_TOKEN));
  const timeoutReader = createPayloadContentReader({ env, timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(json()), 1000);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) });
  await assert.rejects(timeoutReader(), /The build was stopped/);
});

test("login pages, invalid JSON and malformed UTF-8 cannot become CMS content", async () => {
  const responses = [
    () => new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }),
    () => new Response("PRIVATE_INVALID_JSON", { headers: { "content-type": "application/json" } }),
    () => new Response(new Uint8Array([0xc0, 0x80]), { headers: { "content-type": "application/json" } }),
    () => new Response(null, { headers: { "content-type": "application/json" } }),
  ];
  for (const response of responses) {
    const reader = createPayloadContentReader({ env, fetchImpl: async () => response() });
    await assert.rejects(reader(), (error) => /JSON|empty/.test(error.message) && !error.message.includes("PRIVATE_INVALID_JSON"));
  }
});

test("response size limits protect both declared lengths and chunked bodies", async () => {
  const declared = createPayloadContentReader({ env, maximumBytes: 128, fetchImpl: async () => new Response("{}", {
    headers: { "content-type": "application/json", "content-length": "1024" },
  }) });
  await assert.rejects(declared(), /response size limit/);

  let cancelled = false;
  const streamed = createPayloadContentReader({ env, maximumBytes: 128, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(256))); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }) });
  await assert.rejects(streamed(), /response size limit/);
  assert.equal(cancelled, true);
});

test("the site-wide reader shares its published snapshot with page configuration readers", async () => {
  const names = ["CONTENT_SOURCE", "CMS_URL", "CMS_READ_TOKEN"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, { CONTENT_SOURCE: "payload", CMS_URL: env.CMS_URL, CMS_READ_TOKEN: "site-wide-reader-test-token" });
    globalThis.fetch = async () => { calls++; return json(); };
    const [content, homepage, site] = await Promise.all([
      getPayloadSiteContent(), getPageData("homepage", page("homepage")), getPageData("site", page("site")),
    ]);
    assert.equal(calls, 1);
    assert.equal(homepage, content.pages.homepage);
    assert.equal(site, content.pages.site);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
  }
});

test("legacy page configuration does not require CMS credentials or make network requests", async () => {
  const previous = process.env.CONTENT_SOURCE;
  const originalFetch = globalThis.fetch;
  try {
    process.env.CONTENT_SOURCE = "legacy";
    globalThis.fetch = async () => { throw new Error("Legacy pages must not request the CMS."); };
    for (const name of payloadPageNames) {
      const data = page(name);
      assert.equal(await getPageData(name, data), data);
    }
    await assert.rejects(getPageData("unknown", {}), /Unsupported site page/);
  } finally {
    globalThis.fetch = originalFetch;
    previous === undefined ? delete process.env.CONTENT_SOURCE : process.env.CONTENT_SOURCE = previous;
  }
});
