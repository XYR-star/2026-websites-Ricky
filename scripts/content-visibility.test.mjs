import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadPureTS(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const content = await loadPureTS("../src/lib/content.ts");
const homepage = await loadPureTS("../src/lib/homepage.ts");

test("research lists exclude drafts and sort published entries newest first", () => {
  const entries = [
    { slug: "old", data: { date: new Date("2025-01-01"), draft: false } },
    { slug: "private", data: { date: new Date("2027-01-01"), draft: true } },
    { slug: "new", data: { date: new Date("2026-01-01") } },
  ];
  assert.deepEqual(content.getVisibleResearchEntries(entries).map((entry) => entry.slug), ["new", "old"]);
  assert.deepEqual(entries.map((entry) => entry.slug), ["old", "private", "new"]);
});

test("homepage follows drag order even when legacy order values disagree", () => {
  const sections = [
    { id: "first", enabled: true, order: 10 },
    { id: "hidden", enabled: false, order: 0 },
    { id: "second", enabled: true, order: 1 },
  ];
  assert.deepEqual(homepage.getOrderedHomepageSections(sections).map((section) => section.id), ["first", "second"]);
  assert.equal(sections.length, 3);
});

test("homepage supports new sections without a legacy order field", () => {
  const section = { id: "new", enabled: true };
  assert.deepEqual(homepage.getOrderedHomepageSections([section]), [section]);
});

test("homepage respects the position and visibility of magazine sections", () => {
  const hero = { id: "home-hero" };
  const cover = { id: "cover", type: "magazineCover", enabled: false };
  const contents = { id: "contents", type: "magazineContents", enabled: true };
  const intro = { id: "intro", type: "homeIntro", enabled: true };
  assert.deepEqual(homepage.getHomepageLayout({ hero, sections: [intro, cover, contents] }), [intro, contents]);
  assert.deepEqual(homepage.getHomepageLayout({ layoutVersion: 1, hero, sections: [] }), []);
  assert.deepEqual(homepage.getHomepageLayout({ hero, sections: [] }).map(({ type }) => type),
    ["magazineCover", "magazineContents", "homeIntro"]);
});
