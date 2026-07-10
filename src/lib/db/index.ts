/**
 * Database Client Configuration
 * 
 * Uses Neon Serverless Postgres with Drizzle ORM
 * Connection pooling enabled for optimal performance
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema';

// Validate database URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create connection pool
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds
});

// Create Drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export schema for use in queries
export * from './schema';

// Helper function to test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
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
  await pool.end();
}

// Made with Bob
