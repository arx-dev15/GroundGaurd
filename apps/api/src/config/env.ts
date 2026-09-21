import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export interface Config {
  env: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  aiServiceUrl: string;
  mlServiceUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

export function loadConfig(): Config {
  const env = process.env.NODE_ENV || 'development';
  const port = parseInt(process.env.PORT || process.env.API_PORT || '4000', 10);
  
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/groundguard';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';
  
  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_groundguard_phase2_change_me_in_prod';
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

  if (env === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_jwt_secret_groundguard_phase2_change_me_in_prod')) {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
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
  };
}

export const config = loadConfig();
