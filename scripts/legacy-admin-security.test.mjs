import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createContent, getContent, trashContent, updateContent } from "../admin/lib/content.mjs";
import { getSessionFromRequest } from "../admin/lib/security.mjs";
import { renderMarkdownPreview } from "../admin/lib/preview.mjs";

const request = (token) => ({ headers: { cookie: `ricky_admin_session=${token}` } });
const token = "a".repeat(64);
const validSession = {
  username: "admin",
  csrfToken: "b".repeat(48),
  expiresAt: Date.now() + 60_000,
};

test("legacy session lookup rejects inherited cookie names and inherited records", () => {
  const empty = { read: () => ({}) };
  for (const value of ["constructor", "__proto__", "toString"]) {
    assert.equal(getSessionFromRequest(request(value), empty), null);
  }
  const inherited = { read: () => Object.create({ [token]: validSession }) };
  assert.equal(getSessionFromRequest(request(token), inherited), null);
});

test("legacy session lookup requires valid state and expires old sessions", () => {
  for (const state of [null, {}, { [token]: { ...validSession, csrfToken: undefined } }, { [token]: { ...validSession, expiresAt: "never" } }]) {
    assert.equal(getSessionFromRequest(request(token), { read: () => state }), null);
  }
  assert.deepEqual(getSessionFromRequest(request(token), { read: () => ({ [token]: validSession }) }), {
    ...validSession, token,
  });
  const expired = { [token]: { ...validSession, expiresAt: 0 } };
  let saved;
  assert.equal(getSessionFromRequest(request(token), { read: () => expired, write: (state) => { saved = state; } }), null);
  assert.deepEqual(saved, {});
});

test("legacy content routes reject traversal before file reads or writes", (t) => {
  const payload = { title: "Fixture", description: "Fixture only" };
  const traversal = "../../../README";
  const write = t.mock.method(fs, "writeFileSync", () => { throw new Error("Unexpected file write"); });
  const rename = t.mock.method(fs, "renameSync", () => { throw new Error("Unexpected file move"); });
  assert.throws(() => getContent("blog", traversal), /Invalid content slug/);
  assert.throws(() => updateContent("blog", traversal, payload), /Invalid content slug/);
  assert.throws(() => trashContent("blog", traversal), /Invalid content slug/);
  assert.throws(() => createContent("blog", { ...payload, date: traversal }), /Invalid content slug/);
  assert.throws(() => getContent("constructor", "fixture"), /Unsupported collection/);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(rename.mock.callCount(), 0);
});

test("legacy Markdown preview escapes raw HTML and prevents active links and images", () => {
  const html = renderMarkdownPreview([
    '<img src=x onerror="alert(1)">',
    "",
    "Inline <pre><svg/onload=alert(1)></pre>",
    "[**Unsafe**](javascript:alert%281%29) <javascript:alert(1)>",
    "[Entity](javascript&colon;alert%281%29) [Numeric](&#x6a;avascript:alert%281%29)",
    "![Data image](data:image/svg+xml,example)",
  ].join("\n"));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /<strong>Unsafe<\/strong> javascript:alert\(1\)/);
  assert.match(html, /href="javascript&amp;colon;alert%281%29"/);
  assert.doesNotMatch(html, /href="javascript(?::|&colon;)|href="&#|<(?:img|svg)\b|src="data:/);
  assert.match(html, /Data image/);
});

test("legacy Markdown preview retains local images, web and email links, and code", () => {
  const html = renderMarkdownPreview([
    "![Photo](images/photo.jpg)",
    "[Link](https://example.com/?q=1&lang=zh) [Mail](mailto:mail@example.com)",
    "",
    "```html",
    "<img src=x onerror=alert(1)>",
    "```",
  ].join("\n"));
  assert.match(html, /<img src="images\/photo\.jpg" alt="Photo">/);
  assert.match(html, /href="https:\/\/example\.com\/\?q=1&amp;lang=zh"/);
  assert.match(html, /href="mailto:mail@example\.com"/);
  assert.match(html, /<pre><code class="language-html">&lt;img src=x onerror=alert\(1\)&gt;/);
});
