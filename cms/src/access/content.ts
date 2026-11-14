import type { Access, PayloadRequest, Where } from 'payload'

// Payload proxies requests and spreads their context during Local API calls.
// An enumerable module-private Symbol survives those trusted copies, whereas
// HTTP/JSON cannot carry the Symbol or forge an active token's object identity.
const publishedReaderKey = Symbol('published-content-reader')
// Payload treats symbol-only plain contexts as empty and replaces them. This
// marker preserves its copy path; it grants no access without the active token.
const readerContextMarker = '__rickyPublishedReaderContext'
const publishedReaders = new WeakSet<object>()

function readerIdentity(req?: object | null): object | undefined {
  const context = (req as { context?: unknown } | undefined | null)?.context
  if (!context || typeof context !== 'object') return undefined
  const token = (context as Record<symbol, unknown>)[publishedReaderKey]
  return token && typeof token === 'object' ? token : undefined
}

export function isContentAdmin(req?: Pick<PayloadRequest, 'user'> | null): boolean {
  return req?.user?.collection === 'users' && req.user.role === 'admin'
}

export function isPublishedContentRead(req?: object | null): boolean {
  const identity = readerIdentity(req)
  return Boolean(identity && publishedReaders.has(identity))
}

export async function withPublishedContentRead<T>(
  req: PayloadRequest,
  read: () => Promise<T>,
): Promise<T> {
  req.context ??= {}
  const previous = readerIdentity(req)
  const inherited = Boolean(previous && publishedReaders.has(previous))
  const identity = inherited ? previous! : {}
  const originalContext = req.context as Record<symbol, unknown>
  const hadMarker = Object.hasOwn(req.context, readerContextMarker)
  const previousMarker = req.context[readerContextMarker]
  req.context[readerContextMarker] = true
  originalContext[publishedReaderKey] = identity
  publishedReaders.add(identity)
  try {
    return await read()
  } finally {
    if (!inherited) {
      publishedReaders.delete(identity)
      delete originalContext[publishedReaderKey]
      const currentContext = req.context as Record<symbol, unknown>
      if (currentContext[publishedReaderKey] === identity) delete currentContext[publishedReaderKey]
      for (const context of [originalContext, currentContext]) {
        const record = context as Record<string, unknown>
        if (hadMarker) record[readerContextMarker] = previousMarker
        else delete record[readerContextMarker]
      }
    }
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
