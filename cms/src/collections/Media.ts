import { APIError, type CollectionConfig } from 'payload'
import { adminOnly, isContentAdmin, isPublishedContentRead } from '../access/content'
import { isTrustedPublicMedia, storageConfig } from '../lib/runtime-env'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: '素材', plural: '素材库' },
  admin: {
    group: '内容', useAsTitle: 'alt',
    defaultColumns: ['alt', 'filename', 'publicUrl', 'updatedAt'],
    description: storageConfig()
      ? '原图保存，不压缩。新素材保持私有，发布文章时才复制被引用的图片到公开素材桶。'
      : '现在可以复用已导入的旧图片；新图片上传将在完成存储配置后开放。',
  },
  access: {
    create: ({ req }) => isContentAdmin(req) && Boolean(storageConfig()),
    read: ({ req }) => isContentAdmin(req) ? true : isPublishedContentRead(req) ? { publicUrl: { exists: true } } : false,
    update: adminOnly,
    delete: () => false,
  },
  upload: {
    disableLocalStorage: true,
    filesRequiredOnCreate: false,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  },
  hooks: {
    afterRead: [({ doc }) => {
      if (!doc.filename && isTrustedPublicMedia(doc.originalUrl)) {
        const url = doc.originalUrl.startsWith('/') ? new URL(doc.originalUrl, process.env.SITE_URL || 'https://www.heyrickishere.com').href : doc.originalUrl
        const extension = new URL(url).pathname.split('.').pop()?.toLowerCase()
        const mime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }
        return { ...doc, url, thumbnailURL: url, mimeType: mime[extension || ''] || doc.mimeType }
      }
      return doc
    }],
    beforeChange: [({ data, req, context, operation, originalDoc }) => {
      if (context.importV1 || context.preparePublicMedia) return data
      if (!isContentAdmin(req)) throw new APIError('请先登录素材后台。', 403)
      // Existing descriptions remain editable while new uploads are disabled.
      if ((operation === 'create' || req.file) && !storageConfig()) throw new APIError('尚未连接私有 R2 素材桶，上传暂未启用。', 503)
      if (operation === 'create' && !req.file && !data.filename) throw new APIError('请先完成图片上传，再保存素材。', 400)
      if (operation === 'update' && (req.file || (data.filename && data.filename !== originalDoc?.filename))) {
        throw new APIError('原图保持不变。请上传一份新素材，再替换文章中的图片引用。', 409)
      }
      // Public locations are assigned only by the server-side publish operation.
      delete data.publicUrl
      delete data.publicKey
      delete data.originalUrl
      return data
    }],
    beforeDelete: [() => { throw new APIError('为保护文章与版本引用，第一版不开放永久删除素材。', 403) }],
  },
  fields: [
    { name: 'alt', label: '图片说明', type: 'text', required: true },
    { name: 'media_id', label: '文章素材编号', type: 'text', admin: { description: '沿用稳定编号，改文章标题不移动已发布图片。' } },
    { name: 'publicUrl', label: '公开素材地址', type: 'text', admin: { readOnly: true },
      access: { create: () => false, update: () => false },
      validate: (value: unknown) => !value || isTrustedPublicMedia(value) || '素材地址必须来自已配置的公开素材域名。' },
    { name: 'publicKey', type: 'text', admin: { hidden: true },
      access: { create: () => false, update: () => false, read: ({ req }) => isContentAdmin(req) } },
    { name: 'originalUrl', label: 'v1 原素材地址', type: 'text', admin: { readOnly: true },
      access: { create: () => false, update: () => false },
      validate: (value: unknown) => !value || isTrustedPublicMedia(value) || '只能导入可信的旧公开素材地址。' },
  ],
}
