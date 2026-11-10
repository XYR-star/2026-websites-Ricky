import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCMSChanges } from "./check-cms-changes.mjs";

const slug = "2026-11-07-editorial-workbench";
const article = (collection = "blog") => `src/content/${collection}/${slug}.md`;
const change = (path = article(), status = "M", mode = "100644") => ({ path, status, mode });
const publication = (overrides = {}) => ({
  headRef: `cms/blog/${slug}`,
  baseRef: "main",
  sameRepository: true,
  changes: [change()],
  ...overrides,
});

for (const collection of ["blog", "travel", "research"]) {
  for (const status of ["A", "M"]) {
    test(`accepts ${status} of one ${collection} article with historical CMS images`, () => {
      assert.doesNotThrow(() => validateCMSChanges(publication({
        headRef: `cms/${collection}/${slug}`,
        changes: [change(article(collection), status), change("public/images/cms-trial/old_cover-1.JPG", "A")],
      })));
    });
  }
}

const rejected = [
  ["another article", { changes: [change(), change("src/content/blog/other.md")] }],
  ["another collection", { changes: [change(), change(article("travel"))] }],
  ["site configuration", { changes: [change(), change("public/admin/config.yml")] }],
  ["unsupported collection", { headRef: `cms/unknown/${slug}`, changes: [change("src/content/unknown/entry.md")] }],
  ["article deletion", { changes: [change(article(), "D")] }],
  ["article rename", { changes: [change(article(), "R100")] }],
  ["image deletion", { changes: [change(), change("public/images/cms-trial/old.jpg", "D")] }],
  ["executable article", { changes: [change(article(), "M", "100755")] }],
  ["symlink article", { changes: [change(article(), "M", "120000")] }],
  ["symlink image", { changes: [change(), change("public/images/cms-trial/old.jpg", "A", "120000")] }],
  ["missing article", { changes: [change("public/images/cms-trial/old.jpg")] }],
  ["no changes", { changes: [] }],
  ["missing changes", { changes: undefined }],
  ["nested historical image", { changes: [change(), change("public/images/cms-trial/sub/old.jpg")] }],
  ["unsupported historical image", { changes: [change(), change("public/images/cms-trial/old.svg")] }],
  ["foreign repository", { sameRepository: false }],
  ["missing repository", { sameRepository: undefined }],
  ["preview base", { baseRef: "decap-preview" }],
  ["wrong base", { baseRef: "release" }],
  ["missing collection", { headRef: `cms/${slug}` }],
  ["missing slug", { headRef: "cms/blog/" }],
];

for (const [label, overrides] of rejected) {
  test(`rejects ${label}`, () => {
    assert.throws(() => validateCMSChanges(publication(overrides)));
  });
}

const pages = new Map([
  ["homepage", "src/data/homepage.json"],
  ["about", "src/data/about.json"],
  ["now", "src/data/now.json"],
  ["projects", "src/data/projects.json"],
  ["tracks", "src/data/tracks.json"],
  ["site", "src/data/site.json"],
]);

for (const [name, path] of pages) {
  for (const status of ["A", "M"]) {
    test(`accepts ${status} of the fixed ${name} page JSON`, () => {
      assert.doesNotThrow(() => validateCMSChanges(publication({
        headRef: `cms/pages/${name}`, changes: [change(path, status)],
      })));
    });
  }
}

const pagePublication = (overrides = {}) => publication({
  headRef: "cms/pages/homepage", changes: [change("src/data/homepage.json")], ...overrides,
});

const rejectedPages = [
  ["other page JSON", { changes: [change("src/data/about.json")] }],
  ["second page JSON", { changes: [change("src/data/homepage.json"), change("src/data/about.json")] }],
  ["another page JSON alongside tracks", {
    headRef: "cms/pages/tracks",
    changes: [change("src/data/tracks.json"), change("src/data/homepage.json")],
  }],
  ["adjacent site configuration", { changes: [change("src/data/homepage.json"), change("src/data/config.json")] }],
  ["CMS configuration", { changes: [change("src/data/homepage.json"), change("public/admin/config.yml")] }],
  ["article alongside page", { changes: [change("src/data/homepage.json"), change()] }],
  ["historical image alongside page", { changes: [change("src/data/homepage.json"), change("public/images/cms-trial/old.jpg", "A")] }],
  ["page deletion", { changes: [change("src/data/homepage.json", "D")] }],
  ["page rename", { changes: [change("src/data/homepage.json", "R100")] }],
  ["page symlink", { changes: [change("src/data/homepage.json", "M", "120000")] }],
  ["executable page", { changes: [change("src/data/homepage.json", "M", "100755")] }],
  ["empty page diff", { changes: [] }],
  ["foreign repository page", { sameRepository: false }],
  ["wrong base page", { baseRef: "release" }],
];

for (const [label, overrides] of rejectedPages) {
  test(`rejects ${label}`, () => {
    assert.throws(() => validateCMSChanges(pagePublication(overrides)));
  });
}

for (const name of ["unknown", "homepage.json", "src/data/homepage.json", "../homepage", "constructor", "__proto__", ""]) {
  test(`rejects non-allowlisted page slug ${JSON.stringify(name)}`, () => {
    assert.throws(() => validateCMSChanges(pagePublication({ headRef: `cms/pages/${name}` })));
  });
}

test("rejects a fixed page file in an article PR", () => {
  assert.throws(() => validateCMSChanges(publication({ changes: [change(), change("src/data/homepage.json")] })));
});

