-- CreateTable
CREATE TABLE "transfer_records" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "dataDescription" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawfulBasis" TEXT,
    "sourceService" TEXT NOT NULL,
    "claimId" TEXT,
    "claimantId" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "transfer_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfer_records_provider_transferredAt_idx" ON "transfer_records"("provider", "transferredAt");

-- CreateIndex
CREATE INDEX "transfer_records_claimId_idx" ON "transfer_records"("claimId");

