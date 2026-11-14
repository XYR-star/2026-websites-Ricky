import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_TYPES, imageSignatureMatches, publicObjectKey, referencedMediaIDs, safeObjectKey } from '../src/lib/media-policy'
import { isTrustedPublicMedia, storageConfig } from '../src/lib/runtime-env'

test('only supported original image signatures can become public', () => {
  assert.equal(IMAGE_TYPES.has('image/svg+xml'), false)
  assert.equal(imageSignatureMatches(Buffer.from('<script>alert(1)</script>'), 'image/jpeg'), false)
  assert.equal(imageSignatureMatches(new Uint8Array([255,216,255,224]), 'image/jpeg'), true)
  assert.equal(imageSignatureMatches(Buffer.from('GIF89a'), 'image/gif'), true)
  assert.equal(imageSignatureMatches(Buffer.from('RIFFxxxxWEBP'), 'image/webp'), true)
})

test('storage paths reject traversal and retain article folder grouping', () => {
  assert.equal(safeObjectKey('drafts', '原图.jpg'), 'drafts/原图.jpg')
  for (const value of ['../photo.jpg', 'a/b.jpg', 'a\\b.jpg']) assert.throws(() => safeObjectKey('drafts', value))
  assert.throws(() => safeObjectKey('drafts/..', 'photo.jpg'))
  const uuid = '4bc5be8c-3c13-4ae7-943e-d8b832def49f'
  const first = publicObjectKey('travel', uuid, 'drafts/photo.jpg', 'etag1', 'photo.jpg')
  assert.equal(first, publicObjectKey('travel', uuid, 'drafts/photo.jpg', 'etag1', 'photo.jpg'))
  assert.notEqual(first, publicObjectKey('travel', uuid, 'drafts/photo.jpg', 'etag2', 'photo.jpg'))
  assert.ok(first.startsWith(`cms/travel/${uuid}/`))
})

test('only explicit upload references are published, without duplicate copies', () => {
  const body = { root: { children: [{ type: 'upload', relationTo: 'media', value: 7 }, { type: 'paragraph', children: [{ type: 'upload', relationTo: 'media', value: { id: 8 } }] }] } }
  assert.deepEqual(referencedMediaIDs(body, 7), [7, 8])
  assert.throws(() => referencedMediaIDs({ root: { children: [{ type: 'upload', relationTo: 'users', value: 1 }] } }))
})

test('legacy public paths survive but private/signed/untrusted sources are not public URLs', () => {
  assert.equal(isTrustedPublicMedia('/images/travel/photo.jpg'), true)
  assert.equal(isTrustedPublicMedia('https://assets.heyrickishere.com/cms/photo.jpg'), true)
  for (const url of ['https://evil.example/photo.jpg', '/images/../admin', '/images/%2e%2e/admin', 'https://assets.heyrickishere.com/a?X-Amz-Signature=secret', '//evil.example/a', 'javascript:alert(1)']) {
    assert.equal(isTrustedPublicMedia(url), false, url)
  }
})

test('missing private bucket disables uploads rather than writing ephemeral local files', () => {
  const old = { ...process.env }
  try {
    for (const key of ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_PRIVATE_BUCKET']) delete process.env[key]
    assert.equal(storageConfig(), undefined)
    process.env.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com'
    assert.throws(() => storageConfig(), /R2_ACCESS_KEY_ID/)
    Object.assign(process.env, { R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', R2_PRIVATE_BUCKET: 'same', R2_PUBLIC_BUCKET: 'same', R2_PUBLIC_BASE: 'https://assets.heyrickishere.com' })
    assert.throws(() => storageConfig(), /different R2 buckets/)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key]
    Object.assign(process.env, old)
  }
})
