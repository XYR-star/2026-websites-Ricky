import { createHash, randomUUID } from 'node:crypto'
import { APIError, type CollectionAfterChangeHook, type CollectionAfterDeleteHook, type CollectionBeforeChangeHook, type GlobalAfterChangeHook, type GlobalBeforeChangeHook, type GlobalBeforeOperationHook, type Payload, type PayloadRequest } from 'payload'
import { isContentAdmin } from '../access/content'
import { referencedMediaIDs } from '../lib/media-policy'
import { prepareMedia } from '../lib/public-media'
import { isTrustedPublicMedia, serverOrigins } from '../lib/runtime-env'

type Publication = { _status?: string | null; visibility?: string | null }
const oldPublications = new WeakMap<object, Map<string, Publication>>()
function remember(req: PayloadRequest, key: string, value: Publication) {
  let map = oldPublications.get(req)
  if (!map) { map = new Map(); oldPublications.set(req, map) }
  map.set(key, value)
}
function consume(req: PayloadRequest, key: string): Publication | undefined {
  const map = oldPublications.get(req)
  const result = map?.get(key)
  map?.delete(key)
  return result
}

export const preparePostMedia: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req, context }) => {
  if (context.importV1 || context.suppressDeploy) return data
  if (!isContentAdmin(req)) throw new Error('Please sign in before publishing.')
  if (operation === 'update' && originalDoc?.id !== undefined) {
    const main = await req.payload.findByID({ collection: 'posts', id: originalDoc.id, draft: false, depth: 0, overrideAccess: false, req })
    remember(req, `post:${originalDoc.id}`, { _status: main._status, visibility: main.visibility })
  }
  if (data._status !== 'published' || (data.visibility ?? originalDoc?.visibility) === 'private') return data
  const media_id = data.media_id || originalDoc?.media_id || randomUUID()
  const article = { type: data.type || originalDoc?.type, media_id }
  const body = data.body ?? originalDoc?.body
  const cover = data.cover === undefined ? originalDoc?.cover : data.cover
  const legacyCover = data.legacyCoverUrl === undefined ? originalDoc?.legacyCoverUrl : data.legacyCoverUrl
  if (legacyCover && !isTrustedPublicMedia(legacyCover)) throw new Error('The legacy cover is not a trusted public image.')
  if (article.type === 'travel' && !cover && !legacyCover) throw new Error('游记发布前需要设置封面。')
  const description = article.type === 'research' ? (data.summary ?? originalDoc?.summary) : (data.description ?? originalDoc?.description)
  if (!String(description || '').trim()) throw new Error('发布前请填写简介或摘要。')
  for (const id of referencedMediaIDs(body, cover)) await prepareMedia(id, article, req)
  return { ...data, media_id }
}

/** Runs only after the content transaction is committed, with no inherited req/transaction. */
export async function dispatchDeploymentRecord(payload: Payload, id: string | number): Promise<boolean> {
  let record
  try {
    record = await payload.findByID({ collection: 'deployments', id, depth: 0, overrideAccess: true })
  } catch { return false } // A rolled-back transaction has no outbox row to dispatch.
  if (record.status === 'requested') return true
  const hook = process.env.SITE_DEPLOY_HOOK?.trim()
  if (!hook) {
    await payload.update({ collection: 'deployments', id, data: { status: 'not-configured', message: '预览部署连接尚未配置，内容仍保存在 v2 数据库。' }, overrideAccess: true })
    return false
  }
  try {
    const url = new URL(hook)
    if (url.origin !== 'https://api.vercel.com' || !url.pathname.startsWith('/v1/integrations/deploy/')) throw new Error('Invalid deployment hook.')
    await payload.update({ collection: 'deployments', id, data: { status: 'pending', message: '内容已提交，正在发送网站更新请求。' }, overrideAccess: true })
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), cache: 'no-store' })
    if (!response.ok) throw new Error('Deploy request rejected.')
    const result = await response.json() as { job?: { id?: string } }
    await payload.update({ collection: 'deployments', id, data: { status: 'requested', jobId: result.job?.id || '', message: 'Vercel 已接收部署请求；构建成功才表示网站已更新。' }, overrideAccess: true })
    return true
  } catch {
    await payload.update({ collection: 'deployments', id, data: { status: 'failed', message: '网站更新请求未确认成功。内容已保留，可从此记录重试。' }, overrideAccess: true })
    return false
  }
}

async function queueBuild(req: PayloadRequest, eventKey: string, label: string): Promise<void> {
  if (!isContentAdmin(req) || req.context.importV1 || req.context.suppressDeploy) return
  const previous = await req.payload.find({ collection: 'deployments', where: { eventKey: { equals: eventKey } }, limit: 1, depth: 0, overrideAccess: false, req })
  if (previous.totalDocs) return
  const hook = process.env.SITE_DEPLOY_HOOK?.trim()
  // This durable outbox row participates in the same transaction as the content.
  // Failure must abort that transaction rather than silently lose its publish event.
  const record = await req.payload.create({ collection: 'deployments', data: {
    eventKey, label, status: hook ? 'pending' : 'not-configured',
    message: hook ? '等待内容事务提交后发送网站更新。' : '内容保存在 v2 数据库，尚未配置预览部署连接。',
  }, overrideAccess: true, req })
  if (!hook) return
  try {
    const { after } = await import('next/server.js')
    after(async () => { await dispatchDeploymentRecord(req.payload, record.id) })
  } catch {
    // CLI/non-Next execution or unavailable scheduling leaves a durable retry row.
    req.payload.logger.warn({ msg: 'Website update remains queued; retry the persisted deployment record after commit.' })
  }
}

