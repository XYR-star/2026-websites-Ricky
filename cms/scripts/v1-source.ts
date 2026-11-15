import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { marked, type Token, type Tokens } from 'marked'
import { PAGE_NAMES, type PageName } from '../src/lib/page-data'
import { isPublicAssetURL } from '../src/lib/content-serialization'
// The importer validates against the frontend's public page contract as well.
// It runs from this full source checkout, never as a deployed request handler.
import { validatePageData } from '../../src/lib/page-data.mjs'

export const V1_TAG = 'v1.0.0'
export const V1_COMMIT = 'd5b026c7ca5029ca006a4b12de2667c57b8b8ffd'
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
export const ARTICLE_TYPES = ['blog', 'research', 'travel'] as const
export type ArticleType = typeof ARTICLE_TYPES[number]
export type LegacyMedia = { url: string; alt: string; title: string }
export type FrozenArticle = {
  sourcePath: string
  sourceHash: string
  type: ArticleType
  slug: string
  routeKey: string
  title: string
  date: string
  markdown: string
  draft: boolean
  media_id: string
  description?: string
  summary?: string
  cover?: string
  tags?: string[]
  project?: string
  status?: string
  links?: { label: string; href: string }[]
  images: LegacyMedia[]
}
export type FrozenV1Source = {
  tag: string
  commit: string
  articles: FrozenArticle[]
  pages: Record<PageName, Record<string, any>>
  pageHashes: Record<PageName, string>
}

