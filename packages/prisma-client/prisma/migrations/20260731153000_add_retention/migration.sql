-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "legalHoldAt" TIMESTAMP(3),
ADD COLUMN     "legalHoldByUserId" TEXT,
ADD COLUMN     "legalHoldReason" TEXT;

-- AlterTable
ALTER TABLE "video_uploads" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "retainYears" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_entityType_key" ON "retention_policies"("entityType");


-- The seven-year floor, at the database.
--
-- The service refuses to save a policy under seven years, but a constraint
-- outlives the service: a row written through psql or a future admin screen is
-- caught here. PD 12.8 is a floor, not a default.
ALTER TABLE "retention_policies"
  ADD CONSTRAINT "retention_policies_seven_year_floor"
  CHECK ("retainYears" >= 7);
