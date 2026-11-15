import type { APIRoute } from 'astro'
import { getContentSource, getPayloadSiteContent } from '../../lib/payload-content.mjs'
import { buildContentManifest } from '../../../cms/src/lib/content-fingerprint'

export const GET: APIRoute = async () => {
  if (getContentSource() !== 'payload') return new Response(null, { status: 404 })
  const snapshot = await getPayloadSiteContent()
  return new Response(JSON.stringify(buildContentManifest(snapshot)), { headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
  } })
}
