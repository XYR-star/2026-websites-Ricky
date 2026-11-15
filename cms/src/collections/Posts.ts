import { randomUUID } from 'node:crypto'
import { BlocksFeature, CodeBlock, EXPERIMENTAL_TableFeature, FixedToolbarFeature, UploadFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { adminOnly, publishedOrAdmin } from '../access/content.js'
import { notifyPostDeleted, notifyPostPublished, preparePostMedia } from '../hooks/publishing.js'

export const normalizePostRoute: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const type = data.type ?? originalDoc?.type ?? 'blog'
  if (!['blog', 'travel', 'research'].includes(type)) throw new Error('请选择有效的文章类型。')
  let slug = String(data.slug ?? originalDoc?.slug ?? '').trim().normalize('NFC')
  if (!slug && data.title) {
    const day = String(data.date ?? new Date().toISOString()).slice(0, 10)
    const title = String(data.title).normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
    slug = `${day}-${title || randomUUID()}`
  }
  if (!slug && data._status !== 'published') slug = `draft-${randomUUID()}`
  if (!slug || !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(slug) || slug.length > 200) {
    throw new Error('文章地址只能包含文字、数字、短横线和下划线，且不超过 200 个字符。')
  }
  return { ...data, type, slug, routeKey: `${type}/${slug}` }
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: '文章', plural: '文章' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'visibility', '_status', 'date', 'updatedAt'],
    group: '内容管理',
    description: process.env.SITE_DEPLOY_HOOK?.trim()
      ? '草稿仅在后台可见。发布或撤稿后，网站还需要等待部署成功。'
      : '新版试用：草稿和发布版本保存在独立后台。正式站接入完成后才会随发布更新。',
    preview: doc => doc.id && process.env.CMS_URL ? `${process.env.CMS_URL.replace(/\/$/, '')}/preview/posts/${doc.id}` : null,
  },
  access: {
    admin: adminOnly,
    read: publishedOrAdmin,
    create: adminOnly,
    update: adminOnly,
    delete: () => false,
    readVersions: adminOnly,
  },
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 30 },
  hooks: {
    beforeValidate: [normalizePostRoute],
    beforeChange: [preparePostMedia],
    afterChange: [notifyPostPublished],
    afterDelete: [notifyPostDeleted],
  },
  fields: [
    { name: 'title', label: '标题', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'type', label: '文章类型', type: 'select', required: true, defaultValue: 'blog', options: [
          { label: '博客', value: 'blog' }, { label: '游记', value: 'travel' }, { label: '研究日志', value: 'research' },
        ] },
        { name: 'date', label: '日期', type: 'date', required: true, defaultValue: () => new Date().toISOString(), admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } } },
      ],
    },
    { name: 'description', label: '简介', type: 'textarea', admin: { condition: data => data.type !== 'research' } },
    { name: 'summary', label: '研究摘要', type: 'textarea', admin: { condition: data => data.type === 'research' } },
    {
      name: 'body', label: '正文', type: 'richText', required: true,
      editor: lexicalEditor({ features: ({ defaultFeatures }) => [
        ...defaultFeatures.filter(feature => !['upload', 'relationship'].includes(feature.key)),
        UploadFeature({ enabledCollections: ['media'], collections: { media: { fields: [
          { name: 'alt', label: '图片说明', type: 'text' },
          { name: 'title', label: '图片附注', type: 'text' },
        ] } } }),
        BlocksFeature({ blocks: [CodeBlock({ defaultLanguage: 'text', languages: {
          text: 'Text', plaintext: 'Plain text', bash: 'Bash', shell: 'Shell', zsh: 'Zsh',
          markdown: 'Markdown', mermaid: 'Mermaid', javascript: 'JavaScript', typescript: 'TypeScript',
          json: 'JSON', python: 'Python', yaml: 'YAML', css: 'CSS', html: 'HTML', sql: 'SQL',
        } })] }),
        EXPERIMENTAL_TableFeature(),
        FixedToolbarFeature(),
      ] }),
    },
    { name: 'cover', label: '封面', type: 'upload', relationTo: 'media', admin: { position: 'sidebar' } },
    { name: 'visibility', label: '可见范围', type: 'select', defaultValue: 'public', required: true, options: [
      { label: '公开展示（发布后）', value: 'public' }, { label: '仅自己', value: 'private' },
    ], admin: { position: 'sidebar', description: '“仅自己”的内容即使保存为已发布，也不会导出到正式网站。' } },
    { name: 'slug', label: '文章地址', type: 'text', required: true, admin: { position: 'sidebar', description: '新文章留空时按标题生成。修改已发布文章的地址会改变访问链接。' } },
    { name: 'routeKey', type: 'text', unique: true, index: true, required: true, admin: { hidden: true, readOnly: true } },
    { name: 'media_id', label: '素材目录编号', type: 'text', defaultValue: () => randomUUID(), admin: { position: 'sidebar', readOnly: true } },
    { name: 'legacyCoverUrl', label: '原有封面地址', type: 'text', admin: { position: 'sidebar', description: '导入旧文章时保留原图片地址。选择新封面后优先使用新封面。' } },
    { name: 'tags', label: '标签', type: 'array', fields: [{ name: 'tag', label: '标签', type: 'text', required: true }], admin: { condition: data => data.type === 'blog' } },
    { name: 'project', label: '所属项目', type: 'text', admin: { condition: data => data.type === 'research' } },
    { name: 'status', label: '研究进展', type: 'text', admin: { condition: data => data.type === 'research' } },
    { name: 'links', label: '相关资料', type: 'array', admin: { condition: data => data.type === 'research' }, fields: [
      { name: 'label', label: '名称', type: 'text', required: true },
      { name: 'href', label: '网址', type: 'text', required: true, validate: (value: unknown) => {
        if (typeof value !== 'string') return '请填写 http(s) 地址。'
        try { return ['http:', 'https:'].includes(new URL(value).protocol) || '请填写 http(s) 地址。' } catch { return '请填写 http(s) 地址。' }
      } },
    ] },
  ],
}
