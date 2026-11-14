import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createLocalReq, isolateObjectProperty, type PayloadRequest } from 'payload'
import { adminOnly, isPublishedContentRead, publishedOrAdmin, readPublishedGlobal, withPublishedContentRead } from '../src/access/content.js'
import { isPublicAssetURL, getPublishedMediaURL, replaceLegacyImageReferences } from '../src/lib/content-serialization.js'
import { PAGE_NAMES, exportPageData, importPageData } from '../src/lib/page-data.js'
import { isValidSiteContentToken } from '../src/endpoints/siteContent.js'

test('management data is unavailable to anonymous requests and forged context flags', async () => {
  const req = { user: null, context: { publishedContentRead: true, bootstrapOwner: true } } as unknown as PayloadRequest
  assert.equal(adminOnly({ req }), false)
  assert.equal(await publishedOrAdmin({ req } as any), false)
  assert.equal(readPublishedGlobal({ req }), false)
  assert.equal(isPublishedContentRead(req), false)
  await withPublishedContentRead(req, async () => {
    assert.equal(readPublishedGlobal({ req }), true)
    assert.deepEqual(await publishedOrAdmin({ req } as any), { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] })
    const copiedContext = { ...req, context: JSON.parse(JSON.stringify(req.context)) } as PayloadRequest
    assert.equal(isPublishedContentRead(copiedContext), false)
    assert.equal(await publishedOrAdmin({ req: copiedContext } as any), false)
    assert.equal(readPublishedGlobal({ req: copiedContext }), false)
  })
  assert.equal(isPublishedContentRead(req), false)
})

test('Payload request proxies and shallow clones retain only the scoped published-read capability', async () => {
  const req = { user: null, context: { publishedContentRead: true }, transactionID: 'content-read' } as unknown as PayloadRequest
  const shallow = { ...req } as PayloadRequest
  const permissionRequest = isolateObjectProperty(req, 'transactionID')
  const independentContext = { ...req, context: JSON.parse(JSON.stringify(req.context)) } as PayloadRequest
  const publishedFilter = { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] }
  for (const candidate of [req, shallow, permissionRequest, independentContext]) assert.equal(isPublishedContentRead(candidate), false)

  await withPublishedContentRead(req, async () => {
    for (const candidate of [req, shallow, permissionRequest]) {
      assert.equal(isPublishedContentRead(candidate), true)
      assert.equal(readPublishedGlobal({ req: candidate }), true)
      assert.deepEqual(await publishedOrAdmin({ req: candidate } as any), publishedFilter)
      assert.equal(adminOnly({ req: candidate }), false)
    }
    assert.equal(isPublishedContentRead(independentContext), false)
    assert.equal(await publishedOrAdmin({ req: independentContext } as any), false)
    assert.equal(readPublishedGlobal({ req: independentContext }), false)
    // Payload isolates the transaction property while forwarding the exact same
    // context object during internal query field-permission checks.
    delete permissionRequest.transactionID
    assert.equal(req.transactionID, 'content-read')
    assert.equal(permissionRequest.context, req.context)
  })
  for (const candidate of [req, shallow, permissionRequest, independentContext]) {
    assert.equal(isPublishedContentRead(candidate), false)
    assert.equal(await publishedOrAdmin({ req: candidate } as any), false)
    assert.equal(readPublishedGlobal({ req: candidate }), false)
  }
})

