import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';

export interface DBApiKey {
  id: string;
  userId: string;
  projectId: string | null;
  name: string;
  keyPrefix: string;
  keyHash: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const API_KEY_COLS = `
  id,
  user_id AS "userId",
  project_id AS "projectId",
  name,
  key_prefix AS "keyPrefix",
  key_hash AS "keyHash",
  last_used_at AS "lastUsedAt",
  expires_at AS "expiresAt",
  revoked_at AS "revokedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export class ApiKeyRepository {
  public async createApiKey(data: {
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    projectId?: string | null;
    expiresAt?: Date | null;
  }): Promise<DBApiKey> {
    const pool = dbManager.getPool();
    const id = generateId('key');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO api_keys
        (id, user_id, project_id, name, key_prefix, key_hash, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING ${API_KEY_COLS};`,
      [
        id,
        data.userId,
        data.projectId ?? null,
        data.name.trim(),
        data.keyPrefix,
        data.keyHash,
        data.expiresAt ?? null,
        now,
      ]
    );
    return res.rows[0];
  }


  public async listApiKeysByUserId(userId: string): Promise<DBApiKey[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${API_KEY_COLS}
       FROM api_keys
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC;`,
      [userId]
    );
    return res.rows;
  }


  public async findApiKeyByIdAndUserId(id: string, userId: string): Promise<DBApiKey | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${API_KEY_COLS}
       FROM api_keys
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL;`,
      [id, userId]
    );
    return res.rows[0] || null;
  }


  public async findActiveApiKeyByHash(keyHash: string): Promise<DBApiKey | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${API_KEY_COLS}
       FROM api_keys
       WHERE key_hash = $1
         AND revoked_at IS NULL

         AND (expires_at IS NULL OR expires_at > NOW());`,
      [keyHash]
    );
    return res.rows[0] || null;
  }


  public async updateLastUsed(id: string): Promise<void> {
    const pool = dbManager.getPool();
    await pool.query(
      `UPDATE api_keys
       SET last_used_at = NOW(), updated_at = NOW()
       WHERE id = $1;`,
      [id]
    ).catch(() => {});
  }


  public async revokeApiKey(id: string, userId: string): Promise<boolean> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `UPDATE api_keys
       SET revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id;`,
      [id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const apiKeyRepository = new ApiKeyRepository();