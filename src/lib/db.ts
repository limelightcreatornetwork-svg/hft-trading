import { PrismaClient } from '@prisma/client';

// PrismaClient singleton for Next.js
// Prevents creating multiple instances during development hot reloading

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL;

// Only use accelerateUrl if it's a Prisma Accelerate URL (starts with prisma://)
const isPrismaAccelerate = databaseUrl?.startsWith('prisma://') || databaseUrl?.startsWith('prisma+postgres://');

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    ...(isPrismaAccelerate && databaseUrl ? { accelerateUrl: databaseUrl } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
