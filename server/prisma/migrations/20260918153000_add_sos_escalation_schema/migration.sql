-- CreateEnum
CREATE TYPE "SosEscalationAction" AS ENUM ('NOTIFIED', 'ACCEPTED', 'DECLINED', 'TIMED_OUT');

-- AlterEnum
ALTER TYPE "SosStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SosStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "SosStatus" ADD VALUE IF NOT EXISTS 'DECLINED_ALL';
ALTER TYPE "SosStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "SosStatus" ADD VALUE IF NOT EXISTS 'RESOLVED';

-- AlterTable
ALTER TABLE "EmergencyAccessLog" ADD COLUMN IF NOT EXISTS "sosAlertId" TEXT;

-- AlterTable
ALTER TABLE "SosAlert" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "acceptedBy" TEXT,
ADD COLUMN IF NOT EXISTS "currentResponderId" TEXT,
ADD COLUMN IF NOT EXISTS "escalationDeadline" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "escalationIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "facilityId" TEXT,
ADD COLUMN IF NOT EXISTS "raisedByWorkerId" TEXT,
ADD COLUMN IF NOT EXISTS "vitalsSnapshot" TEXT;

ALTER TABLE "SosAlert" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE IF NOT EXISTS "SosEscalationEvent" (
    "id" TEXT NOT NULL,
    "sosAlertId" TEXT NOT NULL,
    "responderId" TEXT,
    "responderName" TEXT,
    "action" "SosEscalationAction" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SosEscalationEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SosAlert_raisedByWorkerId_fkey') THEN
        ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_raisedByWorkerId_fkey" FOREIGN KEY ("raisedByWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SosAlert_facilityId_fkey') THEN
        ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SosEscalationEvent_sosAlertId_fkey') THEN
        ALTER TABLE "SosEscalationEvent" ADD CONSTRAINT "SosEscalationEvent_sosAlertId_fkey" FOREIGN KEY ("sosAlertId") REFERENCES "SosAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmergencyAccessLog_sosAlertId_fkey') THEN
        ALTER TABLE "EmergencyAccessLog" ADD CONSTRAINT "EmergencyAccessLog_sosAlertId_fkey" FOREIGN KEY ("sosAlertId") REFERENCES "SosAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

