import { dbManager } from '../plugins/database';
import { ChunkDTO } from '@groundguard/contracts';

export class ChunkRepository {
  public async saveChunks(documentId: string, chunks: ChunkDTO[]): Promise<void> {
    if (!chunks || chunks.length === 0) return;
    const pool = dbManager.getPool();
    const client = await pool.connect();
    const now = new Date();

    try {
      await client.query('BEGIN');

      // 1. Atomic Idempotency: delete existing chunks for document
      await client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);

      // 2. Insert new chunks with lineage inside the same transaction
      for (const chunk of chunks) {
        const chunkIdx = chunk.chunk_index ?? chunk.chunkIndex ?? 0;
        const pageNum = chunk.page_number ?? chunk.pageNumber ?? 1;
        const identifiersJson = JSON.stringify(chunk.identifiers || []);

        await client.query(
          `INSERT INTO chunks (id, document_id, chunk_index, page_number, text, section, heading, identifiers, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            chunk.id,
            documentId,
            chunkIdx,
            pageNum,
            chunk.text,
            chunk.section || null,
            chunk.heading || null,
            identifiersJson,
            now,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getChunksByDocumentId(documentId: string): Promise<any[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT id, document_id, chunk_index, page_number, text, section, heading, identifiers, created_at
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [documentId]
    );
    return res.rows;
  }

  public async deleteChunksByDocumentId(documentId: string): Promise<void> {
    const pool = dbManager.getPool();
    await pool.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);
  }
}

export const chunkRepository = new ChunkRepository();
