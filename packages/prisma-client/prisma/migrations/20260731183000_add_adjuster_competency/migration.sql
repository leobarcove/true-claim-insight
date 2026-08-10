-- AlterTable
ALTER TABLE "adjusters" ADD COLUMN     "adjustingSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "adjuster_competencies" (
    "id" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "yearsInSubject" INTEGER NOT NULL,
    "casesHandled" INTEGER NOT NULL DEFAULT 0,
    "performanceSatisfactory" BOOLEAN NOT NULL DEFAULT false,
    "seniorRecognisedAt" TIMESTAMP(3),
    "seniorRecognisedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adjuster_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adjuster_competencies_category_idx" ON "adjuster_competencies"("category");

-- CreateIndex
CREATE UNIQUE INDEX "adjuster_competencies_adjusterId_category_key" ON "adjuster_competencies"("adjusterId", "category");

-- AddForeignKey
ALTER TABLE "adjuster_competencies" ADD CONSTRAINT "adjuster_competencies_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

