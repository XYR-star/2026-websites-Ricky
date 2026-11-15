import { createHash } from 'node:crypto'

export const publicPageNames = ['homepage', 'about', 'now', 'projects', 'tracks', 'site'] as const
const articleRoute = /^(blog|travel|research)\/[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u
const digest = /^[a-f0-9]{64}$/
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_MANIFEST_ARTICLES = 10_000

export type ContentBinding = { schemaVersion: 1; articles: Record<string, string | null>; pages: Record<string, string> }
export type ContentManifest = { schemaVersion: 1; generatedAt: string; articles: Record<string, string>; pages: Record<string, string> }

function ordered(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .map(key => [key, ordered((value as Record<string, unknown>)[key])]))
  throw new Error('Content fingerprint requires JSON data.')
}

export function contentFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
}

export function articleKey(type: unknown, slug: unknown): string {
  const key = `${String(type)}/${String(slug)}`
  if (!articleRoute.test(key)) throw new Error('Invalid public article route.')
  return key
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validContentBinding(value: unknown): value is ContentBinding {
  if (!object(value) || value.schemaVersion !== 1 || Object.keys(value).some(key => !['schemaVersion', 'articles', 'pages'].includes(key)) || !object(value.articles) || !object(value.pages)) return false
  const articles = Object.entries(value.articles), pages = Object.entries(value.pages)
  return articles.length + pages.length > 0 && articles.length <= 2 && pages.length <= 1 &&
    articles.every(([key, hash]) => articleRoute.test(key) && (hash === null || typeof hash === 'string' && digest.test(hash))) &&
    pages.every(([key, hash]) => publicPageNames.includes(key as typeof publicPageNames[number]) && typeof hash === 'string' && digest.test(hash))
}

export function validateContentManifest(value: unknown): ContentManifest {
  if (!object(value) || value.schemaVersion !== 1 || Object.keys(value).some(key => !['schemaVersion', 'generatedAt', 'articles', 'pages'].includes(key)) ||
      typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt)) || !object(value.articles) || !object(value.pages)) throw new Error('Invalid website content manifest.')
  const articles = Object.entries(value.articles), pages = Object.entries(value.pages)
  if (articles.length > MAX_MANIFEST_ARTICLES || articles.some(([key, hash]) => !articleRoute.test(key) || typeof hash !== 'string' || !digest.test(hash)) ||
      pages.length !== publicPageNames.length || pages.some(([key, hash]) => !publicPageNames.includes(key as typeof publicPageNames[number]) || typeof hash !== 'string' || !digest.test(hash))) throw new Error('Invalid website content manifest.')
  return value as ContentManifest
}

/** Called only with the same validated public snapshot used to render the site. */
export function buildContentManifest(snapshot: { articles: Record<string, Record<string, unknown>[]>; pages: Record<string, unknown> }): ContentManifest {
  const articles: Record<string, string> = Object.create(null)
  for (const [type, list] of Object.entries(snapshot.articles)) for (const article of list) {
    if (article._status !== 'published' || article.draft === true) throw new Error('Only public published content may be fingerprinted.')
    const key = articleKey(type, article.slug)
    if (Object.hasOwn(articles, key)) throw new Error('Duplicate public article route.')
    articles[key] = contentFingerprint(article)
  }
  const manifest = validateContentManifest({ schemaVersion: 1, generatedAt: new Date().toISOString(), articles,
    pages: Object.fromEntries(publicPageNames.map(key => [key, contentFingerprint(snapshot.pages[key])])) })
  if (Buffer.byteLength(JSON.stringify(manifest)) > MAX_MANIFEST_BYTES) throw new Error('Website content manifest is too large.')
  return manifest
}

export function manifestMatches(binding: ContentBinding, manifest: ContentManifest): boolean {
  return Object.entries(binding.articles).every(([key, hash]) => hash === null ? !Object.hasOwn(manifest.articles, key) : manifest.articles[key] === hash) &&
    Object.entries(binding.pages).every(([key, hash]) => manifest.pages[key] === hash)
}
