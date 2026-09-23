import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/groundguard';

export interface MigrationOptions {
  isPgMem?: boolean;
}

export async function runMigrations(customPool?: Pool, options?: MigrationOptions): Promise<void> {
  const pool = customPool || new Pool({ connectionString: databaseUrl });
  const migrationsDir = path.resolve(__dirname, '../migrations');

  const client = await pool.connect();
  const isPgMem = options?.isPgMem ?? (pool as any).__isPgMem ?? (process.env.PG_MEM_MODE === 'true');


  try {
    if (!isPgMem) {
      await client.query('SELECT pg_advisory_lock(847291)');
    }

    // 1. Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename varchar(255) PRIMARY KEY,
        applied_at timestamptz
      );
    `);

    // 2. Fetch applied migrations
    const res = await client.query('SELECT filename FROM schema_migrations');
    const appliedFiles = new Set(res.rows.map((row) => row.filename));

    // 3. Read & deterministically sort SQL migration files
    const allFiles = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of allFiles) {
      if (appliedFiles.has(filename)) {
        continue;
      }

      console.log(`[Migration] Executing migration: ${filename}...`);
      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      // 4. Run migration in a transaction
      await client.query('BEGIN');
      try {
        const checkRes = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
        if (checkRes.rowCount && checkRes.rowCount > 0) {
          await client.query('ROLLBACK');
          continue;
        }

        if (isPgMem) {
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
          await client.query(sql);
        }

        await client.query(
          'INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)',
          [filename, new Date()]
        );
        await client.query('COMMIT');
        console.log(`[Migration] Successfully applied & recorded: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migration] FAILED migration ${filename}. Rolled back transaction.`, err);
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
    if (!customPool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[Migration] Migration process failed:', err);
    process.exit(1);
  });
}
