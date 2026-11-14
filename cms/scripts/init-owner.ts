import { finishCLI, loadLocalEnvironment, verifyEnvironment } from './load-env'

loadLocalEnvironment()
verifyEnvironment()
const email = process.env.CMS_ADMIN_EMAIL!.trim().toLowerCase()
const password = process.env.CMS_ADMIN_PASSWORD
if (!password || password.length < 16) throw new Error('Set a unique CMS_ADMIN_PASSWORD of at least 16 characters in your local private environment.')
const { getPayload } = await import('payload')
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })
try {
  const result = await payload.find({ collection: 'users', limit: 1, depth: 0, overrideAccess: true })
  if (result.totalDocs) throw new Error('Owner already exists. Initialization did not change the account.')
  await payload.create({ collection: 'users', data: { email, password, role: 'admin' }, overrideAccess: true, context: { bootstrapOwner: true } })
  console.log('Created the single configured administrator. Password was not printed.')
} finally {
  await payload.destroy()
}
// The upstream adapter retains its bootstrap socket after destroy(). All writes
// above are awaited; terminate this CLI explicitly, as Payload's own CLI does.
await finishCLI()
