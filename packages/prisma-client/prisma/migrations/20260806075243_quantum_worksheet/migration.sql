-- CreateEnum
CREATE TYPE "SettlementBasis" AS ENUM ('REINSTATEMENT', 'INDEMNITY');

-- CreateTable
CREATE TABLE "quantum_worksheets" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "basis" "SettlementBasis" NOT NULL,
    "assessedLoss" DECIMAL(12,2) NOT NULL,
    "depreciationRate" DECIMAL(5,4),
    "betterment" DECIMAL(12,2),
    "sumInsured" DECIMAL(12,2) NOT NULL,
    "valueAtRisk" DECIMAL(12,2),
    "averageCondition" BOOLEAN NOT NULL DEFAULT false,
    "salvage" DECIMAL(12,2),
    "excess" DECIMAL(12,2),
    "adjustedLoss" DECIMAL(12,2) NOT NULL,
    "underinsured" BOOLEAN NOT NULL DEFAULT false,
    "averageRatio" DECIMAL(6,5),
    "averageApplied" BOOLEAN NOT NULL DEFAULT false,
    "recommended" DECIMAL(12,2) NOT NULL,
    "cappedAtSumInsured" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "warnings" TEXT[],
    "preparedByAdjusterId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quantum_worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quantum_worksheets_supersedesId_key" ON "quantum_worksheets"("supersedesId");

-- CreateIndex
CREATE INDEX "quantum_worksheets_claimId_revision_idx" ON "quantum_worksheets"("claimId", "revision" DESC);

-- CreateIndex
CREATE INDEX "quantum_worksheets_tenantId_idx" ON "quantum_worksheets"("tenantId");

-- AddForeignKey
ALTER TABLE "quantum_worksheets" ADD CONSTRAINT "quantum_worksheets_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

