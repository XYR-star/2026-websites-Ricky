import type { Access, PayloadRequest, Where } from 'payload'

// This capability exists only in server memory. A request body or context flag
// cannot opt into the published-content reader.
const publishedReaders = new WeakSet<object>()

export function isContentAdmin(req?: Pick<PayloadRequest, 'user'> | null): boolean {
  return req?.user?.collection === 'users' && req.user.role === 'admin'
}

export function isPublishedContentRead(req?: object | null): boolean {
  return Boolean(req && publishedReaders.has(req))
}

export async function withPublishedContentRead<T>(
  req: PayloadRequest,
  read: () => Promise<T>,
): Promise<T> {
  const inherited = publishedReaders.has(req)
  publishedReaders.add(req)
  try {
    return await read()
  } finally {
    if (!inherited) publishedReaders.delete(req)
  }
}

export const withPublishedGlobalRead = withPublishedContentRead

export const adminOnly = ({ req }: { req: PayloadRequest }): boolean => isContentAdmin(req)

export const publishedOrAdmin: Access = ({ req }) => {
  if (isContentAdmin(req)) return true
  if (!isPublishedContentRead(req)) return false
  const published: Where = { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] }
  return published
}

export const readPublishedGlobal = ({ req }: { req: PayloadRequest }): boolean =>
  isContentAdmin(req) || isPublishedContentRead(req)
