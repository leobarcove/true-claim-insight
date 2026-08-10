-- Encrypt NRIC (Malaysian national identity number) at rest.
--
-- NRIC is the highest-sensitivity identifier the platform holds: it enables
-- identity theft, and PDPA treats it accordingly. It was previously plaintext,
-- indexed AND unique — so readable in table pages, index pages and backups.
--
-- Lookup by NRIC moves to the blind index (`nricHash`, HMAC + secret pepper),
-- which also carries the uniqueness the plaintext column used to enforce.
-- Existing rows: 12 values of seed data. They are NOT migrated in SQL, because
-- encryption needs the application's master key. Plaintext is dropped; re-enter
-- those records if any value was real.
--
-- The pepper is effectively permanent: changing it invalidates every stored
-- index and breaks lookups until all values are re-indexed. Unlike the
-- encryption key, it is not designed to rotate.

-- Claimant: keep the tail for display, then drop the readable value.
ALTER TABLE "claimants"
    ADD COLUMN "nricLast4" TEXT;

UPDATE "claimants"
   SET "nricLast4" = RIGHT(regexp_replace("nric", '\D', '', 'g'), 4)
 WHERE "nric" IS NOT NULL;

DROP INDEX IF EXISTS "claimants_nric_idx";
DROP INDEX IF EXISTS "claimants_nric_key";
ALTER TABLE "claimants" DROP COLUMN "nric";

-- nricEncrypted was an unused bytea column; the versioned ciphertext is text.
ALTER TABLE "claimants" DROP COLUMN "nricEncrypted";
ALTER TABLE "claimants" ADD COLUMN "nricEncrypted" TEXT;

-- Claim: denormalised NRIC snapshot.
ALTER TABLE "claims"
    ADD COLUMN "nricEncrypted" TEXT,
    ADD COLUMN "nricLast4" TEXT;

UPDATE "claims"
   SET "nricLast4" = RIGHT(regexp_replace("nric", '\D', '', 'g'), 4)
 WHERE "nric" IS NOT NULL;

DROP INDEX IF EXISTS "claims_nric_idx";
ALTER TABLE "claims" DROP COLUMN "nric";

-- Policy: insured person's NRIC from the insurer feed.
ALTER TABLE "policies"
    ADD COLUMN "insuredNricEncrypted" TEXT,
    ADD COLUMN "insuredNricLast4" TEXT;

UPDATE "policies"
   SET "insuredNricLast4" = RIGHT(regexp_replace("insuredNric", '\D', '', 'g'), 4)
 WHERE "insuredNric" IS NOT NULL;

ALTER TABLE "policies" DROP COLUMN "insuredNric";