test('official Local API context copies preserve an opaque server token that JSON and string flags cannot forge', async () => {
  // Real Local API calls replace req.context with an object spread. Symbols are
  // carried by trusted server-side copies, while HTTP/JSON cannot transmit a
  // private Symbol or recreate the minted token object's memory identity.
  const req = {
    user: null, context: { publishedContentRead: true }, headers: new Headers(),
    i18n: { t: () => '' }, payloadDataLoader: {}, url: 'https://cms.example.test/api/site-content',
  } as unknown as PayloadRequest
  const payload = { config: {} } as any
  let oldContextCopy: PayloadRequest | undefined
  let copiedContextRequest: PayloadRequest | undefined
  let copiedProxy: PayloadRequest | undefined
  let jsonCopy: PayloadRequest | undefined
  await withPublishedContentRead(req, async () => {
    const originalContext = req.context
    oldContextCopy = { ...req }
    const local = await createLocalReq({ req }, payload)
    assert.equal(local, req)
    assert.notEqual(local.context, originalContext)
    assert.equal(isPublishedContentRead(local), true)
    assert.equal(isPublishedContentRead(oldContextCopy), true)
    copiedContextRequest = { ...local, context: { ...local.context } }
    copiedProxy = isolateObjectProperty(copiedContextRequest, 'transactionID')
    jsonCopy = { ...local, context: JSON.parse(JSON.stringify(local.context)) }
    assert.equal(isPublishedContentRead(copiedContextRequest), true)
    assert.equal(isPublishedContentRead(copiedProxy), true)
    assert.equal(isPublishedContentRead(jsonCopy), false)
    assert.equal(await publishedOrAdmin({ req: jsonCopy } as any), false)
    await withPublishedContentRead(copiedContextRequest, async () => {
      assert.equal(isPublishedContentRead(req), true)
      assert.equal(isPublishedContentRead(copiedProxy), true)
    })
    assert.equal(isPublishedContentRead(req), true)
    assert.equal(isPublishedContentRead(copiedContextRequest), true)
  })
  for (const candidate of [req, oldContextCopy, copiedContextRequest, copiedProxy, jsonCopy]) assert.equal(isPublishedContentRead(candidate), false)
})

test('an empty native HTTP context retains its scoped reader token through repeated official Local API calls', async () => {
  const req = {
    user: null, context: {}, headers: new Headers(),
    i18n: { t: () => '' }, payloadDataLoader: {}, url: 'https://cms.example.test/api/site-content',
  } as unknown as PayloadRequest
  const payload = { config: {} } as any
  const copies: PayloadRequest[] = []
  assert.deepEqual(req.context, {})
  await withPublishedContentRead(req, async () => {
    for (let round = 0; round < 3; round++) {
      const oldContext = req.context
      copies.push({ ...req }, { ...req, context: { ...req.context } })
      const proxy = isolateObjectProperty(req, 'transactionID')
      copies.push(proxy)
      await createLocalReq({ req: proxy }, payload)
      // Payload's empty-context optimization uses Object.keys, which ignores
      // Symbols. A harmless enumerable marker keeps the opaque token on the
      // trusted spread path even for real HTTP requests that start with {}.
      assert.notEqual(req.context, oldContext)
      assert.equal(isPublishedContentRead(req), true)
      assert.deepEqual(await publishedOrAdmin({ req } as any), { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] })
      for (const copy of copies) assert.equal(isPublishedContentRead(copy), true)
      const jsonOnly = { ...req, context: JSON.parse(JSON.stringify(req.context)) } as PayloadRequest
      assert.equal(isPublishedContentRead(jsonOnly), false)
      assert.equal(readPublishedGlobal({ req: jsonOnly }), false)
    }
  })
  assert.deepEqual(req.context, {})
  for (const candidate of [req, ...copies]) {
    assert.equal(isPublishedContentRead(candidate), false)
    assert.equal(await publishedOrAdmin({ req: candidate } as any), false)
    assert.equal(readPublishedGlobal({ req: candidate }), false)
  }
})

test('the context-copy marker and a matching Symbol description do not grant published-content access', async () => {
  const req = {
    user: null,
    context: {
      __rickyPublishedReaderContext: true,
      publishedContentRead: true,
      'Symbol(published-content-reader)': {},
      [Symbol('published-content-reader')]: {},
    },
  } as unknown as PayloadRequest
  assert.equal(isPublishedContentRead(req), false)
  assert.equal(await publishedOrAdmin({ req } as any), false)
  assert.equal(readPublishedGlobal({ req }), false)
  assert.equal(adminOnly({ req }), false)
})

test('published-read capability is revoked after a failing read and survives nested scopes', async () => {
  const req = {} as PayloadRequest
  let clone: PayloadRequest | undefined
  await assert.rejects(withPublishedContentRead(req, async () => {
    clone = isolateObjectProperty(req, 'transactionID')
    await withPublishedContentRead(clone, async () => {
      assert.equal(isPublishedContentRead(req), true)
      assert.equal(isPublishedContentRead(clone), true)
    })
    assert.equal(isPublishedContentRead(req), true)
    assert.equal(isPublishedContentRead(clone), true)
    throw new Error('read failed')
  }))
  assert.equal(isPublishedContentRead(req), false)
  assert.equal(isPublishedContentRead(clone), false)
})

