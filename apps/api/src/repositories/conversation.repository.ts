import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';

export type DBMessageRole = 'user' | 'assistant' | 'system';

export interface DBConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DBMessage {
  id: string;
  conversationId: string;
  role: DBMessageRole;
  content: string;
  generationId: string | null;
  createdAt: Date;
}

const CONVERSATION_COLS = `c.id, c.project_id AS "projectId", c.title, c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
const MESSAGE_COLS = `id, conversation_id AS "conversationId", role, content, generation_id AS "generationId", created_at AS "createdAt"`;

export class ConversationRepository {
  public async createConversation(data: { projectId: string; title: string }): Promise<DBConversation> {
    const pool = dbManager.getPool();
    const id = generateId('conv');
    const now = new Date();

    const query = `
      INSERT INTO conversations (id, project_id, title, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, project_id AS "projectId", title, created_at AS "createdAt", updated_at AS "updatedAt";
    `;
    const res = await pool.query(query, [id, data.projectId, data.title, now, now]);
    return res.rows[0];
  }

  public async listConversationsByProjectId(projectId: string): Promise<DBConversation[]> {
    const pool = dbManager.getPool();
    const query = `
      SELECT ${CONVERSATION_COLS}
      FROM conversations c
      WHERE c.project_id = $1
      ORDER BY c.updated_at DESC;
    `;
    const res = await pool.query(query, [projectId]);
    return res.rows;
  }

  /**
   * Ownership-safe lookup: returns null if the conversation does not exist
   * OR belongs to a project owned by a different user.
   */
  public async findConversationByIdAndUserId(id: string, userId: string): Promise<DBConversation | null> {
    const pool = dbManager.getPool();
    const query = `
      SELECT ${CONVERSATION_COLS}
      FROM conversations c
      JOIN projects p ON p.id = c.project_id
      WHERE c.id = $1 AND p.user_id = $2;
    `;
    const res = await pool.query(query, [id, userId]);
    return res.rows[0] || null;
  }

  public async listMessagesByConversationId(conversationId: string): Promise<DBMessage[]> {
    const pool = dbManager.getPool();
    const query = `
      SELECT ${MESSAGE_COLS}
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC;
    `;
    const res = await pool.query(query, [conversationId]);
    return res.rows;
  }

  /**
   * Used by the generation orchestrator (next step) to persist the user question
   * and assistant answer. Also bumps conversations.updated_at in the same transaction.
   */
  public async createMessage(data: {
    conversationId: string;
    role: DBMessageRole;
    content: string;
    generationId?: string;
  }): Promise<DBMessage> {
    const pool = dbManager.getPool();
    const client = await pool.connect();
    const id = generateId('msg');
    const now = new Date();

    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO messages (id, conversation_id, role, content, generation_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${MESSAGE_COLS};`,
        [id, data.conversationId, data.role, data.content, data.generationId ?? null, now]
      );
      await client.query('UPDATE conversations SET updated_at = $1 WHERE id = $2', [now, data.conversationId]);
      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const conversationRepository = new ConversationRepository();