import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { buildConfig } from 'payload'
import { marked } from 'marked'
import { Posts } from '../src/collections/Posts.js'
import { extractLegacyCodeBlocks, getContentEditorConfig, importLegacyMarkdown, serializeContentBody } from '../src/lib/content-serialization.js'
import { buildSiteContent, siteContentEndpoint } from '../src/endpoints/siteContent.js'
import { isPublishedContentRead } from '../src/access/content.js'
import { importPageData, PAGE_NAMES } from '../src/lib/page-data.js'

// Config sanitization exercises the real editor without initializing Payload,
// connecting to Postgres, running schema migrations, or starting a server.
const config = await buildConfig({
  secret: 'unit-only-config-sanitization-not-a-live-secret-00000000',
  db: postgresAdapter({ pool: { connectionString: 'postgres://unused:unused@localhost/unused' }, push: false }),
  collections: [
    { slug: 'users', auth: true, fields: [{ name: 'role', type: 'text' }] },
    { slug: 'media', upload: { disableLocalStorage: true, filesRequiredOnCreate: false }, fields: [{ name: 'alt', type: 'text' }, { name: 'publicUrl', type: 'text' }] },
    Posts,
  ],
})
const editor = await getContentEditorConfig(config)

function semanticSummary(markdown: string) {
  const summary: { links: unknown[]; images: unknown[]; headings: unknown[]; code: unknown[]; tables: unknown[]; text: string[] } = { links: [], images: [], headings: [], code: [], tables: [], text: [] }
  const plain = (tokens: any[]): string => tokens.map(token => token.tokens ? plain(token.tokens) : token.text ?? '').join('').replace(/\s+/g, ' ').trim()
  marked.walkTokens(marked.lexer(markdown), (token: any) => {
    if (token.type === 'link') summary.links.push([token.href, token.title ?? null, plain(token.tokens ?? [])])
    if (token.type === 'image') summary.images.push([token.href, token.title ?? null, token.text])
    if (token.type === 'heading') summary.headings.push([token.depth, plain(token.tokens ?? [])])
    if (token.type === 'code') summary.code.push([token.lang || 'text', token.text])
    if (token.type === 'table') summary.tables.push({ header: token.header.map((cell: any) => plain(cell.tokens)), rows: token.rows.map((row: any[]) => row.map(cell => plain(cell.tokens))) })
    if ((token.type === 'text' && !token.tokens) || token.type === 'codespan' || token.type === 'escape') summary.text.push(String(token.text).replace(/\s+/g, ' ').trim())
  })
  // Rich text canonicalizes boundaries around inline formatting; all prose must
  // still survive when the tokens are read as one normalized text stream.
  return { ...summary, text: summary.text.join('').replace(/\s+/g, '') }
}

test('native editor round trip preserves formatted writing, image alt/caption, code and a table', async () => {
  const url = 'https://assets.heyrickishere.com/cms/photo.jpg'
  const source = '# 中文标题\n\n一段 **加粗** 和 `inline`。\n\n![湖水](' + url + ' "照片说明")\n\n```bash\nprintf "hello"\n```\n\n| 名称 | 内容 |\n| --- | --- |\n| 草稿 | 私有 |'
  const media = { id: 42, publicUrl: url, alt: '备用说明' }
  const body = await importLegacyMarkdown(source, new Map([[url, media]]), editor)
  const output = await serializeContentBody(body, editor, async () => media)
  assert.match(output, /^# 中文标题/m)
  assert.match(output, /\*\*加粗\*\*/)
  assert.match(output, /`inline`/)
  assert.ok(output.includes(`![湖水](${url} "照片说明")`))
  assert.ok(output.includes('```bash\nprintf "hello"\n```'))
  assert.match(output, /\| 名称 \| 内容 \|/)
  assert.match(output, /\| 草稿 \| 私有 \|/)
  assert.equal(body.root.children.some((node: any) => node.type === 'upload'), true)
  assert.equal(body.root.children.some((node: any) => node.type === 'block' && node.fields.blockType === 'Code'), true)
  assert.equal(body.root.children.some((node: any) => node.type === 'table'), true)
})

test('private media cannot be serialized, including private document download URLs', async () => {
  const url = 'https://assets.heyrickishere.com/cms/photo.jpg'
  const body = await importLegacyMarkdown(`![湖水](${url})`, { [url]: 42 }, editor)
  await assert.rejects(serializeContentBody(body, editor, async () => ({ id: 42, originalUrl: 'https://cms.example/api/media/file/private.jpg' })), /公开素材/)
})

for (const type of ['blog', 'travel', 'research']) {
  const base = new URL(`../../src/content/${type}/`, import.meta.url)
  for (const file of (await readdir(base)).filter(name => name.endsWith('.md'))) test(`v1 ${type}/${file}: all fenced code and real image references survive import`, async () => {
    const raw = await readFile(new URL(file, base), 'utf8')
    const source = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    const oldCode = extractLegacyCodeBlocks(source)
    const urls = [...oldCode.markdown.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1])
    const media = new Map(urls.map((url, index) => [url, { id: index + 1, publicUrl: url }]))
    const body = await importLegacyMarkdown(source, media, editor)
    const output = await serializeContentBody(body, editor, async ref => {
      const id = typeof ref === 'object' ? ref.id : ref
      const doc = [...media.values()].find(value => value.id === id)
      if (!doc) throw new Error('Unknown imported media')
      return doc
    })
    for (const block of oldCode.blocks.values()) assert.ok(output.includes(block.code), `${file}: code changed`)
    for (const url of urls) assert.ok(output.includes(url), `${file}: image lost`)
    assert.equal(extractLegacyCodeBlocks(output).blocks.size, oldCode.blocks.size, `${file}: code block count changed`)
    assert.deepEqual(semanticSummary(output), semanticSummary(source), `${file}: Markdown semantics changed`)
    assert.ok(output.length > source.length * 0.8, `${file}: imported content was unexpectedly shortened`)
  })
}

