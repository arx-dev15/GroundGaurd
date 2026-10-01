import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors';
import { redisManager } from '../plugins/redis';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  prefix?: string;
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, WindowBucket>();

// Clean up expired buckets periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (now > bucket.resetAt) {
      memoryBuckets.delete(key);
    }
  }
}, 60_000);
cleanupInterval.unref();

export function createRateLimiter(options: RateLimitOptions) {
  const { limit, windowMs, prefix = 'rl' } = options;

  return async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Allow disabling rate limiting via environment variable for automated testing
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return;
    }

    const identifier = request.apiKey?.id || request.user?.id || request.ip || 'anonymous';
    const key = `${prefix}:${identifier}`;
    const now = Date.now();

    // Check Redis first if available
    let currentCount = 0;
    let ttlSeconds = Math.ceil(windowMs / 1000);
    let redisUsed = false;

    try {
      const client = redisManager.getClient();
      if (client && client.status === 'ready') {
        const redisKey = `gg:ratelimit:${key}`;
        const count = await client.incr(redisKey);
        if (count === 1) {
          await client.expire(redisKey, ttlSeconds);
        }
        currentCount = count;
        redisUsed = true;
      }
    } catch {
      // Redis unavailable; fallback to memory
    }

    if (!redisUsed) {
      let bucket = memoryBuckets.get(key);
      if (!bucket || now > bucket.resetAt) {
        bucket = { count: 1, resetAt: now + windowMs };
        memoryBuckets.set(key, bucket);
      } else {
        bucket.count++;
      }
      currentCount = bucket.count;
      ttlSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    }

    const remaining = Math.max(0, limit - currentCount);
    reply.header('X-RateLimit-Limit', limit);
    reply.header('X-RateLimit-Remaining', remaining);

    if (currentCount > limit) {
      reply.header('Retry-After', ttlSeconds);
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Maximum ${limit} requests allowed per ${Math.round(windowMs / 1000)} seconds.`,
        429
      );
    }
  };
}

// Preset rate limiters for sensitive endpoints
export const authRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_AUTH || '20', 10),
  windowMs: 60_000,
  prefix: 'auth',
});

export const generationRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_GENERATIONS || '30', 10),
  windowMs: 60_000,
  prefix: 'gen',
});

export const claimRetryRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_RETRY || '30', 10),
  windowMs: 60_000,
  prefix: 'retry',
});

export const evaluationRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_EVALUATIONS || '15', 10),
  windowMs: 60_000,
  prefix: 'eval',
});

export const apiKeyRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_API_KEYS || '20', 10),
  windowMs: 60_000,
  prefix: 'apikey',
});

export const uploadRateLimiter = createRateLimiter({
  limit: parseInt(process.env.RATE_LIMIT_UPLOADS || '15', 10),
  windowMs: 60_000,
  prefix: 'upload',
});
