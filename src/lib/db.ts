import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

// Configure WebSocket for Neon serverless (only in Node.js environment)
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    // Dynamic import to avoid issues during build
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

function createPrismaClient(): PrismaClient | null {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    // Return null during build time when DATABASE_URL is not set
    console.warn('DATABASE_URL not set - Prisma client not initialized');
    return null as unknown as PrismaClient;
  }

  // Check if using Prisma Accelerate
  const isPrismaAccelerate = databaseUrl.startsWith('prisma://') || databaseUrl.startsWith('prisma+postgres://');
  
  if (isPrismaAccelerate) {
    // Use Prisma Accelerate
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      accelerateUrl: databaseUrl,
    });
  }

  // Use Neon serverless adapter for standard postgres URLs
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    adapter,
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()!;

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
