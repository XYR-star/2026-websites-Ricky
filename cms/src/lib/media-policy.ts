import { createHash } from 'node:crypto'

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export function imageSignatureMatches(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString('ascii')
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png') return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
  if (mime === 'image/avif') return ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 64))
  return false
}

export function safeObjectKey(prefix: string, filename: string): string {
  if (!filename || /[\\/\u0000-\u001f\u007f]/.test(filename) || filename === '.' || filename === '..') {
    throw new Error('Invalid image filename.')
  }
  const parts = prefix.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/.test(part))) {
    throw new Error('Invalid private image prefix.')
  }
  return [...parts, filename].join('/')
}

export function publicObjectKey(type: string, mediaID: string, objectKey: string, etag: string, filename: string): string {
  if (!['blog', 'travel', 'research'].includes(type) || !/^[a-f0-9-]{36}$/i.test(mediaID)) {
    throw new Error('Missing or invalid article media folder.')
  }
  safeObjectKey('', filename)
  const fingerprint = createHash('sha256').update(`${objectKey}\n${etag}`).digest('hex').slice(0, 20)
  return `cms/${type}/${mediaID}/${fingerprint}-${filename}`
}

export function referencedMediaIDs(body: unknown, cover?: unknown): Array<string | number> {
  const ids = new Map<string, string | number>()
  const add = (value: unknown) => {
    const id = value && typeof value === 'object' && 'id' in value ? value.id : value
    if (typeof id === 'string' || typeof id === 'number') ids.set(String(id), id)
  }
  add(cover)
  const walk = (value: unknown, depth: number) => {
    if (depth > 100) throw new Error('Article document is nested too deeply.')
    if (Array.isArray(value)) { value.forEach((node) => walk(node, depth + 1)); return }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if (node.type === 'upload') {
      if (node.relationTo !== 'media') throw new Error('Unsupported image collection in article.')
      add(node.value)
    }
    if (Array.isArray(node.children)) walk(node.children, depth + 1)
    if (node.root) walk(node.root, depth + 1)
  }
  walk(body, 0)
  if (ids.size > 100) throw new Error('A single publish may reference at most 100 images.')
  return [...ids.values()]
}
