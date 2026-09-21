import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';

export interface DBUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserRepository {
  public async createUser(data: { email: string; passwordHash: string; name: string }): Promise<DBUser> {
    const pool = dbManager.getPool();
    const id = generateId('usr');
    const now = new Date();

    const query = `
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, password_hash AS "passwordHash", name, created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    try {
      const res = await pool.query(query, [id, data.email.toLowerCase().trim(), data.passwordHash, data.name.trim(), now, now]);
      return res.rows[0];
    } catch (err: any) {
      if (err && (err.code === '23505' || (err.message && err.message.includes('unique')))) {
        const { AppError } = require('../utils/errors');
        throw new AppError('EMAIL_EXISTS', 'Email is already registered', 409);
      }
      throw err;
    }
  }

  public async findByEmail(email: string): Promise<DBUser | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, email, password_hash AS "passwordHash", name, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users
      WHERE email = $1;
    `;
    const res = await pool.query(query, [email.toLowerCase().trim()]);
    return res.rows[0] || null;
  }

  public async findById(id: string): Promise<DBUser | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, email, password_hash AS "passwordHash", name, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users
      WHERE id = $1;
    `;
    const res = await pool.query(query, [id]);
    return res.rows[0] || null;
  }
}

export const userRepository = new UserRepository();
