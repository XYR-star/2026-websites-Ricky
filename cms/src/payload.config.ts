import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { zh } from '@payloadcms/translations/languages/zh'
import sharp from 'sharp'
import { Users } from './collections/Users'
import { Posts } from './collections/Posts'
import { Media } from './collections/Media'
import { Deployments } from './collections/Deployments'
import { siteGlobals } from './globals'
import { siteContentEndpoint } from './endpoints/siteContent'
import { isContentAdmin } from './access/content'
import { configuredSecret, requiredEnv, serverOrigins, storageConfig } from './lib/runtime-env'
import { MAX_IMAGE_BYTES } from './lib/media-policy'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const storage = storageConfig()
const databaseURL = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined
if (databaseURL?.hostname.endsWith('.neon.tech')) databaseURL.searchParams.set('sslmode', 'verify-full')
const adapter = postgresAdapter({
  // Allow two simultaneous editing transactions plus their independent lock
  // checks. A bounded wait prevents exhausted connections from hanging forever.
  pool: { connectionString: databaseURL?.href, max: 5, connectionTimeoutMillis: 15_000 },
  push: false,
  migrationDir: path.resolve(dirname, 'migrations'),
})

// Schema/type/import-map generation needs no connection or placeholder secrets.
// Every actual Payload instance validates the real environment before DB init.
const database: typeof adapter = {
  ...adapter,
  init(args) {
    requiredEnv('DATABASE_URL')
    configuredSecret('PAYLOAD_SECRET')
    configuredSecret('CMS_READ_TOKEN')
    requiredEnv('CMS_ADMIN_EMAIL')
    serverOrigins()
    return adapter.init(args)
  },
}
const configuredOrigins = process.env.CMS_URL ? serverOrigins() : []

export default buildConfig({
  serverURL: process.env.CMS_URL,
  secret: process.env.PAYLOAD_SECRET || '',
  cookiePrefix: 'ricky-v2',
  cors: configuredOrigins,
  csrf: configuredOrigins,
  telemetry: false,
  // Payload's development fallback logs complete emails, including recovery
  // links. Until a real provider is connected, fail closed without logging mail.
  email: () => ({
    name: 'mail-disabled',
    defaultFromAddress: 'no-reply@heyrickishere.com',
    defaultFromName: 'Ricky CMS',
    sendEmail: async () => { throw new Error('邮件恢复尚未配置。请使用已登录账号修改密码，或联系站点管理员。') },
  }),
  admin: {
    user: 'users',
    importMap: { baseDir: dirname },
    meta: { titleSuffix: ' — Ricky 内容后台 v2' },
  },
  i18n: { fallbackLanguage: 'zh', supportedLanguages: { zh } },
  editor: lexicalEditor(),
  collections: [Users, Posts, Media, Deployments],
  globals: siteGlobals,
  endpoints: [siteContentEndpoint],
  db: database,
  sharp,
  upload: { limits: { fileSize: MAX_IMAGE_BYTES }, abortOnLimit: true },
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  plugins: [s3Storage({
    enabled: Boolean(storage),
    alwaysInsertFields: true,
    bucket: storage?.privateBucket || '',
    clientUploads: { access: ({ req }) => isContentAdmin(req) },
    signedDownloads: { expiresIn: 300 },
    collections: { media: { prefix: 'drafts' } },
    config: storage ? {
      region: 'auto', endpoint: storage.endpoint, forcePathStyle: true,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    } : { region: 'auto' },
  })],
})
