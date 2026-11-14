import { randomUUID } from 'node:crypto'
import type { SanitizedConfig } from 'payload'

export type MediaDocument = {
  id?: number | string
  publicUrl?: string | null
  originalUrl?: string | null
  alt?: string | null
  filename?: string | null
  mimeType?: string | null
}
export type MediaReference = number | string | MediaDocument
export type MediaLookup = Map<string, MediaReference> | Record<string, MediaReference>
type EditorConfig = Parameters<typeof import('@payloadcms/richtext-lexical').convertMarkdownToLexical>[0]['editorConfig']
type ResolveMedia = (reference: MediaReference) => Promise<MediaDocument>

const legacyOrigins = new Set([
  'https://assets.heyrickishere.com',
  'https://pub-9f290c4c2d7b479fad35f3c7051d2d9f.r2.dev',
  'https://www.heyrickishere.com',
  'https://heyrickishere.com',
])

/** Accept only configured public asset origins, never R2's authenticated endpoint. */
export function isPublicAssetURL(value: unknown): value is string {
  if (typeof value !== 'string' || !value || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false
  try {
    const parsed = new URL(value, 'https://www.heyrickishere.com')
    const decodedPath = decodeURIComponent(parsed.pathname)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || /[\\\u0000-\u001f\u007f]/u.test(decodedPath)) return false
    if (decodedPath.split('/').includes('..')) return false
    if (value.startsWith('/')) return !value.startsWith('//') && parsed.pathname.startsWith('/images/')
    const configured = process.env.R2_PUBLIC_BASE ?? process.env.R2_PUBLIC_BASE_URL ?? process.env.MEDIA_PUBLIC_BASE
    const allowed = new Set(legacyOrigins)
    if (configured) {
      const base = new URL(configured)
      if (base.protocol === 'https:' && !base.username && !base.password) allowed.add(base.origin)
    }
    if (parsed.protocol !== 'https:' || !allowed.has(parsed.origin)) return false
    if (['https://www.heyrickishere.com', 'https://heyrickishere.com'].includes(parsed.origin)) return parsed.pathname.startsWith('/images/')
    return parsed.pathname !== '/'
  } catch { return false }
}

export function getPublishedMediaURL(media: MediaDocument): string {
  const value = media.publicUrl || media.originalUrl
  if (!isPublicAssetURL(value)) throw new Error('媒体尚未准备为公开素材，已停止发布内容导出。')
  return value
}

const editorConfigs = new WeakMap<object, Promise<EditorConfig>>()
export function getContentEditorConfig(config: SanitizedConfig): Promise<EditorConfig> {
  let pending = editorConfigs.get(config)
  if (!pending) {
    pending = import('@payloadcms/richtext-lexical').then(({ editorConfigFactory }) => {
      const field = config.collections.find(collection => collection.slug === 'posts')?.fields.find(field => 'name' in field && field.name === 'body')
      return field && field.type === 'richText'
        ? editorConfigFactory.fromField({ field })
        : editorConfigFactory.default({ config })
    })
    editorConfigs.set(config, pending)
  }
  return pending
}