function fail(message: string): never { throw new Error(`v1 导入预检失败：${message}`) }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function nonempty(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} 缺失或不是文字。`)
  return value
}
function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') fail(`${field} 不是文字。`)
  return value
}
function normalizedDate(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(text)) fail('文章日期无效。')
  const day = text.slice(0, 10)
  const date = new Date(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(Date.parse(text)) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) fail('文章日期不是有效日历日期。')
  return text
}

/** Extract actual Markdown images. Code examples are deliberately not assets. */
export function legacyMediaReferences(markdown: string): LegacyMedia[] {
  const images: LegacyMedia[] = []
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type !== 'image') return
    if (!isPublicAssetURL(token.href)) fail('正文图片不是受信任的 v1 公开素材地址。')
    images.push({ url: token.href, alt: token.text ?? '', title: token.title ?? '' })
  })
  return images
}

export function parseFrozenArticle(sourcePath: string, raw: string): FrozenArticle {
  const match = /^src\/content\/(blog|research|travel)\/([^/]+)\.md$/u.exec(sourcePath)
  if (!match || match[2].startsWith('_')) fail('不支持这个文章路径。')
  const type = match[1] as ArticleType
  const slug = match[2]
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u.test(slug)) fail('原文章地址无效，不能自动改名。')
  const parsed = matter(raw)
  const data = parsed.data
  if (data.draft !== undefined && typeof data.draft !== 'boolean') fail('原稿 draft 标记不是布尔值。')
  if (data.media_id !== undefined && (typeof data.media_id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(data.media_id))) fail('原素材编号不是有效 UUID。')
  const article: FrozenArticle = {
    sourcePath, sourceHash: hash(raw), type, slug, routeKey: `${type}/${slug}`,
    title: nonempty(data.title, '标题'), date: normalizedDate(data.date),
    markdown: parsed.content, draft: data.draft === true, media_id: data.media_id ?? randomUUID(),
    images: legacyMediaReferences(parsed.content),
  }
  if (type === 'research') {
    article.summary = nonempty(data.summary, '研究摘要')
    article.project = optionalText(data.project, '所属项目')
    article.status = optionalText(data.status, '研究进展')
    if (data.links !== undefined) {
      if (!Array.isArray(data.links)) fail('研究资料链接不是列表。')
      article.links = data.links.map(link => {
        if (!link || typeof link !== 'object' || Array.isArray(link)) fail('研究资料链接格式无效。')
        const href = nonempty(link.href, '资料链接')
        let url: URL
        try { url = new URL(href) } catch { fail('研究资料链接无效。') }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\s\\\u0000-\u001f\u007f]/u.test(href)) fail('研究资料链接不安全。')
        return { label: nonempty(link.label, '资料名称'), href }
      })
    }
  } else {
    article.description = nonempty(data.description, '简介')
    const cover = optionalText(data.cover, '封面')
    if (cover) {
      if (!isPublicAssetURL(cover)) fail('封面不是受信任的 v1 公开素材地址。')
      article.cover = cover
    }
    if (type === 'travel' && !article.cover) fail('游记缺少封面。')
  }
  if (type === 'blog' && data.tags !== undefined) {
    if (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string')) fail('博客标签格式无效。')
    article.tags = [...data.tags]
  }
  return article
}

function runGit(args: string[], cwd: string): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}
function utf8(value: Buffer): string { return new TextDecoder('utf-8', { fatal: true }).decode(value) }

/** Read immutable Git objects only. Working-tree drafts are never considered. */
export function readFrozenV1Source(options: { repoRoot?: string; expectedCommit?: string } = {}): FrozenV1Source {
  const repoRoot = options.repoRoot ?? repositoryRoot
  const expectedCommit = options.expectedCommit ?? V1_COMMIT
  const commit = utf8(runGit(['rev-parse', '--verify', `${V1_TAG}^{commit}`], repoRoot)).trim()
  if (!/^[a-f0-9]{40}$/.test(commit) || commit !== expectedCommit) fail('v1.0.0 标签与冻结的正式提交不一致。')
  const paths = utf8(runGit(['ls-tree', '-r', '--name-only', '-z', commit, '--', ...ARTICLE_TYPES.map(type => `src/content/${type}`)], repoRoot)).split('\0').filter(Boolean)
  const articles = paths.filter(path => path.endsWith('.md') && !path.split('/').some(part => part.startsWith('_')))
    .map(path => parseFrozenArticle(path, utf8(runGit(['show', `${commit}:${path}`], repoRoot))))
  const routes = new Set<string>()
  for (const article of articles) {
    if (routes.has(article.routeKey)) fail('原稿包含重复文章地址。')
    routes.add(article.routeKey)
  }
  const pages = {} as FrozenV1Source['pages']
  const pageHashes = {} as FrozenV1Source['pageHashes']
  for (const name of PAGE_NAMES) {
    const raw = utf8(runGit(['show', `${commit}:src/data/${name}.json`], repoRoot))
    let data: Record<string, any>
    try { data = JSON.parse(raw); validatePageData(name, data) } catch { fail(`${name} 页面配置无效。`) }
    pages[name] = data
    pageHashes[name] = hash(raw)
  }
  return { tag: V1_TAG, commit, articles, pages, pageHashes }
}

type SemanticNode = string | number | boolean | null | SemanticNode[] | { [key: string]: SemanticNode }
const whitespace = (value: string): string => value.replace(/\s+/gu, ' ')
function inline(tokens: Token[] = []): SemanticNode[] {
  const result: SemanticNode[] = []
  for (const token of tokens) {
    let value: SemanticNode
    switch (token.type) {
      case 'text': value = token.tokens ? { textGroup: inline(token.tokens) } : whitespace(token.text); break
      case 'escape': value = token.text; break
      case 'strong': case 'em': case 'del': value = { type: token.type, children: inline(token.tokens) }; break
      case 'codespan': value = { type: 'code', text: token.text }; break
      case 'br': value = { type: 'break' }; break
      case 'link': value = { type: 'link', href: token.href, title: token.title ?? '', children: inline(token.tokens) }; break
      case 'image': value = { type: 'image', href: token.href, title: token.title ?? '', alt: token.text }; break
      case 'html': value = { type: 'html', text: token.text }; break
      default: fail(`正文包含尚未验证可往返的行内格式：${token.type}。`)
    }
    if (typeof value === 'string' && typeof result.at(-1) === 'string') result[result.length - 1] = `${result.at(-1)}${value}`
    else result.push(value)
  }
  return result
}

function blocks(tokens: Token[]): SemanticNode[] {
  const result: SemanticNode[] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'space': case 'def': break
      case 'heading': result.push({ type: 'heading', depth: token.depth, children: inline(token.tokens) }); break
      case 'paragraph': case 'text': result.push({ type: 'paragraph', children: inline(token.tokens ?? [{ type: 'text', raw: token.raw, text: token.text }]) }); break
      case 'code': result.push({ type: 'code', language: token.lang || 'text', code: token.text }); break
      case 'hr': result.push({ type: 'hr' }); break
      case 'blockquote': result.push({ type: 'blockquote', children: blocks(token.tokens ?? []) }); break
      case 'list': {
        const list = token as Tokens.List
        result.push({ type: 'list', ordered: list.ordered, start: list.ordered ? Number(list.start) : null, items: list.items.map(item => ({ task: item.task ?? false, checked: item.checked ?? false, children: blocks(item.tokens) })) })
        break
      }
      case 'table': {
        const table = token as Tokens.Table
        result.push({ type: 'table', align: table.align, header: table.header.map(cell => inline(cell.tokens)), rows: table.rows.map(row => row.map(cell => inline(cell.tokens))) })
        break
      }
      case 'html': result.push({ type: 'html', text: token.text }); break
      default: fail(`正文包含尚未验证可往返的区块格式：${token.type}。`)
    }
  }
  return result
}

export function markdownSemantics(markdown: string): SemanticNode[] { return blocks(marked.lexer(markdown.replaceAll('\r\n', '\n'))) }

/** Formatting markers may change; visible text, structure, links and code may not. */
export function assertMarkdownRoundTrip(before: string, after: string, routeKey: string): void {
  if (JSON.stringify(markdownSemantics(before)) !== JSON.stringify(markdownSemantics(after))) {
    fail(`${routeKey} 的正文往返改变了文本、结构、代码或素材引用；未执行写入。`)
  }
}

export function allLegacyMedia(source: FrozenV1Source): LegacyMedia[] {
  const media = new Map<string, LegacyMedia>()
  for (const article of source.articles) {
    if (article.cover && !media.has(article.cover)) media.set(article.cover, { url: article.cover, alt: article.title, title: '' })
    for (const image of article.images) if (!media.has(image.url)) media.set(image.url, image)
  }
  return [...media.values()]
}
