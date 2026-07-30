-- CreateTable
CREATE TABLE "authority_limits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole",
    "adjusterId" TEXT,
    "category" "ClaimCategory",
    "maxApprovalAmount" DECIMAL(14,2),
    "canApproveOwnAssessment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authority_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authority_limits_tenantId_role_idx" ON "authority_limits"("tenantId", "role");

-- CreateIndex
CREATE INDEX "authority_limits_adjusterId_idx" ON "authority_limits"("adjusterId");

-- AddForeignKey
ALTER TABLE "authority_limits" ADD CONSTRAINT "authority_limits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_limits" ADD CONSTRAINT "authority_limits_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

