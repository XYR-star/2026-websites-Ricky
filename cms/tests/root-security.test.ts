import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayloadRequest } from 'payload'
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Users } from '../src/collections/Users.js'
import { Media } from '../src/collections/Media.js'
import { dispatchDeploymentRecord, notifyPostPublished, preparePostMedia, protectPublishedGlobal } from '../src/hooks/publishing.js'
import { prepareMedia } from '../src/lib/public-media.js'
import { siteContentEndpoint } from '../src/endpoints/siteContent.js'
import { isPublishedContentRead, withPublishedContentRead } from '../src/access/content.js'

const admin = { id: 1, collection: 'users', role: 'admin' }

function request(overrides: Record<string, unknown> = {}): PayloadRequest {
  return { user: null, context: {}, headers: new Headers(), payload: {}, ...overrides } as unknown as PayloadRequest
}

function setEnv(values: Record<string, string | undefined>): () => void {
  const old = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]))
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  return () => {
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('first-user registration remains closed even when collection access is bypassed', async t => {
  const restore = setEnv({ CMS_ADMIN_EMAIL: 'owner@example.com' })
  t.after(restore)
  const beforeValidate = Users.hooks!.beforeValidate![0]
  let usersRead = 0
  const req = request({ payload: { find: async () => { usersRead++; return { totalDocs: 0, docs: [] } } } })

  // Payload's first-register endpoint intentionally bypasses collection create
  // access. The collection hook must still reject both normal and forged bodies.
  for (const data of [
    { email: 'owner@example.com', password: 'untrusted-request-password' },
    { email: 'owner@example.com', password: 'untrusted-request-password', context: { bootstrapOwner: true }, role: 'admin' },
  ]) {
    await assert.rejects(beforeValidate({ operation: 'create', data, req, context: {} } as any), (error: any) => error.status === 403)
  }
  assert.equal(usersRead, 0)
})

test('trusted owner initialization accepts exactly the configured email and refuses a second owner', async t => {
  const restore = setEnv({ CMS_ADMIN_EMAIL: ' Owner@Example.com ' })
  t.after(restore)
  const beforeValidate = Users.hooks!.beforeValidate![0]
  const options: any[] = []
  let existing = false
  const req = request({ payload: { find: async (args: any) => { options.push(args); return { totalDocs: Number(existing), docs: [] } } } })

  await assert.rejects(beforeValidate({ operation: 'create', data: { email: 'other@example.com' }, req, context: { bootstrapOwner: true } } as any), (error: any) => error.status === 403)
  const result = await beforeValidate({ operation: 'create', data: { email: 'OWNER@example.com', role: 'reader' }, req, context: { bootstrapOwner: true } } as any)
  assert.equal(result.email, 'owner@example.com')
  assert.equal(result.role, 'admin')
  assert.equal(options[0].req, req)
  assert.equal(options[0].collection, 'users')
  existing = true
  await assert.rejects(beforeValidate({ operation: 'create', data: { email: 'owner@example.com' }, req, context: { bootstrapOwner: true } } as any), (error: any) => error.status === 409)
})

test('the owner can only read and update their own account; anonymous account and media access fail', async () => {
  const anonymous = request({ context: { bootstrapOwner: true, publishedContentRead: true } })
  const own = request({ user: admin })
  assert.equal(await Users.access!.read!({ req: anonymous } as any), false)
  assert.equal(await Users.access!.update!({ req: anonymous } as any), false)
  assert.deepEqual(await Users.access!.read!({ req: own } as any), { id: { equals: 1 } })
  assert.deepEqual(await Users.access!.update!({ req: own } as any), { id: { equals: 1 } })
  assert.equal(await Users.access!.create!({ req: own } as any), false)
  assert.equal(await Users.access!.delete!({ req: own } as any), false)
  assert.equal(await Media.access!.read!({ req: anonymous } as any), false)
  assert.equal(await Media.access!.create!({ req: anonymous } as any), false)
  assert.equal(await Media.access!.update!({ req: anonymous } as any), false)
})

test('the scoped build reader can only resolve public media and loses that access after export', async () => {
  const req = request()
  await withPublishedContentRead(req, async () => {
    assert.deepEqual(await Media.access!.read!({ req } as any), { publicUrl: { exists: true } })
    assert.equal(await Media.access!.create!({ req } as any), false)
    assert.equal(await Media.access!.update!({ req } as any), false)
  })
  assert.equal(isPublishedContentRead(req), false)
  assert.equal(await Media.access!.read!({ req } as any), false)
})

test('even an owner cannot assign public locations through ordinary media editing', async t => {
  const restore = setEnv({
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'private-key', R2_SECRET_ACCESS_KEY: 'private-secret',
    R2_PRIVATE_BUCKET: 'private-drafts', R2_PUBLIC_BUCKET: 'public-media',
    R2_PUBLIC_BASE: 'https://assets.heyrickishere.com',
  })
  t.after(restore)
  const req = request({ user: admin })
  const hook = Media.hooks!.beforeChange![0]
  const data = { alt: '保留说明', publicUrl: 'https://assets.heyrickishere.com/forged.jpg', publicKey: 'forged.jpg', originalUrl: '/images/forged.jpg' }
  const result = await hook({ operation: 'update', data, originalDoc: { filename: 'original.jpg' }, req, context: {} } as any)
  assert.deepEqual(result, { alt: '保留说明' })
  await assert.rejects(Promise.resolve().then(() => hook({ operation: 'update', data: { filename: 'replacement.jpg' }, originalDoc: { filename: 'original.jpg' }, req, context: {} } as any)), (error: any) => error.status === 409)
  await assert.rejects(Promise.resolve().then(() => hook({ operation: 'update', data: {}, originalDoc: { filename: 'original.jpg' }, req: { ...req, file: {} }, context: {} } as any)), (error: any) => error.status === 409)
})

test('saving an incomplete draft or a private article never prepares images for public storage', async () => {
  const req = request({ user: admin, payload: { findByID: () => { throw new Error('Private draft must not resolve or publish media') } } })
  const draft = { _status: 'draft', visibility: 'public', type: 'travel', cover: 9, description: '' }
  const privatePost = { _status: 'published', visibility: 'private', type: 'travel', cover: 9, description: '' }
  assert.equal(await preparePostMedia({ operation: 'update', data: draft, originalDoc: { _status: 'published', visibility: 'public' }, req, context: {} } as any), draft)
  assert.equal(await preparePostMedia({ operation: 'update', data: privatePost, originalDoc: {}, req, context: {} } as any), privatePost)
})

test('public-content tokens are required before any database read, regardless of caller query flags', async t => {
  const restore = setEnv({ CMS_READ_TOKEN: 'a'.repeat(48) })
  t.after(restore)
  const req = request({
    query: { draft: true, overrideAccess: true }, context: { publishedContentRead: true },
    payload: new Proxy({}, { get: () => { throw new Error('Unauthorized requests must not touch Payload') } }),
  })
  for (const header of [undefined, 'Bearer wrong-token', `Bearer ${'a'.repeat(48)}x`]) {
    req.headers = new Headers(header ? { authorization: header } : {})
    const response = await siteContentEndpoint.handler(req)
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(isPublishedContentRead(req), false)
  }
})

for (const change of [
  { _status: 'draft', visibility: 'public', title: '撤下文章' },
  { _status: 'published', visibility: 'private', title: '改为私人文章' },
]) test(`${change.title} schedules removal using the old main document even when previousDoc is a newer draft`, async t => {
  const restore = setEnv({ SITE_DEPLOY_HOOK: undefined })
  t.after(restore)
  let main: Record<string, unknown> = { id: 7, _status: 'published', visibility: 'public', updatedAt: '2026-01-01T00:00:00.000Z' }
  const latestDraft = { id: 7, _status: 'draft', visibility: 'public', updatedAt: '2026-01-02T00:00:00.000Z' }
  const events: any[] = []
  const req = request({ user: admin, transactionID: 'content-transaction', payload: {
    findByID: async (args: any) => { assert.equal(args.draft, false); assert.equal(args.overrideAccess, false); return main },
    find: async () => ({ totalDocs: 0, docs: [] }),
    create: async (args: any) => { events.push(args); return { id: 11, ...args.data } },
  } })
  await preparePostMedia({ operation: 'update', data: change, originalDoc: latestDraft, req, context: {} } as any)
  main = { id: 7, updatedAt: '2026-01-03T00:00:00.000Z', ...change }
  await notifyPostPublished({ operation: 'update', doc: main, previousDoc: latestDraft, req, context: {} } as any)
  assert.equal(events.length, 1)
  assert.equal(events[0].req, req)
  assert.equal(events[0].collection, 'deployments')
  assert.match(events[0].data.label, /^撤下：/)
})

test('autosaving a draft of a public article does not create a deployment event or change the main article', async () => {
  const main = { id: 7, _status: 'published', visibility: 'public', updatedAt: '2026-01-01T00:00:00.000Z' }
  const draft = { id: 7, _status: 'draft', visibility: 'public', updatedAt: '2026-01-02T00:00:00.000Z' }
  const req = request({ user: admin, payload: {
    findByID: async (args: any) => { assert.equal(args.draft, false); return main },
    find: () => { throw new Error('A draft save must not look for deployment events') },
    create: () => { throw new Error('A draft save must not create deployment events') },
  } })
  await preparePostMedia({ operation: 'update', data: draft, originalDoc: main, req, context: {} } as any)
  assert.equal(await notifyPostPublished({ operation: 'update', doc: draft, previousDoc: main, req, context: {} } as any), draft)
  assert.equal(main._status, 'published')
})

test('required published site globals cannot be withdrawn through either unpublish API form', async () => {
  const main = { _status: 'published', updatedAt: '2026-01-01T00:00:00.000Z' }
  const req = request({ user: admin, payload: {
    findGlobal: async (args: any) => { assert.equal(args.draft, false); assert.equal(args.overrideAccess, false); return main },
  } })
  const global = { slug: 'about' }
  for (const args of [{ draft: false, data: { _status: 'draft' } }, { data: {}, unpublishAllLocales: true }]) {
    await assert.rejects(protectPublishedGlobal({ args, operation: 'update', req, context: {}, global } as any), (error: any) => error.status === 409)
  }
})

test('normal autosave may keep a new site configuration draft without touching its published main version', async () => {
  const req = request({ user: admin, payload: {
    findGlobal: () => { throw new Error('Pure draft saves must not query or change the published main version') },
  } })
  const args = { draft: true, data: { _status: 'draft', title: '新的私人草稿' } }
  assert.equal(await protectPublishedGlobal({ args, operation: 'update', req, context: {}, global: { slug: 'about' } } as any), args)
})

test('a partial site-configuration update cannot inherit an unpublished status from a newer draft', async () => {
  const req = request({ user: admin, payload: {
    findGlobal: async (args: any) => { assert.equal(args.draft, false); return { _status: 'published' } },
  } })
  const args = { data: { title: '更新一处文案' } }
  const result = await protectPublishedGlobal({ args, operation: 'update', req, context: {}, global: { slug: 'about' } } as any)
  assert.equal(result.data.title, args.data.title)
  assert.equal(result.data._status, 'published')
})

test('publishing persists its event inside the content transaction without sending a pre-commit webhook', async t => {
  const restore = setEnv({ SITE_DEPLOY_HOOK: 'https://api.vercel.com/v1/integrations/deploy/test-hook' })
  t.after(restore)
  let networkCalls = 0
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('No pre-commit network request is allowed') })
  const main = { id: 7, _status: 'published', visibility: 'public', updatedAt: '2026-01-03T00:00:00.000Z', title: '发布文章' }
  const events: any[] = []
  const req = request({ user: admin, transactionID: 'uncommitted-content', payload: {
    findByID: async () => main,
    find: async () => ({ totalDocs: 0, docs: [] }),
    create: async (args: any) => { events.push(args); return { id: 11, ...args.data } },
    logger: { warn: () => {} },
  } })
  await notifyPostPublished({ operation: 'create', doc: main, previousDoc: {}, req, context: {} } as any)
  assert.equal(events.length, 1)
  assert.equal(events[0].req, req)
  assert.equal(events[0].req.transactionID, 'uncommitted-content')
  assert.equal(events[0].data.status, 'pending')
  assert.equal(networkCalls, 0)
})

