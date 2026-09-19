-- AlterTable
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "familyDoctorId" TEXT,
ADD COLUMN IF NOT EXISTS "familyDoctorName" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Patient_familyDoctorId_fkey'
  ) THEN
    ALTER TABLE "Patient" ADD CONSTRAINT "Patient_familyDoctorId_fkey" FOREIGN KEY ("familyDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

