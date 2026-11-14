import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { PayloadRequest } from 'payload'
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
    const other = { ...req } as PayloadRequest
    assert.equal(isPublishedContentRead(other), false)
  })
  assert.equal(isPublishedContentRead(req), false)
})

test('published-read capability is revoked after a failing read and survives nested scopes', async () => {
  const req = {} as PayloadRequest
  await assert.rejects(withPublishedContentRead(req, async () => {
    await withPublishedContentRead(req, async () => assert.equal(isPublishedContentRead(req), true))
    assert.equal(isPublishedContentRead(req), true)
    throw new Error('read failed')
  }))
  assert.equal(isPublishedContentRead(req), false)
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
