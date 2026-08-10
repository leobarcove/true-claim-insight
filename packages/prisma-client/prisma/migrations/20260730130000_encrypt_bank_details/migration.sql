-- Field-level encryption for payout bank details (PDPA).
--
-- The plaintext column is dropped in the SAME migration that adds the encrypted
-- one. Leaving both would mean "we added encryption" while the readable copy
-- still sits on disk and in every backup — which is where a lot of nominally
-- encrypted systems actually are.
--
-- Existing values: 3 rows of seed data at the time of writing. They are NOT
-- migrated in SQL, because encryption requires the application's master key.
-- The plaintext is dropped; re-enter those cases if the values were real.

CREATE TABLE "encryption_keys" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "wrappedDataKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "encryption_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "encryption_keys_version_key" ON "encryption_keys"("version");

ALTER TABLE "cases"
    ADD COLUMN "bankAccountNumberEncrypted" TEXT,
    ADD COLUMN "bankAccountLast4" TEXT;

-- Preserve the non-identifying tail so operator screens keep working without
-- decrypting, then remove the readable account number.
UPDATE "cases"
   SET "bankAccountLast4" = RIGHT(regexp_replace("bankAccountNumber", '\D', '', 'g'), 4)
 WHERE "bankAccountNumber" IS NOT NULL;

ALTER TABLE "cases" DROP COLUMN "bankAccountNumber";
