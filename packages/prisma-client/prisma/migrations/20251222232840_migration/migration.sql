/*
  Warnings:

  - You are about to drop the column `email` on the `adjusters` table. All the data in the column will be lost.
  - You are about to drop the column `fullName` on the `adjusters` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `adjusters` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `adjusters` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `adjusters` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `adjusters` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sessionId,assessmentType]` on the table `risk_assessments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `adjusters` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'INSURER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'SIU_INVESTIGATOR';
ALTER TYPE "UserRole" ADD VALUE 'COMPLIANCE_OFFICER';
ALTER TYPE "UserRole" ADD VALUE 'SUPPORT_DESK';
ALTER TYPE "UserRole" ADD VALUE 'SHARIAH_REVIEWER';

-- DropIndex
DROP INDEX "adjusters_email_key";

-- AlterTable
ALTER TABLE "adjusters" DROP COLUMN "email",
DROP COLUMN "fullName",
DROP COLUMN "lastLoginAt",
DROP COLUMN "passwordHash",
DROP COLUMN "phoneNumber",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "approvedAmount" DECIMAL(65,30),
ADD COLUMN     "complianceNotes" JSONB DEFAULT '{}',
ADD COLUMN     "estimatedLossAmount" DECIMAL(65,30),
ADD COLUMN     "estimatedRepairCost" DECIMAL(12,2),
ADD COLUMN     "excessAmount" DECIMAL(65,30),
ADD COLUMN     "isPdpaCompliant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ncdRate" DOUBLE PRECISION,
ADD COLUMN     "policeReportDate" TIMESTAMP(3),
ADD COLUMN     "policeStation" TEXT,
ADD COLUMN     "siuInvestigatorId" TEXT,
ADD COLUMN     "slaDeadline" TIMESTAMP(3),
ADD COLUMN     "sstAmount" DECIMAL(65,30),
ADD COLUMN     "sumInsured" DECIMAL(65,30),
ADD COLUMN     "vehicleChassisNumber" TEXT,
ADD COLUMN     "vehicleEngineNumber" TEXT,
ADD COLUMN     "vehicleMake" TEXT,
ADD COLUMN     "vehicleModel" TEXT,
ADD COLUMN     "vehiclePlateNumber" TEXT,
ADD COLUMN     "vehicleYear" INTEGER,
ADD COLUMN     "workshopName" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "adjusters_userId_key" ON "adjusters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_sessionId_assessmentType_key" ON "risk_assessments"("sessionId", "assessmentType");

-- AddForeignKey
ALTER TABLE "adjusters" ADD CONSTRAINT "adjusters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_siuInvestigatorId_fkey" FOREIGN KEY ("siuInvestigatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
