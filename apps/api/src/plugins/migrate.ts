import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export interface MigrationOptions {
  isPgMem?: boolean;
}

export async function runMigrations(pool: Pool, options?: MigrationOptions): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'infra/migrations');
  const fallbackMigrationsDir = path.resolve(process.cwd(), '../../infra/migrations');
  
  const targetDir = fs.existsSync(migrationsDir) ? migrationsDir : fallbackMigrationsDir;
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const client = await pool.connect();
  const isPgMem = options?.isPgMem ?? (pool as any).__isPgMem ?? (process.env.PG_MEM_MODE === 'true');


  try {
    if (!isPgMem) {
      await client.query('SELECT pg_advisory_lock(847291)');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename varchar(255) PRIMARY KEY,
        applied_at timestamptz
      );
    `);

    const res = await client.query('SELECT filename FROM schema_migrations');
    const appliedFiles = new Set(res.rows.map((row) => row.filename));

    const allFiles = fs.readdirSync(targetDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of allFiles) {
      if (appliedFiles.has(filename)) {
        continue;
      }

      const filePath = path.join(targetDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        const checkRes = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
        if (checkRes.rowCount && checkRes.rowCount > 0) {
          await client.query('ROLLBACK');
          continue;
        }

        if (isPgMem) {
          // Explicit test-only compatibility execution for in-memory pg-mem
          const statements = sql
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          for (const statement of statements) {
            let execSql = statement;
            if (execSql.includes('vector(384)')) {
              execSql = execSql.replace(/vector\(\d+\)/g, 'text');
            }
            if (execSql.includes('USING gin (identifiers)')) {
              execSql = execSql.replace(/USING gin/g, '');
            }
            const cleanSql = execSql.replace(/--.*$/gm, '').trim();
            if (cleanSql.toUpperCase().startsWith('DROP EXTENSION') || cleanSql.toUpperCase().startsWith('CREATE EXTENSION')) {
              continue;
            }
            await client.query(execSql);
          }
        } else {
          // Real PostgreSQL: Execute intact SQL file as a single atomic query
          await client.query(sql);
        }

        await client.query(
          'INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)',
          [filename, new Date()]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    if (!isPgMem) {
      try {
        await client.query('SELECT pg_advisory_unlock(847291)');
      } catch (_) {}
    }
    client.release();
  }
}
