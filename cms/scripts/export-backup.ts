import { createHash, randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Payload, PayloadRequest } from 'payload'
import { PAGE_NAMES } from '../src/lib/page-data'
import { finishCLI, loadLocalEnvironment, verifyEnvironment } from './load-env'

const cmsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hiddenCredentialKeys = new Set([
  'password', 'passwordhash', 'salt', 'hash', 'token', 'accesstoken', 'refreshtoken',
  'apikey', 'secret', 'secretaccesskey', 'accesskeyid', 'payloadsecret', 'databaseurl',
  'authorization', 'cookie', 'cookies', 'sessions', 'resetpasswordtoken',
  'resetpasswordexpiration', 'verificationtoken',
])
const signedURLParameters = /^(?:x-amz-.+|x-goog-.+|token|access_token|signature|sig|authorization|credential|key-pair-id|policy)$/i
const mediaURLFields = new Set(['url', 'thumbnailURL', 'publicUrl', 'originalUrl'])

export type BackupOwner = { id: number | string; email: string; role: 'admin'; collection: 'users' }
type PageResult<T> = { docs: T[]; hasNextPage?: boolean; nextPage?: number | null; totalDocs?: number }
type BackupAPI = Pick<Payload, 'find' | 'findVersions' | 'findGlobal' | 'findGlobalVersions'>

/** Content fields stay intact; system credential metadata is never backed up. */
export function sanitizeBackupData(value: unknown, field = ''): any {
  if (Array.isArray(value)) return value.map(item => sanitizeBackupData(item))
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString()
    const result: Record<string, unknown> = Object.create(null)
    for (const [key, child] of Object.entries(value)) {
      if (hiddenCredentialKeys.has(key.toLowerCase().replace(/[-_]/g, ''))) continue
      const sanitized = sanitizeBackupData(child, key)
      if (sanitized !== undefined) result[key] = sanitized
    }
    return result
  }
  if (typeof value === 'string' && mediaURLFields.has(field)) {
    try {
      const url = new URL(value)
      if (url.username || url.password || [...url.searchParams.keys()].some(key => signedURLParameters.test(key))) return undefined
    } catch { /* Relative private file paths have no embedded credentials. */ }
  }
  return value
}

/** Use stable IDs and fail rather than silently accepting truncated pagination. */
export async function readAllBackupPages<T>(read: (page: number) => Promise<PageResult<T>>): Promise<T[]> {
  const docs: T[] = []
  const seenPages = new Set<number>()
  const seenDocumentIDs = new Set<string>()
  let page = 1
  let expectedTotal: number | undefined
  while (true) {
    if (seenPages.has(page)) throw new Error('Backup pagination repeated a page.')
    seenPages.add(page)
    const result = await read(page)
    if (!Array.isArray(result.docs)) throw new Error('Backup pagination did not return a document list.')
    if (typeof result.totalDocs === 'number') {
      if (!Number.isSafeInteger(result.totalDocs) || result.totalDocs < 0) throw new Error('Invalid backup document count.')
      expectedTotal ??= result.totalDocs
      if (result.totalDocs !== expectedTotal) throw new Error('Content changed during pagination. Export again while editing is paused.')
    }
    for (const doc of result.docs) {
      const id = doc && typeof doc === 'object' && 'id' in doc ? doc.id : undefined
      if (typeof id === 'string' || typeof id === 'number') {
        const key = `${typeof id}:${id}`
        if (seenDocumentIDs.has(key)) throw new Error('Content changed during pagination: a backup document was repeated.')
        seenDocumentIDs.add(key)
      }
      docs.push(doc)
    }
    if (expectedTotal !== undefined && docs.length > expectedTotal) throw new Error('Content changed during pagination. Export again while editing is paused.')
    if (!result.hasNextPage) break
    if (!result.docs.length || !Number.isSafeInteger(result.nextPage) || Number(result.nextPage) !== page + 1 || page >= 100_000) throw new Error('Backup pagination is incomplete.')
    page = Number(result.nextPage)
  }
  if (expectedTotal !== undefined && docs.length !== expectedTotal) throw new Error('Backup document count is incomplete.')
  return docs
}

/**
 * This is the only trusted-CLI access override. It resolves the configured owner
 * without exporting user records. Every content and version read below enforces
 * the owner's normal collection/global access control.
 */
export async function resolveBackupOwner(payload: Pick<Payload, 'find'>, expectedEmail: string): Promise<BackupOwner> {
  const email = expectedEmail.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Configure CMS_ADMIN_EMAIL before exporting.')
  const result = await payload.find({
    collection: 'users', where: { email: { equals: email } }, limit: 2, depth: 0,
    select: { email: true, role: true }, overrideAccess: true,
  })
  const owner = result.docs[0]
  if (result.totalDocs !== 1 || result.docs.length !== 1 || !owner || owner.email?.trim().toLowerCase() !== email ||
      owner.role !== 'admin' || (typeof owner.id !== 'string' && typeof owner.id !== 'number')) {
    throw new Error('The single configured administrator must exist before exporting content.')
  }
  return { id: owner.id, email, role: 'admin', collection: 'users' }
}

function requireBackupOwner(req: PayloadRequest, email: string): void {
  if (req.user?.collection !== 'users' || req.user.role !== 'admin' || req.user.email?.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('Content backup requires the configured administrator.')
  }
}

