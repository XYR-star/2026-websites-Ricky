import { timingSafeEqual } from 'node:crypto'
import type { Endpoint, PayloadRequest } from 'payload'
import { isPublishedContentRead, withPublishedContentRead } from '../access/content.js'
import { exportPageData, PAGE_NAMES, type PageName } from '../lib/page-data.js'
import { getContentEditorConfig, getPublishedMediaURL, isPublicAssetURL, serializeContentBody, type MediaDocument, type MediaReference } from '../lib/content-serialization.js'

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Authorization',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
}

export function isValidSiteContentToken(header: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length < 32 || !header?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const wanted = Buffer.from(expected)
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted)
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`文章${label}无效。`)
  return value
}

async function publishedRead<T>(req: PayloadRequest, step: string, read: () => Promise<T>): Promise<T> {
  try { return await read() } catch (error) {
    // Diagnose boundaries without logging article text, URLs or provider errors.
    req.payload.logger.error({ msg: 'Published content read step failed', step,
      readerScopeActive: isPublishedContentRead(req), errorName: error instanceof Error ? error.name : 'UnknownError' })
    throw error
  }
}

async function readPublishedMedia(reference: MediaReference, req: PayloadRequest): Promise<MediaDocument> {
  const id = typeof reference === 'object' && reference ? reference.id : reference
  if (typeof id !== 'string' && typeof id !== 'number') throw new Error('无效的媒体关联。')
  const doc = await publishedRead(req, 'media', () => req.payload.findByID({ collection: 'media', id, req, depth: 0, overrideAccess: false, draft: false }))
  getPublishedMediaURL(doc as MediaDocument)
  return doc as MediaDocument
}

async function exportPost(doc: Record<string, any>, req: PayloadRequest, editorConfig: Awaited<ReturnType<typeof getContentEditorConfig>>): Promise<Record<string, unknown>> {
  if (doc._status !== 'published' || doc.visibility !== 'public') throw new Error('内容接口拒绝导出非公开版本。')
  if (!['blog', 'travel', 'research'].includes(doc.type)) throw new Error('文章类型无效。')
  const slug = text(doc.slug, '地址')
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u.test(slug)) throw new Error('文章地址无效。')
  const date = text(doc.date, '日期')
  if (!Number.isFinite(Date.parse(date))) throw new Error('文章日期无效。')
  const output: Record<string, unknown> = {
    _status: 'published', slug, title: text(doc.title, '标题'), date,
    bodyMarkdown: await serializeContentBody(doc.body, editorConfig, reference => readPublishedMedia(reference, req)),
  }
  if (doc.type === 'research') {
    output.summary = typeof doc.summary === 'string' ? doc.summary : ''
    for (const field of ['project', 'status']) if (typeof doc[field] === 'string' && doc[field]) output[field] = doc[field]
    output.links = (doc.links ?? []).map((link: any) => {
      const href = text(link.href, '资料链接')
      const url = new URL(href)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\s\\\u0000-\u001f\u007f]/u.test(href)) throw new Error('资料链接不安全。')
      return { label: text(link.label, '资料名称'), href }
    })
  } else output.description = typeof doc.description === 'string' ? doc.description : ''
  if (doc.type === 'blog') output.tags = (doc.tags ?? []).map((item: any) => text(typeof item === 'string' ? item : item.tag, '标签'))
  if (typeof doc.media_id === 'string') output.media_id = doc.media_id
  if (doc.cover) output.cover = getPublishedMediaURL(await readPublishedMedia(doc.cover, req))
  else if (doc.legacyCoverUrl) {
    if (!isPublicAssetURL(doc.legacyCoverUrl)) throw new Error('旧封面地址不属于公开素材来源。')
    output.cover = doc.legacyCoverUrl
  }
  if (doc.type === 'travel' && !output.cover) throw new Error('公开游记缺少封面。')
  return output
}

export async function buildSiteContent(req: PayloadRequest): Promise<Record<string, unknown>> {
  return withPublishedContentRead(req, async () => {
    const articles: Record<string, Record<string, unknown>[]> = { blog: [], travel: [], research: [] }
    const editorConfig = await getContentEditorConfig(req.payload.config)
    let page = 1
    while (true) {
      const result = await publishedRead(req, 'posts', () => req.payload.find({
        collection: 'posts', req, overrideAccess: false, draft: false,
        where: { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] },
        depth: 0, limit: 100, page, sort: '-date',
      }))
      for (const doc of result.docs) articles[String((doc as any).type)].push(await exportPost(doc as any, req, editorConfig))
      if (!result.hasNextPage) break
      if (++page > 1000) throw new Error('内容数量超出单次构建上限。')
    }
    const pages: Partial<Record<PageName, unknown>> = {}
    for (const slug of PAGE_NAMES) {
      const doc = await publishedRead(req, `page:${slug}`, () => req.payload.findGlobal({ slug, req, overrideAccess: false, draft: false, depth: 0 }))
      if ((doc as any)._status !== 'published') throw new Error('页面配置尚未发布，已停止正式内容导出。')
      pages[slug] = exportPageData(slug, doc as any)
    }
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), articles, pages }
  })
}

export const siteContentEndpoint: Endpoint = {
  path: '/site-content', method: 'get',
  handler: async req => {
    if (!process.env.CMS_READ_TOKEN || process.env.CMS_READ_TOKEN.length < 32) return Response.json({ error: '内容读取服务尚未配置。' }, { status: 503, headers: responseHeaders })
    if (!isValidSiteContentToken(req.headers.get('authorization'), process.env.CMS_READ_TOKEN)) return Response.json({ error: '需要有效的只读凭据。' }, { status: 401, headers: responseHeaders })
    try {
      return Response.json(await buildSiteContent(req), { headers: responseHeaders })
    } catch (error) {
      req.payload.logger.error({ msg: 'Published site-content export failed', errorName: error instanceof Error ? error.name : 'UnknownError' })
      return Response.json({ error: '正式内容暂时无法读取；请检查发布状态及素材准备结果。' }, { status: 503, headers: responseHeaders })
    }
  },
}
