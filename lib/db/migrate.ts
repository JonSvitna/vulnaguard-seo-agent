import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Pool } from 'pg'

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib', 'db', 'migrations')

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

/**
 * Applies any `.sql` files under `lib/db/migrations/` that aren't yet
 * recorded in `schema_migrations`, in filename order. Each file runs
 * inside its own transaction; a failing file rolls back and throws,
 * stopping startup rather than continuing with a partial schema.
 */
export async function runMigrations(pool: Pool): Promise<{ applied: string[] }> {
  await ensureMigrationsTable(pool)

  const { rows: appliedRows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  )
  const alreadyApplied = new Set(appliedRows.map((r) => r.version))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const applied: string[] = []

  for (const file of files) {
    if (alreadyApplied.has(file)) continue

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
      await client.query('COMMIT')
      applied.push(file)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
    } finally {
      client.release()
    }
  }

  return { applied }
}
