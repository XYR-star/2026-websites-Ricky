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

const articleCollections = config.collections.filter(({ folder }) => typeof folder === "string");
const pageCollection = config.collections.find(({ name }) => name === "pages");
const expectedPages = {
  homepage: "src/data/homepage.json", about: "src/data/about.json", now: "src/data/now.json",
  projects: "src/data/projects.json", tracks: "src/data/tracks.json", site: "src/data/site.json",
};

test("every article collection can pass the server publication boundary", () => {
  assert.deepEqual(config.collections.map(({ name }) => name).sort(), ["blog", "pages", "research", "travel"]);
  assert.deepEqual(articleCollections.map(({ name }) => name).sort(), ["blog", "research", "travel"]);
  for (const collection of articleCollections) {
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
  for (const collection of articleCollections) {
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

test("research fields match its article model and only accept safe web references", () => {
  const research = articleCollections.find(({ name }) => name === "research");
  assert.deepEqual(research.fields.map(({ name }) => name).sort(), ["body", "date", "draft", "links", "media_id", "project", "status", "summary", "title"]);
  assert.equal(research.fields.find(({ name }) => name === "summary").widget, "text");
  for (const name of ["project", "status"]) assert.equal(research.fields.find((field) => field.name === name).required, false);
  const links = research.fields.find(({ name }) => name === "links");
  assert.equal(links.widget, "list");
  assert.deepEqual(links.default, []);
  assert.deepEqual(links.fields.map(({ name }) => name), ["label", "href"]);
  const pattern = new RegExp(links.fields.find(({ name }) => name === "href").pattern[0]);
  assert.equal(pattern.test("https://example.com/paper?id=1#results"), true);
  assert.equal(pattern.test("javascript:alert(1)"), false);
  assert.equal(pattern.test("mailto:reader@example.com"), false);
});

test("editable pages are exactly the six allowed JSON files", () => {
  assert.equal(pageCollection.format, "json");
  assert.equal(pageCollection.folder, undefined);
  assert.equal(pageCollection.delete, false);
  assert.deepEqual(Object.fromEntries(pageCollection.files.map(({ name, file }) => [name, file])), expectedPages);
  assert.deepEqual(Object.fromEntries(pageCollection.files.map(({ name, preview_path }) => [name, preview_path])), {
    homepage: "/", about: "/about/", now: "/now/", projects: "/projects/", tracks: "/tracks/", site: "/",
  });
  for (const page of pageCollection.files) {
    const input = {
      headRef: `cms/pages/${page.name}`, baseRef: "main", sameRepository: true,
      changes: [{ path: page.file, status: "M", mode: "100644" }],
    };
    assert.doesNotThrow(() => validateCMSChanges(input));
    for (const other of pageCollection.files.filter((candidate) => candidate.name !== page.name)) {
      assert.throws(() => validateCMSChanges({ ...input, changes: [...input.changes, { path: other.file, status: "M", mode: "100644" }] }));
    }
    assert.throws(() => validateCMSChanges({ ...input, changes: [...input.changes, { path: "public/images/cms-trial/other.jpg", status: "A", mode: "100644" }] }));
  }
  assert.throws(() => validateCMSChanges({
    headRef: "cms/pages/arbitrary", baseRef: "main", sameRepository: true,
    changes: [{ path: "src/data/arbitrary.json", status: "A", mode: "100644" }],
  }));
});

function visitFields(fields, visitor, path = "") {
  for (const field of fields) {
    const current = path ? `${path}.${field.name}` : field.name;
    visitor(field, current);
    if (field.fields) visitFields(field.fields, visitor, current);
    if (field.field) visitFields([field.field], visitor, current);
    for (const type of field.types || []) visitFields(type.fields, visitor, `${current}[${type.name}]`);
  }
}

test("pages contain no article upload fields and site domain remains outside the editor", () => {
  for (const page of pageCollection.files) {
    visitFields(page.fields, (field, path) => {
      assert.equal(["image", "file"].includes(field.widget), false, `${page.name}.${path} must not call the article uploader`);
      assert.notEqual(field.name, "media_id");
    });
  }
  const site = pageCollection.files.find(({ name }) => name === "site");
  assert.deepEqual(site.fields.map(({ name }) => name).sort(), ["about", "description", "email", "intro", "location", "socialLinks", "title"]);
  const siteData = JSON.parse(readFileSync(new URL("../src/data/site.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(siteData, "siteUrl"), false);
});

test("homepage supports eight native block types with stable IDs and drag ordering", () => {
  const homepage = pageCollection.files.find(({ name }) => name === "homepage");
  const sections = homepage.fields.find(({ name }) => name === "sections");
  assert.equal(sections.widget, "list");
  assert.equal(sections.typeKey, "type");
  assert.deepEqual(sections.types.map(({ name }) => name).sort(), ["aboutNote", "curatedLinks", "featuredPosts", "nowSummary", "quote", "researchList", "richText", "travelList"]);
  for (const type of sections.types) {
    assert.equal(type.widget, "object");
    const id = type.fields.find(({ name }) => name === "id");
    assert.equal(id.widget, "uuid");
    assert.equal(id.prefix, "section-");
    assert.equal(id.default, undefined);
    assert.equal(type.fields.find(({ name }) => name === "enabled").default, true);
    assert.equal(type.fields.find(({ name }) => name === "order").widget, "hidden");
  }
});

test("editable link patterns permit their intended URLs and block active or malformed schemes", () => {
  let checked = 0;
  for (const page of pageCollection.files) {
    visitFields(page.fields, (field, path) => {
      if (!(field.name === "href" || field.name.endsWith("Href"))) return;
      checked++;
      assert.ok(field.pattern, `${page.name}.${path} requires a URL restriction`);
      const pattern = new RegExp(field.pattern[0]);
      assert.equal(pattern.test("https://example.com/a?b=c#d"), true);
      assert.equal(pattern.test("http://example.com"), true);
      for (const value of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<h1>x</h1>", "//example.com", "https://space here.example", "https://example.com\\evil", "https://example.com\nnext"]) {
        assert.equal(pattern.test(value), false, `${page.name}.${path} blocks ${JSON.stringify(value)}`);
      }
      if (field.name.endsWith("Href") || path.includes("curatedLinks")) {
        assert.equal(pattern.test("/blog/example"), true);
        assert.equal(pattern.test("#start-here"), true);
      }
      if (field.required === false) assert.equal(pattern.test(""), true);
    });
  }
  assert.ok(checked >= 10, "all block, hero and page links were checked");
});

function checkStoredFields(data, fields, path) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const [key, value] of Object.entries(data)) {
    if (key === "type") continue; // Native variable-list discriminator.
    assert.ok(byName.has(key), `${path}.${key} must remain editable or explicitly preserved`);
    const field = byName.get(key);
    if (field.widget === "object") checkStoredFields(value, field.fields, `${path}.${key}`);
    if (field.widget === "list" && field.types) {
      for (const item of value) {
        const type = field.types.find((candidate) => candidate.name === item.type);
        assert.ok(type, `${path}.${key}: known section type ${item.type}`);
        checkStoredFields(item, type.fields, `${path}.${key}[${item.id}]`);
      }
    } else if (field.widget === "list" && field.fields) {
      for (const [index, item] of value.entries()) checkStoredFields(item, field.fields, `${path}.${key}[${index}]`);
    }
  }
}

test("all existing JSON content fields are represented in the CMS without losing copy", () => {
  for (const page of pageCollection.files) {
    const data = JSON.parse(readFileSync(new URL(`../${page.file}`, import.meta.url), "utf8"));
    checkStoredFields(data, page.fields, page.name);
  }
  const homepage = JSON.parse(readFileSync(new URL("../src/data/homepage.json", import.meta.url), "utf8"));
  const ids = [homepage.hero.id, ...homepage.sections.map(({ id }) => id)];
  assert.equal(new Set(ids).size, ids.length, "existing anchor IDs stay unique");
});
