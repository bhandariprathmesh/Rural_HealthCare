import { PrismaClient } from '@prisma/client';

type PrismaClientWithMch = PrismaClient & {
  mchRecord: any;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientWithMch };

export const prisma: PrismaClientWithMch =
  (globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })) as PrismaClientWithMch;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

