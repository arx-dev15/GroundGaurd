import fs from 'fs/promises';
import path from 'path';

const UPLOADS_BASE_DIR = path.resolve(process.cwd(), 'uploads');

export async function saveUploadedFile(projectId: string, documentId: string, buffer: Buffer): Promise<string> {
  const projectDir = path.join(UPLOADS_BASE_DIR, projectId);
  await fs.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${documentId}.pdf`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function deleteStoredFile(filePath: string): Promise<void> {
  try {
    if (filePath) {
      await fs.unlink(filePath);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`[Storage] Failed to delete file at ${filePath}:`, err.message);
    }
  }
}
