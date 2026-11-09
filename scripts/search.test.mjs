import assert from "node:assert/strict";
import test from "node:test";
import { findSearchEntries } from "../src/lib/search.mjs";

function entry(title, date, text = title) {
  return { title, date: new Date(date).toISOString(), text };
}

test("九寨沟 finds 暑假九寨行 through a contiguous Chinese phrase", () => {
  const trip = entry("暑假九寨行", "2026-11-04");
  const unrelated = entry("九月山寨和水沟", "2026-11-08");
  assert.deepEqual(findSearchEntries([unrelated, trip], "九寨沟"), [trip]);
  assert.deepEqual(findSearchEntries([unrelated, trip], "去九寨。"), [trip]);
});

test("exact terms rank ahead of newer approximate matches", () => {
  const approximate = entry("暑假九寨行", "2026-11-04");
  const exact = entry("九寨沟游览手记", "2026-04-21");
  assert.deepEqual(findSearchEntries([approximate, exact], "九寨沟"), [exact, approximate]);
});

test("short Chinese terms require an exact match", () => {
  const exact = entry("重庆之旅", "2026-04-21");
  const unrelated = entry("重阳节出游", "2026-11-04");
  assert.deepEqual(findSearchEntries([unrelated, exact], "重庆"), [exact]);
});

test("exact keywords still match indexed body text and ties use newest first", () => {
  const older = entry("部署记录", "2026-04-20", "部署记录 Git Vercel");
  const newer = entry("工具笔记", "2026-04-21", "工具笔记 Git Vercel");
  const partial = entry("Git 入门", "2026-11-04");
  assert.deepEqual(findSearchEntries([older, partial, newer], "ＧＩＴ，vercel"), [newer, older, partial]);
  assert.deepEqual(findSearchEntries([older], " \t "), []);
});
