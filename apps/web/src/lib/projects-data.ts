import type { Project } from '@groundguard/types';

export function createFallbackProject(id: string, name?: string): Project {
  return {
    id,
    name: name || 'Project',
    description: 'GroundGuard project workspace',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
