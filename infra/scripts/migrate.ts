import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/groundguard';

export async function runMigrations(customPool?: Pool): Promise<void> {
  const pool = customPool || new Pool({ connectionString: databaseUrl });
  const migrationsDir = path.resolve(__dirname, '../migrations');

  const client = await pool.connect();

  try {
    // 1. Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename varchar(255),
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

      // 4. Run migration transactionally
      await client.query('BEGIN');
      try {
        await client.query(sql);
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