export const notifyPostPublished: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  const previousMain = consume(req, `post:${doc.id}`)
  if (context.importV1 || context.suppressDeploy) return doc
  const current = await req.payload.findByID({ collection: 'posts', id: doc.id, depth: 0, draft: false, overrideAccess: false, req })
  if (current.updatedAt !== doc.updatedAt || current._status !== doc._status) return doc
  const before = previousMain ?? previousDoc
  const wasPublic = before?._status === 'published' && before?.visibility === 'public'
  const isPublic = current._status === 'published' && current.visibility === 'public'
  if (!wasPublic && !isPublic) return doc
  const key = createHash('sha256').update(`post:${doc.id}:${current.updatedAt}:${current._status}:${current.visibility}`).digest('hex')
  await queueBuild(req, key, `${isPublic ? '发布或更新' : '撤下'}：${doc.title}`)
  return doc
}

export const notifyPostDeleted: CollectionAfterDeleteHook = async ({ doc, req, context }) => {
  if (!context.importV1 && doc._status === 'published' && doc.visibility === 'public') await queueBuild(req, `delete:${doc.id}:${doc.updatedAt}`, `删除已发布文章：${doc.title}`)
  return doc
}

export const protectPublishedGlobal: GlobalBeforeOperationHook = async ({ args, operation, req, global, context }) => {
  if (operation !== 'update' || context.importV1 || context.suppressDeploy || args?.draft === true) return args
  const main = await req.payload.findGlobal({ slug: global.slug, draft: false, depth: 0, overrideAccess: false, req })
  if (main._status === 'published') {
    if (args?.data?._status === 'draft' || args?.unpublishAllLocales) throw new APIError('站点必备页面不能撤稿。可以继续保存新草稿；首页区块可通过“显示这一块”隐藏。', 409)
    // A normal PATCH may merge a newer draft into the main document. Keep its
    // published status explicit when the caller did not supply a status.
    if (args?.data && args.data._status === undefined) return { ...args, data: { ...args.data, _status: 'published' } }
  }
  return args
}

export const captureGlobalPublication: GlobalBeforeChangeHook = async ({ data, req, context, global }) => {
  if (!context.importV1 && !context.suppressDeploy) {
    const main = await req.payload.findGlobal({ slug: global.slug, draft: false, depth: 0, overrideAccess: false, req })
    remember(req, `global:${global.slug}`, { _status: main._status })
  }
  return data
}

export const notifyGlobalPublished: GlobalAfterChangeHook = async ({ doc, previousDoc, req, context, global }) => {
  const previousMain = consume(req, `global:${global.slug}`)
  if (context.importV1 || context.suppressDeploy) return doc
  const current = await req.payload.findGlobal({ slug: global.slug, draft: false, depth: 0, overrideAccess: false, req })
  if (current.updatedAt !== doc.updatedAt || current._status !== doc._status) return doc
  if (doc._status !== 'published' && (previousMain ?? previousDoc)?._status !== 'published') return doc
  await queueBuild(req, `global:${global.slug}:${doc.updatedAt}:${doc._status}`, `更新页面：${global.slug}`)
  return doc
}

export async function retryDeployment(req: PayloadRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!isContentAdmin(req)) return Response.json({ error: '请先登录后台。' }, { status: 401, headers })
  if (req.headers.get('x-cms-request') !== '1' || !serverOrigins().includes(req.headers.get('origin') || '')) return Response.json({ error: '请求来源无效。' }, { status: 403, headers })
  const id = req.routeParams?.id
  if (typeof id !== 'string' || !/^[0-9]+$/.test(id)) return Response.json({ error: '发布记录无效。' }, { status: 400, headers })
  await req.payload.findByID({ collection: 'deployments', id, depth: 0, overrideAccess: false, req })
  if (!process.env.SITE_DEPLOY_HOOK?.trim()) return Response.json({ error: 'v2 预览部署连接尚未配置；内容仍保存在数据库中。' }, { status: 503, headers })
  // This custom endpoint has no enclosing content-write transaction. Reset the
  // committed outbox row, then dispatch through a fresh system request.
  await req.payload.update({ collection: 'deployments', id, data: { status: 'pending' }, overrideAccess: true })
  const sent = await dispatchDeploymentRecord(req.payload, id)
  return Response.json(sent ? { message: '部署请求已发送；构建成功后网站才会更新。' } : { error: '网站更新请求失败，已保存的内容仍保留。' }, { status: sent ? 200 : 502, headers })
}
