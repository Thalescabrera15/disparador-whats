import { PrismaClient } from '@prisma/client';

/** PrismaClient singleton do worker (auth state vive aqui, no Postgres). */
export const prisma = new PrismaClient();

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
