import assert from 'node:assert/strict'
import test from 'node:test'
import { articleKey, buildContentManifest, contentFingerprint, manifestMatches, MAX_MANIFEST_BYTES, publicPageNames, validContentBinding, validateContentManifest } from '../src/lib/content-fingerprint.js'
import { checkPublication, checkPublicContent, publicationManifestURL } from '../src/endpoints/checkPublication.js'
import { notifyPostPublished, preparePostMedia, notifyGlobalPublished } from '../src/hooks/publishing.js'
import { exportPost } from '../src/endpoints/siteContent.js'
import { getContentEditorConfig, importLegacyMarkdown } from '../src/lib/content-serialization.js'
import { exportPageData } from '../src/lib/page-data.js'
import pendingConfig from '../src/payload.config.js'

const config = await pendingConfig
const editor = await getContentEditorConfig(config)
const publicArticle = { _status: 'published', slug: '2026-11-14-中文', title: '公开标题', date: '2026-11-14', bodyMarkdown: '正文不能出现在manifest中', description: '简介' }
const pages = Object.fromEntries(publicPageNames.map(name => [name, { title: name }]))
const manifest = () => buildContentManifest({ articles: { blog: [publicArticle], travel: [], research: [] }, pages })
const binding = () => ({ schemaVersion: 1 as const, articles: { ['blog/' + publicArticle.slug]: contentFingerprint(publicArticle) }, pages: {} })

test('the public manifest exposes only routes and deterministic content digests, never prose or credentials', () => {
  const value = manifest()
  assert.equal(Object.keys(value.articles).length, 1)
  assert.equal(Object.keys(value.pages).length, 6)
  assert.doesNotMatch(JSON.stringify(value), /公开标题|正文不能|简介|Bearer|private/)
  assert.equal(contentFingerprint({ z: 2, a: [1, { d: null, c: '中文' }] }), contentFingerprint({ a: [1, { c: '中文', d: null }], z: 2 }))
  assert.throws(() => buildContentManifest({ articles: { blog: [{ ...publicArticle, _status: 'draft' }] }, pages }), /published/)
  assert.throws(() => buildContentManifest({ articles: { blog: [{ ...publicArticle, draft: true }] }, pages }), /published/)
  assert.throws(() => articleKey('blog', '../private'))
})

test('verification requires this content version, and renames additionally require the old route to disappear', () => {
  const value = manifest()
  assert.equal(manifestMatches(binding(), value), true)
  const other = structuredClone(value)
  other.articles['blog/' + publicArticle.slug] = contentFingerprint({ ...publicArticle, title: '另一个版本' })
  assert.equal(manifestMatches(binding(), other), false)
  const rename = { ...binding(), articles: { ...binding().articles, 'blog/previous-route': null } }
  value.articles['blog/previous-route'] = 'a'.repeat(64)
  assert.equal(manifestMatches(rename, value), false)
  delete value.articles['blog/previous-route']
  assert.equal(manifestMatches(rename, value), true)
  const removal = { schemaVersion: 1 as const, articles: { ['blog/' + publicArticle.slug]: null }, pages: {} }
  assert.equal(manifestMatches(removal, value), false)
  delete value.articles['blog/' + publicArticle.slug]
  assert.equal(manifestMatches(removal, value), true)
})

test('manifest and outbox schemas fail closed on forged, excessive or unknown targets', () => {
  assert.equal(validContentBinding(binding()), true)
  assert.equal(validContentBinding({ schemaVersion: 1, articles: {}, pages: {} }), false)
  assert.equal(validContentBinding({ ...binding(), url: 'https://private.example' }), false)
  assert.equal(validContentBinding({ ...binding(), articles: { 'unknown/private': 'a'.repeat(64) } }), false)
  assert.throws(() => validateContentManifest({ ...manifest(), token: 'secret' }))
  assert.throws(() => validateContentManifest({ ...manifest(), generatedAt: 'invalid' }))
  assert.throws(() => validateContentManifest({ ...manifest(), pages: {} }))
  assert.throws(() => validateContentManifest({ ...manifest(), articles: Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`blog/item-${i}`, 'a'.repeat(64)])) }))
})

