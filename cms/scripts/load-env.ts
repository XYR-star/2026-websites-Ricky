import { existsSync } from 'node:fs'
import { configuredSecret, requiredEnv, serverOrigins } from '../src/lib/runtime-env'

export function loadLocalEnvironment(): void {
  for (const path of ['.env.local', '.env']) if (existsSync(path)) process.loadEnvFile(path)
}

export function verifyEnvironment(): void {
  requiredEnv('DATABASE_URL')
  requiredEnv('CMS_ADMIN_EMAIL')
  configuredSecret('PAYLOAD_SECRET')
  configuredSecret('CMS_READ_TOKEN')
  serverOrigins()
}
