-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('DESK_REVIEW', 'VIDEO', 'SITE_VISIT', 'EXPERT_REFERRAL');

-- CreateEnum
CREATE TYPE "EscalationTrigger" AS ENUM ('FRAUD_SIGNAL', 'AMOUNT_REVISED_UP', 'EXTRACTION_INCONSISTENCY', 'ADJUSTER_JUDGEMENT');

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "assessmentMode" "AssessmentMode";

-- CreateTable
CREATE TABLE "assessment_mode_decisions" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "AssessmentMode" NOT NULL,
    "trigger" "EscalationTrigger",
    "fastTracked" BOOLEAN NOT NULL DEFAULT false,
    "reasons" TEXT[],
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_mode_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_mode_decisions_claimId_createdAt_idx" ON "assessment_mode_decisions"("claimId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "assessment_mode_decisions_tenantId_idx" ON "assessment_mode_decisions"("tenantId");

-- AddForeignKey
ALTER TABLE "assessment_mode_decisions" ADD CONSTRAINT "assessment_mode_decisions_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

