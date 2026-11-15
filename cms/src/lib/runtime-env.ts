export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Configure the isolated v2 environment before starting the CMS.`)
  return value
}

export function serverOrigins(): string[] {
  const values = [requiredEnv('CMS_URL'), process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`]
  return [...new Set(values.filter((v): v is string => Boolean(v)).map((value) => {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('CMS_URL must be a bare origin without credentials, path, or query.')
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) {
      throw new Error('CMS_URL must use HTTPS outside local development.')
    }
    return url.origin
  }))]
}

export function configuredSecret(name: string): string {
  const value = requiredEnv(name)
  if (value.length < 40 || /^(change|example|test|secret|replace)/i.test(value)) {
    throw new Error(`${name} must be a separately generated secret of at least 40 characters.`)
  }
  return value
}

export type StorageConfig = {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  privateBucket: string
  publicBucket: string
  publicBase: string
}

export function storageConfig(): StorageConfig | undefined {
  const keys = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET']
  if (keys.every((key) => !process.env[key]?.trim())) return undefined
  keys.forEach(requiredEnv)
  const endpoint = new URL(requiredEnv('R2_ENDPOINT'))
  const publicURL = new URL(requiredEnv('R2_PUBLIC_BASE'))
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('R2_ENDPOINT must be an HTTPS S3 endpoint without URL credentials.')
  }
  if (publicURL.protocol !== 'https:' || publicURL.username || publicURL.password || publicURL.search || publicURL.hash) {
    throw new Error('R2_PUBLIC_BASE must be an HTTPS public media URL without credentials.')
  }
  const privateBucket = requiredEnv('R2_PRIVATE_BUCKET')
  const publicBucket = requiredEnv('R2_PUBLIC_BUCKET')
  if (privateBucket === publicBucket) throw new Error('Draft and public media must use different R2 buckets.')
  return {
    endpoint: endpoint.origin,
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    privateBucket,
    publicBucket,
    publicBase: publicURL.href.replace(/\/$/, ''),
  }
}

export function isTrustedPublicMedia(value: unknown): value is string {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f\\]/.test(value)) return false
  if (value.startsWith('/images/') && !value.startsWith('//')) {
    try {
      const decoded = decodeURIComponent(value)
      return !decoded.split('/').some((part) => part === '.' || part === '..') && !/[\\\u0000-\u0020]/.test(decoded)
    } catch { return false }
  }
  try {
    const url = new URL(value)
    const allowed = new Set([
      process.env.R2_PUBLIC_BASE || 'https://assets.heyrickishere.com',
      ...(process.env.LEGACY_MEDIA_ORIGINS || 'https://assets.heyrickishere.com,https://pub-9f290c4c2d7b479fad35f3c7051d2d9f.r2.dev').split(','),
    ].map((origin) => new URL(origin.trim()).origin))
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && allowed.has(url.origin)
  } catch { return false }
}
