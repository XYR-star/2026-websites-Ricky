import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

for (const collection of ["blog", "travel"]) {
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
  ["research article", { headRef: `cms/research/${slug}`, changes: [change(article("research"))] }],
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

function runCLI({ mode = "regular", invalidSha = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ricky-cms-guard-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-q");
    git("config", "user.name", "CMS Guard Test");
    git("config", "user.email", "cms-test@example.invalid");
    writeFileSync(join(directory, "README.md"), "fixture\n");
    git("add", "README.md");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const target = join(directory, article());
    mkdirSync(dirname(target), { recursive: true });
    if (mode === "symlink") symlinkSync("../../../README.md", target);
    else {
      writeFileSync(target, "---\ntitle: Test\n---\nBody\n");
      if (mode === "executable") chmodSync(target, 0o755);
    }
    git("add", ".");
    git("commit", "-qm", "article");
    const head = git("rev-parse", "HEAD");
    const eventPath = join(directory, "event.json");
    const repo = { full_name: "XYR-star/2026-websites-Ricky" };
    writeFileSync(eventPath, JSON.stringify({ pull_request: {
      base: { ref: "main", sha: base, repo },
      head: { ref: `cms/blog/${slug}`, sha: invalidSha ? "--bad-ref" : head, repo },
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

for (const mode of ["symlink", "executable"]) {
  test(`CLI rejects actual ${mode} files`, () => {
    const result = runCLI({ mode });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only add or update its own article/);
  });
}

test("CLI rejects an invalid commit reference before invoking Git diff", () => {
  const result = runCLI({ invalidSha: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid commit reference/);
});
