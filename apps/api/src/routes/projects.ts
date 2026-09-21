import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { projectRepository } from '../repositories/project.repository';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Project } from '@groundguard/contracts';

function toPublicProject(dbProj: { id: string; name: string; description?: string; createdAt: Date; updatedAt: Date }): Project {
  return {
    id: dbProj.id,
    name: dbProj.name,
    description: dbProj.description || undefined,
    createdAt: dbProj.createdAt.toISOString(),
    updatedAt: dbProj.updatedAt.toISOString(),
  };
}

export async function projectRoutes(fastify: FastifyInstance) {
  // All project routes require authentication
  fastify.addHook('preHandler', authenticate);

  // POST /v1/projects
  fastify.post('/v1/projects', async (request, reply) => {
    const { name, description } = (request.body || {}) as {
      name?: string;
      description?: string;
    };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError('Project name is required');
    }

    const userId = request.user!.id;
    const dbProject = await projectRepository.createProject({
      userId,
      name,
      description,
    });

    return reply.status(201).send({
      project: toPublicProject(dbProject),
    });
  });

  // GET /v1/projects
  fastify.get('/v1/projects', async (request, reply) => {
    const userId = request.user!.id;
    const dbProjects = await projectRepository.listProjectsByUserId(userId);
    
    return reply.status(200).send({
      projects: dbProjects.map(toPublicProject),
    });
  });

  // GET /v1/projects/:projectId
  fastify.get('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const dbProject = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!dbProject) {
      throw new NotFoundError('Project not found');
    }

    return reply.status(200).send({
      project: toPublicProject(dbProject),
    });
  });

  // PATCH /v1/projects/:projectId
  fastify.patch('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const body = (request.body || {}) as Record<string, unknown>;
    const bodyKeys = Object.keys(body);

    if (bodyKeys.length === 0) {
      throw new BadRequestError('At least one modifiable field (name or description) must be provided');
    }

    const allowedKeys = new Set(['name', 'description']);
    const invalidKeys = bodyKeys.filter((key) => !allowedKeys.has(key));

    if (invalidKeys.length > 0) {
      throw new BadRequestError(`Unsupported or protected field(s) in PATCH payload: ${invalidKeys.join(', ')}`);
    }

    const hasName = typeof body.name === 'string' && body.name.trim().length > 0;
    const hasDesc = typeof body.description === 'string';

    if (!hasName && !hasDesc) {
      throw new BadRequestError('At least one modifiable field (name or description) must be provided');
    }

    const updates: { name?: string; description?: string } = {};
    if (hasName) updates.name = body.name as string;
    if (hasDesc) updates.description = body.description as string;

    const updated = await projectRepository.updateProject(projectId, userId, updates);
    if (!updated) {
      throw new NotFoundError('Project not found');
    }

    return reply.status(200).send({
      project: toPublicProject(updated),
    });
  });

  // DELETE /v1/projects/:projectId
  fastify.delete('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const deleted = await projectRepository.deleteProject(projectId, userId);
    if (!deleted) {
      throw new NotFoundError('Project not found');
    }

    return reply.status(200).send({
      message: 'Project deleted successfully',
    });
  });
}
