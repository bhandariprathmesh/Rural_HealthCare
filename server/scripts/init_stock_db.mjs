import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');

  // 1. Create DiagnosticStatus enum if it does not exist
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "DiagnosticStatus" AS ENUM ('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ DiagnosticStatus enum ensured.');
  } catch (err) {
    console.warn('Enum error or already exists:', err.message);
  }

  // 2. Create DiagnosticItem table if it doesn't exist
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DiagnosticItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL,
        "testName" TEXT NOT NULL,
        "testNameHi" TEXT,
        "category" TEXT NOT NULL DEFAULT 'Rapid Diagnostic',
        "kitsAvailable" INTEGER NOT NULL DEFAULT 0,
        "minKitsLevel" INTEGER NOT NULL DEFAULT 10,
        "status" "DiagnosticStatus" NOT NULL DEFAULT 'AVAILABLE',
        "batch" TEXT,
        "expiryDate" TEXT,
        "facilityId" TEXT NOT NULL,
        "facilityName" TEXT,
        "isDemo" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DiagnosticItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "DiagnosticItem_code_key" ON "DiagnosticItem"("code");
    `);
    console.log('✓ DiagnosticItem table ensured.');
  } catch (err) {
    console.error('Failed to create DiagnosticItem table:', err);
  }

  // 3. Inspect columns in Medicine table
  try {
    const medCols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Medicine';
    `);
    console.log('Medicine columns in DB:', medCols);
  } catch (err) {
    console.warn('Failed to query Medicine columns:', err.message);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
