import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import matter from "gray-matter";
import { validateCMSChanges } from "./check-cms-changes.mjs";

const config = matter(`---\n${readFileSync(new URL("../public/admin/config.yml", import.meta.url), "utf8")}\n---`).data;

test("production CMS keeps the authenticated backend and editorial workflow", () => {
  assert.equal(config.backend.name, "turbo-github");
  assert.equal(config.backend.branch, "main");
  assert.equal(config.backend.cms_label_prefix, "cms/");
  assert.equal(config.publish_mode, "editorial_workflow");
  assert.equal(config.site_url, "https://www.heyrickishere.com");
  assert.equal(config.media_library.name, "ricky-r2");
  assert.equal(config.media_library.config.editor_mode, "production");
});

test("every offered collection can pass the server publication boundary", () => {
  assert.deepEqual(config.collections.map(({ name }) => name).sort(), ["blog", "travel"]);
  for (const collection of config.collections) {
    const slug = "2026-11-07-验证文章";
    assert.equal(collection.folder, `src/content/${collection.name}`);
    assert.doesNotThrow(() => validateCMSChanges({
      headRef: `cms/${collection.name}/${slug}`,
      baseRef: "main",
      sameRepository: true,
      changes: [{ path: `${collection.folder}/${slug}.md`, status: "A", mode: "100644" }],
    }));
  }
});

test("new content preserves the Markdown contract and stable R2 directory field", () => {
  for (const collection of config.collections) {
    const field = (name) => collection.fields.find((item) => item.name === name);
    assert.equal(field("body").widget, "markdown");
    assert.equal(field("media_id").widget, "uuid");
    assert.equal(field("media_id").default, undefined);
    assert.equal(field("draft").default, false);
    assert.equal(field("draft").widget, "hidden");
    assert.equal(collection.delete, false);
    assert.equal(collection.preview_path, `${collection.name}/{{slug}}/`);
    // Decap's year/month/day variables convert local midnight to UTC and can shift the day.
    assert.equal(collection.slug, "{{date | date('YYYY-MM-DD')}}-{{slug}}");
    assert.equal(collection.summary, "{{date | date('YYYY-MM-DD')}} · {{title}}");
    assert.equal(new RegExp(collection.view_groups[0].pattern).exec("2026-11-07")?.[0], "2026");
    assert.deepEqual(collection.sortable_fields.find((item) => item.field === "date"), {
      field: "date", label: "日期", default_sort: "desc",
    });
  }
  const blog = config.collections.find(({ name }) => name === "blog");
  assert.equal(blog.fields.find(({ name }) => name === "cover").required, false);
  assert.equal(blog.fields.find(({ name }) => name === "tags").widget, "list");
});
