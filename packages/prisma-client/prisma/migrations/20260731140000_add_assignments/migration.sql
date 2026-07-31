-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('TPA_ADMIN', 'ADJUSTING');

-- CreateEnum
CREATE TYPE "AssignmentChannel" AS ENUM ('EMAIL', 'PORTAL', 'MERIMEN', 'API', 'MANUAL');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('RECEIVED', 'ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'COMPLETED');

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "insurerTenantId" TEXT NOT NULL,
    "handlingTenantId" TEXT NOT NULL,
    "mode" "AssignmentMode" NOT NULL DEFAULT 'TPA_ADMIN',
    "channel" "AssignmentChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'RECEIVED',
    "externalRef" TEXT NOT NULL,
    "scope" TEXT,
    "instructions" TEXT,
    "appointedByName" TEXT,
    "appointedByEmail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "claimId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assignments_claimId_key" ON "assignments"("claimId");

-- CreateIndex
CREATE INDEX "assignments_handlingTenantId_status_idx" ON "assignments"("handlingTenantId", "status");

-- CreateIndex
CREATE INDEX "assignments_status_receivedAt_idx" ON "assignments"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_insurerTenantId_externalRef_key" ON "assignments"("insurerTenantId", "externalRef");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_insurerTenantId_fkey" FOREIGN KEY ("insurerTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_handlingTenantId_fkey" FOREIGN KEY ("handlingTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