test('only the designated admin collection and role may manage content', () => {
  assert.equal(adminOnly({ req: { user: { collection: 'users', role: 'admin' } } as any }), true)
  assert.equal(adminOnly({ req: { user: { collection: 'users', role: 'reader' } } as any }), false)
  assert.equal(adminOnly({ req: { user: { collection: 'other', role: 'admin' } } as any }), false)
})

test('content-read token is server-only, exact and requires a sufficiently long configured secret', () => {
  const secret = 'a'.repeat(48)
  assert.equal(isValidSiteContentToken(`Bearer ${secret}`, secret), true)
  assert.equal(isValidSiteContentToken(`Bearer ${secret}x`, secret), false)
  assert.equal(isValidSiteContentToken(`bearer ${secret}`, secret), false)
  assert.equal(isValidSiteContentToken(null, secret), false)
  assert.equal(isValidSiteContentToken('Bearer short', 'short'), false)
  assert.equal(isValidSiteContentToken(`Bearer ${secret}`, undefined), false)
})

test('only known public image locations may leave the CMS', () => {
  assert.equal(isPublicAssetURL('https://assets.heyrickishere.com/cms/photo.jpg'), true)
  assert.equal(isPublicAssetURL('/images/travel/photo.jpg'), true)
  for (const url of [
    'https://account.r2.cloudflarestorage.com/bucket/photo.jpg',
    'https://assets.heyrickishere.com/cms/photo.jpg?X-Amz-Signature=secret',
    'https://user:password@assets.heyrickishere.com/cms/photo.jpg',
    'https://evil.example/photo.jpg', '/api/media/file/photo.jpg', '//evil.example/photo.jpg',
    '/images/%2e%2e/secret.jpg', '/images/a%5cb.jpg',
  ]) assert.equal(isPublicAssetURL(url), false, url)
  assert.equal(getPublishedMediaURL({ originalUrl: '/images/old.jpg' }), '/images/old.jpg')
  assert.throws(() => getPublishedMediaURL({ originalUrl: 'https://private.r2.cloudflarestorage.com/x' }))
})

test('legacy image import preserves code samples and replaces only actual block images', () => {
  const url = 'https://assets.heyrickishere.com/cms/photo.jpg'
  const source = `# Title\n\n![湖水](${url} "照片说明")\n\n\`![示例](https://example.com/a.jpg)\`\n\n\`\`\`markdown\n![示例](https://example.com/a.jpg)\n\`\`\``
  const seen: any[] = []
  const output = replaceLegacyImageReferences(source, new Map([[url, { id: 42 }]]), value => seen.push(value))
  assert.match(output, /!\[media:42\]\(\)/)
  assert.match(output, /`!\[示例\]\(https:\/\/example.com\/a.jpg\)`/)
  assert.match(output, /```markdown\n!\[示例\]\(https:\/\/example.com\/a.jpg\)\n```/)
  assert.deepEqual(seen, [{ id: 42, alt: '湖水', title: '照片说明' }])
  assert.throws(() => replaceLegacyImageReferences(`![图](${url})`, {}), /素材记录/)
  assert.throws(() => replaceLegacyImageReferences(`文字 ![图](${url})`, { [url]: 42 }), /单独成段/)
})

for (const name of PAGE_NAMES) test(`v1 ${name} JSON survives CMS import/export without Payload metadata`, async () => {
  const source = JSON.parse(await readFile(new URL(`../../src/data/${name}.json`, import.meta.url), 'utf8'))
  const imported = importPageData(name, source)
  const stored: Record<string, any> = { ...imported, id: 123, _status: 'published', globalType: name, createdAt: 'internal', updatedAt: 'internal' }
  if (name === 'homepage') stored.sections = stored.sections.map((row: any, index: number) => ({ ...row, id: String(index), blockName: 'internal' }))
  assert.deepEqual(exportPageData(name, stored), source)
})
