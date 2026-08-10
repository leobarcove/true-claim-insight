-- CreateEnum
CREATE TYPE "ConflictPartyType" AS ENUM ('INSURER', 'TAKAFUL_OPERATOR', 'WORKSHOP', 'CLAIMANT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConflictInterestType" AS ENUM ('EMPLOYMENT', 'EQUITY', 'FAMILY', 'FINANCIAL', 'OTHER');

-- CreateTable
CREATE TABLE "conflict_declarations" (
    "id" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "partyType" "ConflictPartyType" NOT NULL,
    "interestType" "ConflictInterestType" NOT NULL,
    "partyName" TEXT NOT NULL,
    "partyTenantId" TEXT,
    "relationship" TEXT NOT NULL,
    "details" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declaredByUserId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflict_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_attestations" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conflict_declarations_adjusterId_resolvedAt_idx" ON "conflict_declarations"("adjusterId", "resolvedAt");

-- CreateIndex
CREATE INDEX "conflict_declarations_partyTenantId_idx" ON "conflict_declarations"("partyTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_attestations_claimId_adjusterId_key" ON "conflict_attestations"("claimId", "adjusterId");

-- AddForeignKey
ALTER TABLE "conflict_declarations" ADD CONSTRAINT "conflict_declarations_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_attestations" ADD CONSTRAINT "conflict_attestations_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_attestations" ADD CONSTRAINT "conflict_attestations_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

