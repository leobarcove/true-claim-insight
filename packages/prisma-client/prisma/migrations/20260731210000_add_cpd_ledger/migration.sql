-- CreateTable
CREATE TABLE "cpd_records" (
    "id" TEXT NOT NULL,
    "adjusterId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "hours" DECIMAL(5,1) NOT NULL,
    "programmeName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRecognised" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpd_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cpd_records_adjusterId_year_idx" ON "cpd_records"("adjusterId", "year");

-- AddForeignKey
ALTER TABLE "cpd_records" ADD CONSTRAINT "cpd_records_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hours are positive and sane. Zero-hour entries would let the ledger fill with
-- noise; a single 100-hour entry is a typo, not a programme.
ALTER TABLE "cpd_records"
  ADD CONSTRAINT "cpd_records_hours_sane"
  CHECK ("hours" > 0 AND "hours" <= 60);
