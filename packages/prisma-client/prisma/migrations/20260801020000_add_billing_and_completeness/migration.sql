-- CreateEnum
CREATE TYPE "FeeBasis" AS ENUM ('SCALE', 'TIME', 'FIXED');

-- CreateEnum
CREATE TYPE "FeeNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- AlterTable
ALTER TABLE "adjusters" ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "qualification" TEXT;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "documentsCompleteAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fee_scales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "basis" "FeeBasis" NOT NULL,
    "bands" JSONB,
    "hourlyRate" DECIMAL(10,2),
    "fixedFee" DECIMAL(10,2),
    "sstRate" DECIMAL(4,3) NOT NULL DEFAULT 0.08,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "workedOn" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "description" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "evidenceUrl" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_notes" (
    "id" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "insurerTenantId" TEXT NOT NULL,
    "status" "FeeNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "professionalFee" DECIMAL(12,2) NOT NULL,
    "disbursementsTotal" DECIMAL(12,2) NOT NULL,
    "sstAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "computation" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_scales_tenantId_isActive_idx" ON "fee_scales"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "time_entries_claimId_idx" ON "time_entries"("claimId");

-- CreateIndex
CREATE INDEX "disbursements_claimId_idx" ON "disbursements"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_notes_noteNumber_key" ON "fee_notes"("noteNumber");

-- CreateIndex
CREATE INDEX "fee_notes_insurerTenantId_status_idx" ON "fee_notes"("insurerTenantId", "status");

-- CreateIndex
CREATE INDEX "fee_notes_status_dueAt_idx" ON "fee_notes"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "fee_scales" ADD CONSTRAINT "fee_scales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_notes" ADD CONSTRAINT "fee_notes_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_notes" ADD CONSTRAINT "fee_notes_insurerTenantId_fkey" FOREIGN KEY ("insurerTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

