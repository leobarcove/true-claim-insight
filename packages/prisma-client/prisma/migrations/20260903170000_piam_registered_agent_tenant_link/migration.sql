-- A PIAM registration belongs to a tenant by id, not by matching two strings.
--
-- `validateJwtPayload` resolved the tenant with
--   LEFT JOIN "tenants" t ON LOWER(t."name") = LOWER(p."agencyName")
-- and threw 401 "PIAM agent not found" when it missed. `agencyName` comes from
-- PIAM's register, so the value on one side of that comparison is not ours to
-- control: a rename there, or a tenant renamed here, locks every agent of that
-- agency out of a system that still shows them signed in — and reports it as an
-- authentication failure, which sends whoever debugs it to the wrong place.
ALTER TABLE "piam_registered_agents" ADD COLUMN "tenantId" TEXT;

-- Backfilled by the match that is working today, so nothing changes hands.
UPDATE "piam_registered_agents" p
SET "tenantId" = t."id"
FROM "tenants" t
WHERE LOWER(t."name") = LOWER(p."agencyName")
  AND p."tenantId" IS NULL;

-- Deliberately not a foreign key with ON DELETE CASCADE: the register is a
-- record of who is licensed, and removing a tenant must not delete the evidence
-- that an agency was ever registered.
ALTER TABLE "piam_registered_agents"
  ADD CONSTRAINT "piam_registered_agents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "piam_registered_agents_tenantId_idx" ON "piam_registered_agents"("tenantId");

-- The old index existed only to serve the name join.
DROP INDEX IF EXISTS "piam_registered_agents_agencyName_idx";
