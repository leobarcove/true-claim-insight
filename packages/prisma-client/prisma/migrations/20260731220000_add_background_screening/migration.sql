-- CreateEnum
CREATE TYPE "ScreeningCheckType" AS ENUM ('BANKRUPTCY_INSOLVENCY', 'EMPLOYMENT_HISTORY', 'ACADEMIC_HISTORY', 'CRIMINAL_SCREENING', 'OTHER');

-- CreateEnum
CREATE TYPE "ScreeningOutcome" AS ENUM ('CLEAR', 'FINDINGS');

-- CreateTable
CREATE TABLE "background_screenings" (
    "id" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "checkType" "ScreeningCheckType" NOT NULL,
    "outcome" "ScreeningOutcome" NOT NULL,
    "findingsNote" TEXT,
    "screenedAt" TIMESTAMP(3) NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "background_screenings_adjusterId_checkType_idx" ON "background_screenings"("adjusterId", "checkType");

-- AddForeignKey
ALTER TABLE "background_screenings" ADD CONSTRAINT "background_screenings_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

