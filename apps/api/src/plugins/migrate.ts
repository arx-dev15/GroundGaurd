import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'infra/migrations');
  const fallbackMigrationsDir = path.resolve(process.cwd(), '../../infra/migrations');
  
  const targetDir = fs.existsSync(migrationsDir) ? migrationsDir : fallbackMigrationsDir;
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename varchar(255),
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
        await client.query(sql);
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
    client.release();
  }
}


