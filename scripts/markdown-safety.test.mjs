import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import config from "../astro.config.mjs";

const markdown = config.markdown.processor
  ? await config.markdown.processor.createRenderer(config.markdown)
  : await createMarkdownProcessor(config.markdown);

test("published Markdown cannot emit raw executable HTML or unsafe link destinations", async () => {
  const { code } = await markdown.render([
    '<script>window.markdownAudit = 1</script>',
    '<img src="/missing.jpg" onerror="window.markdownAudit = 2">',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '[脚本链接](javascript:alert%281%29)',
    '[引用链接][unsafe]',
    '[unsafe]: JaVaScRiPt:alert%281%29',
    '![图片说明](data:text/html;base64,PHNjcmlwdD4=)',
  ].join("\n\n"));

  assert.doesNotMatch(code, /<script\b|<img\b|<iframe\b|onerror=|javascript:|data:text\/html/i);
  assert.match(code, /<span>脚本链接<\/span>/);
  assert.match(code, /<span>引用链接<\/span>/);
  assert.match(code, /图片说明/);
});

test("safe Markdown retains links, image URLs, tables, and light/dark syntax highlighting", async () => {
  const { code } = await markdown.render([
    '[外部文档](https://example.com/guide)',
    '[站内页面](/blog/#guide)',
    '[相对链接](../guide)',
    '[邮件](mailto:reader@example.com)',
    '![R2 原图](https://assets.heyrickishere.com/cms/original.jpg "图片说明")',
    '![旧素材](images/cms-trial/cover.jpg)',
    '| 项目 | 说明 |\n| --- | --- |\n| 图片 | 原图 |',
    '```js\nconsole.log("<script>");\n```',
  ].join("\n\n"));

  for (const href of ['https://example.com/guide', '/blog/#guide', '../guide', 'mailto:reader@example.com']) {
    assert.ok(code.includes(`href="${href}"`));
  }
  assert.ok(code.includes('src="https://assets.heyrickishere.com/cms/original.jpg"'));
  assert.ok(code.includes('src="/images/cms-trial/cover.jpg"'));
  const originalImage = code.match(/<img\b[^>]*src="https:\/\/assets\.heyrickishere\.com\/cms\/original\.jpg"[^>]*>/)?.[0];
  assert.ok(originalImage);
  for (const attribute of ['title="图片说明"', 'loading="lazy"', 'decoding="async"']) {
    assert.ok(originalImage.includes(attribute));
  }
  assert.match(code, /<table>/);
  for (const name of ["astro-code-themes", "github-light", "github-dark"]) {
    assert.ok(code.includes(name));
  }
  assert.match(code, /--shiki-dark-bg:/);
  assert.doesNotMatch(code, /<script\b/);
});

test("adjacent Markdown images remain separate captioned paragraphs for the article gallery", async () => {
  const { code } = await markdown.render([
    '![第一张](https://assets.heyrickishere.com/cms/first.jpg "第一张照片说明")',
    '![第二张](https://assets.heyrickishere.com/cms/second.jpg "第二张照片说明")',
  ].join("\n\n"));

  const images = [...code.matchAll(/<p>\s*(<img\b[^>]*>)\s*<\/p>/g)].map((match) => match[1]);
  assert.equal(images.length, 2);
  assert.ok(images[0].includes('src="https://assets.heyrickishere.com/cms/first.jpg"'));
  assert.ok(images[0].includes('title="第一张照片说明"'));
  assert.ok(images[1].includes('src="https://assets.heyrickishere.com/cms/second.jpg"'));
  assert.ok(images[1].includes('title="第二张照片说明"'));
});