export async function collectBackupContent(payload: BackupAPI, req: PayloadRequest, ownerEmail: string) {
  requireBackupOwner(req, ownerEmail)
  const common = { req, overrideAccess: false, depth: 0, limit: 100, sort: 'id' } as const
  const postsCurrent = await readAllBackupPages(page => payload.find({ ...common, collection: 'posts', draft: false, page }))
  const postsLatestDrafts = await readAllBackupPages(page => payload.find({ ...common, collection: 'posts', draft: true, page }))
  const postVersions = await readAllBackupPages(page => payload.findVersions({ ...common, collection: 'posts', page }))
  const media = await readAllBackupPages(page => payload.find({ ...common, collection: 'media', page }))
  const deployments = await readAllBackupPages(page => payload.find({ ...common, collection: 'deployments', page }))
  const globalsCurrent: Record<string, unknown> = {}
  const globalsLatestDrafts: Record<string, unknown> = {}
  const globalVersions: Record<string, unknown[]> = {}
  for (const slug of PAGE_NAMES) {
    globalsCurrent[slug] = await payload.findGlobal({ slug, req, overrideAccess: false, draft: false, depth: 0 })
    globalsLatestDrafts[slug] = await payload.findGlobal({ slug, req, overrideAccess: false, draft: true, depth: 0 })
    globalVersions[slug] = await readAllBackupPages(page => payload.findGlobalVersions({ ...common, slug, page }))
  }
  return {
    'posts-current.json': postsCurrent,
    'posts-latest-drafts.json': postsLatestDrafts,
    'posts-versions.json': postVersions,
    'globals-current.json': globalsCurrent,
    'globals-latest-drafts.json': globalsLatestDrafts,
    'globals-versions.json': globalVersions,
    'media.json': media,
    'deployments.json': deployments,
  }
}

export async function writePrivateBackup(
  baseDirectory: string,
  documents: Record<string, unknown>,
  startedAt: string,
): Promise<{ directory: string; files: number }> {
  await mkdir(baseDirectory, { recursive: true, mode: 0o700 })
  const base = await lstat(baseDirectory)
  if (!base.isDirectory() || base.isSymbolicLink()) throw new Error('The private backup destination must be a real directory.')
  await chmod(baseDirectory, 0o700)
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`
  const staging = path.join(baseDirectory, `.partial-${name}`)
  const destination = path.join(baseDirectory, name)
  await mkdir(staging, { mode: 0o700 })
  const files: Record<string, { bytes: number; sha256: string }> = {}
  async function write(name: string, value: unknown): Promise<void> {
    if (!/^[a-z0-9-]+\.json$/i.test(name)) throw new Error('Unsafe backup filename.')
    const bytes = Buffer.from(`${JSON.stringify(sanitizeBackupData(value), null, 2)}\n`, 'utf8')
    const file = await open(path.join(staging, name), 'wx', 0o600)
    try { await file.writeFile(bytes) } finally { await file.close() }
    files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  try {
    for (const [name, value] of Object.entries(documents)) await write(name, value)
    await write('manifest.json', {
      formatVersion: 1, kind: 'payload-content-export', startedAt, finishedAt: new Date().toISOString(),
      accessChecks: 'All content and version reads use the configured administrator with overrideAccess:false.',
      ownerLookup: 'Only the exact configured administrator identity is resolved by a trusted CLI lookup. User records are not exported.',
      includes: ['current content', 'latest drafts', 'available content versions', 'global page settings', 'media metadata', 'deployment records'],
      excludes: ['users and password hashes', 'sessions and authentication credentials', 'environment variables', 'R2 file bytes', 'database schema and internal tables'],
      limitations: [
        'This is not a pg_dump full database backup.',
        'Reads are not a single transactional database snapshot. Pause editing during export.',
        'R2 original files require a separate object backup.',
        'Short-lived signed media URLs are omitted; stable object metadata and public URLs remain.',
      ],
      files: { ...files },
    })
    const checksums = Object.entries(files).map(([name, info]) => `${info.sha256}  ${name}`).join('\n') + '\n'
    const checks = await open(path.join(staging, 'SHA256SUMS'), 'wx', 0o600)
    try { await checks.writeFile(checksums) } finally { await checks.close() }
    await rename(staging, destination)
    return { directory: destination, files: Object.keys(files).length + 1 }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Export CMS content, drafts and versions into cms/private-exports/. Requires the configured owner and the real v2 environment. Does not include users, credentials or R2 file bytes; not a full database backup.')
    return
  }
  if (args.length) throw new Error('Unsupported export option. Use --help.')
  loadLocalEnvironment()
  verifyEnvironment()
  const startedAt = new Date().toISOString()
  const { getPayload, createLocalReq } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  try {
    const owner = await resolveBackupOwner(payload, process.env.CMS_ADMIN_EMAIL!)
    // This verified identity is deliberately narrower than the full User shape:
    // access checks need id/email/role; user credentials are never loaded here.
    const req = await createLocalReq({ user: owner as NonNullable<PayloadRequest['user']>, context: { contentBackup: true, suppressDeploy: true } }, payload)
    const content = await collectBackupContent(payload, req, owner.email)
    const result = await writePrivateBackup(path.join(cmsRoot, 'private-exports'), content, startedAt)
    console.log(JSON.stringify({ status: 'completed', directory: result.directory, files: result.files,
      includesR2Bytes: false, fullDatabaseBackup: false }, null, 2))
  } finally {
    await payload.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(() => finishCLI()).catch(() => {
    // Database/provider errors can contain connection strings. Keep raw errors out of logs.
    console.error('CMS content export failed. No completed backup was published. Check the configured owner, database connection and local directory permissions.')
    return finishCLI(1)
  })
}
