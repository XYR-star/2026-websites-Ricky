import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { Payload, PayloadRequest } from 'payload'
import type { Post } from '../src/payload-types'
import { buildSiteContent, siteContentEndpoint } from '../src/endpoints/siteContent'
import { PAGE_NAMES } from '../src/lib/page-data'
import { finishCLI, loadLocalEnvironment, verifyEnvironment } from './load-env'
import { resolveBackupOwner, type BackupOwner } from './export-backup'

const context = { liveVerification: true, suppressDeploy: true }
type Snapshot = {
  schemaVersion: 1
  articles: Record<'blog' | 'travel' | 'research', Record<string, unknown>[]>
  pages: Record<string, unknown>
}
type VerificationReport = {
  ok: boolean
  checks: Record<string, boolean>
  counts: { importedPages: number; baselinePublicArticles: number; temporaryPostsCreated: number; temporaryPostsDeleted: number }
  browserTwoDeviceVerified: false
  r2UploadVerified: false
  failedStage?: string
}

function body(text: string): Post['body'] {
  return { root: {
    type: 'root', version: 1, direction: null, format: '', indent: 0,
    children: [{
      type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
      children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }],
      textFormat: 0, textStyle: '',
    }],
  } }
}

function bodyText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const node = value as Record<string, unknown>
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  if (node.root) return bodyText(node.root)
  return Array.isArray(node.children) ? node.children.map(bodyText).join('') : ''
}

function articleCount(snapshot: Snapshot): number {
  return Object.values(snapshot.articles).reduce((count, articles) => count + articles.length, 0)
}

function postIn(snapshot: Snapshot, slug: string): Record<string, unknown> | undefined {
  return snapshot.articles.blog.find(post => post.slug === slug)
}

/** Only expected authorization errors count as denial; provider/validation failures do not. */
async function denied(operation: () => Promise<unknown>): Promise<boolean> {
  try { await operation(); return false } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    return status === 401 || status === 403 || status === 404
  }
}

async function missing(operation: () => Promise<unknown>): Promise<boolean> {
  try { await operation(); return false } catch (error) {
    return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 404)
  }
}

