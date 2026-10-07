import { FastifyInstance } from 'fastify';
import { authenticate, assertProjectAuthorized } from '../middleware/auth';
import { projectRepository } from '../repositories/project.repository';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Project } from '@groundguard/contracts';

function toPublicProject(dbProj: { id: string; name: string; description?: string; createdAt?: Date | string | null; updatedAt?: Date | string | null }): Project {
  const parseDate = (d?: Date | string | null) => {
    if (!d) return new Date(0).toISOString();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  };

  return {
    id: dbProj.id,
    name: dbProj.name,
    description: dbProj.description || undefined,
    createdAt: parseDate(dbProj.createdAt),
    updatedAt: parseDate(dbProj.updatedAt),
  };
}

export async function projectRoutes(fastify: FastifyInstance) {
  // All project routes require authentication
  fastify.addHook('preHandler', authenticate);

  // POST /v1/projects
  fastify.post('/v1/projects', async (request, reply) => {
    if (request.apiKey && request.apiKey.projectId) {
      throw new BadRequestError('Project-scoped API keys cannot create new projects');
    }

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
    let dbProjects = await projectRepository.listProjectsByUserId(userId);
    if (request.apiKey && request.apiKey.projectId) {
      dbProjects = dbProjects.filter((p) => p.id === request.apiKey!.projectId);
    }

    return reply.status(200).send({
      projects: dbProjects.map(toPublicProject),
    });
  });

  // GET /v1/projects/:projectId
  fastify.get('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    assertProjectAuthorized(request, projectId);
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

    assertProjectAuthorized(request, projectId);
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

    assertProjectAuthorized(request, projectId);
    const deleted = await projectRepository.deleteProject(projectId, userId);
    if (!deleted) {
      throw new NotFoundError('Project not found');
    }

    return reply.status(200).send({
      message: 'Project deleted successfully',
    });
  });

  // GET /v1/projects/:projectId/claims
  fastify.get('/v1/projects/:projectId/claims', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const query = (request.query || {}) as {
      limit?: string;
      offset?: string;
      status?: string;
    };

    const limit = query.limit !== undefined ? parseInt(query.limit, 10) : undefined;
    const offset = query.offset !== undefined ? parseInt(query.offset, 10) : undefined;
    const statusFilter = query.status
      ? query.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const { generationRepository } = await import('../repositories/generation.repository');
    const { items: rawClaims, total } = await generationRepository.listClaimsByProjectId(projectId, {
      limit: limit !== undefined && !isNaN(limit) ? limit : undefined,
      offset: offset !== undefined && !isNaN(offset) ? offset : undefined,
      status: statusFilter,
    });

    const enrichedClaims = await Promise.all(
      rawClaims.map(async (c) => {
        const ev = await generationRepository.listEvidenceByClaimId(c.id);
        const metaList = ev.map((e) => {
          const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {});
          return {
            evidenceId: e.id,
            chunkId: e.chunkId,
            documentId: e.documentId ?? undefined,
            text: e.text,
            retrievalScore: e.retrievalScore ?? undefined,
            metadata: meta,
            pageNumber: (meta?.pageNumber as number) ?? undefined,
            section: (meta?.section as string) ?? undefined,
            heading: (meta?.heading as string) ?? undefined,
          };
        });

        const claimObj: Record<string, unknown> = {
          claimId: c.id,
          externalClaimId: c.externalClaimId ?? undefined,
          text: c.text,
          status: c.status,
          ordinal: c.claimIndex,
          generationId: c.generationId,
          conversationId: c.conversationId ?? undefined,
          conversationTitle: c.conversationTitle ?? 'Untitled conversation',
          query: c.query,
          createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
          evidence: metaList,
        };

        if (c.label) {
          claimObj.verification = {
            label: c.label,
            scores: {
              entailment: c.entailmentScore ?? 0,
              contradiction: c.contradictionScore ?? 0,
              neutral: c.neutralScore ?? 0,
            },
            groundingScore: c.groundingScore ?? 0,
            modelVersion: c.modelVersion ?? '',
          };
        }

        return claimObj;
      })
    );

    const responsePayload: Record<string, unknown> = {
      claims: enrichedClaims,
      items: enrichedClaims,
    };

    if (limit !== undefined && !isNaN(limit)) {
      const currentOffset = offset ?? 0;
      responsePayload.pagination = {
        total,
        limit,
        offset: currentOffset,
        hasMore: currentOffset + limit < total,
      };
    }

    return reply.status(200).send(responsePayload);
  });

  // GET /v1/projects/:projectId/grounded-generations
  fastify.get('/v1/projects/:projectId/grounded-generations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const { generationRepository } = await import('../repositories/generation.repository');
    const groundedGens = await generationRepository.listGroundedGenerationsByProjectId(projectId);

    // Collect source document filenames for each generation
    const results = await Promise.all(
      groundedGens.map(async (g) => {
        const claims = await generationRepository.listClaimsByGenerationId(g.generationId);
        const sourceNames = new Set<string>();
        for (const c of claims) {
          const evList = await generationRepository.listEvidenceByClaimId(c.id);
          for (const ev of evList) {
            const meta = typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : (ev.metadata ?? {});
            const name = (meta?.filename as string) || (meta?.documentFilename as string) || ev.documentId;
            if (name) sourceNames.add(name);
          }
        }

        return {
          generationId: g.generationId,
          conversationId: g.conversationId,
          conversationTitle: g.conversationTitle,
          query: g.query,
          createdAt: new Date(g.createdAt).toISOString(),
          claimCounts: {
            total: g.totalClaims,
            verified: g.verifiedClaims,
            flagged: g.flaggedClaims,
            recovered: g.recoveredClaims,
            needsReview: g.needsReviewClaims,
          },
          sources: Array.from(sourceNames),
        };
      })
    );

    return reply.status(200).send({ generations: results });
  });
}