async function exportFixture(overrides: Record<string, unknown> = {}) {
  const body = await importLegacyMarkdown('# 已发布正文\n\n内容。', {}, editor)
  const doc = { id: 9, type: 'blog', slug: '2026-11-14-中文地址', title: '公开文章', description: '简介', date: '2026-11-14T00:00:00.000Z', _status: 'published', visibility: 'public', body, tags: [{ id: 'internal', tag: '测试' }], createdAt: 'private metadata', ...overrides }
  const pages = Object.fromEntries(await Promise.all(PAGE_NAMES.map(async name => [name, importPageData(name, JSON.parse(await readFile(new URL(`../../src/data/${name}.json`, import.meta.url), 'utf8')))])))
  const calls: any[] = []
  const req: any = {
    user: null, context: {}, query: { draft: true, depth: 99 }, headers: new Headers(),
    payload: {
      config,
      logger: { error: () => {} },
      find: async (args: any) => {
        calls.push(args)
        assert.equal(isPublishedContentRead(req), true)
        assert.equal(args.overrideAccess, false)
        assert.equal(args.draft, false)
        assert.equal(args.depth, 0)
        return { docs: [doc], hasNextPage: false }
      },
      findGlobal: async (args: any) => {
        calls.push(args)
        assert.equal(isPublishedContentRead(req), true)
        assert.equal(args.overrideAccess, false)
        assert.equal(args.draft, false)
        return { ...pages[args.slug], _status: 'published', id: 1, createdAt: 'internal' }
      },
    },
  }
  return { req, calls }
}

test('site export ignores caller draft query and emits only the frontend contract', async () => {
  const { req, calls } = await exportFixture()
  const data: any = await buildSiteContent(req)
  assert.equal(data.articles.blog.length, 1)
  assert.equal(data.articles.blog[0].slug, '2026-11-14-中文地址')
  assert.equal(data.articles.blog[0].bodyMarkdown, '# 已发布正文\n\n内容。')
  for (const field of ['id', 'visibility', 'createdAt', 'updatedAt', 'body']) assert.equal(field in data.articles.blog[0], false)
  assert.deepEqual(Object.keys(data.pages).sort(), [...PAGE_NAMES].sort())
  assert.equal(calls.length, 7)
  assert.equal(isPublishedContentRead(req), false)
})

test('a draft or private record returned by a faulty query aborts export', async () => {
  for (const override of [{ _status: 'draft' }, { visibility: 'private' }]) {
    const { req } = await exportFixture(override)
    await assert.rejects(buildSiteContent(req), /非公开版本/)
    assert.equal(isPublishedContentRead(req), false)
  }
})

test('endpoint rejects unauthorized requests without reading data and returns no private errors', async () => {
  const before = process.env.CMS_READ_TOKEN
  process.env.CMS_READ_TOKEN = 'unit-read-token-'.repeat(4)
  try {
    const { req, calls } = await exportFixture()
    let response = await siteContentEndpoint.handler(req)
    assert.equal(response.status, 401)
    assert.equal(calls.length, 0)
    req.headers.set('authorization', `Bearer ${process.env.CMS_READ_TOKEN}`)
    req.payload.find = async () => { throw new Error('postgres://private-password@db/secret') }
    response = await siteContentEndpoint.handler(req)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.doesNotMatch(await response.text(), /private-password|postgres:/)
    assert.equal(isPublishedContentRead(req), false)
  } finally {
    if (before === undefined) delete process.env.CMS_READ_TOKEN
    else process.env.CMS_READ_TOKEN = before
  }
})
