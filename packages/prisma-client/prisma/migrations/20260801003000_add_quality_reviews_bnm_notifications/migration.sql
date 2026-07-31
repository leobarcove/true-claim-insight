-- CreateEnum
CREATE TYPE "QualityRating" AS ENUM ('SATISFACTORY', 'NEEDS_IMPROVEMENT', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "BnmChangeType" AS ENUM ('PAID_UP_CAPITAL', 'HEAD_OFFICE_RELOCATION', 'BRANCH_CHANGE', 'DIRECTOR_CEO_SHAREHOLDER_CHANGE');

-- CreateTable
CREATE TABLE "work_quality_reviews" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "rating" "QualityRating" NOT NULL,
    "findings" TEXT,
    "notes" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_quality_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnm_notifications" (
    "id" TEXT NOT NULL,
    "changeType" "BnmChangeType" NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "notifiedByUserId" TEXT,
    "reference" TEXT,
    "keyPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnm_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_quality_reviews_adjusterId_reviewedAt_idx" ON "work_quality_reviews"("adjusterId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "work_quality_reviews_reportId_reviewerUserId_key" ON "work_quality_reviews"("reportId", "reviewerUserId");

-- CreateIndex
CREATE INDEX "bnm_notifications_notifiedAt_dueAt_idx" ON "bnm_notifications"("notifiedAt", "dueAt");

-- AddForeignKey
ALTER TABLE "work_quality_reviews" ADD CONSTRAINT "work_quality_reviews_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "adjuster_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_quality_reviews" ADD CONSTRAINT "work_quality_reviews_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

