import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config/env';
import { runMigrations } from './migrate';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool | null = null;
  private isMemDb: boolean = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    }
    return this.pool;
  }

  public async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const pool = this.getPool();
      const res = await pool.query('SELECT 1 as alive');
      if (res.rows[0]?.alive === 1) {
        return { ok: true };
      }
      return { ok: false, error: 'Query returned unexpected result' };
    } catch (err: any) {
      // If live Postgres is offline and we are in dev/test, fallback to in-memory PG
      if (!this.isMemDb && config.env !== 'production') {
        try {
          const memDb = newDb();
          const memPool = memDb.adapters.createPg().Pool;
          this.pool = new memPool();
          this.isMemDb = true;
          await runMigrations(this.pool!);
          return { ok: true };
        } catch (memErr: any) {
          return { ok: false, error: memErr.message };
        }
      }
      return { ok: false, error: err.message || 'PostgreSQL connection failed' };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (_) {}
      this.pool = null;
    }
  }
}

export const dbManager = DatabaseManager.getInstance();
