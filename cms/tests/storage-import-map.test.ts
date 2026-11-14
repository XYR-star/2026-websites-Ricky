import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cmsRoot = fileURLToPath(new URL('../', import.meta.url))
const configURL = new URL('../src/payload.config.ts', import.meta.url).href
const clientHandler = '@payloadcms/storage-s3/client#S3ClientUploadHandler'

test('the official import-map generator includes the S3 client in both offline and enabled configurations', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ricky-storage-import-map-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const outputs: string[] = []
  for (const enabled of [false, true]) {
    const output = path.join(directory, `${enabled ? 'enabled' : 'disabled'}.js`)
    // Each subprocess starts with a fresh config module and a deliberately
    // minimal environment. No local environment files, real credentials,
    // Payload instance, database connection or storage request are involved.
    const source = `
      import assert from 'node:assert/strict';
      import { generateImportMap } from 'payload';
      const { default: pending } = await import(${JSON.stringify(configURL)});
      const config = await pending;
      const handler = ${JSON.stringify(clientHandler)};
      assert.equal(config.admin.dependencies[handler].path, handler);
      const providers = config.admin.components?.providers ?? [];
      const hasProvider = providers.some(provider => typeof provider === 'object' && provider.path === handler);
      const hasEndpoint = config.endpoints.some(endpoint => endpoint.path === '/storage-s3-generate-signed-url');
      assert.equal(hasProvider, ${enabled});
      assert.equal(hasEndpoint, ${enabled});
      assert.equal(await config.collections.find(collection => collection.slug === 'media').access.create({
        req: { user: { collection: 'users', role: 'admin' } },
      }), ${enabled});
      await generateImportMap({ ...config, admin: {
        ...config.admin,
        importMap: { ...config.admin.importMap, importMapFile: ${JSON.stringify(output)} },
      } }, { force: true, log: false });
      process.stdout.write('generated-offline');
    `
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || '',
      NODE_ENV: 'production',
      DISABLE_PAYLOAD_HMR: 'true',
    }
    if (enabled) Object.assign(env, {
      R2_ENDPOINT: 'https://storage.offline.invalid',
      R2_ACCESS_KEY_ID: 'offline-fixture-not-a-real-key',
      R2_SECRET_ACCESS_KEY: 'offline-fixture-not-a-real-secret',
      R2_PRIVATE_BUCKET: 'offline-private', R2_PUBLIC_BUCKET: 'offline-public',
      R2_PUBLIC_BASE: 'https://assets.heyrickishere.com',
    })
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: cmsRoot, env, encoding: 'utf8', timeout: 30_000,
    })
    assert.equal(result.status, 0, result.error?.message || result.stderr)
    assert.equal(result.stdout, 'generated-offline')
    const generated = await readFile(output, 'utf8')
    assert.match(generated, /import \{ S3ClientUploadHandler as [^\n]+ from '@payloadcms\/storage-s3\/client'/)
    assert.equal(generated.split(`"${clientHandler}":`).length - 1, 1)
    outputs.push(generated)
  }
  const dependencySet = (source: string) => source.split('\n')
    .filter(line => line.startsWith('import ') || line.startsWith('  "'))
    .map(line => line.replace(/,$/, '')).sort()
  assert.deepEqual(dependencySet(outputs[0]), dependencySet(outputs[1]), 'Enabling storage must not change the generated client dependencies')
  const checkedIn = await readFile(new URL('../src/app/(payload)/admin/importMap.js', import.meta.url), 'utf8')
  assert.equal(checkedIn.split(`"${clientHandler}":`).length - 1, 1)
})
