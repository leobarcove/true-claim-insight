-- CreateEnum
CREATE TYPE "KeyPersonType" AS ENUM ('SHAREHOLDER', 'KRP', 'SHAREHOLDER_AND_KRP');

-- CreateTable
CREATE TABLE "key_persons" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "type" "KeyPersonType" NOT NULL,
    "position" TEXT,
    "appointedAt" TIMESTAMP(3) NOT NULL,
    "ceasedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "key_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fit_proper_attestations" (
    "id" TEXT NOT NULL,
    "keyPersonId" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "allMet" BOOLEAN NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestedByUserId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "fit_proper_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "key_persons_type_ceasedAt_idx" ON "key_persons"("type", "ceasedAt");

-- CreateIndex
CREATE INDEX "fit_proper_attestations_keyPersonId_attestedAt_idx" ON "fit_proper_attestations"("keyPersonId", "attestedAt");

-- AddForeignKey
ALTER TABLE "fit_proper_attestations" ADD CONSTRAINT "fit_proper_attestations_keyPersonId_fkey" FOREIGN KEY ("keyPersonId") REFERENCES "key_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

