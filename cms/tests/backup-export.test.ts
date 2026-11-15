import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PayloadRequest } from 'payload'
import {
  collectBackupContent, readAllBackupPages, resolveBackupOwner, sanitizeBackupData, writePrivateBackup,
} from '../scripts/export-backup'

const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
const owner = { id: 1, collection: 'users', email: 'owner@example.com', role: 'admin' }
const req = { user: owner } as unknown as PayloadRequest

test('the trusted owner lookup is limited to one configured identity and returns no credentials', async () => {
  let received: any
  const payload = { find: async (args: unknown) => {
    received = args
    return { docs: [{ ...owner, hash: 'PRIVATE_HASH', sessions: ['PRIVATE_SESSION'] }], totalDocs: 1 }
  } } as unknown as Parameters<typeof resolveBackupOwner>[0]
  assert.deepEqual(await resolveBackupOwner(payload, ' OWNER@example.com '), owner)
  assert.deepEqual(received.where, { email: { equals: 'owner@example.com' } })
  assert.deepEqual(received.select, { email: true, role: true })
  assert.equal(received.overrideAccess, true)
  assert.equal(received.depth, 0)
  assert.equal(received.limit, 2)
})

test('the owner lookup fails for missing, duplicate, mismatched or non-admin accounts', async () => {
  for (const result of [
    { docs: [], totalDocs: 0 },
    { docs: [owner, owner], totalDocs: 2 },
    { docs: [{ ...owner, email: 'other@example.com' }], totalDocs: 1 },
    { docs: [{ ...owner, role: 'editor' }], totalDocs: 1 },
    { docs: [{ ...owner, id: undefined }], totalDocs: 1 },
  ]) {
    const payload = { find: async () => result } as unknown as Parameters<typeof resolveBackupOwner>[0]
    await assert.rejects(resolveBackupOwner(payload, owner.email), /single configured administrator/)
  }
})

test('pagination reads every page and never accepts a truncated or repeating page sequence', async () => {
  const calls: number[] = []
  const docs = await readAllBackupPages(async (page) => {
    calls.push(page)
    return { docs: [{ id: page }], totalDocs: 3, hasNextPage: page < 3, nextPage: page < 3 ? page + 1 : null }
  })
  assert.deepEqual(calls, [1, 2, 3])
  assert.deepEqual(docs, [{ id: 1 }, { id: 2 }, { id: 3 }])
  await assert.rejects(readAllBackupPages(async () => ({ docs: [], totalDocs: 1, hasNextPage: false })), /incomplete/)
  await assert.rejects(readAllBackupPages(async () => ({ docs: [1], hasNextPage: true, nextPage: 1 })), /incomplete/)
  await assert.rejects(readAllBackupPages(async () => ({ docs: [1], hasNextPage: true, nextPage: 3 })), /incomplete/)
  await assert.rejects(readAllBackupPages(async () => ({ docs: [], hasNextPage: true, nextPage: 2 })), /incomplete/)
  await assert.rejects(readAllBackupPages(async page => ({ docs: [{ id: 7 }], totalDocs: 2, hasNextPage: page === 1, nextPage: 2 })), /document was repeated/)
  await assert.rejects(readAllBackupPages(async page => ({ docs: [page], totalDocs: page, hasNextPage: page === 1, nextPage: 2 })), /Content changed/)
})

test('every content and version operation respects the administrator and disables access overrides', async () => {
  const calls: Array<{ method: string; args: any }> = []
  const list = (method: string) => async (args: any) => {
    calls.push({ method, args })
    return { docs: [{ id: `${method}-${args.collection ?? args.slug}` }], totalDocs: 1, hasNextPage: false }
  }
  const payload = {
    find: list('find'), findVersions: list('findVersions'), findGlobalVersions: list('findGlobalVersions'),
    findGlobal: async (args: any) => { calls.push({ method: 'findGlobal', args }); return { _status: args.draft ? 'draft' : 'published', title: args.slug } },
  } as unknown as Parameters<typeof collectBackupContent>[0]
  const output = await collectBackupContent(payload, req, owner.email)
  assert.equal(Object.keys(output).length, 8)
  assert.equal(calls.length, 23)
  assert.ok(calls.every(call => call.args.overrideAccess === false && call.args.req === req && call.args.depth === 0))
  assert.ok(calls.every(call => call.args.collection !== 'users'))
  assert.deepEqual(calls.filter(call => call.method === 'find' && call.args.collection === 'posts').map(call => call.args.draft), [false, true])
  assert.equal(calls.filter(call => call.method === 'findGlobal' && call.args.draft === false).length, 6)
  assert.equal(calls.filter(call => call.method === 'findGlobal' && call.args.draft === true).length, 6)
  assert.equal(calls.filter(call => call.method === 'findGlobalVersions').length, 6)
  assert.ok(!Object.hasOwn(output, 'users.json'))
})

