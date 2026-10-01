import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  aiServiceUrl: string;
  mlServiceUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  uploadPath: string;
  maxUploadSize: number;
}

const KNOWN_DEV_SECRETS = new Set([
  'dev_jwt_secret_change_me_in_production',
  'dev_jwt_secret_groundguard_phase2_change_me_in_prod',
  'default_secret',
  'secret',
  'changeme',
]);

export function loadConfig(): Config {
  const rawEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const env: 'development' | 'test' | 'production' =
    rawEnv === 'production' ? 'production' : rawEnv === 'test' ? 'test' : 'development';

  // Canonical port: one concept -> one variable (PORT)
  const port = parseInt(process.env.PORT || '4000', 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`FATAL: Invalid PORT environment variable: ${process.env.PORT}`);
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/groundguard';
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_groundguard_phase2_change_me_in_prod';
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

  const uploadPath = process.env.UPLOAD_PATH || path.resolve(process.cwd(), 'uploads');
  const maxUploadSize = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10); // 10MB default

  // Strict Production Invariant Enforcement
  if (env === 'production') {
    // 1. JWT_SECRET guard: must be explicitly configured, >=32 chars, not a known dev string
    if (!process.env.JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET environment variable is mandatory in production.');
    }
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error(
        `FATAL: JWT_SECRET in production must be at least 32 characters long. Current length: ${process.env.JWT_SECRET.length}.`
      );
    }
    if (KNOWN_DEV_SECRETS.has(process.env.JWT_SECRET) || process.env.JWT_SECRET.startsWith('dev_')) {
      throw new Error('FATAL: Known development JWT_SECRET string detected in production. Use a cryptographically secure key.');
    }

    // 2. DATABASE_URL guard: must be explicitly configured, cannot be localhost/127.0.0.1
    if (!process.env.DATABASE_URL) {
      throw new Error('FATAL: DATABASE_URL environment variable is mandatory in production.');
    }
    if (
      process.env.DATABASE_URL.includes('127.0.0.1') ||
      process.env.DATABASE_URL.includes('localhost') ||
      process.env.DATABASE_URL.includes('::1')
    ) {
      throw new Error(
        'FATAL: DATABASE_URL points to localhost/127.0.0.1 in production. A production PostgreSQL instance is required.'
      );
    }

    // 3. PG_MEM_MODE guard: must NEVER silently activate in production
    if (process.env.PG_MEM_MODE === 'true') {
      throw new Error('FATAL: PG_MEM_MODE=true is strictly forbidden in production.');
    }
  }

  return {
    env,
    port,
    databaseUrl,
    redisUrl,
    aiServiceUrl,
    mlServiceUrl,
    jwtSecret,
    jwtExpiresIn,
    uploadPath,
    maxUploadSize,
  };
}

export const config = loadConfig();
