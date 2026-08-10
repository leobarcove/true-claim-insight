-- CreateEnum
CREATE TYPE "AdjusterReportType" AS ENUM ('PRELIMINARY', 'INTERIM', 'FINAL', 'SUPPLEMENTARY');

-- CreateEnum
CREATE TYPE "AdjusterReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SIGNED', 'ISSUED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "adjuster_reports" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" "AdjusterReportType" NOT NULL,
    "status" "AdjusterReportStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "authorAdjusterId" TEXT NOT NULL,
    "reviewerAdjusterId" TEXT,
    "signedByAdjusterId" TEXT,
    "countersignBasis" TEXT,
    "submittedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,
    "renderedDocumentId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adjuster_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjuster_reports_supersedesId_key" ON "adjuster_reports"("supersedesId");

-- CreateIndex
CREATE INDEX "adjuster_reports_claimId_idx" ON "adjuster_reports"("claimId");

-- CreateIndex
CREATE INDEX "adjuster_reports_status_idx" ON "adjuster_reports"("status");

-- CreateIndex
CREATE INDEX "adjuster_reports_authorAdjusterId_idx" ON "adjuster_reports"("authorAdjusterId");

-- AddForeignKey
ALTER TABLE "adjuster_reports" ADD CONSTRAINT "adjuster_reports_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuster_reports" ADD CONSTRAINT "adjuster_reports_authorAdjusterId_fkey" FOREIGN KEY ("authorAdjusterId") REFERENCES "adjusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuster_reports" ADD CONSTRAINT "adjuster_reports_reviewerAdjusterId_fkey" FOREIGN KEY ("reviewerAdjusterId") REFERENCES "adjusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuster_reports" ADD CONSTRAINT "adjuster_reports_signedByAdjusterId_fkey" FOREIGN KEY ("signedByAdjusterId") REFERENCES "adjusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuster_reports" ADD CONSTRAINT "adjuster_reports_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "adjuster_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One live report per claim and type.
--
-- A claim may legitimately carry several reports of the same type over its life
-- (a corrected final report supersedes an earlier one), so history must be kept.
-- What must never happen is two reports of the same type being worked on at
-- once: the insurer would receive contradictory documents with no way to tell
-- which is current. Superseded, withdrawn and issued reports are excluded, so
-- only the in-flight ones are constrained.
CREATE UNIQUE INDEX "adjuster_reports_one_active_per_claim_type"
  ON "adjuster_reports" ("claimId", "type")
  WHERE "status" IN ('DRAFT', 'IN_REVIEW', 'SIGNED');
