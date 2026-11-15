import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import type { Payload, PayloadRequest } from 'payload'
import configPromise from '../src/payload.config'
import { getContentEditorConfig } from '../src/lib/content-serialization'
import { PAGE_NAMES } from '../src/lib/page-data'
import { applyFrozenImport, importedPostData, importMode, preflightFrozenImport } from '../scripts/import-v1'
import { allLegacyMedia, assertMarkdownRoundTrip, legacyMediaReferences, parseFrozenArticle, readFrozenV1Source, V1_COMMIT } from '../scripts/v1-source'

// Real configuration/editor and immutable public v1 content, without creating
// Payload, a database connection, a migration, or a server.
const source = readFrozenV1Source()
const editor = await getContentEditorConfig(await configPromise)

test('migration is an offline preflight unless --apply is explicitly requested', () => {
  assert.equal(importMode([]), 'dry-run')
  assert.equal(importMode(['--dry-run']), 'dry-run')
  assert.equal(importMode(['--apply']), 'apply')
  assert.equal(importMode(['--help']), 'help')
  assert.throws(() => importMode(['--dry-run', '--apply']))
  assert.throws(() => importMode(['--source', '/local/unpublished']))
})

test('the source is the exact frozen production commit with original routes and images', () => {
  assert.equal(source.commit, V1_COMMIT)
  assert.equal(source.tag, 'v1.0.0')
  assert.equal(source.articles.length, 6)
  assert.deepEqual(Object.keys(source.pages).sort(), [...PAGE_NAMES].sort())
  assert.ok(source.articles.some(article => article.slug === '2026-11-03-暑假九寨行'))
  const legacy = source.articles.find(article => article.slug === '2026-04-21-120-swu')
  assert.equal(legacy?.cover, '/images/travel/120_swu/1776737551118-6000ce60.jpg')
  assert.equal(allLegacyMedia(source).length, 3)
  assert.throws(() => readFrozenV1Source({ expectedCommit: '0'.repeat(40) }), /冻结的正式提交/)
})

test('every frozen article and page passes lossless preflight before any database is opened', async () => {
  assert.deepEqual(await preflightFrozenImport(source, editor), {
    articleCount: 6, pageCount: 6, mediaCount: 3, markdownRoundTrips: 6,
  })
})

test('preflight rejects changed prose, code, lists, links and image metadata', () => {
  for (const [before, after] of [
    ['正文内容。', '正文被改变。'],
    ['```bash\nprintf "$value"\n```', '```bash\nprintf value\n```'],
    ['- 第一项\n- 第二项', '- 第一项'],
    ['[来源](https://example.com/a)', '[来源](https://example.com/b)'],
    ['![原说明](/images/photo.jpg "标题")', '![改说明](/images/photo.jpg "标题")'],
  ]) assert.throws(() => assertMarkdownRoundTrip(before, after, 'blog/test'), /往返改变/)
  assert.doesNotThrow(() => assertMarkdownRoundTrip('正文 **加粗**。', '正文 __加粗__。', 'blog/test'))
})

test('only actual trusted legacy image nodes enter the media inventory', () => {
  const markdown = '```md\n![示例](https://untrusted.example/code.jpg)\n```\n\n![湖水](/images/photo.jpg)'
  assert.deepEqual(legacyMediaReferences(markdown), [{ url: '/images/photo.jpg', alt: '湖水', title: '' }])
  assert.throws(() => legacyMediaReferences('![不可导入](https://untrusted.example/photo.jpg)'), /受信任/)
  assert.throws(() => parseFrozenArticle('src/content/blog/unsafe.md', '---\ntitle: 标题\ndate: 2026-11-14\ndescription: 简介\ndraft: "false"\n---\n正文'), /draft 标记/)
})

