/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `claimants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "claimants" ALTER COLUMN "nricHash" DROP NOT NULL,
ALTER COLUMN "nricEncrypted" DROP NOT NULL,
ALTER COLUMN "fullName" DROP NOT NULL,
ALTER COLUMN "dateOfBirth" DROP NOT NULL;

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_codes_phoneNumber_code_idx" ON "otp_codes"("phoneNumber", "code");

-- CreateIndex
CREATE INDEX "otp_codes_expiresAt_idx" ON "otp_codes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "claimants_phoneNumber_key" ON "claimants"("phoneNumber");

-- CreateIndex
CREATE INDEX "claimants_phoneNumber_idx" ON "claimants"("phoneNumber");
