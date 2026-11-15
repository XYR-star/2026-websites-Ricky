import type { PayloadRequest } from 'payload'
import { isContentAdmin } from '../access/content'
import { serverOrigins } from '../lib/runtime-env'
import { MAX_MANIFEST_BYTES, manifestMatches, validContentBinding, validateContentManifest, type ContentBinding } from '../lib/content-fingerprint'

export type PublicationCheck = { state: 'verified' | 'different' | 'check-failed' | 'not-tracked'; checkedAt: string; message: string }
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/** This origin is server configuration, never a URL supplied by a request. */
export function publicationManifestURL(site = process.env.SITE_URL || 'https://www.heyrickishere.com'): string {
  const url = new URL(site)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname)) throw new Error('Invalid public website origin.')
  return `${url.origin}/.well-known/cms-status.json`
}

export async function checkPublicContent(binding: ContentBinding, options: { fetchImpl?: typeof fetch; site?: string } = {}): Promise<PublicationCheck> {
  const checkedAt = new Date().toISOString()
  try {
    const response = await (options.fetchImpl || fetch)(publicationManifestURL(options.site), {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Manifest unavailable.')
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_MANIFEST_BYTES) throw new Error('Manifest too large.')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Manifest empty.')
    let bytes = 0, text = ''
    const decoder = new TextDecoder('utf-8', { fatal: true })
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > MAX_MANIFEST_BYTES) { await reader.cancel(); throw new Error('Manifest too large.') }
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    } finally { reader.releaseLock() }
    const manifest = validateContentManifest(JSON.parse(text))
    return manifestMatches(binding, manifest)
      ? { state: 'verified', checkedAt, message: '已上线（内容已核验）：正式站当前的文章或页面与本次发布一致。' }
      : { state: 'different', checkedAt, message: '尚未核验到本次内容：网站当前为其他版本，可能仍在部署或已有后续更新。' }
  } catch {
    // A network problem or mismatching content is never called a build failure.
    return { state: 'check-failed', checkedAt, message: '网站内容检查暂时失败，不能据此判断部署失败。已保存内容与发布记录仍保留。' }
  }
}

export async function checkPublication(req: PayloadRequest): Promise<Response> {
  if (!isContentAdmin(req)) return Response.json({ error: '请先登录后台。' }, { status: 401, headers })
  if (req.headers.get('x-cms-request') !== '1' || !serverOrigins().includes(req.headers.get('origin') || '')) return Response.json({ error: '请求来源无效。' }, { status: 403, headers })
  const id = req.routeParams?.id
  if (typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id)) return Response.json({ error: '发布记录无效。' }, { status: 400, headers })
  const record = await req.payload.findByID({ collection: 'deployments', id, depth: 0, overrideAccess: false, req })
  const result: PublicationCheck = validContentBinding(record.contentBinding)
    ? await checkPublicContent(record.contentBinding)
    : { state: 'not-tracked', checkedAt: new Date().toISOString(), message: '这条旧记录没有保存内容摘要，无法准确核验；发布新版本后可使用内容检查。' }
  await req.payload.update({ collection: 'deployments', id, data: { siteStatus: result.state, siteCheckedAt: result.checkedAt, siteMessage: result.message }, overrideAccess: true })
  return Response.json(result, { headers })
}