test('content checks use the configured HTTPS origin with no credentials or redirect following', async () => {
  const value = await checkPublicContent(binding(), { site: 'https://www.heyrickishere.com', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://www.heyrickishere.com/.well-known/cms-status.json')
    assert.deepEqual(options!.headers, { Accept: 'application/json', 'Cache-Control': 'no-cache' })
    assert.equal(options!.redirect, 'error')
    assert.equal(options!.cache, 'no-store')
    assert.ok(options!.signal)
    return Response.json(manifest())
  } })
  assert.equal(value.state, 'verified')
  for (const site of ['http://www.heyrickishere.com', 'https://localhost', 'https://127.0.0.1', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=secret', 'https://example.com:444']) assert.throws(() => publicationManifestURL(site))
  assert.equal((await checkPublicContent(binding(), { fetchImpl: async () => Response.json({ ...manifest(), articles: {} }) })).state, 'different')
})

test('network, login HTML, invalid UTF-8, oversize streams and malformed manifests are check failures, never claimed build failures', async () => {
  const cases: (() => Promise<Response>)[] = [
    async () => { throw new Error('private-provider-diagnostic') },
    async () => new Response('login', { headers: { 'content-type': 'text/html' } }),
    async () => new Response(null, { status: 302, headers: { location: 'https://untrusted.example' } }),
    async () => new Response('not json', { headers: { 'content-type': 'application/json' } }),
    async () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
    async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(MAX_MANIFEST_BYTES + 1) } }),
    async () => new Response(new Uint8Array(MAX_MANIFEST_BYTES + 1), { headers: { 'content-type': 'application/json' } }),
  ]
  for (const fetchImpl of cases) {
    const result = await checkPublicContent(binding(), { fetchImpl })
    assert.equal(result.state, 'check-failed')
    assert.doesNotMatch(JSON.stringify(result), /private-provider|untrusted\.example/)
  }
})

test('the check endpoint rejects anonymous, cross-site and forged requests before reading records', async t => {
  const old = process.env.CMS_URL
  process.env.CMS_URL = 'https://cms.example.com'
  t.after(() => { if (old === undefined) delete process.env.CMS_URL; else process.env.CMS_URL = old })
  const req: any = { user: null, headers: new Headers(), payload: new Proxy({}, { get: () => { throw new Error('Must not read DB') } }) }
  assert.equal((await checkPublication(req)).status, 401)
  req.user = { collection: 'users', role: 'admin' }
  req.headers = new Headers({ origin: 'https://evil.example', 'x-cms-request': '1' })
  assert.equal((await checkPublication(req)).status, 403)
  req.headers = new Headers({ origin: 'https://cms.example.com', 'x-cms-request': '1' })
  req.routeParams = { id: '../1' }
  assert.equal((await checkPublication(req)).status, 400)
})

test('publication stores the exact serialized current version and old-route removal in the content transaction', async t => {
  const restore = process.env.SITE_DEPLOY_HOOK
  delete process.env.SITE_DEPLOY_HOOK
  t.after(() => { if (restore !== undefined) process.env.SITE_DEPLOY_HOOK = restore })
  const body = await importLegacyMarkdown('本次正文。', {}, editor)
  let current: any = { id: 5, type: 'blog', slug: 'previous-route', _status: 'published', visibility: 'public', title: '旧版', description: '简介', date: '2026-11-14', body, updatedAt: '2026-11-14T01:00:00Z' }
  const events: any[] = []
  const req: any = { user: { collection: 'users', role: 'admin' }, context: {}, transactionID: 'same-content-transaction', payload: {
    config, findByID: async () => current, find: async () => ({ totalDocs: 0 }), create: async (args: any) => { events.push(args); return { id: 1 } },
  } }
  await preparePostMedia({ operation: 'update', originalDoc: current, data: { _status: 'draft' }, req, context: {} } as any)
  current = { ...current, slug: 'new-route', title: '本次新版', updatedAt: '2026-11-14T02:00:00Z' }
  await notifyPostPublished({ operation: 'update', doc: current, previousDoc: current, req, context: {} } as any)
  const expected = contentFingerprint(await exportPost(current, req, editor))
  assert.deepEqual(events[0].data.contentBinding, { schemaVersion: 1, articles: { 'blog/previous-route': null, 'blog/new-route': expected }, pages: {} })
  assert.equal(events[0].req, req)
  assert.equal(events[0].data.siteStatus, 'waiting')
  const published = await exportPost(current, req, editor)
  assert.equal(manifestMatches(events[0].data.contentBinding, buildContentManifest({ articles: { blog: [published] }, pages })), true)
})

test('global publication fingerprints only public page data, excluding Payload metadata', async () => {
  const current = { title: '关于页面', _status: 'published', updatedAt: '2026-11-14T01:00:00Z', id: 'private' }
  const events: any[] = []
  const req: any = { user: { collection: 'users', role: 'admin' }, context: {}, payload: {
    findGlobal: async () => current, find: async () => ({ totalDocs: 0 }), create: async (args: any) => { events.push(args); return { id: 1 } },
  } }
  await notifyGlobalPublished({ doc: current, previousDoc: {}, req, context: {}, global: { slug: 'about' } } as any)
  assert.deepEqual(events[0].data.contentBinding, { schemaVersion: 1, articles: {}, pages: { about: contentFingerprint(exportPageData('about', current)) } })
})