test('a failed durable deployment record aborts publication instead of silently losing the update event', async () => {
  const main = { id: 7, _status: 'published', visibility: 'public', updatedAt: '2026-01-03T00:00:00.000Z', title: '发布文章' }
  const req = request({ user: admin, payload: {
    findByID: async () => main,
    find: async () => ({ totalDocs: 0, docs: [] }),
    create: async () => { throw new Error('Database could not save outbox record') },
  } })
  await assert.rejects(notifyPostPublished({ operation: 'create', doc: main, previousDoc: {}, req, context: {} } as any), /outbox record/)
})

test('deployment dispatch never reads inside the content transaction and sends nothing for rolled-back content', async t => {
  const restore = setEnv({ SITE_DEPLOY_HOOK: 'https://api.vercel.com/v1/integrations/deploy/test-hook' })
  t.after(restore)
  let committed = false
  let networkCalls = 0
  const statuses: string[] = []
  t.mock.method(globalThis, 'fetch', async () => {
    assert.equal(committed, true)
    networkCalls++
    return Response.json({ job: { id: 'deployment-job' } })
  })
  const payload = {
    findByID: async (args: any) => {
      assert.equal(args.req, undefined)
      assert.equal(args.overrideAccess, true)
      if (!committed) throw new Error('Rolled-back/uncommitted outbox record is not visible')
      return { id: 11, status: 'pending' }
    },
    update: async (args: any) => { assert.equal(args.req, undefined); statuses.push(args.data.status); return { id: 11, ...args.data } },
  }
  assert.equal(await dispatchDeploymentRecord(payload as any, 11), false)
  assert.equal(networkCalls, 0)
  assert.deepEqual(statuses, [])
  committed = true
  assert.equal(await dispatchDeploymentRecord(payload as any, 11), true)
  assert.equal(networkCalls, 1)
  assert.deepEqual(statuses, ['pending', 'requested'])
})

