/**
 * Database Client Configuration
 *
 * Uses Neon Serverless Postgres with Drizzle ORM.
 * The client is initialised lazily on first use so that importing this module
 * during a Next.js build (when DATABASE_URL is not available) does not throw.
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

type Schema = typeof schema;

let _pool: Pool | null = null;
let _db: NeonDatabase<Schema> | null = null;

function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

export function getDb(): NeonDatabase<Schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

/**
 * Proxy that forwards every property access to the lazily-created db instance.
 * Allows call-sites to keep writing `db.select()...` unchanged.
 */
export const db = new Proxy({} as NeonDatabase<Schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Export schema for use in queries
export * from './schema';

// Helper function to test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Helper function to close pool (for graceful shutdown)
export async function closeDatabaseConnection(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