for (const invalid of [".", "..", "../other", "a/b", "a\\b", ".hidden", "a..b", "a.", "a.lock", "a b", "a\u0000b", "a\u007fb", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a@{b"]) {
  test(`rejects unsafe slug ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => validateCMSChanges(publication({
      headRef: `cms/blog/${invalid}`,
      changes: [change(`src/content/blog/${invalid}.md`)],
    })));
  });
}

test("continues to skip non-CMS development PRs", () => {
  assert.doesNotThrow(() => validateCMSChanges(publication({
    headRef: "feat/editorial-workbench", sameRepository: false, changes: [change("astro.config.mjs")],
  })));
});

test("permits Unicode slugs without accepting traversal or invalid Git refs", () => {
  assert.doesNotThrow(() => validateCMSChanges(publication({
    headRef: "cms/blog/2026-写作流程", changes: [change("src/content/blog/2026-写作流程.md")],
  })));
});

const script = fileURLToPath(new URL("./check-cms-changes.mjs", import.meta.url));
const validPage = JSON.stringify({ hero: { eyebrow: "Journal", title: "Homepage fixture", id: "intro" }, sections: [] });

function runCLI({ mode = "regular", changeType = "add", invalidSha = false, page = false, pageSource, extraPath } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ricky-cms-guard-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-q");
    git("config", "user.name", "CMS Guard Test");
    git("config", "user.email", "cms-test@example.invalid");
    writeFileSync(join(directory, "README.md"), "fixture\n");
    const target = join(directory, page ? "src/data/homepage.json" : article());
    mkdirSync(dirname(target), { recursive: true });
    if (changeType !== "add") writeFileSync(target, page ? validPage : "---\ntitle: Test\n---\nOriginal body\n");
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    if (changeType === "delete") rmSync(target);
    else if (changeType === "rename") renameSync(target, join(dirname(target), "renamed.md"));
    else if (mode === "symlink") symlinkSync("../../../README.md", target);
    else {
      writeFileSync(target, page ? pageSource ?? validPage : "---\ntitle: Test\n---\nBody\n");
      if (mode === "executable") chmodSync(target, 0o755);
    }
    if (extraPath) writeFileSync(join(directory, extraPath), "unexpected file\n");
    git("add", ".");
    git("commit", "-qm", "article");
    const head = git("rev-parse", "HEAD");
    git("checkout", "--quiet", "--detach", base);
    const eventPath = join(directory, "event.json");
    const repo = { full_name: "XYR-star/2026-websites-Ricky" };
    writeFileSync(eventPath, JSON.stringify({ pull_request: {
      base: { ref: "main", sha: base, repo },
      head: { ref: page ? "cms/pages/homepage" : `cms/blog/${slug}`, sha: invalidSha ? "--bad-ref" : head, repo },
    } }));
    return spawnSync(process.execPath, [script], {
      cwd: directory,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("CLI reads Git diff and ordinary-file mode from a real repository", () => {
  const result = runCLI();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CMS content changes passed/);
});

for (const changeType of ["rename", "delete"]) {
  test(`CLI rejects an actual article ${changeType}`, () => {
    const result = runCLI({ changeType });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only add or update its own content file/);
  });
}

test("CLI rejects forbidden paths without echoing pathspecs or workflow commands", () => {
  const result = runCLI({ extraPath: ":(unknown)file\n::warning::unexpected" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only add or update its own content file/);
  assert.doesNotMatch(result.stderr + result.stdout, /::warning::unexpected/);
});

for (const mode of ["symlink", "executable"]) {
  test(`CLI rejects actual ${mode} files`, () => {
    const result = runCLI({ mode });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only add or update its own content file/);
  });
}

test("CLI permits the fixed page JSON using its file collection entry name", () => {
  const result = runCLI({ page: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CMS content changes passed/);
});

test("CLI accepts a valid page update with the base commit checked out", () => {
  const result = runCLI({ page: true, changeType: "update", pageSource: validPage.replace("Homepage fixture", "Updated homepage") });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CMS content changes passed/);
});

for (const [label, pageSource] of [
  ["invalid JSON", '{"hero":'],
  ["invalid page data", '{"title":"Homepage fixture"}'],
  ["unsafe page link", JSON.stringify({
    hero: { eyebrow: "Journal", title: "Homepage fixture", id: "intro" },
    sections: [{ id: "contents", type: "magazineContents", enabled: true, linkHref: "javascript:alert(1)" }],
  })],
]) {
  test(`CLI rejects ${label} from the PR head commit`, () => {
    const result = runCLI({ page: true, changeType: "update", pageSource });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CMS page JSON failed validation in src\/data\/homepage\.json/);
  });
}

test("CLI keeps newlines in untrusted JSON keys out of workflow command lines", () => {
  const pageSource = JSON.stringify({ "\n::warning::unexpected": true });
  const result = runCLI({ page: true, changeType: "update", pageSource });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CMS page JSON failed validation/);
  assert.doesNotMatch(result.stderr + result.stdout, /^\s*::warning::unexpected/m);
});

for (const mode of ["symlink", "executable"]) {
  test(`CLI rejects an actual ${mode} page JSON`, () => {
    const result = runCLI({ mode, page: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only add or update its own content file/);
  });
}

test("CLI rejects an invalid commit reference before invoking Git diff", () => {
  const result = runCLI({ invalidSha: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid commit reference/);
});
