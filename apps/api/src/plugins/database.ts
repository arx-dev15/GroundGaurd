import { Pool } from 'pg';
import { config } from '../config/env';

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

  public setTestPool(testPool: Pool): void {
    this.pool = testPool;
    this.isMemDb = true;
    (this.pool as any).__isPgMem = true;
  }

  public getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      this.isMemDb = false;
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
