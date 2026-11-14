import config from '@payload-config'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createLocalReq, getPayload } from 'payload'
import { isContentAdmin } from '../../../../../access/content'
import { isTrustedPublicMedia } from '../../../../../lib/runtime-env'
import './preview.css'

export const dynamic = 'force-dynamic'

function previewImage(media: unknown): string | undefined {
  if (!media || typeof media !== 'object') return undefined
  const object = media as Record<string, unknown>
  const publicURL = object.publicUrl || object.originalUrl
  if (isTrustedPublicMedia(publicURL)) {
    return publicURL.startsWith('/') ? new URL(publicURL, process.env.SITE_URL || 'https://www.heyrickishere.com').href : publicURL
  }
  if (typeof object.url !== 'string') return undefined
  try {
    const url = new URL(object.url, process.env.CMS_URL)
    // Let the same-origin authenticated file endpoint issue a short-lived URL.
    if (url.pathname.startsWith('/api/media/file/')) return url.pathname
  } catch { /* do not render unexpected sources */ }
  return undefined
}

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  upload: ({ node }) => {
    const source = previewImage(node.value)
    if (!source) return <p>这张图片尚未完成上传。</p>
    return <figure><img src={source} alt={String(node.fields?.alt || '')} loading="lazy" />
      {node.fields?.alt && <figcaption>{String(node.fields.alt)}</figcaption>}</figure>
  },
  blocks: {
    Code: ({ node }: { node: { fields: { code?: string } } }) => <pre><code>{String(node.fields.code || '')}</code></pre>,
  },
})

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !isContentAdmin({ user })) redirect('/admin/login')
  const { id } = await params
  if (!/^[0-9]+$/.test(id)) notFound()
  const req = await createLocalReq({ user }, payload)
  const post = await payload.findByID({ collection: 'posts', id, depth: 1, draft: true, overrideAccess: false, req })
  if (!post) notFound()
  const cover = previewImage(post.cover) || (isTrustedPublicMedia(post.legacyCoverUrl) ? new URL(post.legacyCoverUrl, process.env.SITE_URL || 'https://www.heyrickishere.com').href : undefined)
  return <main className="ricky-preview">
    <nav><a href={`/admin/collections/posts/${id}`}>← 返回编辑</a><span>仅管理员可见 · 保存后的最新版本</span></nav>
    <article>
      <p className="eyebrow">{post.type === 'travel' ? '游记' : post.type === 'research' ? '研究日志' : '博客'} · 私密预览</p>
      <h1>{post.title}</h1>
      <p className="summary">{post.type === 'research' ? post.summary : post.description}</p>
      <p className="date">{post.date?.slice(0, 10)} · {post.visibility === 'private' ? '仅自己' : post._status === 'published' ? '文章有正式版本' : '草稿'}</p>
      {cover && <img className="cover" src={cover} alt={post.title} />}
      <RichText data={post.body} converters={converters} className="preview-body" />
    </article>
  </main>
}