function fakeStore() {
  const calls: Array<{ method: string; args: any }> = []
  const media = new Map<string, any>()
  const posts = new Map<string, any>()
  const pages = new Map<string, any>()
  let serial = 100
  const api = {
    find: async (args: any) => {
      calls.push({ method: 'find', args })
      const found = args.collection === 'media'
        ? media.get(args.where.or[0].originalUrl.equals)
        : posts.get(args.where.routeKey.equals)
      return { docs: found ? [found] : [], totalDocs: found ? 1 : 0 }
    },
    create: async (args: any) => {
      calls.push({ method: 'create', args })
      const doc = { ...args.data, id: serial++, createdAt: '2026-11-14T00:00:00.000Z' }
      if (args.collection === 'media') media.set(doc.originalUrl, doc)
      else posts.set(doc.routeKey, doc)
      return doc
    },
    findGlobal: async (args: any) => {
      calls.push({ method: 'findGlobal', args })
      return pages.get(args.slug) || {}
    },
    updateGlobal: async (args: any) => {
      calls.push({ method: 'updateGlobal', args })
      const doc = { ...args.data, id: serial++, updatedAt: '2026-11-14T00:00:00.000Z' }
      pages.set(args.slug, doc)
      return doc
    },
  }
  return { calls, media, posts, pages, api: api as unknown as Payload }
}

test('import preserves routes, creates only public image metadata and is safe to retry without overwriting edits', async () => {
  const store = fakeStore()
  const req = { user: { id: 1, collection: 'users', role: 'admin', email: 'owner@example.com' } } as unknown as PayloadRequest
  const first = await applyFrozenImport(store.api, req, source, editor)
  assert.deepEqual(first, {
    posts: { created: 6, skipped: 0 }, pages: { created: 6, skipped: 0 }, media: { created: 3, skipped: 0 }, imagesUploaded: 0, deploysTriggered: 0,
  })
  for (const article of source.articles) {
    const actual = store.posts.get(article.routeKey)
    assert.equal(actual.slug, article.slug)
    assert.equal(actual.media_id, article.media_id)
    assert.equal(actual.legacyCoverUrl, article.cover)
    assert.equal(actual._status, article.draft ? 'draft' : 'published')
  }
  const mediaCreates = store.calls.filter(call => call.method === 'create' && call.args.collection === 'media')
  assert.equal(mediaCreates.length, 3)
  assert.ok(mediaCreates.every(call => call.args.overrideAccess === true && call.args.context.importV1 === true))
  assert.ok(mediaCreates.every(call => call.args.data.publicUrl === call.args.data.originalUrl && call.args.data.mimeType === 'image/jpeg'))
  assert.ok(mediaCreates.every(call => !call.args.file && !call.args.filePath && !call.args.data.filename))
  assert.ok(store.calls.filter(call => !(call.method === 'create' && call.args.collection === 'media')).every(call => call.args.overrideAccess === false && call.args.req === req))
  assert.ok(store.calls.filter(call => call.method === 'create' || call.method === 'updateGlobal').every(call => call.args.context.importV1 === true && call.args.context.suppressDeploy === true))

  const firstPost = store.posts.values().next().value
  firstPost.title = '用户已经继续编辑'
  const snapshots = JSON.stringify({ posts: [...store.posts], pages: [...store.pages], media: [...store.media] })
  store.calls.length = 0
  assert.deepEqual(await applyFrozenImport(store.api, req, source, editor), {
    posts: { created: 0, skipped: 6 }, pages: { created: 0, skipped: 6 }, media: { created: 0, skipped: 3 }, imagesUploaded: 0, deploysTriggered: 0,
  })
  assert.equal(JSON.stringify({ posts: [...store.posts], pages: [...store.pages], media: [...store.media] }), snapshots)
  assert.ok(store.calls.every(call => call.method === 'find' || call.method === 'findGlobal'))
})

test('draft import data remains a draft while preserving its original address', () => {
  const body = { root: { type: 'root', version: 1, children: [], direction: null, format: '' as const, indent: 0 } }
  const data = importedPostData({ ...source.articles[0], draft: true }, body)
  assert.equal(data._status, 'draft')
  assert.equal(data.slug, source.articles[0].slug)
})

test('the actual dry-run CLI succeeds with no database or owner credentials configured', () => {
  const env = { ...process.env }
  for (const key of ['DATABASE_URL', 'CMS_ADMIN_EMAIL', 'CMS_ADMIN_PASSWORD', 'CMS_READ_TOKEN', 'PAYLOAD_SECRET', 'CMS_URL']) delete env[key]
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-v1.ts', '--dry-run'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', env, timeout: 30_000,
  })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.databaseAccessed, false)
  assert.equal(output.sourceFilesChanged, false)
  assert.equal(output.source.commit, V1_COMMIT)
  assert.equal(output.checked.markdownRoundTrips, 6)
})
