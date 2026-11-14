import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Payload, PayloadRequest } from 'payload'
import { dispatchDeploymentRecord, retryDeployment } from '../src/hooks/publishing.js'
import { deploymentDB } from './helpers/deployment-db.js'

const admin = { id: 1, collection: 'users', role: 'admin' }
const origin = 'https://cms.offline.invalid'

function environment(t: TestContext, hook: string | undefined = 'https://api.vercel.com/v1/integrations/deploy/offline-test') {
  const previous = { CMS_URL: process.env.CMS_URL, SITE_DEPLOY_HOOK: process.env.SITE_DEPLOY_HOOK }
  process.env.CMS_URL = origin
  if (hook === undefined) delete process.env.SITE_DEPLOY_HOOK
  else process.env.SITE_DEPLOY_HOOK = hook
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

function request(payload: object, overrides: object = {}): PayloadRequest {
  return { user: admin, payload, context: {}, headers: new Headers({ origin, 'x-cms-request': '1' }), routeParams: { id: '11' }, ...overrides } as unknown as PayloadRequest
}

test('retrying an already accepted deployment preserves its job and sends nothing, even without the hook configured', async t => {
  environment(t, '')
  let posts = 0
  t.mock.method(globalThis, 'fetch', async () => { posts++; throw new Error('Must not resend') })
  const req = request({
    findByID: async (args: any) => { assert.equal(args.req, req); assert.equal(args.overrideAccess, false); return { id: 11, status: 'requested', jobId: 'existing-job' } },
    update: async () => { throw new Error('Must not reset a requested row') },
    db: { drizzle: { transaction: async () => { throw new Error('No dispatch is needed') } } },
  })
  const response = await retryDeployment(req)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'requested', jobId: 'existing-job', message: 'Vercel 已接收此记录的部署请求，请查看构建结果。' })
  assert.equal(posts, 0)
})

test('two dispatcher instances sharing the database send only one request and report the other as in flight', async t => {
  environment(t)
  const store = deploymentDB({ id: 11, status: 'pending' })
  const payload = { db: store.db } as unknown as Payload
  let complete!: () => void
  const pending = new Promise<void>(resolve => { complete = resolve })
  let started!: () => void
  const sending = new Promise<void>(resolve => { started = resolve })
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
    posts++
    assert.equal(options?.method, 'POST')
    assert.ok(options?.signal)
    assert.equal(store.state.locked, true)
    started()
    await pending
    return Response.json({ job: { id: 'single-job' } })
  })
  const first = dispatchDeploymentRecord(payload, 11)
  await sending
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'in-flight' })
  assert.equal(posts, 1)
  assert.equal(store.state.locked, true, 'The losing transaction must not release the winner’s lock')
  complete()
  assert.deepEqual(await first, { status: 'requested', jobId: 'single-job' })
  assert.equal(store.state.locked, false)
  assert.equal(store.state.releases, 1)
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'requested', jobId: 'single-job' })
  assert.equal(posts, 1)
  assert.equal(store.state.releases, 2)
})

test('a failed send retains the durable record, releases its transaction lock and can be retried', async t => {
  environment(t)
  const store = deploymentDB({ id: 11, status: 'pending' })
  let posts = 0
  t.mock.method(globalThis, 'fetch', async () => {
    if (++posts === 1) throw new Error('Offline network failure')
    return Response.json({ job: { id: 'recovered-job' } })
  })
  const payload = { db: store.db } as unknown as Payload
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'failed' })
  assert.equal(store.state.record?.status, 'failed')
  assert.equal(store.state.locked, false)
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'requested', jobId: 'recovered-job' })
  assert.equal(store.state.releases, 2)
  assert.equal(posts, 2)
})

test('the retry endpoint reports an existing send as 202 without resetting its row', async t => {
  environment(t)
  const store = deploymentDB({ id: 11, status: 'pending' })
  let complete!: () => void
  const pending = new Promise<void>(resolve => { complete = resolve })
  let started!: () => void
  const sending = new Promise<void>(resolve => { started = resolve })
  let posts = 0
  t.mock.method(globalThis, 'fetch', async () => { posts++; started(); await pending; return Response.json({ job: { id: 'job' } }) })
  const payload = { db: store.db, findByID: async () => ({ id: 11, status: 'pending' }),
    update: async () => { throw new Error('The endpoint must not reset an in-flight row') } }
  const first = dispatchDeploymentRecord(payload as unknown as Payload, 11)
  await sending
  const response = await retryDeployment(request(payload))
  assert.equal(response.status, 202)
  assert.equal((await response.json()).status, 'in-flight')
  assert.equal(posts, 1)
  complete()
  assert.deepEqual(await first, { status: 'requested', jobId: 'job' })
  assert.equal(store.state.record?.jobId, 'job')
})

test('database failure rolls back and releases the lock without sending, while invalid IDs never query', async t => {
  environment(t)
  const store = deploymentDB({ id: 11, status: 'pending' })
  const payload = { db: store.db } as unknown as Payload
  let posts = 0
  t.mock.method(globalThis, 'fetch', async () => { posts++; return Response.json({ job: { id: 'job' } }) })
  store.state.failNextSelect = true
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'failed' })
  assert.equal(store.state.record?.status, 'pending')
  assert.equal(store.state.locked, false)
  assert.equal(store.state.releases, 1)
  assert.equal(posts, 0)
  const queries = store.state.queries.length
  for (const id of [0, -1, 2_147_483_648, 'invalid']) assert.deepEqual(await dispatchDeploymentRecord(payload, id), { status: 'missing' })
  assert.equal(store.state.queries.length, queries)
  assert.deepEqual(await dispatchDeploymentRecord(payload, 11), { status: 'requested', jobId: 'job' })
})

test('retry endpoint rejects anonymous and cross-origin requests before reading or dispatching', async t => {
  environment(t)
  const payload = { findByID: async () => { throw new Error('Must not read') } }
  const anonymous = await retryDeployment(request(payload, { user: null }))
  assert.equal(anonymous.status, 401)
  const crossOrigin = await retryDeployment(request(payload, { headers: new Headers({ origin: 'https://other.offline.invalid', 'x-cms-request': '1' }) }))
  assert.equal(crossOrigin.status, 403)
})
