/*
  Warnings:

  - A unique constraint covering the columns `[nric]` on the table `claimants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "claimants" ADD COLUMN     "nric" TEXT;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "nric" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "claimants_nric_key" ON "claimants"("nric");

-- CreateIndex
CREATE INDEX "claimants_nric_idx" ON "claimants"("nric");

-- CreateIndex
CREATE INDEX "claims_nric_idx" ON "claims"("nric");
