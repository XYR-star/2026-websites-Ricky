import { existsSync } from 'node:fs'
import { configuredSecret, requiredEnv, serverOrigins } from '../src/lib/runtime-env'

export function loadLocalEnvironment(): void {
  for (const path of ['.env.local', '.env']) if (existsSync(path)) process.loadEnvFile(path)
  process.env.DISABLE_PAYLOAD_HMR = 'true'
}

/** Payload's own CLI also exits explicitly after destroy; drain output first. */
export async function finishCLI(code = Number(process.exitCode || 0)): Promise<never> {
  await Promise.all([process.stdout, process.stderr].map(stream => new Promise<void>(resolve => stream.write('', () => resolve()))))
  process.exit(code)
}

export function verifyEnvironment(): void {
  requiredEnv('DATABASE_URL')
  requiredEnv('CMS_ADMIN_EMAIL')
  configuredSecret('PAYLOAD_SECRET')
  configuredSecret('CMS_READ_TOKEN')
  serverOrigins()
}