test('client-upload media is published from its receipt-bound _objectKey folder without changing original bytes', async t => {
  const restore = setEnv({
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'private-key', R2_SECRET_ACCESS_KEY: 'private-secret',
    R2_PRIVATE_BUCKET: 'private-drafts', R2_PUBLIC_BUCKET: 'public-media',
    R2_PUBLIC_BASE: 'https://assets.heyrickishere.com',
  })
  t.after(restore)
  const bytes = new Uint8Array([255, 216, 255, 1, 2, 3])
  const key = 'drafts/receipt-bound-upload-key/photo.jpg'
  const commands: any[] = []
  t.mock.method(S3Client.prototype, 'send', (async (command: any) => {
    commands.push(command)
    if (command instanceof HeadObjectCommand) {
      if (command.input.Bucket === 'private-drafts') assert.equal(command.input.Key, key)
      return { ContentType: 'image/jpeg', ContentLength: bytes.length, ETag: 'verified-etag' }
    }
    if (command instanceof GetObjectCommand) {
      assert.equal(command.input.Key, key)
      assert.equal(command.input.IfMatch, 'verified-etag')
      return { Body: { transformToByteArray: async () => bytes } }
    }
    assert.ok(command instanceof CopyObjectCommand)
    assert.equal(command.input.CopySource, `private-drafts/${key}`)
    assert.equal(command.input.CopySourceIfMatch, 'verified-etag')
    assert.equal(command.input.MetadataDirective, 'REPLACE')
    return {}
  }) as any)
  const saved: any[] = []
  const req = request({ user: admin, payload: {
    collections: { media: { config: { slug: 'media', fields: [], upload: {} } } },
    findByID: async () => ({ id: 12, prefix: 'drafts', _objectKey: 'receipt-bound-upload-key', filename: 'photo.jpg', filesize: bytes.length }),
    update: async (args: any) => { saved.push(args); return args.data },
  } })
  const publicURL = await prepareMedia(12, { type: 'blog', media_id: 'aabbccdd-0000-0000-0000-000000000000' }, req)
  assert.match(publicURL, /^https:\/\/assets\.heyrickishere\.com\/cms\/blog\//)
  assert.equal(commands.length, 4)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].context.preparePublicMedia, true)
  assert.equal(saved[0].req, req)
  assert.equal(saved[0].data.publicUrl, publicURL)
})