test('content backup rejects an unverified or different administrator before reading content', async () => {
  let calls = 0
  const payload = { find: async () => { calls++; throw new Error('should not read') } } as unknown as Parameters<typeof collectBackupContent>[0]
  for (const user of [null, { ...owner, role: 'editor' }, { ...owner, email: 'other@example.com' }, { ...owner, collection: 'members' }]) {
    await assert.rejects(collectBackupContent(payload, { user } as unknown as PayloadRequest, owner.email), /configured administrator/)
  }
  assert.equal(calls, 0)
})

test('credential metadata and signed file URLs are excluded without damaging article content', () => {
  const original = {
    id: 1, title: '私密草稿', body: { root: { children: [{ text: 'This code example mentions password and token.' }] } },
    hash: 'PRIVATE_HASH', password: 'PRIVATE_PASSWORD', sessions: [{ id: 'PRIVATE_SESSION' }],
    extra: { refresh_token: 'PRIVATE_REFRESH', secretAccessKey: 'PRIVATE_KEY', privateURL: '/api/media/file/photo.jpg' },
    publicUrl: 'https://assets.heyrickishere.com/cms/photo.jpg',
    sizes: { thumbnail: { url: 'https://private.example/photo.jpg?X-Amz-Signature=PRIVATE_SIGNED', width: 500 } },
    url: 'https://user:PRIVATE_PASSWORD@example.com/photo.jpg',
  }
  const result = plain(sanitizeBackupData(original))
  assert.equal(result.title, original.title)
  assert.deepEqual(result.body, original.body)
  assert.equal(result.publicUrl, original.publicUrl)
  assert.deepEqual(result.sizes.thumbnail, { width: 500 })
  assert.deepEqual(result.extra, { privateURL: '/api/media/file/photo.jpg' })
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'))
  assert.equal(original.hash, 'PRIVATE_HASH')
  assert.ok(Object.hasOwn(original, 'url'))
})

test('untrusted JSON keys remain data instead of modifying object prototypes', () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"body":"content"}')
  const output = sanitizeBackupData(value)
  assert.equal(({} as any).polluted, undefined)
  assert.equal(Object.getPrototypeOf(output), null)
  assert.equal(plain(output).__proto__.polluted, true)
})

test('a completed local backup has private permissions, checksums and an explicit restore scope', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ricky-cms-backup-test-'))
  try {
    const output = await writePrivateBackup(path.join(directory, 'private-exports'), {
      'posts-current.json': [{ id: 1, title: '内容', password: 'PRIVATE_PASSWORD' }],
      'posts-versions.json': [{ id: 2, version: { title: '草稿', _status: 'draft' } }],
    }, '2026-11-14T00:00:00.000Z')
    assert.equal(output.files, 4)
    assert.equal((await stat(output.directory)).mode & 0o777, 0o700)
    const files = await readdir(output.directory)
    assert.deepEqual(files.sort(), ['SHA256SUMS', 'manifest.json', 'posts-current.json', 'posts-versions.json'])
    const manifest = JSON.parse(await readFile(path.join(output.directory, 'manifest.json'), 'utf8'))
    assert.equal(manifest.kind, 'payload-content-export')
    assert.ok(manifest.excludes.includes('R2 file bytes'))
    assert.ok(manifest.limitations.some((line: string) => line.includes('not a pg_dump')))
    const checksumLines = (await readFile(path.join(output.directory, 'SHA256SUMS'), 'utf8')).trim().split('\n')
    assert.equal(checksumLines.length, 3)
    for (const line of checksumLines) {
      const [hash, file] = line.split('  ')
      const bytes = await readFile(path.join(output.directory, file))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
      assert.equal((await stat(path.join(output.directory, file))).mode & 0o777, 0o600)
    }
    assert.ok(!(await readFile(path.join(output.directory, 'posts-current.json'), 'utf8')).includes('PRIVATE_PASSWORD'))
    assert.ok((await readdir(path.join(directory, 'private-exports'))).every(name => !name.startsWith('.partial-')))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('unsafe output names abort the export and remove only its new staging directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ricky-cms-backup-failure-'))
  try {
    await assert.rejects(writePrivateBackup(path.join(directory, 'private-exports'), {
      'posts-current.json': [], '../leak.json': { data: 'content' },
    }, new Date().toISOString()), /Unsafe backup filename/)
    assert.deepEqual(await readdir(path.join(directory, 'private-exports')), [])
    assert.deepEqual((await readdir(directory)).sort(), ['private-exports'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a symlink cannot redirect private exports into another directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ricky-cms-backup-symlink-'))
  try {
    await symlink(directory, path.join(directory, 'private-exports'))
    await assert.rejects(writePrivateBackup(path.join(directory, 'private-exports'), { 'posts-current.json': [] }, new Date().toISOString()), /real directory/)
    assert.deepEqual(await readdir(directory), ['private-exports'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
