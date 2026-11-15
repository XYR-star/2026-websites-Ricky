import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

type Record = { id: number; status: string; jobId?: string | null; message?: string }

/** Models cross-transaction advisory-lock ownership, commit and rollback offline. */
export function deploymentDB(initial?: Record) {
  const dialect = new PgDialect()
  const state = {
    record: initial,
    locked: false,
    releases: 0,
    statuses: [] as string[],
    failNextSelect: false,
    queries: [] as string[],
  }
  const db = {
    drizzle: {
      transaction: async <T>(work: (transaction: { execute: (query: SQL) => Promise<{ rows: object[] }> }) => Promise<T>): Promise<T> => {
        let acquired = false
        let changed: Record | undefined
        let didUpdate = false
        try {
          const result = await work({
            execute: async (query: SQL) => {
              const { sql, params } = dialect.sqlToQuery(query)
              state.queries.push(sql)
              if (sql.startsWith('SELECT pg_try_advisory_xact_lock(')) {
                assert.deepEqual(params, [0x5249434b, state.record?.id ?? 11])
                if (state.locked) return { rows: [{ acquired: false }] }
                state.locked = acquired = true
                return { rows: [{ acquired: true }] }
              }
              assert.equal(acquired, true, 'Every outbox read/update requires this transaction to own its lock')
              if (sql.startsWith('SELECT id, status, job_id')) {
                if (state.failNextSelect) { state.failNextSelect = false; throw new Error('Offline database read failure') }
                return { rows: state.record ? [{ ...state.record }] : [] }
              }
              assert.match(sql, /^UPDATE deployments SET status = \$1::enum_deployments_status/)
              assert.equal(params[3], state.record?.id)
              didUpdate = true
              if (state.record) changed = { ...state.record, status: String(params[0]), message: String(params[1]), jobId: params[2] as string | null }
              state.statuses.push(String(params[0]))
              return { rows: [] }
            },
          })
          if (didUpdate) state.record = changed
          return result
        } finally {
          if (acquired) { state.locked = false; state.releases++ }
        }
      },
    },
  }
  return { state, db }
}
