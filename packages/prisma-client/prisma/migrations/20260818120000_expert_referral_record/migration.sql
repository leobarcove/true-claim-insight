-- CreateEnum
CREATE TYPE "ExpertOutcome" AS ENUM ('PROCEED', 'DECLINE');

-- CreateTable
CREATE TABLE "expert_referrals" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expertName" TEXT,
    "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referredByUserId" TEXT,
    "outcome" "ExpertOutcome",
    "opinion" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "outcomeByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expert_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expert_referrals_caseId_idx" ON "expert_referrals"("caseId");

-- CreateIndex
CREATE INDEX "expert_referrals_tenantId_idx" ON "expert_referrals"("tenantId");

-- AddForeignKey
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

