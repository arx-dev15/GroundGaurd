import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';

export interface DBProject {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectRepository {
  public async createProject(data: { userId: string; name: string; description?: string }): Promise<DBProject> {
    const pool = dbManager.getPool();
    const id = generateId('proj');
    const now = new Date();

    const query = `
      INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id AS "userId", name, description, created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const res = await pool.query(query, [id, data.userId, data.name.trim(), data.description ? data.description.trim() : null, now, now]);
    return res.rows[0];
  }

  public async listProjectsByUserId(userId: string): Promise<DBProject[]> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, user_id AS "userId", name, description, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM projects
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const res = await pool.query(query, [userId]);
    return res.rows;
  }

  public async findProjectById(id: string): Promise<DBProject | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, user_id AS "userId", name, description, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM projects
      WHERE id = $1;
    `;
    const res = await pool.query(query, [id]);
    return res.rows[0] || null;
  }

  public async findProjectByIdAndUserId(id: string, userId: string): Promise<DBProject | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, user_id AS "userId", name, description, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM projects
      WHERE id = $1 AND user_id = $2;
    `;
    const res = await pool.query(query, [id, userId]);
    return res.rows[0] || null;
  }

  public async updateProject(
    id: string,
    userId: string,
    updates: { name?: string; description?: string }
  ): Promise<DBProject | null> {
    const pool = dbManager.getPool();

    // Check ownership first
    const existing = await this.findProjectByIdAndUserId(id, userId);
    if (!existing) {
      return null;
    }

    const newName = updates.name !== undefined ? updates.name.trim() : existing.name;
    const newDesc = updates.description !== undefined ? updates.description.trim() : existing.description;
    const now = new Date();

    const query = `
      UPDATE projects
      SET name = $1, description = $2, updated_at = $3
      WHERE id = $4 AND user_id = $5
      RETURNING id, user_id AS "userId", name, description, created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const res = await pool.query(query, [newName, newDesc, now, id, userId]);
    return res.rows[0] || null;
  }

  public async deleteProject(id: string, userId: string): Promise<boolean> {
    const pool = dbManager.getPool();
    const query = `
      DELETE FROM projects
      WHERE id = $1 AND user_id = $2;
    `;
    const res = await pool.query(query, [id, userId]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const projectRepository = new ProjectRepository();
