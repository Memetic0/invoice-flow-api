import { Pool } from 'pg';
import { logger } from './logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms`, { text: text.slice(0, 80), rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Database query failed:', { text: text.slice(0, 80), error });
    throw error;
  }
}

export async function getClient() {
  return pool.connect();
}

export default pool;