// Standard imported images become native Payload upload nodes. Fenced and inline
// code stays literal so examples in technical articles are not imported as assets.
export function replaceLegacyImageReferences(markdown: string, mediaByUrl: MediaLookup, onImage?: (image: { id: number | string; alt: string; title: string }) => void): string {
  const get = (url: string) => mediaByUrl instanceof Map ? mediaByUrl.get(url) : mediaByUrl[url]
  let fence: { marker: string; length: number } | undefined
  return markdown.split('\n').map(line => {
    const boundary = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (boundary) {
      const marker = boundary[1][0]
      if (!fence) fence = { marker, length: boundary[1].length }
      else if (marker === fence.marker && boundary[1].length >= fence.length) fence = undefined
      return line
    }
    if (fence) return line
    return line.split(/(`+[^`]*`+)/g).map((part, index) => {
      if (index % 2) return part
      return part.replace(/(?<!\\)!\[((?:\\.|[^\]\\])*)\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+["']([^"'\r\n]*)["'])?\s*\)/g, (whole, alt, angleURL, bareURL, title) => {
        if (line.trim() !== whole) throw new Error('旧稿中的图片需要单独成段，避免导入时丢失同行文字。')
        const value = get(angleURL ?? bareURL)
        if (value === undefined) throw new Error('导入前需要为正文图片创建素材记录。')
        const id = typeof value === 'object' ? value.id : value
        if ((typeof id !== 'string' && typeof id !== 'number') || !/^[A-Za-z0-9_-]+$/.test(String(id))) throw new Error('无效的媒体记录编号。')
        onImage?.({ id, alt: String(alt ?? '').replace(/\\([\\\[\]])/g, '$1'), title: String(title ?? '') })
        return `![media:${id}]()`
      })
    }).join('')
  }).join('\n')
}

export async function importLegacyMarkdown(markdown: string, mediaByUrl: MediaLookup = new Map(), editorConfig?: EditorConfig): Promise<any> {
  if (!editorConfig) throw new Error('导入正文需要显式提供 getContentEditorConfig(payload.config)。')
  const { convertMarkdownToLexical } = await import('@payloadcms/richtext-lexical')
  const images: { id: number | string; alt: string; title: string }[] = []
  const codes = extractLegacyCodeBlocks(markdown)
  const imageMarkdown = replaceLegacyImageReferences(codes.markdown, mediaByUrl, image => images.push(image))
  const body = convertMarkdownToLexical({ markdown: imageMarkdown, editorConfig })
  let imageIndex = 0
  const annotate = (node: any) => {
    if (node?.type === 'upload') {
      const image = images[imageIndex++]
      if (!image || String(node.value) !== String(image.id)) throw new Error('图片导入顺序不一致，已停止导入。')
      node.fields = { ...node.fields, alt: image.alt, title: image.title }
    }
    for (const [index, child] of (node?.children ?? []).entries()) {
      const marker = child.type === 'paragraph' && child.children?.length === 1 && child.children[0].type === 'text' ? child.children[0].text : undefined
      const code = marker ? codes.blocks.get(marker) : undefined
      if (code) node.children[index] = { type: 'block', version: 2, format: '', fields: { id: randomUUID(), blockType: 'Code', language: code.language, code: code.code } }
      else annotate(child)
    }
  }
  annotate(body.root)
  if (imageIndex !== images.length) throw new Error('部分图片未能导入编辑器。')
  return body
}

export function extractLegacyCodeBlocks(markdown: string): { markdown: string; blocks: Map<string, { language: string; code: string }> } {
  const lines = markdown.split('\n')
  const output: string[] = []
  const blocks = new Map<string, { language: string; code: string }>()
  for (let index = 0; index < lines.length; index++) {
    const start = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(lines[index])
    if (!start) { output.push(lines[index]); continue }
    const language = start[2].trim() || 'text'
    if (!/^[A-Za-z0-9_-]+$/.test(language)) throw new Error('代码块语言标记不受支持，请先核对原稿。')
    const marker = `RICKYCODETOKEN${randomUUID().replaceAll('-', '')}END`
    const codeLines: string[] = []
    const close = new RegExp(`^ {0,3}${start[1][0] === '`' ? '`' : '~'}{${start[1].length},}\\s*$`)
    while (++index < lines.length && !close.test(lines[index])) codeLines.push(lines[index])
    blocks.set(marker, { language, code: codeLines.join('\n') })
    output.push('', marker, '')
  }
  return { markdown: output.join('\n'), blocks }
}

async function sanitizeUploads(value: any, replacements: Map<string, string>, resolveMedia?: ResolveMedia): Promise<any> {
  if (Array.isArray(value)) return Promise.all(value.map(child => sanitizeUploads(child, replacements, resolveMedia)))
  if (!value || typeof value !== 'object') return value
  if (value.type === 'block') {
    if (value.fields?.blockType !== 'Code' || typeof value.fields.code !== 'string') throw new Error('正文包含尚不支持发布的区块。')
    const language = String(value.fields.language ?? 'text')
    if (!/^[A-Za-z0-9_-]+$/.test(language)) throw new Error('代码块语言标记无效。')
    const runs = [...value.fields.code.matchAll(/`+/g)].map(match => match[0].length)
    const fence = '`'.repeat(Math.max(3, ...runs.map(length => length + 1)))
    const marker = `RICKYCODETOKEN${randomUUID().replaceAll('-', '')}END`
    replacements.set(marker, `${fence}${language}\n${value.fields.code}\n${fence}`)
    return { type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'text', version: 1, mode: 'normal', detail: 0, format: 0, style: '', text: marker }] }
  }
  if (value.type === 'upload') {
    if (value.relationTo !== 'media') throw new Error('正文包含不支持的媒体集合。')
    const reference = value.value as MediaReference
    const media = resolveMedia ? await resolveMedia(reference) : typeof reference === 'object' && reference ? reference : undefined
    if (!media) throw new Error('正文媒体未能读取，已停止发布内容导出。')
    const url = getPublishedMediaURL(media)
    const alt = String(value.fields?.alt || media.alt || '').replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
    const title = String(value.fields?.title ?? '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ')
    const marker = `RICKYMEDIATOKEN${randomUUID().replaceAll('-', '')}END`
    replacements.set(marker, `![${alt}](${url}${title ? ` "${title}"` : ''})`)
    return {
      type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
      children: [{ type: 'text', version: 1, mode: 'normal', detail: 0, format: 0, style: '', text: marker }],
    }
  }
  return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await sanitizeUploads(child, replacements, resolveMedia)])))
}

export async function serializeContentBody(body: unknown, editorConfig: EditorConfig, resolveMedia?: ResolveMedia): Promise<string> {
  if (!body || typeof body !== 'object' || !('root' in body)) throw new Error('正文格式无效。')
  const replacements = new Map<string, string>()
  const data = await sanitizeUploads(body, replacements, resolveMedia)
  const { convertLexicalToMarkdown } = await import('@payloadcms/richtext-lexical')
  let result = convertLexicalToMarkdown({ data, editorConfig })
  for (const [marker, markdown] of replacements) result = result.replaceAll(marker, markdown)
  if (/!\[media:[^\]]+\]\(\)/.test(result)) throw new Error('正文仍包含未解析的媒体编号。')
  return result
}
