-- Tenant-scoped compliance registers, and memberships as the source of roles.
--
-- 1. compliance_events, key_persons and bnm_notifications record the registered
--    adjuster's own PD duties (10, 11.2(d), 13). They had no tenant column, so
--    every firm-admin or compliance officer on the platform — including a panel
--    insurer's — read and wrote one global register. Each row now belongs to an
--    adjusting firm.
--
--    Backfill, most specific first: a compliance event takes its adjuster's
--    firm, then its claim's adjuster's firm, then its claim's tenant if that
--    is a firm; a notification takes its key person's; what remains belongs to
--    the earliest adjusting firm. Pre-registration there is
--    exactly one firm on a deployment, so that last rule is the truth rather
--    than a guess. If no adjusting firm exists while rows do, SET NOT NULL
--    fails and the migration stops — deliberately: an unowned register is the
--    defect being removed, not something to carry forward.
--
-- 2. Roles are now read from the user's membership in the active tenant, not
--    from users.role. Users that predate memberships get one backfilled from
--    their primary tenant. Memberships whose role cannot exist in that kind of
--    tenant (for example an ADJUSTER inside an insurer) are suspended, not
--    deleted: the guard refuses them either way, and the row stays as the
--    record of what was granted.

-- AlterTable
ALTER TABLE "compliance_events" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "key_persons" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "bnm_notifications" ADD COLUMN "tenantId" TEXT;

-- Backfill compliance_events: the register is the adjusting firm's, so the
-- firm is preferred at every step — the event's adjuster, then the claim's
-- adjuster, then the claim's own tenant only when that tenant is a firm (older
-- claims were owned by the insurer, whose Board this register is not).
UPDATE "compliance_events" ce SET "tenantId" = a."tenantId"
  FROM "adjusters" a WHERE ce."adjusterId" = a."id" AND ce."tenantId" IS NULL;
UPDATE "compliance_events" ce SET "tenantId" = a."tenantId"
  FROM "claims" c JOIN "adjusters" a ON a."id" = c."adjusterId"
 WHERE ce."claimId" = c."id" AND ce."tenantId" IS NULL;
UPDATE "compliance_events" ce SET "tenantId" = c."tenantId"
  FROM "claims" c JOIN "tenants" t ON t."id" = c."tenantId"
 WHERE ce."claimId" = c."id" AND ce."tenantId" IS NULL AND t."type" = 'ADJUSTING_FIRM';
UPDATE "compliance_events" SET "tenantId" = (
  SELECT "id" FROM "tenants" WHERE "type" = 'ADJUSTING_FIRM' ORDER BY "createdAt" ASC LIMIT 1
) WHERE "tenantId" IS NULL;

-- Backfill key_persons
UPDATE "key_persons" SET "tenantId" = (
  SELECT "id" FROM "tenants" WHERE "type" = 'ADJUSTING_FIRM' ORDER BY "createdAt" ASC LIMIT 1
) WHERE "tenantId" IS NULL;

-- Backfill bnm_notifications
UPDATE "bnm_notifications" n SET "tenantId" = kp."tenantId"
  FROM "key_persons" kp WHERE n."keyPersonId" = kp."id" AND n."tenantId" IS NULL;
UPDATE "bnm_notifications" SET "tenantId" = (
  SELECT "id" FROM "tenants" WHERE "type" = 'ADJUSTING_FIRM' ORDER BY "createdAt" ASC LIMIT 1
) WHERE "tenantId" IS NULL;

ALTER TABLE "compliance_events" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "key_persons" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "bnm_notifications" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "compliance_events_tenantId_idx" ON "compliance_events"("tenantId");
CREATE INDEX "key_persons_tenantId_idx" ON "key_persons"("tenantId");
CREATE INDEX "bnm_notifications_tenantId_idx" ON "bnm_notifications"("tenantId");

-- AddForeignKey
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "key_persons" ADD CONSTRAINT "key_persons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bnm_notifications" ADD CONSTRAINT "bnm_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Memberships: backfill one for every staff user that has a primary tenant but
-- no membership in it.
INSERT INTO "user_tenants" ("id", "userId", "tenantId", "role", "isDefault", "status", "joinedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", u."tenantId", u."role", true, 'ACTIVE', NOW(), NOW(), NOW()
  FROM "users" u
 WHERE u."tenantId" IS NOT NULL
   AND u."role" NOT IN ('SUPER_ADMIN', 'CLAIMANT')
   AND NOT EXISTS (
     SELECT 1 FROM "user_tenants" ut WHERE ut."userId" = u."id" AND ut."tenantId" = u."tenantId"
   );

-- Suspend memberships whose role cannot exist in that kind of tenant. Mirrors
-- TENANT_ROLES in @tci/shared-types (access-policy.ts); the guard enforces the
-- same rule at runtime.
UPDATE "user_tenants" ut SET "status" = 'SUSPENDED', "updatedAt" = NOW()
  FROM "tenants" t
 WHERE ut."tenantId" = t."id"
   AND ut."status" = 'ACTIVE'
   AND (
     (t."type" = 'ADJUSTING_FIRM' AND ut."role" NOT IN ('ADJUSTER', 'FIRM_ADMIN', 'COMPLIANCE_OFFICER', 'SUPPORT_DESK'))
     OR
     (t."type" = 'INSURER' AND ut."role" NOT IN ('FIRM_ADMIN', 'SIU_INVESTIGATOR', 'COMPLIANCE_OFFICER', 'SUPPORT_DESK', 'SHARIAH_REVIEWER'))
   );
