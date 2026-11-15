import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getStorageFilePath } from '@payloadcms/plugin-cloud-storage/utilities'
import type { PayloadRequest } from 'payload'
import { isContentAdmin } from '../access/content'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, imageSignatureMatches, publicObjectKey, safeObjectKey } from './media-policy'
import { isTrustedPublicMedia, storageConfig } from './runtime-env'

type Media = { id: string | number; publicUrl?: string; originalUrl?: string; filename?: string; prefix?: string; _objectKey?: string; mimeType?: string; filesize?: number }

export async function prepareMedia(id: string | number, article: { type: string; media_id: string }, req: PayloadRequest): Promise<string> {
  if (!isContentAdmin(req)) throw new Error('Publishing images requires an authenticated administrator.')
  const media = await req.payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: false, req }) as unknown as Media
  if (media.publicUrl && isTrustedPublicMedia(media.publicUrl)) return media.publicUrl
  if (media.originalUrl && isTrustedPublicMedia(media.originalUrl)) return media.originalUrl
  const storage = storageConfig()
  if (!storage) throw new Error('Connect the private R2 bucket before publishing new images.')
  if (!media.filename) throw new Error('Image upload is incomplete. Upload and save the image before publishing.')
  safeObjectKey(media.prefix || 'drafts', media.filename)
  const key = await getStorageFilePath({ collection: req.payload.collections.media.config,
    collectionPrefix: 'drafts', doc: media, filename: media.filename, req, useCompositePrefixes: false })
  if (key.split('/').some(part => part === '.' || part === '..') || /[\\\u0000-\u001f\u007f]/.test(key)) throw new Error('Invalid private image object path.')
  const client = new S3Client({
    region: 'auto', endpoint: storage.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  })
  const head = await client.send(new HeadObjectCommand({ Bucket: storage.privateBucket, Key: key }))
  const mime = head.ContentType?.split(';')[0]
  if (!mime || !IMAGE_TYPES.has(mime) || head.ContentLength === undefined || head.ContentLength <= 0 || head.ContentLength > MAX_IMAGE_BYTES) {
    throw new Error('Uploaded image type or size is invalid.')
  }
  if (!head.ETag) throw new Error('Uploaded image has no verifiable object version; article was not published.')
  if (media.filesize && media.filesize !== head.ContentLength) throw new Error('Uploaded image length does not match its saved record.')
  const sample = await client.send(new GetObjectCommand({ Bucket: storage.privateBucket, Key: key, Range: 'bytes=0-63', IfMatch: head.ETag }))
  const signature = await sample.Body?.transformToByteArray()
  if (!signature || !imageSignatureMatches(signature, mime)) throw new Error('Uploaded file contents do not match the selected image type.')
  const publicKey = publicObjectKey(article.type, article.media_id, key, head.ETag, media.filename)
  const encodedSource = `${storage.privateBucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  // Copying is server-to-server and preserves the original file bytes.
  await client.send(new CopyObjectCommand({
    Bucket: storage.publicBucket, Key: publicKey, CopySource: encodedSource, CopySourceIfMatch: head.ETag,
    MetadataDirective: 'REPLACE', ContentType: mime, CacheControl: 'public, max-age=31536000, immutable',
  }))
  const published = await client.send(new HeadObjectCommand({ Bucket: storage.publicBucket, Key: publicKey }))
  if (published.ContentLength !== head.ContentLength) throw new Error('Public image copy verification failed; article was not published.')
  const publicUrl = `${storage.publicBase}/${publicKey.split('/').map(encodeURIComponent).join('/')}`
  // Only this trusted server step can write immutable public-location fields.
  await req.payload.update({ collection: 'media', id, data: { publicUrl, publicKey }, overrideAccess: true,
    context: { ...req.context, preparePublicMedia: true }, req })
  return publicUrl
}
