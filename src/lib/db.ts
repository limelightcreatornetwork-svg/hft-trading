import { PrismaClient } from '@prisma/client';

// PrismaClient singleton for Next.js
// Prevents creating multiple instances during development hot reloading

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7+ requires accelerateUrl for the local Prisma Postgres dev server
const databaseUrl = process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    accelerateUrl: databaseUrl,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