/** Writes only one uniquely named article, then deletes only the ID returned by its create. */
export async function verifyLiveContent(payload: Payload, owner: BackupOwner): Promise<VerificationReport> {
  const { createLocalReq } = await import('payload')
  const report: VerificationReport = {
    ok: false, checks: {},
    counts: { importedPages: 0, baselinePublicArticles: 0, temporaryPostsCreated: 0, temporaryPostsDeleted: 0 },
    browserTwoDeviceVerified: false, r2UploadVerified: false,
  }
  // A fresh request for every operation avoids mistaking one request's in-memory
  // document or transaction state for persisted cross-request behavior.
  const adminRequest = () => createLocalReq({ user: owner as NonNullable<PayloadRequest['user']>, context: { ...context } }, payload)
  const anonymousRequest = () => createLocalReq({ context: { ...context } }, payload)
  let stage = 'initialize'
  let createdID: Post['id'] | undefined
  const nonce = randomUUID()
  const slug = `cms-live-check-${nonce}`
  const savedDraft = `live-check-saved-${nonce}`
  const mainText = `live-check-main-${nonce}`
  const nextDraft = `live-check-next-draft-${nonce}`
  let baseline: Snapshot | undefined
  let baselineDeployments: number | undefined
  const check = (label: string, result: boolean): void => {
    report.checks[label] = result
    if (!result) throw new Error('Live verification assertion failed.')
  }
  const exported = async (): Promise<Snapshot> => {
    const snapshot = await buildSiteContent(await anonymousRequest())
    // Use the real Astro validator, including all six page contracts. Dynamic
    // URL import keeps this CLI independent of Astro's build-time environment.
    const adapterURL = new URL('../../src/lib/payload-content.mjs', import.meta.url)
    const { validatePayloadSiteContent } = await import(adapterURL.href)
    return validatePayloadSiteContent(snapshot) as Snapshot
  }
  try {
    stage = 'baseline-public-contract'
    baseline = await exported()
    report.counts.importedPages = Object.keys(baseline.pages).length
    report.counts.baselinePublicArticles = articleCount(baseline)
    check('sixPublishedPageContracts', PAGE_NAMES.every(name => name in baseline!.pages) && report.counts.importedPages === PAGE_NAMES.length)
    baselineDeployments = (await payload.find({ collection: 'deployments', depth: 0, limit: 1, req: await adminRequest(), overrideAccess: false })).totalDocs

    stage = 'create-private-draft'
    const data: Omit<Post, 'id' | 'createdAt' | 'updatedAt'> = {
      title: 'Temporary CMS verification', type: 'blog', slug, routeKey: `blog/${slug}`,
      date: new Date().toISOString(), description: 'Temporary content used only by the controlled verification CLI.',
      body: body(savedDraft), visibility: 'private', _status: 'draft', media_id: randomUUID(),
    }
    const created = await payload.create({ collection: 'posts', data, draft: true, req: await adminRequest(), overrideAccess: false, context })
    createdID = created.id
    report.counts.temporaryPostsCreated = 1

    stage = 'read-saved-draft-with-new-request'
    const saved = await payload.findByID({ collection: 'posts', id: createdID, draft: true, depth: 0, req: await adminRequest(), overrideAccess: false })
    check('privateDraftPersistsAcrossRequests', saved._status === 'draft' && saved.visibility === 'private' && bodyText(saved.body) === savedDraft)
    check('privateDraftExcludedFromExport', !postIn(await exported(), slug))

    stage = 'anonymous-access-control'
    check('anonymousDraftReadDenied', await denied(async () => payload.findByID({ collection: 'posts', id: createdID!, draft: true, req: await anonymousRequest(), overrideAccess: false })))
    check('anonymousPostWriteDenied', await denied(async () => payload.update({ collection: 'posts', id: createdID!, data: { description: 'Unauthorized change must be refused.' }, draft: true, req: await anonymousRequest(), overrideAccess: false, context })))
    check('anonymousVersionsReadDenied', await denied(async () => payload.findVersions({ collection: 'posts', where: { parent: { equals: createdID! } }, req: await anonymousRequest(), overrideAccess: false })))
    check('anonymousGlobalReadDenied', await denied(async () => payload.findGlobal({ slug: 'homepage', req: await anonymousRequest(), overrideAccess: false })))
    check('anonymousMediaReadDenied', await denied(async () => payload.find({ collection: 'media', req: await anonymousRequest(), overrideAccess: false })))
    check('anonymousMediaCreateDenied', await denied(async () => payload.create({ collection: 'media', data: { alt: 'Unauthorized metadata-only upload must be refused.' }, req: await anonymousRequest(), overrideAccess: false, context })))
    const unauthorized = await siteContentEndpoint.handler(await anonymousRequest())
    check('anonymousSiteContentEndpointDenied', unauthorized.status === 401)

    stage = 'publish-temporary-main'
    // This briefly makes only the temporary record available to the protected
    // read-token endpoint. suppressDeploy prevents all external build hooks.
    await payload.update({ collection: 'posts', id: createdID, data: { body: body(mainText), visibility: 'public', _status: 'published' }, draft: false, req: await adminRequest(), overrideAccess: false, context })
    const main = await payload.findByID({ collection: 'posts', id: createdID, draft: false, depth: 0, req: await adminRequest(), overrideAccess: false })
    check('publishedMainPersists', main._status === 'published' && main.visibility === 'public' && bodyText(main.body) === mainText)

    stage = 'save-new-draft-with-main-retained'
    await payload.update({ collection: 'posts', id: createdID, data: { body: body(nextDraft), _status: 'draft' }, draft: true, req: await adminRequest(), overrideAccess: false, context })
    const draft = await payload.findByID({ collection: 'posts', id: createdID, draft: true, depth: 0, req: await adminRequest(), overrideAccess: false })
    const retained = await payload.findByID({ collection: 'posts', id: createdID, draft: false, depth: 0, req: await adminRequest(), overrideAccess: false })
    check('newDraftPersistsAcrossRequests', draft._status === 'draft' && bodyText(draft.body) === nextDraft)
    check('savingDraftRetainsPublishedMain', retained._status === 'published' && bodyText(retained.body) === mainText)
    const publicWhileDraft = await exported()
    const exportedMain = postIn(publicWhileDraft, slug)
    check('exportUsesPublishedBodyOnly', typeof exportedMain?.bodyMarkdown === 'string' && exportedMain.bodyMarkdown.includes(mainText) && !exportedMain.bodyMarkdown.includes(nextDraft))
    check('publicExportAddsOnlyTemporaryPost', articleCount(publicWhileDraft) === report.counts.baselinePublicArticles + 1)

    stage = 'read-published-and-draft-history'
    const history = await payload.findVersions({ collection: 'posts', where: { parent: { equals: createdID } }, depth: 0, limit: 30, req: await adminRequest(), overrideAccess: false })
    const publishedVersion = history.docs.find(item => item.version._status === 'published' && bodyText(item.version.body) === mainText)
    const draftVersion = history.docs.find(item => item.version._status === 'draft' && bodyText(item.version.body) === nextDraft)
    check('publishedAndDraftVersionsExist', Boolean(publishedVersion && draftVersion && publishedVersion.id !== draftVersion.id))
    if (publishedVersion && draftVersion) {
      const oldVersion = await payload.findVersionByID({ collection: 'posts', id: publishedVersion.id, depth: 0, req: await adminRequest(), overrideAccess: false })
      const newVersion = await payload.findVersionByID({ collection: 'posts', id: draftVersion.id, depth: 0, req: await adminRequest(), overrideAccess: false })
      check('bothVersionsReadableWithFreshRequests', bodyText(oldVersion.version.body) === mainText && bodyText(newVersion.version.body) === nextDraft)
    }

    stage = 'unpublish-and-check-export'
    await payload.update({ collection: 'posts', id: createdID, data: { _status: 'draft' }, draft: false, req: await adminRequest(), overrideAccess: false, context })
    const unpublished = await payload.findByID({ collection: 'posts', id: createdID, draft: false, depth: 0, req: await adminRequest(), overrideAccess: false })
    check('unpublishedPostExcludedFromExport', unpublished._status === 'draft' && !postIn(await exported(), slug))

    stage = 'private-publication-and-check-export'
    await payload.update({ collection: 'posts', id: createdID, data: { visibility: 'private', _status: 'published', body: body(nextDraft) }, draft: false, req: await adminRequest(), overrideAccess: false, context })
    const privateMain = await payload.findByID({ collection: 'posts', id: createdID, draft: false, depth: 0, req: await adminRequest(), overrideAccess: false })
    check('privatePublishedPostExcludedFromExport', privateMain._status === 'published' && privateMain.visibility === 'private' && !postIn(await exported(), slug))
  } catch {
    // Never echo provider errors, database URLs, user input or article content.
    report.failedStage = stage
  } finally {
    if (createdID !== undefined) {
      try {
        const ownPost = await payload.findByID({ collection: 'posts', id: createdID, depth: 0, draft: false, req: await adminRequest(), overrideAccess: false })
        if (ownPost.slug !== slug || ownPost.routeKey !== `blog/${slug}`) throw new Error('Temporary identity no longer matches.')
        // Sole content override: trusted CLI cleanup of this run's returned ID.
        // No bulk where-delete, existing article, page, media or deployment row.
        await payload.delete({ collection: 'posts', id: createdID, req: await adminRequest(), overrideAccess: true, context })
        report.counts.temporaryPostsDeleted = 1
        report.checks.temporaryPostRemoved = await missing(async () => payload.findByID({ collection: 'posts', id: createdID!, draft: true, req: await adminRequest(), overrideAccess: false }))
        const leftovers = await payload.findVersions({ collection: 'posts', where: { parent: { equals: createdID } }, depth: 0, limit: 1, req: await adminRequest(), overrideAccess: false })
        report.checks.temporaryVersionsRemoved = leftovers.totalDocs === 0
      } catch { report.checks.temporaryPostRemoved = false }
    }
    if (baseline) {
      try {
        const restored = await exported()
        report.checks.publicExportRestored = isDeepStrictEqual(restored, baseline)
      } catch { report.checks.publicExportRestored = false }
    }
    if (baselineDeployments !== undefined) {
      try {
        const deployments = await payload.find({ collection: 'deployments', depth: 0, limit: 1, req: await adminRequest(), overrideAccess: false })
        report.checks.noDeploymentRecordsCreated = deployments.totalDocs === baselineDeployments
      } catch { report.checks.noDeploymentRecordsCreated = false }
    }
  }
  report.ok = !report.failedStage && report.counts.temporaryPostsCreated === 1 &&
    report.counts.temporaryPostsDeleted === 1 && Object.values(report.checks).every(Boolean)
  return report
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('Use --run only after the real v2 database, owner and frozen v1 import are ready. Creates one temporary article, briefly tests public export without triggering deployments, then removes only its own record and versions. Does not test browser sessions, concurrent devices or R2 uploads. Run while editing and preview builds are paused.')
    return
  }
  if (args.length !== 1 || args[0] !== '--run') throw new Error('Unsupported verification option.')
  loadLocalEnvironment()
  verifyEnvironment()
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  try {
    const owner = await resolveBackupOwner(payload, process.env.CMS_ADMIN_EMAIL!)
    const report = await verifyLiveContent(payload, owner)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } finally { await payload.destroy() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(() => finishCLI()).catch(() => {
    console.error('Live CMS verification did not complete. Check the real v2 environment, initialized owner and imported pages. No raw provider error or credentials are printed.')
    return finishCLI(1)
  })
}
