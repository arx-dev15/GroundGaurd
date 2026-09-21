import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';
import { DocumentStatus } from '@groundguard/contracts';

export interface DBDocument {
  id: string;
  projectId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  status: DocumentStatus;
  errorMessage?: string;
  chunksCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentRepository {
  public async createDocument(data: {
    projectId: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    filePath: string;
  }): Promise<DBDocument> {
    const pool = dbManager.getPool();
    const id = generateId('doc');
    const now = new Date();

    const query = `
      INSERT INTO documents (id, project_id, filename, file_size, mime_type, file_path, status, error_message, chunks_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NULL, 0, $7, $8)
      RETURNING id, project_id AS "projectId", filename, file_size AS "fileSize", mime_type AS "mimeType", file_path AS "filePath", status, error_message AS "errorMessage", chunks_count AS "chunksCount", created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const res = await pool.query(query, [
      id,
      data.projectId,
      data.filename,
      data.fileSize,
      data.mimeType,
      data.filePath,
      now,
      now,
    ]);

    return res.rows[0];
  }

  public async updateStatus(
    id: string,
    status: DocumentStatus,
    chunksCount?: number,
    errorMessage?: string
  ): Promise<DBDocument | null> {
    const pool = dbManager.getPool();
    const now = new Date();

    const query = `
      UPDATE documents
      SET status = $1,
          chunks_count = COALESCE($2, chunks_count),
          error_message = $3,
          updated_at = $4
      WHERE id = $5
      RETURNING id, project_id AS "projectId", filename, file_size AS "fileSize", mime_type AS "mimeType", file_path AS "filePath", status, error_message AS "errorMessage", chunks_count AS "chunksCount", created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const res = await pool.query(query, [status, chunksCount ?? null, errorMessage ?? null, now, id]);
    return res.rows[0] || null;
  }

  public async findDocumentById(id: string): Promise<DBDocument | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, project_id AS "projectId", filename, file_size AS "fileSize", mime_type AS "mimeType", file_path AS "filePath", status, error_message AS "errorMessage", chunks_count AS "chunksCount", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM documents
      WHERE id = $1;
    `;
    const res = await pool.query(query, [id]);
    return res.rows[0] || null;
  }

  public async findDocumentByIdAndProjectId(id: string, projectId: string): Promise<DBDocument | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, project_id AS "projectId", filename, file_size AS "fileSize", mime_type AS "mimeType", file_path AS "filePath", status, error_message AS "errorMessage", chunks_count AS "chunksCount", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM documents
      WHERE id = $1 AND project_id = $2;
    `;
    const res = await pool.query(query, [id, projectId]);
    return res.rows[0] || null;
  }

  public async listDocumentsByProjectId(projectId: string): Promise<DBDocument[]> {
    const pool = dbManager.getPool();
    const query = `
      SELECT id, project_id AS "projectId", filename, file_size AS "fileSize", mime_type AS "mimeType", file_path AS "filePath", status, error_message AS "errorMessage", chunks_count AS "chunksCount", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM documents
      WHERE project_id = $1
      ORDER BY created_at DESC;
    `;
    const res = await pool.query(query, [projectId]);
    return res.rows;
  }

  public async deleteDocument(id: string, projectId: string): Promise<{ id: string; projectId: string; filePath: string } | null> {
    const pool = dbManager.getPool();
    const query = `
      DELETE FROM documents
      WHERE id = $1 AND project_id = $2
      RETURNING id, project_id AS "projectId", file_path AS "filePath";
    `;
    const res = await pool.query(query, [id, projectId]);
    return res.rows[0] || null;
  }
}

export const documentRepository = new DocumentRepository();
