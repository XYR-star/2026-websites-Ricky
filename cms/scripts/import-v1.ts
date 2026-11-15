import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { Payload, PayloadRequest } from 'payload'
import type { Post } from '../src/payload-types'
import { finishCLI, loadLocalEnvironment, verifyEnvironment } from './load-env'
import {
  allLegacyMedia, assertMarkdownRoundTrip, readFrozenV1Source,
  type FrozenArticle, type FrozenV1Source,
} from './v1-source'
import {
  getContentEditorConfig, importLegacyMarkdown, serializeContentBody,
  type MediaDocument, type MediaLookup, type MediaReference,
} from '../src/lib/content-serialization'
import { PAGE_NAMES, exportPageData, importPageData } from '../src/lib/page-data'

type EditorConfig = Awaited<ReturnType<typeof getContentEditorConfig>>
const context = { importV1: true, suppressDeploy: true }

export function importMode(args: string[]): 'dry-run' | 'apply' | 'help' {
  if (args.some(arg => !['--apply', '--dry-run', '--help'].includes(arg))) throw new Error('仅支持 --dry-run、--apply 或 --help；不能指定本机草稿目录。')
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('--apply 与 --dry-run 不能同时使用。')
  if (args.includes('--help')) return 'help'
  return args.includes('--apply') ? 'apply' : 'dry-run'
}

function mediaResolver(media: Map<string, MediaDocument>) {
  return async (reference: MediaReference): Promise<MediaDocument> => {
    const id = reference && typeof reference === 'object' ? reference.id : reference
    const item = id === undefined ? undefined : media.get(String(id))
    if (!item) throw new Error('v1 导入预检失败：正文素材没有对应的已核对记录。')
    return item
  }
}

/** Complete every conversion and page validation before opening a database. */
export async function preflightFrozenImport(source: FrozenV1Source, editorConfig: EditorConfig) {
  const media = allLegacyMedia(source)
  const mediaByUrl = new Map<string, MediaDocument>()
  const mediaByID = new Map<string, MediaDocument>()
  media.forEach((item, index) => {
    const doc = { id: `v1-preview-${index + 1}`, publicUrl: item.url, originalUrl: item.url, alt: item.alt }
    mediaByUrl.set(item.url, doc)
    mediaByID.set(String(doc.id), doc)
  })
  for (const article of source.articles) {
    const body = await importLegacyMarkdown(article.markdown, mediaByUrl, editorConfig)
    const restored = await serializeContentBody(body, editorConfig, mediaResolver(mediaByID))
    assertMarkdownRoundTrip(article.markdown, restored, article.routeKey)
  }
  for (const name of PAGE_NAMES) {
    const roundTrip = exportPageData(name, importPageData(name, source.pages[name]))
    if (!isDeepStrictEqual(roundTrip, source.pages[name])) throw new Error(`v1 导入预检失败：${name} 页面转换改变了字段、文案或排列。`)
  }
  return { articleCount: source.articles.length, pageCount: PAGE_NAMES.length, mediaCount: media.length, markdownRoundTrips: source.articles.length }
}

type ImportedPostData = Omit<Post, 'id' | 'createdAt' | 'updatedAt'>

export function importedPostData(article: FrozenArticle, body: Post['body']): ImportedPostData {
  const data: ImportedPostData = {
    type: article.type, slug: article.slug, routeKey: article.routeKey,
    title: article.title, date: article.date, body, media_id: article.media_id,
    visibility: 'public', _status: article.draft ? 'draft' : 'published',
  }
  if (article.type === 'research') {
    data.summary = article.summary
    if (article.project !== undefined) data.project = article.project
    if (article.status !== undefined) data.status = article.status
    if (article.links !== undefined) data.links = article.links
  } else {
    data.description = article.description
    if (article.cover) data.legacyCoverUrl = article.cover
  }
  if (article.tags !== undefined) data.tags = article.tags.map(tag => ({ tag }))
  return data
}

/** Privileged CLI-only identity discovery; all subsequent content operations use normal access control. */
async function administratorRequest(payload: Payload): Promise<PayloadRequest> {
  const email = process.env.CMS_ADMIN_EMAIL!.trim().toLowerCase()
  const result = await payload.find({
    collection: 'users', where: { email: { equals: email } }, limit: 2, depth: 0,
    select: { email: true, role: true }, overrideAccess: true,
  })
  const owner = result.docs[0]
  if (result.totalDocs !== 1 || owner?.email?.trim().toLowerCase() !== email || owner.role !== 'admin') {
    throw new Error('先完成唯一管理员的受控初始化；导入没有修改内容。')
  }
  const { createLocalReq } = await import('payload')
  // The trusted CLI intentionally selected only identity fields. Access checks
  // use these fields and must not require loading password/session metadata.
  const user = { ...owner, collection: 'users' } as NonNullable<PayloadRequest['user']>
  return createLocalReq({ user, context }, payload)
}

