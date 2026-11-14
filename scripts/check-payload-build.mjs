/**
 * Exercise the Astro adapter against an authenticated HTTP test fixture.
 * This proves the build contract, not a live Payload/Neon installation.
 * Fixtures contain only the already-published v1 Markdown and page JSON.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import matter from "gray-matter";
import { payloadPageNames, validatePayloadSiteContent } from "../src/lib/payload-content.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const astroPackage = JSON.parse(await readFile(join(project, "node_modules/astro/package.json"), "utf8"));
const astroBin = join(project, "node_modules/astro", astroPackage.bin.astro);
const workspace = await mkdtemp(join(tmpdir(), "ricky-payload-build-check-"));
const token = randomBytes(32).toString("base64url");
const fixture = { schemaVersion: 1, articles: {}, pages: {} };
const fields = {
  blog: ["title", "description", "date", "tags", "cover", "media_id"],
  research: ["title", "summary", "date", "project", "status", "links", "media_id"],
  travel: ["title", "description", "date", "cover", "media_id"],
};
for (const collection of Object.keys(fields)) {
  const directory = join(project, "src/content", collection);
  fixture.articles[collection] = [];
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue;
    const { data, content } = matter(await readFile(join(directory, file), "utf8"));
    if (data.draft === true) continue;
    const article = { _status: "published", slug: file.slice(0, -3), bodyMarkdown: content };
    for (const field of fields[collection]) if (data[field] !== undefined) article[field] = data[field];
    if (article.date instanceof Date) article.date = article.date.toISOString();
    fixture.articles[collection].push(article);
  }
}
for (const name of payloadPageNames) fixture.pages[name] = JSON.parse(await readFile(join(project, "src/data", `${name}.json`), "utf8"));
validatePayloadSiteContent(fixture);

let mode = "published";
let requests = 0;
let wrongRequests = 0;
const server = createServer((request, response) => {
  requests++;
  if (request.url !== "/api/site-content" || request.headers.authorization !== `Bearer ${token}`) {
    wrongRequests++;
    response.writeHead(401).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (mode === "unavailable") {
    response.writeHead(503).end(JSON.stringify({ error: "fixture unavailable" }));
  } else if (mode === "draft") {
    const value = structuredClone(fixture);
    value.articles.blog[0]._status = "draft";
    response.end(JSON.stringify(value));
  } else response.end(JSON.stringify(fixture));
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const env = {
  ...process.env,
  CONTENT_SOURCE: "payload",
  CMS_URL: `http://127.0.0.1:${address.port}`,
  CMS_READ_TOKEN: token,
  ASTRO_TELEMETRY_DISABLED: "1",
  NO_COLOR: "1",
};

function build(output) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroBin, "build", "--force", "--outDir", output], {
      cwd: project, env, stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (data) => { log += data; });
    child.stderr.on("data", (data) => { log += data; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, log }));
  });
}

async function assertNoTokenLeak(directory) {
  let checkedFiles = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkedFiles += await assertNoTokenLeak(path);
    else if (entry.isFile()) {
      assert.equal((await readFile(path)).includes(Buffer.from(token)), false,
        `The server-only content token leaked into a public build file: ${path}`);
      checkedFiles++;
    }
  }
  return checkedFiles;
}

try {
  const output = join(workspace, "published");
  const successful = await build(output);
  assert.equal(successful.code, 0, successful.log);
  assert.equal(wrongRequests, 0, "The build must authenticate its only content request.");
  assert.equal(requests, 1, "Collections and page configuration must share one response per build.");

  for (const [collection, articles] of Object.entries(fixture.articles)) {
    for (const article of articles) {
      const html = await readFile(join(output, collection, article.slug, "index.html"), "utf8");
      assert.ok(html.includes(article.title), `Missing article title for ${collection}/${article.slug}`);
      if (article.cover) assert.ok(html.includes(article.cover), `Cover URL changed for ${article.slug}`);
    }
  }
  const search = await readFile(join(output, "search/index.html"), "utf8");
  const index = JSON.parse(search.match(/<script type="application\/json" id="site-search-index">([\s\S]*?)<\/script>/)?.[1] ?? "null");
  assert.ok(Array.isArray(index));
  assert.equal(index.length, Object.values(fixture.articles).reduce((count, list) => count + list.length, 0));
  assert.ok(index.some((entry) => entry.slug === "2026-11-03-暑假九寨行"));
  const checkedPublicFiles = await assertNoTokenLeak(output);

  const results = [{ mode, exitCode: 0, authenticatedRequests: requests, articleCount: index.length, tokenLeakChecks: checkedPublicFiles }];
  for (const failureMode of ["unavailable", "draft"]) {
    mode = failureMode;
    requests = 0;
    const failedOutput = join(workspace, failureMode);
    const failed = await build(failedOutput);
    assert.notEqual(failed.code, 0, `The ${failureMode} response must stop the build.`);
    assert.equal(requests, 1);
    assert.equal(await stat(join(failedOutput, "index.html")).then(() => true, () => false), false,
      "A failed CMS read must not produce a homepage from local fallback content.");
    assert.ok(!failed.log.includes(token));
    results.push({ mode, exitCode: failed.code, authenticatedRequests: requests, publishedHomepage: false });
  }
  console.log(JSON.stringify({ fixtureOnly: true, liveDatabaseVerified: false, results, temporaryOutput: workspace }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections();
}
