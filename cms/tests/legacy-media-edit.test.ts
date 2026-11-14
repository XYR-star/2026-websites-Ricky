import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { PayloadRequest } from 'payload'
import { Media } from '../src/collections/Media.js'

const storageKeys = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_BUCKET', 'R2_PUBLIC_BASE']
const owner = { id: 1, collection: 'users', role: 'admin' }
const beforeChange = Media.hooks!.beforeChange![0]

function configureStorage(t: TestContext, values: Record<string, string> = {}): void {
  const previous = new Map(storageKeys.map(key => [key, process.env[key]]))
  for (const key of storageKeys) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

function request(user: unknown = owner, file?: unknown): PayloadRequest {
  return {
    user, file, context: {},
    payload: new Proxy({}, { get: () => { throw new Error('Editing an existing description must not access storage or the database') } }),
  } as unknown as PayloadRequest
}

const legacy = {
  id: 3, alt: '旧说明',
  originalUrl: 'https://assets.heyrickishere.com/cms/legacy.jpg',
  publicUrl: 'https://assets.heyrickishere.com/cms/legacy.jpg',
  mimeType: 'image/jpeg',
}

test('an owner can edit an imported image description while private R2 uploads remain disabled', async t => {
  configureStorage(t)
  const req = request()
  assert.equal(await Media.access!.update!({ req } as any), true)
  assert.equal(await Media.access!.create!({ req } as any), false)
  const result = await beforeChange({ operation: 'update', data: { alt: '九寨沟的湖水' }, originalDoc: { ...legacy }, req, context: {} } as any)
  assert.deepEqual(result, { alt: '九寨沟的湖水' })
  assert.deepEqual({ ...legacy, ...result }, { ...legacy, alt: '九寨沟的湖水' })
})

test('description editing does not need an available or complete storage configuration', async t => {
  configureStorage(t, { R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com' })
  const result = await beforeChange({ operation: 'update', data: { alt: '更新说明' }, originalDoc: { ...legacy }, req: request(), context: {} } as any)
  assert.deepEqual(result, { alt: '更新说明' })
})

test('description edits cannot assign public or original locations when uploads are disabled', async t => {
  configureStorage(t)
  const result = await beforeChange({ operation: 'update', data: {
    alt: '新的图片说明', publicUrl: 'https://assets.heyrickishere.com/forged.jpg',
    publicKey: 'forged.jpg', originalUrl: '/images/forged.jpg',
  }, originalDoc: { ...legacy }, req: request(), context: {} } as any)
  assert.deepEqual(result, { alt: '新的图片说明' })
  assert.equal({ ...legacy, ...result }.publicUrl, legacy.publicUrl)
  assert.equal({ ...legacy, ...result }.originalUrl, legacy.originalUrl)
  for (const name of ['publicUrl', 'publicKey', 'originalUrl']) {
    const field = Media.fields.find(field => 'name' in field && field.name === name) as any
    assert.equal(await field.access.create({ req: request() }), false)
    assert.equal(await field.access.update({ req: request() }), false)
  }
})

test('unauthenticated and non-owner requests cannot edit descriptions without storage configured', async t => {
  configureStorage(t)
  for (const user of [null, { id: 2, collection: 'users', role: 'reader' }, { id: 1, collection: 'other', role: 'admin' }]) {
    const req = request(user)
    assert.equal(await Media.access!.update!({ req } as any), false)
    await assert.rejects(Promise.resolve().then(() => beforeChange({ operation: 'update', data: { alt: '不允许' }, originalDoc: { ...legacy }, req, context: {} } as any)), (error: any) => error.status === 403)
  }
})

test('new media and file uploads still require the private storage connection', async t => {
  configureStorage(t)
  for (const args of [
    { operation: 'create', data: { alt: '新素材' }, req: request() },
    { operation: 'create', data: { alt: '新素材', filename: 'new.jpg' }, req: request(owner, {}) },
    { operation: 'update', data: { alt: '替换上传' }, req: request(owner, {}) },
  ]) {
    await assert.rejects(Promise.resolve().then(() => beforeChange({ ...args, originalDoc: { ...legacy }, context: {} } as any)), (error: any) => error.status === 503)
  }
})

test('metadata edits cannot replace or invent the immutable original filename', async t => {
  configureStorage(t)
  for (const originalDoc of [{ ...legacy }, { ...legacy, filename: 'original.jpg' }]) {
    await assert.rejects(Promise.resolve().then(() => beforeChange({ operation: 'update', data: { alt: '更新说明', filename: 'replacement.jpg' }, originalDoc, req: request(), context: {} } as any)), (error: any) => error.status === 409)
  }
})
