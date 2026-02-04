import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

// Configure WebSocket for Neon serverless (only in Node.js environment)
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    // Dynamic require needed for conditional WebSocket polyfill
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws;
  } catch {
    // Ignore if ws is not available during build
  }
}

// PrismaClient singleton for Next.js
// Prevents creating multiple instances during development hot reloading

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Create a PrismaClient instance
 * Throws an error if DATABASE_URL is not set at runtime (except during build)
 */
function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  // During Next.js build, DATABASE_URL may not be set
  // We detect this by checking for typical build-time indicators
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' ||
    process.argv.some(arg => arg.includes('next') && arg.includes('build'));

  if (!databaseUrl) {
    if (isBuildTime) {
      // Return a dummy client during build that will be replaced at runtime
      // This allows the build to complete without a database connection
      console.warn('[DB] DATABASE_URL not set during build - using placeholder client');
      // We still need to return something for type safety during build
      // This client will never be used at runtime since createPrismaClient is called again
      return new Proxy({} as PrismaClient, {
        get(_, prop) {
          if (prop === 'then') return undefined; // Prevent treating as Promise
          throw new Error(
            `DATABASE_URL is required. Cannot access prisma.${String(prop)} without a database connection.`
          );
        },
      });
    }

    throw new Error(
      'DATABASE_URL environment variable is required. ' +
      'Please set it to your Neon or Postgres connection string.'
    );
  }

  // Check if using Prisma Accelerate (prisma:// or prisma+postgres:// URLs)
  const isPrismaAccelerate = databaseUrl.startsWith('prisma://') ||
    databaseUrl.startsWith('prisma+postgres://');

  if (isPrismaAccelerate) {
    // For Prisma Accelerate, use standard PrismaClient configuration
    // The connection string is passed via datasource in schema.prisma
    // No need to pass accelerateUrl - it's handled via DATABASE_URL
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  // Use Neon serverless adapter for standard postgres URLs
  const adapter = new PrismaNeon({ connectionString: databaseUrl });

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    adapter,
  });
}

// Create singleton instance
// The nullish coalescing handles the case where globalForPrisma.prisma is undefined
const prismaInstance = globalForPrisma.prisma ?? createPrismaClient();

// Store in global for development hot reloading
if (process.env.NODE_ENV !== 'production' && prismaInstance) {
  globalForPrisma.prisma = prismaInstance;
}

export const prisma = prismaInstance;
export default prisma;