async function importMetadata(payload: Payload, req: PayloadRequest, source: FrozenV1Source) {
  const lookup = new Map<string, MediaDocument>()
  let created = 0
  let skipped = 0
  for (const item of allLegacyMedia(source)) {
    const found = await payload.find({
      collection: 'media', where: { or: [{ originalUrl: { equals: item.url } }, { publicUrl: { equals: item.url } }] },
      limit: 1, depth: 0, overrideAccess: false, req,
    })
    let doc = found.docs[0]
    if (doc) skipped++
    else {
      // This explicit bypass is limited to importing already-public metadata.
      // No image bytes are uploaded, copied, transformed or fetched here.
      doc = await payload.create({
        collection: 'media', overrideAccess: true, req, context,
        data: {
          alt: item.alt || 'v1 图片', originalUrl: item.url, publicUrl: item.url,
          // This describes an existing public image; it does not create a fake
          // uploaded filename or make the private S3 adapter fetch its bytes.
          mimeType: legacyMediaMimeType(item.url),
        },
      })
      created++
    }
    lookup.set(item.url, doc as MediaDocument)
  }
  return { lookup, created, skipped }
}

function legacyMediaMimeType(url: string): string | undefined {
  const extension = /\.([a-z0-9]+)$/i.exec(new URL(url, 'https://www.heyrickishere.com').pathname)?.[1].toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' } as Record<string, string>)[extension || '']
}

export async function applyFrozenImport(payload: Payload, req: PayloadRequest, source: FrozenV1Source, editorConfig: EditorConfig) {
  const media = await importMetadata(payload, req, source)
  const mediaByID = new Map([...media.lookup.values()].map(doc => [String(doc.id), doc]))
  const posts = { created: 0, skipped: 0 }
  const pages = { created: 0, skipped: 0 }
  for (const article of source.articles) {
    const existing = await payload.find({
      collection: 'posts', where: { routeKey: { equals: article.routeKey } },
      limit: 1, depth: 0, draft: true, overrideAccess: false, req,
    })
    if (existing.totalDocs) { posts.skipped++; continue }
    const body = await importLegacyMarkdown(article.markdown, media.lookup as MediaLookup, editorConfig)
    const restored = await serializeContentBody(body, editorConfig, mediaResolver(mediaByID))
    assertMarkdownRoundTrip(article.markdown, restored, article.routeKey)
    const data = importedPostData(article, body)
    const options = { collection: 'posts' as const, data, overrideAccess: false, req, context }
    if (article.draft) await payload.create({ ...options, draft: true })
    else await payload.create({ ...options, draft: false })
    posts.created++
  }
  for (const name of PAGE_NAMES) {
    const existing = await payload.findGlobal({ slug: name, draft: true, depth: 0, overrideAccess: false, req })
    if (existing.id !== undefined && existing.id !== null || existing.createdAt || existing.updatedAt) { pages.skipped++; continue }
    await payload.updateGlobal({
      slug: name, data: { ...importPageData(name, source.pages[name]), _status: 'published' },
      draft: false, overrideAccess: false, req, context,
    })
    pages.created++
  }
  return { posts, pages, media: { created: media.created, skipped: media.skipped }, imagesUploaded: 0, deploysTriggered: 0 }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const mode = importMode(args)
  if (mode === 'help') {
    console.log('默认离线预检 v1.0.0 冻结内容。仅 --apply 会连接已配置的 v2 数据库并导入；已有内容保持原样。')
    return
  }
  loadLocalEnvironment()
  const source = readFrozenV1Source()
  const { default: configPromise } = await import('../src/payload.config')
  const config = await configPromise
  const editorConfig = await getContentEditorConfig(config)
  const checked = await preflightFrozenImport(source, editorConfig)
  if (mode === 'dry-run') {
    console.log(JSON.stringify({ mode, databaseAccessed: false, source: { tag: source.tag, commit: source.commit }, checked, sourceFilesChanged: false }, null, 2))
    return
  }
  verifyEnvironment()
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config })
  try {
    const req = await administratorRequest(payload)
    const result = await applyFrozenImport(payload, req, source, editorConfig)
    console.log(JSON.stringify({ mode, source: { tag: source.tag, commit: source.commit }, checked, result, sourceFilesChanged: false }, null, 2))
  } finally { await payload.destroy() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(() => finishCLI()).catch(error => {
    const safeMessage = error instanceof Error && error.message.startsWith('v1 导入预检失败：')
      ? error.message : 'v1 导入未完成。请核对环境、管理员及数据库状态；原稿未修改，可修正后幂等重试。'
    console.error(safeMessage)
    return finishCLI(1)
  })
}
