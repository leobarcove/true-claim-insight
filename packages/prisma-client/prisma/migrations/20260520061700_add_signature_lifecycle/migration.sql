-- Add digital signature lifecycle to Document. Documents that are not
-- signable (photos, receipts) sit at NOT_REQUESTED forever; consent
-- forms and signed statements progress PENDING -> SIGNED through the
-- SignatureProvider. signedAt already exists from an earlier migration.

CREATE TYPE "SignatureStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SIGNED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "documents"
  ADD COLUMN "signatureRequestId" TEXT,
  ADD COLUMN "signatureRequestedAt" TIMESTAMP(3),
  ADD COLUMN "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "signatureUrl" TEXT,
  ADD COLUMN "signedStorageUrl" TEXT;

CREATE INDEX "documents_signatureStatus_idx" ON "documents"("signatureStatus");
