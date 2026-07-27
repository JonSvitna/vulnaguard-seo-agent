import { Pool } from 'pg'
import { runMigrations } from '@/lib/db/migrate'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
  // eslint-disable-next-line no-var
  var __pgInit: Promise<void> | undefined
}

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Attach a Postgres plugin in Railway.')
  }
  const ssl =
    process.env.PGSSLMODE === 'disable' ||
    /\blocalhost\b|127\.0\.0\.1|\.railway\.internal\b/.test(connectionString)
      ? false
      : { rejectUnauthorized: false }
  return new Pool({ connectionString, ssl, max: 5 })
}

export function getPool(): Pool {
  if (!global.__pgPool) global.__pgPool = buildPool()
  return global.__pgPool
}

/**
 * Runs the SQL migrations in `lib/db/migrations/` (schema + seed data).
 * Memoized on `global.__pgInit` so concurrent callers share one run, and
 * reset on failure so a later request can retry after a transient error.
 */
export async function ensureSchema(): Promise<void> {
  if (!global.__pgInit) {
    global.__pgInit = runMigrations(getPool())
      .then((result) => {
        if (result.applied.length > 0) {
          console.log('[db] applied migrations:', result.applied.join(', '))
        }
      })
      .catch((err) => {
        global.__pgInit = undefined
        throw err
      })
  }
  return global.__pgInit
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  await ensureSchema()
  const res = await getPool().query(text, params as never)
  return res.rows as T[]
}
