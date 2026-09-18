-- AlterTable: Add email column as nullable first to allow backfill
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- Backfill emails for existing demo users based on their phone numbers
UPDATE "User" SET "email" = 'admin@ruralcare.in' WHERE "phone" = '9829000001' AND "email" IS NULL;
UPDATE "User" SET "email" = 'ankit.doctor@ruralcare.in' WHERE "phone" = '9829000002' AND "email" IS NULL;
UPDATE "User" SET "email" = 'priya.doctor@ruralcare.in' WHERE "phone" = '9829000003' AND "email" IS NULL;
UPDATE "User" SET "email" = 'suresh.doctor@ruralcare.in' WHERE "phone" = '9829000004' AND "email" IS NULL;
UPDATE "User" SET "email" = 'nilesh.doctor@ruralcare.in' WHERE "phone" = '9822054321' AND "email" IS NULL;
UPDATE "User" SET "email" = 'anand.doctor@ruralcare.in' WHERE "phone" = '9829099883' AND "email" IS NULL;
UPDATE "User" SET "email" = 'meena.worker@ruralcare.in' WHERE "phone" = '9829000005' AND "email" IS NULL;
UPDATE "User" SET "email" = 'sunita.worker@ruralcare.in' WHERE "phone" = '9829000006' AND "email" IS NULL;
UPDATE "User" SET "email" = 'raju.worker@ruralcare.in' WHERE "phone" = '9829000007' AND "email" IS NULL;
UPDATE "User" SET "email" = 'kamla.worker@ruralcare.in' WHERE "phone" = '9829099881' AND "email" IS NULL;
UPDATE "User" SET "email" = 'priya.patient@ruralcare.in' WHERE "phone" = '9414158392' AND "email" IS NULL;
UPDATE "User" SET "email" = 'ramesh.patient@ruralcare.in' WHERE "phone" = '9672944501' AND "email" IS NULL;
UPDATE "User" SET "email" = 'sunitabai.patient@ruralcare.in' WHERE "phone" = '9799928831' AND "email" IS NULL;
UPDATE "User" SET "email" = 'mohan.patient@ruralcare.in' WHERE "phone" = '9462091004' AND "email" IS NULL;
UPDATE "User" SET "email" = 'kavita.patient@ruralcare.in' WHERE "phone" = '9529160772' AND "email" IS NULL;

-- Fallback for any other user records without email
UPDATE "User" SET "email" = 'user_' || "id" || '@ruralcare.in' WHERE "email" IS NULL;

-- Backfill passwordHash for existing users where passwordHash IS NULL so they can authenticate
UPDATE "User" SET "passwordHash" = COALESCE("pinHash", '$2b$10$EfM5l2Z9YKGmh.B.yZtczO8WhWeuLMT1lMC3lPo.QYdGrh8av3D1.') WHERE "passwordHash" IS NULL;

-- AlterTable: Set email column as NOT NULL now that all records have values
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex: Create unique index on User(email)
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Ensure user vishwajeetpawade7@gmail.com exists as PATIENT with password123 / 123456
INSERT INTO "User" ("id", "email", "phone", "role", "fullName", "passwordHash", "pinHash", "active", "isDemo", "createdAt", "updatedAt")
VALUES (
  'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  'vishwajeetpawade7@gmail.com',
  '9829999999',
  'PATIENT',
  'Vishwajeet Pawade',
  '$2b$10$EfM5l2Z9YKGmh.B.yZtczO8WhWeuLMT1lMC3lPo.QYdGrh8av3D1.',
  '$2b$10$F/WJUykh3Efv62rP9b3NUOc1NqXsHRQuu6HqsrcjM9O0GNbHRVtVK',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO NOTHING;

-- Ensure patient profile for vishwajeetpawade7@gmail.com exists
INSERT INTO "Patient" (
  "id", "healthId", "abhaNumber", "abhaAddress", "userId", "name", "nameHi",
  "age", "dob", "gender", "bloodGroup", "phone", "village", "district", "state",
  "address", "emergencyContact", "allergies", "chronicConditions", "currentMedications",
  "riskLevel", "registeredAt", "consentStatus", "vaccinationStatus", "createdAt", "updatedAt", "isDemo"
)
VALUES (
  'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  'RHC-2026-VPAW01',
  '91-8822-4411-9901',
  'vishwajeet.pawade@sbx',
  'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  'Vishwajeet Pawade',
  'विश्वजीत पावडे',
  28,
  '1998-05-15',
  'Male',
  'O+',
  '9829999999',
  'Govindpur',
  'Bikaner',
  'Rajasthan',
  'House 12, Ward 3, Govindpur',
  '{"name": "Family Member", "phone": "9829999998", "relation": "Relative"}'::jsonb,
  ARRAY[]::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  'LOW',
  '18 Sep 2026',
  'GRANTED',
  'Fully Vaccinated',
  NOW(),
  NOW(),
  true
)
ON CONFLICT ("healthId") DO NOTHING;

