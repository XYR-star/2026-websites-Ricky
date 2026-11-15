import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { retireLegacyAdmin } from "./retire-legacy-admin.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ricky-admin-retirement-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const output = path.join(project, "dist");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "index.html"), "published site");
  return { root, project, output, dir: pathToFileURL(`${output}/`) };
}

test("Payload builds remove both copied v1 editors and generated admin endpoints, preserving articles and assets", async t => {
  const { project, output, dir } = await fixture(t);
  for (const name of ["admin", "cms-trial", "images", "blog"]) {
    await mkdir(path.join(output, name));
    await writeFile(path.join(output, name, "keep-or-remove.txt"), name);
  }
  await writeFile(path.join(output, "admin", "data-validation.js"), "old generated endpoint");
  assert.deepEqual(await retireLegacyAdmin({ dir, projectRoot: project, contentSource: "payload" }), { removed: ["admin", "cms-trial"] });
  for (const name of ["admin", "cms-trial"]) await assert.rejects(stat(path.join(output, name)), { code: "ENOENT" });
  for (const name of ["images", "blog"]) assert.equal(await readFile(path.join(output, name, "keep-or-remove.txt"), "utf8"), name);
  assert.equal(await readFile(path.join(output, "index.html"), "utf8"), "published site");
});

test("Legacy builds leave v1 editors untouched", async t => {
  const { project, output, dir } = await fixture(t);
  await mkdir(path.join(output, "admin"));
  await writeFile(path.join(output, "admin", "index.html"), "v1 recovery editor");
  assert.deepEqual(await retireLegacyAdmin({ dir, projectRoot: project, contentSource: "legacy" }), { removed: [] });
  assert.equal(await readFile(path.join(output, "admin", "index.html"), "utf8"), "v1 recovery editor");
});

test("Output symlinks, non-file URLs, missing output, and source roots cannot become deletion targets", async t => {
  const { root, project, output } = await fixture(t);
  const options = { projectRoot: project, contentSource: "payload" };
  await symlink(output, path.join(root, "alias"), "dir");
  await assert.rejects(retireLegacyAdmin({ ...options, dir: pathToFileURL(`${root}/alias/`) }), /real output directory/);
  await assert.rejects(retireLegacyAdmin({ ...options, dir: new URL("https://example.com/dist/") }), /file build-directory/);
  await assert.rejects(retireLegacyAdmin({ ...options, dir: pathToFileURL(`${root}/missing/`) }), { code: "ENOENT" });
  for (const dir of [project, root, path.parse(root).root]) {
    await assert.rejects(retireLegacyAdmin({ ...options, dir: pathToFileURL(`${dir}/`) }), /cannot target the project or an ancestor/);
  }
  assert.equal(await readFile(path.join(output, "index.html"), "utf8"), "published site");
});

test("A symlink at an old editor directory is removed without touching its external target", async t => {
  const { root, project, output, dir } = await fixture(t);
  const external = path.join(root, "external");
  await mkdir(external);
  await writeFile(path.join(external, "private.txt"), "must survive");
  await symlink(external, path.join(output, "admin"), "dir");
  await retireLegacyAdmin({ dir, projectRoot: project, contentSource: "payload" });
  assert.equal(await readFile(path.join(external, "private.txt"), "utf8"), "must survive");
  await assert.rejects(stat(path.join(output, "admin")), { code: "ENOENT" });
});

test("Cleanup refuses an incomplete build or an unknown source before removing editor files", async t => {
  const { project, output, dir } = await fixture(t);
  await mkdir(path.join(output, "admin"));
  await writeFile(path.join(output, "admin", "index.html"), "still present");
  await rm(path.join(output, "index.html"));
  await assert.rejects(retireLegacyAdmin({ dir, projectRoot: project, contentSource: "payload" }), { code: "ENOENT" });
  await assert.rejects(retireLegacyAdmin({ dir, projectRoot: project, contentSource: "unconfigured" }), /Unknown content source/);
  assert.equal(await readFile(path.join(output, "admin", "index.html"), "utf8"), "still present");
});

test("Old editor URLs redirect to the new CMS root instead of carrying incompatible v1 paths", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  for (const source of ["/admin", "/admin/:path*", "/cms-trial", "/cms-trial/:path*"]) {
    const rule = config.redirects.find(rule => rule.source === source);
    assert.ok(rule);
    assert.equal(rule.destination, "https://ricky-cms-v2.vercel.app/admin");
    assert.equal(rule.permanent, false);
  }
  const status = config.headers.find(rule => rule.source === "/.well-known/cms-status.json");
  assert.equal(status.headers.find(header => header.key === "Cache-Control")?.value, "no-store");
  assert.equal(status.headers.find(header => header.key === "X-Robots-Tag")?.value, "noindex, nofollow");
  assert.equal(status.headers.find(header => header.key === "X-Content-Type-Options")?.value, "nosniff");
});
