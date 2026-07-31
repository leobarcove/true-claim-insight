-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('CLAIM_PROCESSING', 'BIOMETRIC_ANALYSIS', 'CROSS_BORDER_TRANSFER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('WEB_FORM', 'VIDEO_SESSION', 'STAFF_CAPTURED', 'IMPORTED');

-- CreateTable
CREATE TABLE "consent_notices" (
    "id" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "noticeId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "capturedVia" "ConsentChannel" NOT NULL DEFAULT 'WEB_FORM',
    "ipAddress" TEXT,
    "capturedByUserId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_notices_purpose_approvedAt_idx" ON "consent_notices"("purpose", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "consent_notices_purpose_version_locale_key" ON "consent_notices"("purpose", "version", "locale");

-- CreateIndex
CREATE INDEX "consents_claimantId_purpose_idx" ON "consents"("claimantId", "purpose");

-- CreateIndex
CREATE INDEX "consents_status_idx" ON "consents"("status");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "claimants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "consent_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One live consent per subject per purpose.
--
-- A claimant may grant, withdraw and grant again over the life of a claim, so
-- history must accumulate. What must never happen is two simultaneous GRANTED
-- rows for the same purpose: "is processing lawful right now?" would then have
-- two answers, and the safe one is not necessarily the one the code picks.
CREATE UNIQUE INDEX "consents_one_active_per_subject_purpose"
  ON "consents" ("claimantId", "purpose")
  WHERE "status" = 'GRANTED';
